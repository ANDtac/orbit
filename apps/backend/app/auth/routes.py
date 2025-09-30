"""
app/auth/routes.py
------------------
Authentication and token management routes.

Responsibilities
----------------
- Issue JWT access and refresh tokens on login.
- Provide token refresh (rotate access tokens using a valid refresh token).
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

Endpoints
---------
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
GET    /auth/me

Notes
-----
- Assumes the Users model implements `verify_password(plain: str) -> bool`
  and exposes `id`, `username`, `email`, `is_active`, and `roles` (optional).
- If your model differs, adjust the serialization in `_user_to_dict`.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict

from flask import Blueprint, jsonify, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_jwt,
    get_jwt_identity,
    jwt_required,
)

from ..extensions import db
from ..models import Users, JWTTokenBlocklist

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
    }


@auth_bp.post("/login")
def login():
    """
    POST /auth/login
    ----------------
    Authenticate with username and password to receive JWTs.

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
          "user": { ...user fields... }
        }
    400/401 on invalid input or credentials.
    """
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"message": "username and password required"}), 400

    user: Users | None = Users.query.filter(
        db.func.lower(Users.username) == username.lower()
    ).first()

    if not user or not getattr(user, "is_active", True):
        return jsonify({"message": "invalid credentials"}), 401

    verifier = getattr(user, "verify_password", None)
    if not verifier or not verifier(password):
        return jsonify({"message": "invalid credentials"}), 401

    identity = str(user.id)
    access_token = create_access_token(identity=identity, additional_claims={"sub": identity})
    refresh_token = create_refresh_token(identity=identity, additional_claims={"sub": identity})

    return jsonify(
        {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "user": _user_to_dict(user),
        }
    ), 200


@auth_bp.post("/refresh")
@jwt_required(refresh=True)
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
          "user": { ...user fields... }
        }
    """
    identity = get_jwt_identity()
    user = Users.query.get(int(identity)) if identity and str(identity).isdigit() else None
    if not user or not getattr(user, "is_active", True):
        return jsonify({"message": "user disabled"}), 401

    access_token = create_access_token(identity=str(user.id), additional_claims={"sub": str(user.id)})
    return jsonify({"access_token": access_token, "user": _user_to_dict(user)}), 200


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