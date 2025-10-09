"""
app/auth/routes.py
------------------
Authentication and token management routes leveraging device-backed logins.

Responsibilities
----------------
- Authenticate users by validating their device credentials via Netmiko.
- Enforce rate limiting and lockout windows for repeated failed attempts.
- Issue JWT access and refresh tokens on login and refresh requests.
- Revoke tokens by storing their JTI in a blocklist (logout).
- Return current user info (`/auth/me`) for convenience.

Security Model
--------------
- Uses Flask-JWT-Extended for JWT handling.
- Access tokens: short-lived; used for API requests.
- Refresh tokens: longer-lived; used only to obtain new access tokens.
- Logout adds the current token's JTI to the `JWTTokenBlocklist` table.
  The application checks this blocklist in `app/__init__.py` via
  `@jwt.token_in_blocklist_loader`.
- Login attempts are persisted in `LoginAttempts` for auditing and
  throttle enforcement.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, Tuple

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_jwt,
    get_jwt_identity,
    jwt_required,
    verify_jwt_in_request,
)
from sqlalchemy import func

from ..extensions import db
from ..models import Users, JWTTokenBlocklist, LoginAttempts

auth_bp = Blueprint("auth", __name__)


def _user_to_dict(user: Users) -> Dict[str, Any]:
    """
    Serialize a user model to a safe dictionary for responses.

    Parameters
    ----------
    user : Users
        The ORM user row.

    Returns
    -------
    dict
        Minimal user details safe for API output.
    """
    return {
        "id": user.id,
        "username": getattr(user, "username", None),
        "email": getattr(user, "email", None),
        "is_active": getattr(user, "is_active", True),
        "roles": getattr(user, "roles", None),
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
    }


def _get_client_ip() -> str | None:
    """Extract the requesting client's IP address."""

    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr


def _normalize_user_agent() -> str | None:
    """Return a trimmed user agent string suitable for persistence."""

    ua = request.user_agent.string if request.user_agent else None
    if ua:
        return ua[:512]
    return None


def _verify_device_credentials(username: str, password: str) -> Tuple[bool, str | None]:
    """Validate credentials by attempting a Netmiko SSH login or configured tester."""

    tester: Callable[[str, str], Tuple[bool, str | None] | bool] | None = current_app.config.get(
        "AUTH_CREDENTIAL_TESTER"
    )
    if callable(tester):
        result = tester(username, password)
        if isinstance(result, tuple):
            success, reason = result
            return bool(success), reason
        return bool(result), None if result else "invalid credentials"

    host = current_app.config.get("AUTH_NETMIKO_HOST")
    device_type = current_app.config.get("AUTH_NETMIKO_DEVICE_TYPE")
    port = int(current_app.config.get("AUTH_NETMIKO_PORT", 22) or 22)
    timeout = int(current_app.config.get("AUTH_NETMIKO_TIMEOUT", 10) or 10)
    extras = current_app.config.get("AUTH_NETMIKO_EXTRA", {})

    if not host or not device_type:
        current_app.logger.error("auth_netmiko_config_missing")
        return False, "authentication service unavailable"

    try:
        from netmiko import ConnectHandler
        from netmiko.exceptions import NetmikoTimeoutException, NetmikoAuthenticationException
    except Exception:  # pragma: no cover - import errors handled in tests
        current_app.logger.exception("auth_netmiko_import_failed")
        return False, "authentication service unavailable"

    device_kwargs: Dict[str, Any] = {
        "device_type": device_type,
        "host": host,
        "port": port,
        "username": username,
        "password": password,
        "timeout": timeout,
        "fast_cli": False,
    }
    if isinstance(extras, dict):
        device_kwargs.update(extras)

    try:
        connection = ConnectHandler(**device_kwargs)
        connection.disconnect()
        return True, None
    except NetmikoAuthenticationException:
        return False, "invalid credentials"
    except NetmikoTimeoutException:
        current_app.logger.warning("auth_netmiko_timeout", extra={"username": username})
        return False, "authentication timeout"
    except Exception:
        current_app.logger.exception("auth_netmiko_unexpected_error")
        return False, "authentication service unavailable"


def _record_login_attempt(
    username: str,
    success: bool,
    failure_reason: str | None,
    ip_address: str | None,
) -> LoginAttempts:
    """Persist a login attempt for auditing purposes."""

    attempt = LoginAttempts(
        username=username,
        ip_address=ip_address,
        user_agent=_normalize_user_agent(),
        success=success,
        failure_reason=failure_reason if not success else None,
        created_at=datetime.now(timezone.utc),
    )
    db.session.add(attempt)
    return attempt


