from __future__ import annotations

from app.extensions import db
from app.models import AppEvents, JobTasks, Jobs
from app.services.handlers.registry import get_commands, get_handler
from app.services.password_change import PasswordChangeRequest, execute_password_change_request


def test_password_change_registry_returns_commands_and_handler():
    commands = get_commands("cisco_xe")
    handler = get_handler("cisco_xe")

    assert commands
    assert callable(handler)


def test_execute_password_change_request_uses_handler(monkeypatch, create_device):
    device = create_device()

    def fake_handler(target):
        assert target["device_id"] == device.id
        return {
            "device_id": device.id,
            "ok": True,
            "changed": True,
            "output": "changed",
            "phase": "completed",
            "platform": target["platform_slug"],
            "host": target["host"],
        }

    monkeypatch.setattr("app.services.password_change.get_handler", lambda _: fake_handler)

    summary, results = execute_password_change_request(
        PasswordChangeRequest(
            device_ids=[device.id],
            new_password="new-password",
            current_password="current-password",
            requested_by="1",
        )
    )

    assert summary["ok"] == 1
    assert summary["failed"] == 0
    assert results[0].ok is True
    assert results[0].changed is True


def test_password_change_endpoint_sync_uses_session_password(client, auth_passwords, create_user, create_device, monkeypatch):
    create_user("operator")
    auth_passwords.add("current-password")
    device = create_device()

    def fake_handler(target):
        assert target["current_password"] == "current-password"
        return {
            "device_id": target["device_id"],
            "ok": True,
            "changed": True,
            "output": "changed",
            "phase": "completed",
            "platform": target["platform_slug"],
            "host": target["host"],
        }

    monkeypatch.setattr("app.services.password_change.get_handler", lambda _: fake_handler)

    login = client.post("/api/v1/auth/login", json={"username": "operator", "password": "current-password"})
    access = login.get_json()["access_token"]
    resp = client.post(
        "/api/v1/operations/password-change",
        json={"device_ids": [device.id], "new_password": "updated-password", "async": False},
        headers={"Authorization": f"Bearer {access}"},
    )

    assert resp.status_code == 200
    data = resp.get_json()
    assert data["summary"]["ok"] == 1
    assert data["results"][0]["ok"] is True


def test_password_change_endpoint_async_creates_completed_job(app, client, auth_headers, create_device, monkeypatch):
    app.config["PASSWORD_CHANGE_RUN_INLINE_JOBS"] = True
    device = create_device()
    headers = auth_headers("async-password-user", "pw")

    def fake_handler(target):
        return {
            "device_id": target["device_id"],
            "ok": True,
            "changed": True,
            "output": "changed",
            "phase": "completed",
            "platform": target["platform_slug"],
            "host": target["host"],
        }

    monkeypatch.setattr("app.services.password_change.get_handler", lambda _: fake_handler)

    resp = client.post(
        "/api/v1/operations/password-change",
        json={
            "device_ids": [device.id],
            "new_password": "updated-password",
            "current_password": "pw",
            "async": True,
        },
        headers=headers,
    )

    assert resp.status_code == 202
    job_id = resp.get_json()["job"]["id"]
    job = db.session.get(Jobs, job_id)
    assert job is not None
    assert job.status == "succeeded"

    task = JobTasks.query.filter_by(job_id=job_id).one()
    assert task.status == "succeeded"

    events = AppEvents.query.filter_by(event="password_change.batch_complete").all()
    assert events
