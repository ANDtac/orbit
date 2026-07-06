"""Catalog API round-trip for the Phase 2 Actions-catalog fields.

Verifies ``outputs`` / ``is_mutating`` / ``is_active`` create and update through
the platform_operation_templates REST resource.
"""

from __future__ import annotations

from app.extensions import db as _db
from app.models import PlatformOperationTemplates


def test_create_template_with_outputs_and_is_mutating(client, auth_headers, create_platform):
    headers = auth_headers("catalog-admin", "pw")
    platform = create_platform("cisco_nxos", "nxos")

    outputs = {
        "version": {"type": "string", "source": "regex", "pattern": r"Version (\S+)"},
        "uptime": {"type": "number", "source": "napalm_getter", "getter": "get_facts", "path": "uptime"},
    }
    resp = client.post(
        "/api/v1/platform_operation_templates",
        json={
            "platform_id": platform.id,
            "name": "Show Version",
            "op_type": "show_version",
            "template": "show version",
            "outputs": outputs,
            "is_mutating": True,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.data
    body = resp.get_json()
    assert body["outputs"] == outputs
    assert body["is_mutating"] is True
    assert body["is_active"] is True  # DisableableMixin default

    # Persisted correctly.
    row = _db.session.get(PlatformOperationTemplates, body["id"])
    assert row.outputs == outputs
    assert row.is_mutating is True


def test_create_template_defaults_outputs_and_flag(client, auth_headers, create_platform):
    headers = auth_headers("catalog-admin2", "pw")
    platform = create_platform("cisco_xe", "ios")

    resp = client.post(
        "/api/v1/platform_operation_templates",
        json={
            "platform_id": platform.id,
            "name": "Backup",
            "op_type": "backup",
            "template": "show running-config",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.data
    body = resp.get_json()
    # Backward compatible defaults.
    assert body["outputs"] == {}
    assert body["is_mutating"] is False
    assert body["is_active"] is True


def test_update_template_outputs_round_trip(client, auth_headers, create_platform):
    headers = auth_headers("catalog-editor", "pw")
    platform = create_platform("cisco_xe", "ios")

    created = client.post(
        "/api/v1/platform_operation_templates",
        json={
            "platform_id": platform.id,
            "name": "Interfaces",
            "op_type": "show_interfaces",
            "template": "show interfaces",
        },
        headers=headers,
    ).get_json()

    new_outputs = {
        "if_up": {"type": "boolean", "source": "textfsm", "command": "show interfaces", "field": "link_status"}
    }
    patch = client.patch(
        f"/api/v1/platform_operation_templates/{created['id']}",
        json={"outputs": new_outputs, "is_mutating": True},
        headers=headers,
    )
    assert patch.status_code == 200, patch.data
    body = patch.get_json()
    assert body["outputs"] == new_outputs
    assert body["is_mutating"] is True