@auth_bp.post("/login")
def login():
    """
    POST /auth/login
    ----------------
    Authenticate with username and password by validating against a test device.

    Body
    ----
    {
        "username": "alice",
        "password": "secret"
    }

    Returns
    -------
    200 OK
        {
            "access_token": "<jwt>",
            "refresh_token": "<jwt>",
            "expires_in": <seconds>,
            "refresh_expires_in": <seconds>,
            "user": { ...user fields... }
        }
    400/401/429/503 on invalid input or credentials.
    """

    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"message": "username and password required"}), 400

    now = datetime.now(timezone.utc)
    client_ip = _get_client_ip()

    cfg = current_app.config
    max_attempts = int(cfg.get("AUTH_LOGIN_MAX_ATTEMPTS", 5) or 5)
    window_seconds = int(cfg.get("AUTH_LOGIN_WINDOW_SECONDS", 15 * 60) or (15 * 60))
    lockout_seconds = int(cfg.get("AUTH_LOGIN_LOCKOUT_SECONDS", 15 * 60) or (15 * 60))

    window_start = now - timedelta(seconds=window_seconds)
    failure_query = LoginAttempts.query.filter(
        func.lower(LoginAttempts.username) == username.lower(),
        LoginAttempts.created_at >= window_start,
        LoginAttempts.success.is_(False),
    )
    if client_ip:
        failure_query = failure_query.filter(LoginAttempts.ip_address == client_ip)

    failure_count = failure_query.count()
    if failure_count >= max_attempts:
        latest_failure = failure_query.order_by(LoginAttempts.created_at.desc()).first()
        if latest_failure:
            locked_until = latest_failure.created_at + timedelta(seconds=lockout_seconds)
            if locked_until.tzinfo is None:
                locked_until = locked_until.replace(tzinfo=timezone.utc)
            if locked_until > now:
                retry_after = max(1, int((locked_until - now).total_seconds()))
                response = jsonify(
                    {
                        "message": "account temporarily locked",
                        "locked_until": locked_until.isoformat(),
                        "retry_after": retry_after,
                    }
                )
                response.status_code = 429
                response.headers["Retry-After"] = str(retry_after)
                return response

    success, failure_reason = _verify_device_credentials(username, password)
    attempt = _record_login_attempt(username, success, failure_reason, client_ip)

    if not success:
        db.session.commit()
        message_map = {
            "invalid credentials": ("invalid credentials", 401),
            "authentication timeout": ("authentication timeout", 503),
            "authentication service unavailable": ("authentication unavailable", 503),
        }
        message, status = message_map.get(failure_reason or "", ("authentication failed", 401))
        return jsonify({"message": message}), status

    try:
        user = Users.query.filter(func.lower(Users.username) == username.lower()).first()
        if not user:
            user = Users(username=username)
            db.session.add(user)
            db.session.flush()
        if not getattr(user, "is_active", True) or not getattr(user, "jwt_auth_active", True):
            attempt.success = False
            attempt.failure_reason = "account disabled"
            db.session.commit()
            return jsonify({"message": "account disabled"}), 403

        user.mark_login(now)
        db.session.flush()
        db.session.commit()
    except Exception:
        db.session.rollback()
        current_app.logger.exception("auth_login_persistence_failed")
        return jsonify({"message": "authentication unavailable"}), 503

    identity = str(user.id)
    claims = {"sub": identity, "username": user.username}
    access_token = create_access_token(identity=identity, additional_claims=claims)
    refresh_token = create_refresh_token(identity=identity, additional_claims=claims)

    access_expires = cfg.get("JWT_ACCESS_TOKEN_EXPIRES")
    refresh_expires = cfg.get("JWT_REFRESH_TOKEN_EXPIRES")
    access_seconds = int(access_expires.total_seconds()) if hasattr(access_expires, "total_seconds") else 0
    refresh_seconds = int(refresh_expires.total_seconds()) if hasattr(refresh_expires, "total_seconds") else 0

    return (
        jsonify(
            {
                "access_token": access_token,
                "refresh_token": refresh_token,
                "expires_in": access_seconds,
                "refresh_expires_in": refresh_seconds,
                "user": _user_to_dict(user),
            }
        ),
        200,
    )


@auth_bp.post("/refresh")
def refresh():
    """
    POST /auth/refresh
    ------------------
    Exchange a valid refresh token for a new access token.

    Returns
    -------
    200 OK
        {
            "access_token": "<new access>",
            "expires_in": <seconds>,
            "user": { ...user fields... }
        }
    """
    verify_jwt_in_request(refresh=True)
    identity = get_jwt_identity()
    user = Users.query.get(int(identity)) if identity and str(identity).isdigit() else None
    if not user or not getattr(user, "is_active", True):
        return jsonify({"message": "user disabled"}), 401

    claims = {"sub": str(user.id), "username": user.username}
    access_token = create_access_token(identity=str(user.id), additional_claims=claims)
    access_expires = current_app.config.get("JWT_ACCESS_TOKEN_EXPIRES")
    access_seconds = int(access_expires.total_seconds()) if hasattr(access_expires, "total_seconds") else 0
    return jsonify({"access_token": access_token, "expires_in": access_seconds, "user": _user_to_dict(user)}), 200


@auth_bp.post("/logout")
@jwt_required()
def logout():
    """
    POST /auth/logout
    -----------------
    Revoke the current token by storing its JTI in the blocklist.

    Returns
    -------
    200 OK
        { "message": "logged out" }
    """
    jti = get_jwt().get("jti")
    sub = get_jwt_identity()
    if jti:
        db.session.add(
            JWTTokenBlocklist(
                jwt_token=jti,
                user_id=int(sub) if sub and str(sub).isdigit() else None,
                created_at=datetime.now(timezone.utc),
                reason="logout",
            )
        )
        db.session.commit()
    return jsonify({"message": "logged out"}), 200


@auth_bp.get("/me")
@jwt_required()
def me():
    """
    GET /auth/me
    ------------
    Return the current authenticated user's profile.

    Returns
    -------
    200 OK
        { ...user fields... }
    """
    identity = get_jwt_identity()
    user = Users.query.get(int(identity)) if identity and str(identity).isdigit() else None
    if not user:
        return jsonify({"message": "not found"}), 404
    return jsonify(_user_to_dict(user)), 200
