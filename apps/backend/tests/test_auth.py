"""
apps/backend/tests/test_auth.py
-------------------------------
Authentication flow tests for the Orbit backend.

Coverage
--------
- POST /auth/login
- POST /auth/refresh
- POST /auth/logout
- GET  /auth/me
"""

from __future__ import annotations

from app.models import Users


def test_login_success(client, auth_passwords):
    """
    Validate successful login returns tokens and user payload.
    """
    auth_passwords.add("p@ss")
    resp = client.post("/auth/login", json={"username": "alice", "password": "p@ss"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert "access_token" in data and data["access_token"]
    assert "refresh_token" in data and data["refresh_token"]
    assert data["user"]["username"] == "alice"
    assert Users.query.filter_by(username="alice").first() is not None


def test_login_invalid_credentials(client, auth_passwords):
    """
    Invalid password should return 401.
    """
    resp = client.post("/auth/login", json={"username": "bob", "password": "wrong"})
    assert resp.status_code == 401


def test_refresh_flow(client, auth_passwords):
    """
    Refresh should issue a new access token from a valid refresh.
    """
    auth_passwords.add("123")
    login = client.post("/auth/login", json={"username": "carol", "password": "123"})
    refresh_token = login.get_json()["refresh_token"]

    resp = client.post("/auth/refresh", headers={"Authorization": f"Bearer {refresh_token}"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert "access_token" in data and data["access_token"]


def test_me_requires_auth(client):
    """
    /auth/me requires a valid access token.
    """
    resp = client.get("/auth/me")
    assert resp.status_code in (401, 422)  # depending on JWT error handler config


def test_me_success(client, auth_passwords):
    """
    /auth/me returns the current user's profile.
    """
    auth_passwords.add("pass")
    login = client.post("/auth/login", json={"username": "dave", "password": "pass"})
    access = login.get_json()["access_token"]

    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["username"] == "dave"
    assert "email" in data


def test_logout_revokes_token(client, auth_passwords):
    """
    Logout should succeed and subsequent use of the same token should fail.
    """
    auth_passwords.add("pw")
    login = client.post("/auth/login", json={"username": "erin", "password": "pw"})
    access = login.get_json()["access_token"]

    # Use the token once successfully
    ok = client.get("/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert ok.status_code == 200

    # Logout (revokes current token)
    out = client.post("/auth/logout", headers={"Authorization": f"Bearer {access}"})
    assert out.status_code == 200

    # Token should now be blocked
    blocked = client.get("/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert blocked.status_code in (401, 422)


def test_login_lockout_after_repeated_failures(client, auth_passwords):
    """Too many failed attempts should return a lockout response."""

    for _ in range(5):
        resp = client.post("/auth/login", json={"username": "mallory", "password": "nope"})
        assert resp.status_code == 401

    locked = client.post("/auth/login", json={"username": "mallory", "password": "nope"})
    assert locked.status_code == 429
    payload = locked.get_json()
    assert "locked_until" in payload
    assert "retry_after" in payload