from __future__ import annotations

from app.extensions import db
from app.models import AppEvents, AuditLogEntries, ErrorLogs, Manufacturers, ProductModels


def test_password_change_job_records_domain_events_and_failures(
    app,
    client,
    auth_headers,
    create_device,
    monkeypatch,
):
    app.config["PASSWORD_CHANGE_RUN_INLINE_JOBS"] = True
    device = create_device()
    headers = auth_headers("phase7-operator", "pw")

    def fake_handler(target):
        return {
            "device_id": target["device_id"],
            "ok": False,
            "changed": False,
            "error": "validation failed",
            "phase": "validate",
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

    events = AppEvents.query.order_by(AppEvents.id.asc()).all()
    event_names = [event.event for event in events]
    assert "password_change.started" in event_names
    assert "password_change.device_result" in event_names
    assert "password_change.completed" in event_names

    state_changes = [event for event in events if event.event == "job.state_change" and event.extra.get("job_id") == job_id]
    transitions = {(event.extra.get("from_status"), event.extra.get("to_status")) for event in state_changes}
    assert (None, "queued") in transitions
    assert ("queued", "running") in transitions
    assert ("running", "failed") in transitions

    error_log = ErrorLogs.query.order_by(ErrorLogs.id.desc()).first()
    assert error_log is not None
    assert error_log.context["device_id"] == device.id
    assert error_log.context["phase"] == "validate"


def test_sync_operation_records_app_event_and_audit_entry(client, auth_headers, create_device):
    device = create_device()
    headers = auth_headers("phase7-sync-op", "pw")

    resp = client.post(
        "/api/v1/operations/execute",
        json={
            "device_ids": [device.id],
            "op_type": "show_version",
            "dry_run": False,
            "async": False,
        },
        headers=headers,
    )

    assert resp.status_code == 200
    app_event = AppEvents.query.filter_by(event="operation.execute").order_by(AppEvents.id.desc()).first()
    assert app_event is not None
    assert app_event.extra["device_count"] == 1

    audit_entry = AuditLogEntries.query.filter_by(action="operation.execute", target_id=device.id).first()
    assert audit_entry is not None
    assert audit_entry.target_type == "device"


def test_mutation_endpoints_write_audit_entries(client, auth_headers):
    headers = auth_headers("phase7-auditor", "pw")

    platform_resp = client.post(
        "/api/v1/platforms",
        json={"slug": "phase7-ios", "display_name": "Phase 7 IOS", "napalm_driver": "ios"},
        headers=headers,
    )
    assert platform_resp.status_code == 201
    platform_id = platform_resp.get_json()["id"]

    platform_patch = client.patch(
        f"/api/v1/platforms/{platform_id}",
        json={"vendor_hint": "cisco"},
        headers=headers,
    )
    assert platform_patch.status_code == 200

    credential_resp = client.post(
        "/api/v1/credential_profiles",
        json={"name": "phase7-creds", "auth_type": "username_password", "username": "admin"},
        headers=headers,
    )
    assert credential_resp.status_code == 201
    credential_id = credential_resp.get_json()["id"]

    credential_patch = client.patch(
        f"/api/v1/credential_profiles/{credential_id}",
        json={"description": "updated"},
        headers=headers,
    )
    assert credential_patch.status_code == 200

    policy_resp = client.post(
        "/api/v1/compliance/policies",
        json={"name": "Phase 7 Policy", "scope": {}, "is_active": True},
        headers=headers,
    )
    assert policy_resp.status_code == 201
    policy_id = policy_resp.get_json()["id"]

    policy_patch = client.patch(
        f"/api/v1/compliance/policies/{policy_id}",
        json={"description": "updated"},
        headers=headers,
    )
    assert policy_patch.status_code == 200

    manufacturer = Manufacturers(name="Phase7 Vendor")
    db.session.add(manufacturer)
    db.session.flush()
    product_model = ProductModels(manufacturer_id=manufacturer.id, name="Phase7 Model")
    db.session.add(product_model)
    db.session.commit()

    hardware_resp = client.post(
        "/api/v1/eox_hardware",
        json={"product_model_id": product_model.id},
        headers=headers,
    )
    assert hardware_resp.status_code == 201
    hardware_id = hardware_resp.get_json()["id"]

    hardware_patch = client.patch(
        f"/api/v1/eox_hardware/{hardware_id}",
        json={"notes": "updated"},
        headers=headers,
    )
    assert hardware_patch.status_code == 200

    software_resp = client.post(
        "/api/v1/eox_software",
        json={"platform_id": platform_id, "os_name": "iosxe", "match_operator": "eq", "match_value": "17.9.1"},
        headers=headers,
    )
    assert software_resp.status_code == 201
    software_id = software_resp.get_json()["id"]

    software_patch = client.patch(
        f"/api/v1/eox_software/{software_id}",
        json={"notes": "updated"},
        headers=headers,
    )
    assert software_patch.status_code == 200

    device_resp = client.post(
        "/api/v1/devices",
        json={
            "name": "phase7-device",
            "mgmt_ipv4": "10.10.10.10",
            "platform_id": platform_id,
            "credential_profile_id": credential_id,
        },
        headers=headers,
    )
    assert device_resp.status_code == 201
    device_id = device_resp.get_json()["id"]

    device_patch = client.patch(
        f"/api/v1/devices/{device_id}",
        json={"notes": "updated"},
        headers=headers,
    )
    assert device_patch.status_code == 200

    assert client.delete(f"/api/v1/devices/{device_id}", headers=headers).status_code == 200
    assert client.delete(f"/api/v1/eox_software/{software_id}", headers=headers).status_code == 200
    assert client.delete(f"/api/v1/eox_hardware/{hardware_id}", headers=headers).status_code == 200
    assert client.delete(f"/api/v1/compliance/policies/{policy_id}", headers=headers).status_code == 200
    assert client.delete(f"/api/v1/credential_profiles/{credential_id}", headers=headers).status_code == 200
    assert client.delete(f"/api/v1/platforms/{platform_id}", headers=headers).status_code == 200

    actions = {entry.action for entry in AuditLogEntries.query.all()}
    expected = {
        "device.create",
        "device.update",
        "device.delete",
        "platform.create",
        "platform.update",
        "platform.delete",
        "credential_profile.create",
        "credential_profile.update",
        "credential_profile.delete",
        "compliance_policy.create",
        "compliance_policy.update",
        "compliance_policy.delete",
        "eox_hardware.create",
        "eox_hardware.update",
        "eox_hardware.delete",
        "eox_software.create",
        "eox_software.update",
        "eox_software.delete",
    }

    assert expected.issubset(actions)
