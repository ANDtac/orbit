"""
apps/backend/tests/test_eox.py
------------------------------
Lifecycle (EoX) API tests covering hardware, software, and device queries.

Coverage
--------
- /eox_hardware CRUD + filters
- /eox_software CRUD + filters
- /eox/devices query for "past" and "due soon" milestones
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.extensions import db
from app.models import ProductModels


def _iso(dt: datetime) -> str:
    """UTC -> ISO8601 'Z' string."""
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


# -----------------------------------------------------------------------------
# /eox_hardware
# -----------------------------------------------------------------------------
def test_eox_hardware_crud_and_filters(client, auth_headers):
    """
    Create a ProductModel and a HardwareLifecycle row, list/filter, patch, delete.
    """
    headers = auth_headers("eoxhw", "pw")

    # Create a product model to attach lifecycle to
    pm = ProductModels(manufacturer_id=None, name="Test Chassis 9000", model_number="TC-9000")
    db.session.add(pm)
    db.session.commit()

    eos = _iso(datetime.now(timezone.utc) - timedelta(days=30))  # past EOS
    payload = {
        "product_model_id": pm.id,
        "end_of_sale_date": eos,
        "source_url": "https://example.local/eox/tc-9000",
        "notes": "initial",
    }
    # Create
    r = client.post("/api/v1/eox_hardware", json=payload, headers=headers)
    assert r.status_code == 201, r.data
    row = r.get_json()
    rid = row["id"]
    assert row["product_model_id"] == pm.id

    # List (filter by product_model_id)
    r = client.get(f"/api/v1/eox_hardware?product_model_id={pm.id}", headers=headers)
    assert r.status_code == 200
    rows = r.get_json()
    assert any(x["id"] == rid for x in rows)

    # List (past=eos)
    r = client.get("/api/v1/eox_hardware?past=eos", headers=headers)
    assert r.status_code == 200
    assert any(x["id"] == rid for x in r.get_json())

    # Get
    r = client.get(f"/api/v1/eox_hardware/{rid}", headers=headers)
    assert r.status_code == 200
    assert r.get_json()["id"] == rid

    # Patch
    r = client.patch(f"/api/v1/eox_hardware/{rid}", json={"notes": "updated"}, headers=headers)
    assert r.status_code == 200
    assert r.get_json()["notes"] == "updated"

    # Delete
    r = client.delete(f"/api/v1/eox_hardware/{rid}", headers=headers)
    assert r.status_code == 200

    # Ensure gone
    r = client.get(f"/api/v1/eox_hardware/{rid}", headers=headers)
    assert r.status_code == 404


# -----------------------------------------------------------------------------
# /eox_software
# -----------------------------------------------------------------------------
def test_eox_software_crud_and_list(client, auth_headers, create_platform):
    """
    Create a SoftwareLifecycle row, list/filter, patch, delete.
    """
    headers = auth_headers("eoxsw", "pw")
    platform = create_platform("cisco_xe", "ios")

    ldos = _iso(datetime.now(timezone.utc) + timedelta(days=180))
    payload = {
        "platform_id": platform.id,
        "os_name": "iosxe",
        "match_operator": "eq",
        "match_value": "17.6.3",
        "last_day_of_support_date": ldos,
        "source_url": "https://example.local/eox/sw/iosxe-17.6.3",
        "notes": "initial",
    }

    # Create
    r = client.post("/api/v1/eox_software", json=payload, headers=headers)
    assert r.status_code == 201, r.data
    row = r.get_json()
    rid = row["id"]

    # List (filter by os_name)
    r = client.get("/api/v1/eox_software?os_name=iosxe", headers=headers)
    assert r.status_code == 200
    assert any(x["id"] == rid for x in r.get_json())

    # Get
    r = client.get(f"/api/v1/eox_software/{rid}", headers=headers)
    assert r.status_code == 200

    # Patch
    r = client.patch(f"/api/v1/eox_software/{rid}", json={"notes": "updated"}, headers=headers)
    assert r.status_code == 200
    assert r.get_json()["notes"] == "updated"

    # Delete
    r = client.delete(f"/api/v1/eox_software/{rid}", headers=headers)
    assert r.status_code == 200

    # Ensure gone
    r = client.get(f"/api/v1/eox_software/{rid}", headers=headers)
    assert r.status_code == 404


# -----------------------------------------------------------------------------
# /eox/devices
# -----------------------------------------------------------------------------
def test_eox_devices_query_past_and_due(client, auth_headers, create_device, create_platform):
    """
    Create a device with hardware lifecycle past and software lifecycle due soon,
    then query /eox/devices for both 'past' and 'due soon' windows.
    """
    headers = auth_headers("eoxq", "pw")

    # Product model for hardware lifecycle
    pm = ProductModels(manufacturer_id=None, name="Edge 5k", model_number="E5K")
    db.session.add(pm)
    db.session.commit()

    # Device with platform + product_model + software details
    plat = create_platform("cisco_xe", "ios")
    dev = create_device(
        name="edge-5k-1",
        fqdn="edge-5k-1.local",
        mgmt_ipv4="10.20.30.40",
        platform_id=plat.id,
        os_name="iosxe",
        os_version="17.9.1",
        product_model_id=pm.id,  # ensure hardware lifecycle can attach
    )

    # Create hardware lifecycle with LAST DAY OF SUPPORT in the past
    past_ldos = _iso(datetime.now(timezone.utc) - timedelta(days=7))
    r = client.post(
        "/api/v1/eox_hardware",
        json={"product_model_id": pm.id, "last_day_of_support_date": past_ldos},
        headers=headers,
    )
    assert r.status_code == 201

    # Create software lifecycle with LAST DAY OF SUPPORT due soon (e.g., 30 days)
    soon_ldos = _iso(datetime.now(timezone.utc) + timedelta(days=30))
    r = client.post(
        "/api/v1/eox_software",
        json={
            "platform_id": plat.id,
            "os_name": "iosxe",
            "match_operator": "prefix",
            "match_value": "17.9",
            "last_day_of_support_date": soon_ldos,
        },
        headers=headers,
    )
    assert r.status_code == 201

    # Query: milestone=ldos, past=true -> should include device because hardware LDOS is past
    r = client.get("/api/v1/eox/devices?milestone=ldos&past=true", headers=headers)
    assert r.status_code == 200
    items = r.get_json()
    ids = {it["device_id"] for it in items}
    assert dev.id in ids

    # Query: milestone=ldos, past=false, within_days=60 -> should include device due soon (software)
    r = client.get("/api/v1/eox/devices?milestone=ldos&past=false&within_days=60", headers=headers)
    assert r.status_code == 200
    items = r.get_json()
    ids = {it["device_id"] for it in items}
    assert dev.id in ids