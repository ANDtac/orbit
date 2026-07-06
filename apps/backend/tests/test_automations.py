"""Phase 3 tests: automation validation service + CRUD/run/test API.

CRITICAL: all device I/O is mocked. No real NAPALM/Netmiko session is ever
opened by the run/test endpoints.
"""

from __future__ import annotations

from contextlib import contextmanager

import pytest

from app.extensions import db
from app.models import Automations, AuditLogEntries, Jobs, JobTasks, PlatformOperationTemplates
from app.services import automations as automations_service
from app.services import operations as ops


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------
def _make_action(
    platform_id: int,
    *,
    name: str = "Set NTP",
    op_type: str = "config_ntp",
    template: str = "ntp server {{ server }}",
    variables: dict | None = None,
    outputs: dict | None = None,
    is_mutating: bool = False,
) -> PlatformOperationTemplates:
    action = PlatformOperationTemplates(
        platform_id=platform_id,
        name=name,
        op_type=op_type,
        template=template,
        variables=variables or {},
        outputs=outputs or {},
        is_mutating=is_mutating,
    )
    db.session.add(action)
    db.session.commit()
    return action


class _FakeNapalmDevice:
    def __init__(self, diff="+ ntp server 1.2.3.4"):
        self._diff = diff
        self.committed = False
        self.discarded = False

    def get_facts(self):
        return {"uptime": 1}

    def load_merge_candidate(self, config=None):
        self._candidate = config

    def compare_config(self):
        return self._diff

    def commit_config(self):
        self.committed = True

    def discard_config(self):
        self.discarded = True


# ---------------------------------------------------------------------------
# validate_variable_values
# ---------------------------------------------------------------------------
def test_validate_variable_values_accepts_and_coerces(app, db, create_platform):
    platform = create_platform("cisco_xe", "ios")
    action = _make_action(
        platform.id,
        variables={
            "server": {"type": "string", "required": True},
            "port": {"type": "number"},
            "enabled": {"type": "boolean"},
        },
    )

    cleaned = automations_service.validate_variable_values(
        action, {"server": "1.2.3.4", "port": "123", "enabled": "yes"}
    )

    assert cleaned["server"] == "1.2.3.4"
    assert cleaned["port"] == 123  # coerced str -> int
    assert cleaned["enabled"] is True  # coerced "yes" -> True


def test_validate_variable_values_rejects_missing_required(app, db, create_platform):
    platform = create_platform("cisco_xe", "ios")
    action = _make_action(platform.id, variables={"server": {"type": "string", "required": True}})

    with pytest.raises(ValueError) as exc:
        automations_service.validate_variable_values(action, {})
    assert "server" in str(exc.value) and "required" in str(exc.value)


def test_validate_variable_values_rejects_bad_enum_and_type(app, db, create_platform):
    platform = create_platform("cisco_xe", "ios")
    action = _make_action(
        platform.id,
        variables={
            "mode": {"type": "enum", "enum": ["on", "off"]},
            "count": {"type": "number"},
        },
    )

    with pytest.raises(ValueError) as exc:
        automations_service.validate_variable_values(action, {"mode": "maybe", "count": "abc"})
    message = str(exc.value)
    assert "mode" in message
    assert "count" in message


def test_validate_variable_values_regex_constraint(app, db, create_platform):
    platform = create_platform("cisco_xe", "ios")
    action = _make_action(
        platform.id,
        variables={"server": {"type": "string", "regex": r"^\d+\.\d+\.\d+\.\d+$"}},
    )

    assert automations_service.validate_variable_values(action, {"server": "10.0.0.1"})["server"] == "10.0.0.1"
    with pytest.raises(ValueError):
        automations_service.validate_variable_values(action, {"server": "not-an-ip"})


# ---------------------------------------------------------------------------
# CRUD round-trip through the API
# ---------------------------------------------------------------------------
def test_automations_crud_roundtrip_with_audit(app, client, auth_headers, create_platform):
    headers = auth_headers("auto-admin", "pw")
    platform = create_platform("cisco_xe", "ios")
    action = _make_action(platform.id, variables={"server": {"type": "string", "required": True}})

    create_resp = client.post(
        "/api/v1/automations",
        json={
            "name": "Nightly NTP",
            "action_id": action.id,
            "variable_values": {"server": "1.2.3.4"},
            "target": {"device_ids": [1]},
            "visibility": "shared",
        },
        headers=headers,
    )
    assert create_resp.status_code == 201, create_resp.data
    body = create_resp.get_json()
    automation_id = body["id"]
    assert body["visibility"] == "shared"
    assert body["variable_values"] == {"server": "1.2.3.4"}

    # Audit entry recorded on create.
    audit = AuditLogEntries.query.filter_by(action="automation.create").all()
    assert len(audit) == 1
    assert audit[0].target_id == automation_id

    # List
    list_resp = client.get("/api/v1/automations?filter[visibility]=shared", headers=headers)
    assert list_resp.status_code == 200
    data = list_resp.get_json()["data"]
    assert any(row["id"] == automation_id for row in data)

    # Patch
    patch_resp = client.patch(
        f"/api/v1/automations/{automation_id}",
        json={"description": "updated", "variable_values": {"server": "9.9.9.9"}},
        headers=headers,
    )
    assert patch_resp.status_code == 200
    assert patch_resp.get_json()["description"] == "updated"
    assert patch_resp.get_json()["variable_values"]["server"] == "9.9.9.9"
    assert AuditLogEntries.query.filter_by(action="automation.update").count() == 1

    # Delete
    delete_resp = client.delete(f"/api/v1/automations/{automation_id}", headers=headers)
    assert delete_resp.status_code == 200
    assert db.session.get(Automations, automation_id) is None
    assert AuditLogEntries.query.filter_by(action="automation.delete").count() == 1


