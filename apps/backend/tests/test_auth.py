"""
apps/backend/tests/test_auth.py
-------------------------------
Authentication flow tests for the Orbit backend.

Coverage
--------
- POST /api/v1/auth/login
- POST /api/v1/auth/refresh
- POST /api/v1/auth/logout
- GET  /api/v1/auth/me
"""

from __future__ import annotations

from flask_jwt_extended import decode_token, verify_jwt_in_request

from app.auth.routes import get_session_password
from app.models import Users


def test_login_success(client, auth_passwords):
    """
    Validate successful login returns tokens and user payload.
    """
    auth_passwords.add("p@ss")
    resp = client.post("/api/v1/auth/login", json={"username": "alice", "password": "p@ss"})
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
    resp = client.post("/api/v1/auth/login", json={"username": "bob", "password": "wrong"})
    assert resp.status_code == 401


def test_refresh_flow(client, auth_passwords):
    """
    Refresh should issue a new access token from a valid refresh.
    """
    auth_passwords.add("123")
    login = client.post("/api/v1/auth/login", json={"username": "carol", "password": "123"})
    refresh_token = login.get_json()["refresh_token"]

    resp = client.post("/api/v1/auth/refresh", headers={"Authorization": f"Bearer {refresh_token}"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert "access_token" in data and data["access_token"]


def test_login_includes_encrypted_session_password(client, auth_passwords):
    auth_passwords.add("session-pass")

    resp = client.post("/api/v1/auth/login", json={"username": "session-user", "password": "session-pass"})

    assert resp.status_code == 200
    access_token = resp.get_json()["access_token"]
    claims = decode_token(access_token)
    assert claims["ep"]


def test_refresh_carries_forward_encrypted_session_password(client, auth_passwords):
    auth_passwords.add("refresh-pass")
    login = client.post("/api/v1/auth/login", json={"username": "refresh-user", "password": "refresh-pass"})
    refresh_token = login.get_json()["refresh_token"]
    initial_claims = decode_token(login.get_json()["access_token"])

    refreshed = client.post("/api/v1/auth/refresh", headers={"Authorization": f"Bearer {refresh_token}"})

    assert refreshed.status_code == 200
    refreshed_claims = decode_token(refreshed.get_json()["access_token"])
    assert refreshed_claims["ep"] == initial_claims["ep"]


def test_get_session_password_returns_decrypted_claim(app, client, auth_passwords):
    auth_passwords.add("plain-secret")
    login = client.post("/api/v1/auth/login", json={"username": "decrypt-user", "password": "plain-secret"})
    access = login.get_json()["access_token"]

    with app.test_request_context(headers={"Authorization": f"Bearer {access}"}):
        verify_jwt_in_request()
        assert get_session_password() == "plain-secret"


def test_me_requires_auth(client):
    """
    /api/v1/auth/me requires a valid access token.
    """
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code in (401, 422)  # depending on JWT error handler config


def test_me_success(client, auth_passwords):
    """
    /api/v1/auth/me returns the current user's profile.
    """
    auth_passwords.add("pass")
    login = client.post("/api/v1/auth/login", json={"username": "dave", "password": "pass"})
    access = login.get_json()["access_token"]

    resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["username"] == "dave"
    assert "email" in data


def test_logout_revokes_token(client, auth_passwords):
    """
    Logout should succeed and subsequent use of the same token should fail.
    """
    auth_passwords.add("pw")
    login = client.post("/api/v1/auth/login", json={"username": "erin", "password": "pw"})
    access = login.get_json()["access_token"]

    # Use the token once successfully
    ok = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert ok.status_code == 200

    # Logout (revokes current token)
    out = client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {access}"})
    assert out.status_code == 200

    # Token should now be blocked
    blocked = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert blocked.status_code in (401, 422)


def test_login_lockout_after_repeated_failures(client, auth_passwords):
    """Too many failed attempts should return a lockout response."""

    for _ in range(5):
        resp = client.post("/api/v1/auth/login", json={"username": "mallory", "password": "nope"})
        assert resp.status_code == 401

    locked = client.post("/api/v1/auth/login", json={"username": "mallory", "password": "nope"})
    assert locked.status_code == 429
    payload = locked.get_json()
    assert "locked_until" in payload
    assert "retry_after" in payload


def test_dev_bypass_auth_succeeds_for_existing_user(app, client, create_user):
    app.config["AUTH_DEV_BYPASS"] = True
    create_user("dev-admin")

    resp = client.post("/api/v1/auth/login", json={"username": "dev-admin", "password": "ignored"})

    assert resp.status_code == 200
    assert resp.get_json()["user"]["username"] == "dev-admin"


def test_dev_bypass_auth_rejects_missing_user(app, client):
    app.config["AUTH_DEV_BYPASS"] = True

    resp = client.post("/api/v1/auth/login", json={"username": "ghost", "password": "ignored"})

    assert resp.status_code == 401


def test_dev_bypass_assigns_admin_role_when_user_has_no_roles(app, client, db):
    app.config["AUTH_DEV_BYPASS"] = True

    user = Users(username="roleless-dev", email="roleless-dev@local", roles=[])
    db.session.add(user)
    db.session.commit()

    resp = client.post("/api/v1/auth/login", json={"username": "roleless-dev", "password": "ignored"})

    assert resp.status_code == 200
    db.session.refresh(user)
    assert user.roles == ["admin"]
