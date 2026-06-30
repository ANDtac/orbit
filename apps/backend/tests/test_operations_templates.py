from __future__ import annotations

from app.models import PlatformOperationTemplates


def test_platform_operation_templates_crud_and_filters(client, auth_headers, create_platform):
    headers = auth_headers("template-admin", "pw")
    platform = create_platform("cisco_nxos", "nxos")

    create_resp = client.post(
        "/api/v1/platform_operation_templates",
        json={
            "platform_id": platform.id,
            "name": "Backup Running Config",
            "op_type": "backup",
            "template": "show running-config",
            "notes": "nightly backup",
        },
        headers=headers,
    )

    assert create_resp.status_code == 201, create_resp.data
    template_id = create_resp.get_json()["id"]

    list_resp = client.get(
        f"/api/v1/platform_operation_templates?platform_id={platform.id}&op_type=backup",
        headers=headers,
    )
    assert list_resp.status_code == 200
    rows = list_resp.get_json()
    assert len(rows) == 1
    assert rows[0]["name"] == "Backup Running Config"

    patch_resp = client.patch(
        f"/api/v1/platform_operation_templates/{template_id}",
        json={"notes": "updated notes"},
        headers=headers,
    )
    assert patch_resp.status_code == 200
    assert patch_resp.get_json()["notes"] == "updated notes"

    delete_resp = client.delete(f"/api/v1/platform_operation_templates/{template_id}", headers=headers)
    assert delete_resp.status_code == 200
    assert db.session.get(PlatformOperationTemplates, template_id) is None


def test_platform_operation_templates_validate_required_fields(client, auth_headers, create_platform):
    headers = auth_headers("template-validator", "pw")
    platform = create_platform("cisco_xe", "ios")

    resp = client.post(
        "/api/v1/platform_operation_templates",
        json={"platform_id": platform.id, "op_type": "backup"},
        headers=headers,
    )

    assert resp.status_code == 400
