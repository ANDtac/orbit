"""
apps/backend/tests/test_devices.py
----------------------------------
CRUD and listing tests for the /devices endpoints.

Coverage
--------
- Auth requirement
- Create -> Read -> Update -> List (with filters/sorting/pagination) -> Delete
- PATCH ignores unknown fields
"""

from __future__ import annotations


def test_devices_requires_auth(client):
    """
    GET /devices should require authentication.
    """
    resp = client.get("/api/v1/devices")
    assert resp.status_code in (401, 422)


def test_device_crud_flow(client, auth_headers, create_platform, create_inventory_group):
    """
    Full lifecycle:
    - POST /devices
    - GET /devices/<id>
    - PATCH /devices/<id>
    - GET /devices?filter[name]=
    - DELETE /devices/<id>
    """
    headers = auth_headers("tester", "pw")

    platform = create_platform("cisco_xe", "ios")
    group = create_inventory_group("Core")

    # Create
    payload = {
        "name": "edge-sw1",
        "fqdn": "edge-sw1.local",
        "mgmt_ipv4": "10.10.10.11",
        "mgmt_port": 22,
        "platform_id": platform.id,
        "inventory_group_id": group.id,
        "os_name": "iosxe",
        "os_version": "17.6.3",
        "is_active": True,
        "notes": "created via test",
    }
    r = client.post("/api/v1/devices", json=payload, headers=headers)
    assert r.status_code == 201, r.data
    created = r.get_json()
    dev_id = created["id"]
    assert created["name"] == "edge-sw1"
    assert created["platform_id"] == platform.id

    # Read
    r = client.get(f"/api/v1/devices/{dev_id}", headers=headers)
    assert r.status_code == 200
    got = r.get_json()
    assert got["id"] == dev_id
    assert got["name"] == "edge-sw1"

    # Update (PATCH)
    r = client.patch(f"/api/v1/devices/{dev_id}", json={"name": "edge-sw1-renamed"}, headers=headers)
    assert r.status_code == 200
    updated = r.get_json()
    assert updated["name"] == "edge-sw1-renamed"

    # List with filter
    r = client.get(
        "/api/v1/devices?filter[name]=edge-sw1-renamed", headers=headers
    )
    assert r.status_code == 200
    payload = r.get_json()
    assert any(it["id"] == dev_id for it in payload["data"])

    # Delete
    r = client.delete(f"/api/v1/devices/{dev_id}", headers=headers)
    assert r.status_code == 200

    # Ensure gone
    r = client.get(f"/api/v1/devices/{dev_id}", headers=headers)
    assert r.status_code == 404


def test_devices_filters_sort_pagination(client, auth_headers, create_device):
    """
    Create several devices and validate:
    - name filter
    - sort param (by name ASC/DESC)
    - pagination (cursor-based page[size]/page[cursor])
    """
    headers = auth_headers("u", "p")

    # Create 5 devices with distinct names/ips
    names = ["alpha", "bravo", "charlie", "delta", "echo"]
    for i, name in enumerate(names, start=1):
        create_device(name=name, fqdn=f"{name}.local", mgmt_ipv4=f"10.0.0.{i}")

    # Name filter (substring)
    r = client.get("/api/v1/devices?filter[name]=ha", headers=headers)
    assert r.status_code == 200
    rows = r.get_json()["data"]
    got_names = {row["name"] for row in rows}
    assert "charlie" in got_names  # contains 'ha'

    # Sort ascending by name
    r = client.get("/api/v1/devices?sort=name", headers=headers)
    assert r.status_code == 200
    asc = [row["name"] for row in r.get_json()["data"]]
    assert asc == sorted(asc)

    # Sort descending by name
    r = client.get("/api/v1/devices?sort=-name", headers=headers)
    assert r.status_code == 200
    desc = [row["name"] for row in r.get_json()["data"]]
    assert desc == sorted(desc, reverse=True)

    # Pagination (page[size]=2)
    r1 = client.get("/api/v1/devices?page[size]=2&sort=name", headers=headers)
    assert r1.status_code == 200
    payload1 = r1.get_json()
    page1 = [row["name"] for row in payload1["data"]]
    assert len(page1) == 2

    next_cursor = payload1["page"]["next"]
    assert next_cursor is not None

    r2 = client.get(
        f"/api/v1/devices?page[size]=2&page[cursor]={next_cursor}&sort=name",
        headers=headers,
    )
    assert r2.status_code == 200
    payload2 = r2.get_json()
    page2 = [row["name"] for row in payload2["data"]]

    assert len(page2) == 2
    assert not set(page1).intersection(page2)


def test_patch_ignores_unknown_fields(client, auth_headers, create_device):
    """
    PATCH should ignore unknown attributes rather than erroring.
    """
    headers = auth_headers("userx", "passx")
    d = create_device(name="unknown-test")

    r = client.patch(
        f"/api/v1/devices/{d.id}",
        json={"name": "unknown-test-upd", "nonexistent_field": "ignored"},
        headers=headers,
    )
    assert r.status_code == 200
    data = r.get_json()
    assert data["name"] == "unknown-test-upd"
    # Ensure the unknown field didn't get added somehow
    assert "nonexistent_field" not in data