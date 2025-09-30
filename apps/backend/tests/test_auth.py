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

import json


def test_login_success(client, create_user):
    """
    Validate successful login returns tokens and user payload.
    """
    create_user("alice", "p@ss")
    resp = client.post("/auth/login", json={"username": "alice", "password": "p@ss"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert "access_token" in data and data["access_token"]
    assert "refresh_token" in data and data["refresh_token"]
    assert data["user"]["username"] == "alice"


def test_login_invalid_credentials(client, create_user):
    """
    Invalid password should return 401.
    """
    create_user("bob", "right")
    resp = client.post("/auth/login", json={"username": "bob", "password": "wrong"})
    assert resp.status_code == 401


def test_refresh_flow(client, create_user):
    """
    Refresh should issue a new access token from a valid refresh.
    """
    create_user("carol", "123")
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


def test_me_success(client, create_user):
    """
    /auth/me returns the current user's profile.
    """
    create_user("dave", "pass")
    login = client.post("/auth/login", json={"username": "dave", "password": "pass"})
    access = login.get_json()["access_token"]

    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["username"] == "dave"
    assert "email" in data


def test_logout_revokes_token(client, create_user):
    """
    Logout should succeed and subsequent use of the same token should fail.
    """
    create_user("erin", "pw")
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