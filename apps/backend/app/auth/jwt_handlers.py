"""JWT callback registration helpers."""

from __future__ import annotations

from flask import jsonify
from flask_jwt_extended import JWTManager

from ..models import JWTTokenBlocklist


def register_jwt_handlers(jwt: JWTManager) -> None:
    """Attach token validation callbacks to the shared JWT manager."""

    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(jwt_header: dict, jwt_payload: dict) -> bool:
        _ = jwt_header
        jti = jwt_payload.get("jti")
        return bool(jti and JWTTokenBlocklist.query.filter_by(jwt_token=jti).first())

    @jwt.invalid_token_loader
    def invalid_token(reason: str):
        return jsonify({"message": "Invalid token", "reason": reason}), 401

    @jwt.unauthorized_loader
    def missing_token(reason: str):
        return jsonify({"message": "Missing token", "reason": reason}), 401
