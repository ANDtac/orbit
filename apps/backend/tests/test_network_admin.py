"""Integration tests for network-admin focused API features."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.extensions import db
from app.models import AuditLogEntries, DeviceHealthSnapshots, DeviceTagAssignments, Jobs, Users
from app.services import jobs as jobs_service


def _auth_headers(auth_headers):
    return auth_headers("network-admin", "password")


def test_device_tag_assignment_and_removal(client, auth_headers, create_device):
    headers = _auth_headers(auth_headers)
    device = create_device(name="tagged-device")

    resp = client.post(
        f"/api/v1/devices/{device.id}/tags",
        json={"tags": ["Core", "Critical"]},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["device_id"] == device.id
    slugs = {tag["slug"] for tag in body["tags"]}
    assert slugs == {"core", "critical"}

    assignments = DeviceTagAssignments.query.filter_by(device_id=device.id).all()
    assert len(assignments) == 2

    resp = client.delete(f"/api/v1/devices/{device.id}/tags/core", headers=headers)
    assert resp.status_code == 204
    remaining = DeviceTagAssignments.query.filter_by(device_id=device.id).all()
    assert len(remaining) == 1


def test_device_config_backup_job(client, auth_headers, create_device):
    headers = _auth_headers(auth_headers)
    device = create_device(name="backup-target")

    resp = client.post(
        f"/api/v1/devices/{device.id}/config:backup",
        json={"reason": "nightly"},
        headers=headers,
    )
    assert resp.status_code == 202
    payload = resp.get_json()
    job_id = payload["job"]["id"]
    job = Jobs.query.get(job_id)
    assert job is not None
    assert job.job_type == "device.config.backup"
    assert job.parameters.get("device_id") == device.id


def test_device_bulk_update_creates_job(client, auth_headers, create_device):
    headers = _auth_headers(auth_headers)
    d1 = create_device(name="bulk-1")
    d2 = create_device(name="bulk-2")

    resp = client.post(
        "/api/v1/devices:bulk-update",
        json={"device_ids": [d1.id, d2.id], "updates": {"notes": "maintenance"}},
        headers=headers,
    )
    assert resp.status_code == 202
    job_id = resp.get_json()["job"]["id"]
    job = Jobs.query.get(job_id)
    assert job.job_type == "device.bulk_update"
    assert len(job.tasks) == 2


def test_device_health_summary_and_detail(client, auth_headers, create_device):
    headers = _auth_headers(auth_headers)
    device = create_device(name="health-device")

    snapshot = DeviceHealthSnapshots(
        device_id=device.id,
        status="healthy",
        summary="All good",
        metrics={"latency_ms": 10},
        checks={"ping": {"status": "ok"}},
        observed_at=datetime.now(timezone.utc),
    )
    db.session.add(snapshot)
    db.session.commit()

    resp = client.get("/api/v1/devices/health", headers=headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["overall"]["statuses"]["healthy"] == 1

    resp = client.get(f"/api/v1/devices/{device.id}/health", headers=headers)
    assert resp.status_code == 200
    detail = resp.get_json()
    assert detail["status"] == "healthy"


def test_jobs_api_list_and_create(client, auth_headers, create_user):
    headers = _auth_headers(auth_headers)
    user = Users.query.filter_by(username="network-admin").first()
    if not user:
        user = create_user("network-admin", "password")

    job, _ = jobs_service.enqueue_job(
        job_type="seed.job",
        owner_id=user.id,
        parameters={"demo": True},
        tasks=[],
    )

    resp = client.get("/api/v1/jobs", headers=headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert any(item["id"] == job.id for item in data["data"])

    resp = client.post(
        "/api/v1/jobs",
        json={
            "job_type": "custom.job",
            "tasks": [{"task_type": "noop", "parameters": {"x": 1}}],
        },
        headers=headers,
    )
    assert resp.status_code == 202
    created_job_id = resp.get_json()["job"]["id"]
    created_job = Jobs.query.get(created_job_id)
    assert created_job is not None
    assert created_job.job_type == "custom.job"


def test_groups_api_create_and_list(client, auth_headers):
    headers = _auth_headers(auth_headers)

    resp = client.post(
        "/api/v1/groups",
        json={"name": "Core Routers", "definition": {"filters": {"tags": ["core"]}}},
        headers=headers,
    )
    assert resp.status_code == 201

    resp = client.get("/api/v1/groups", headers=headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert any(group["name"] == "Core Routers" for group in data["data"])


def test_audit_api_filters(client, auth_headers, create_user):
    headers = _auth_headers(auth_headers)
    user = Users.query.filter_by(username="network-admin").first()
    if not user:
        user = create_user("network-admin", "password")

    entry = AuditLogEntries(
        actor_id=user.id,
        actor_type="user",
        actor_display_name="network-admin",
        action="device.update",
        target_type="device",
        target_id=1,
        payload={"field": "value"},
    )
    db.session.add(entry)
    db.session.commit()

    resp = client.get("/api/v1/audit?filter[action]=device.update", headers=headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert any(row["id"] == entry.id for row in data["data"])
