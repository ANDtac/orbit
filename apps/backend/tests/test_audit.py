from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.extensions import db
from app.models import AuditLogEntries


def test_audit_entries_support_filters_and_cursor_pagination(client, auth_headers):
    headers = auth_headers("audit-admin", "pw")

    now = datetime.now(timezone.utc)
    entries = [
        AuditLogEntries(
            actor_display_name="audit-admin",
            action="platform.create",
            target_type="platform",
            target_id=1,
            payload={"slug": "cisco_xe"},
            occurred_at=now - timedelta(minutes=2),
        ),
        AuditLogEntries(
            actor_display_name="audit-admin",
            action="credential.update",
            target_type="credential_profile",
            target_id=2,
            payload={"name": "default"},
            occurred_at=now - timedelta(minutes=1),
        ),
    ]
    db.session.add_all(entries)
    db.session.commit()

    resp = client.get(
        "/api/v1/audit?page[size]=1&filter[action]=platform.create&filter[target_type]=platform",
        headers=headers,
    )

    assert resp.status_code == 200
    payload = resp.get_json()
    assert len(payload["data"]) == 1
    assert payload["data"][0]["action"] == "platform.create"
    assert payload["page"]["next"] is None


def test_audit_requires_network_admin_role(client, auth_passwords, create_user):
    auth_passwords.add("pw")
    create_user("viewer-user", "pw", roles=["viewer"])
    login = client.post("/api/v1/auth/login", json={"username": "viewer-user", "password": "pw"})
    headers = {"Authorization": f"Bearer {login.get_json()['access_token']}"}

    resp = client.get("/api/v1/audit", headers=headers)

    assert resp.status_code == 403