def test_automations_create_rejects_invalid_variable_values(app, client, auth_headers, create_platform):
    headers = auth_headers("auto-admin", "pw")
    platform = create_platform("cisco_xe", "ios")
    action = _make_action(platform.id, variables={"server": {"type": "string", "required": True}})

    resp = client.post(
        "/api/v1/automations",
        json={"name": "Bad", "action_id": action.id, "variable_values": {}},
        headers=headers,
    )
    assert resp.status_code == 400
    assert "server" in (resp.get_json().get("detail") or "")


# ---------------------------------------------------------------------------
# POST /automations/<id>/test  (synchronous dry-run on one device)
# ---------------------------------------------------------------------------
def test_automation_test_returns_structured_dry_run(app, client, auth_headers, create_device, monkeypatch):
    headers = auth_headers("auto-admin", "pw")
    device = create_device()
    action = _make_action(
        device.platform_id,
        name="Show Version",
        op_type="show_version",
        template="show version",
        outputs={"version": {"type": "string", "source": "regex", "pattern": r"Version (\S+)"}},
        is_mutating=False,
    )
    automation = Automations(
        name="Check Version",
        action_id=action.id,
        variable_values={},
        target={"device_ids": [device.id]},
        visibility="private",
    )
    db.session.add(automation)
    db.session.commit()

    monkeypatch.setattr(
        ops, "_run_cli", lambda target, command, timeout: "Cisco IOS XE Software, Version 17.6.4"
    )

    resp = client.post(f"/api/v1/automations/{automation.id}/test", json={}, headers=headers)
    assert resp.status_code == 200, resp.data
    body = resp.get_json()
    assert body["dry_run"] is True
    assert body["result"]["device_id"] == device.id
    assert body["result"]["ok"] is True
    assert body["result"]["fields"] == {"version": "17.6.4"}


def test_automation_test_mutating_action_does_not_commit(app, client, auth_headers, create_device, monkeypatch):
    headers = auth_headers("auto-admin", "pw")
    device = create_device()
    action = _make_action(
        device.platform_id,
        name="Set NTP",
        op_type="config_ntp",
        template="ntp server 1.2.3.4",
        is_mutating=True,
    )
    automation = Automations(
        name="Apply NTP",
        action_id=action.id,
        variable_values={},
        target={"device_ids": [device.id]},
        visibility="private",
    )
    db.session.add(automation)
    db.session.commit()

    fake = _FakeNapalmDevice(diff="+ ntp server 1.2.3.4")

    @contextmanager
    def _fake_conn(target, timeout):
        yield fake

    monkeypatch.setattr(ops, "_napalm_connection", _fake_conn)

    resp = client.post(f"/api/v1/automations/{automation.id}/test", json={}, headers=headers)
    assert resp.status_code == 200, resp.data
    body = resp.get_json()
    assert body["dry_run"] is True
    assert body["result"]["diff"] == "+ ntp server 1.2.3.4"
    assert body["result"]["changed"] is False
    # Dry-run must discard, never commit.
    assert fake.committed is False
    assert fake.discarded is True


# ---------------------------------------------------------------------------
# POST /automations/<id>/run  (enqueue async job)
# ---------------------------------------------------------------------------
def test_automation_run_enqueues_operation_execute_job(app, client, auth_headers, create_device):
    headers = auth_headers("auto-admin", "pw")
    device = create_device()
    action = _make_action(device.platform_id, name="Show Run", op_type="backup", template="show run")
    automation = Automations(
        name="Backup",
        action_id=action.id,
        variable_values={},
        target={"device_ids": [device.id]},
        visibility="private",
    )
    db.session.add(automation)
    db.session.commit()

    resp = client.post(f"/api/v1/automations/{automation.id}/run", json={}, headers=headers)
    assert resp.status_code == 202, resp.data
    job_body = resp.get_json()["job"]

    job = db.session.get(Jobs, job_body["id"])
    assert job is not None
    assert job.job_type == "operation.execute"
    assert job.status == "queued"
    assert job.parameters["operation"]["template_id"] == action.id
    assert job.parameters["scope"]["device_ids"] == [device.id]

    tasks = JobTasks.query.filter_by(job_id=job.id).all()
    assert len(tasks) == 1
    assert tasks[0].device_id == device.id
    assert tasks[0].parameters["template_id"] == action.id


def test_automation_run_without_target_returns_400(app, client, auth_headers, create_platform):
    headers = auth_headers("auto-admin", "pw")
    platform = create_platform("cisco_xe", "ios")
    action = _make_action(platform.id)
    automation = Automations(name="No target", action_id=action.id, variable_values={}, target={})
    db.session.add(automation)
    db.session.commit()

    resp = client.post(f"/api/v1/automations/{automation.id}/run", json={}, headers=headers)
    assert resp.status_code == 400
