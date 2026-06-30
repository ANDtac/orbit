"""Domain event and audit logging helpers."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from flask import g, has_request_context, request
from sqlalchemy import inspect as sa_inspect

from ..extensions import db
from ..models import AppEvents, AuditLogEntries, Users


def _json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]
    return str(value)


def serialize_model_state(model: Any, *, exclude: set[str] | None = None) -> dict[str, Any]:
    """Serialize mapped column values into a JSON-safe dictionary."""

    mapper = sa_inspect(type(model))
    hidden = exclude or set()
    return {
        column.key: _json_safe(getattr(model, column.key))
        for column in mapper.columns
        if column.key not in hidden
    }


def _request_ip() -> str | None:
    if not has_request_context():
        return None
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip() or None
    return request.remote_addr


def _resolve_actor(
    *,
    actor_id: int | None = None,
    actor_type: str | None = None,
    actor_display_name: str | None = None,
) -> tuple[int | None, str | None, str | None]:
    resolved_id = actor_id if actor_id is not None else getattr(g, "user_id", None)
    resolved_type = actor_type or ("user" if resolved_id is not None else None)
    resolved_display_name = actor_display_name

    if resolved_id is not None and not resolved_display_name:
        user = db.session.get(Users, resolved_id)
        if user is not None:
            resolved_display_name = user.username

    if not resolved_display_name and has_request_context():
        auth_subject = getattr(g, "auth_subject", None)
        if auth_subject:
            resolved_display_name = str(auth_subject)

    return resolved_id, resolved_type, resolved_display_name


def record_app_event(
    event: str,
    *,
    level: str = "INFO",
    message: str | None = None,
    extra: dict[str, Any] | None = None,
) -> AppEvents:
    """Stage an AppEvents row on the current session."""

    row = AppEvents(
        event=event,
        level=level,
        message=message,
        extra=_json_safe(extra or {}),
    )
    db.session.add(row)
    return row


def record_audit_log(
    *,
    action: str,
    target_type: str,
    target: Any | None = None,
    target_id: int | None = None,
    target_uuid: str | None = None,
    target_repr: str | None = None,
    payload: dict[str, Any] | None = None,
    message: str | None = None,
    actor_id: int | None = None,
    actor_type: str | None = None,
    actor_display_name: str | None = None,
    request_id: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    job_id: int | None = None,
) -> AuditLogEntries:
    """Stage an AuditLogEntries row on the current session."""

    resolved_actor_id, resolved_actor_type, resolved_actor_display = _resolve_actor(
        actor_id=actor_id,
        actor_type=actor_type,
        actor_display_name=actor_display_name,
    )

    if target is not None:
        target_id = target_id if target_id is not None else getattr(target, "id", None)
        target_uuid = target_uuid if target_uuid is not None else str(getattr(target, "uuid", "") or "") or None
        target_repr = target_repr if target_repr is not None else getattr(target, "name", None) or repr(target)

    row = AuditLogEntries(
        actor_id=resolved_actor_id,
        actor_type=resolved_actor_type,
        actor_display_name=resolved_actor_display,
        action=action,
        target_type=target_type,
        target_id=target_id,
        target_uuid=target_uuid,
        target_repr=target_repr,
        request_id=request_id if request_id is not None else (getattr(g, "correlation_id", None) if has_request_context() else None),
        ip_address=ip_address if ip_address is not None else _request_ip(),
        user_agent=user_agent if user_agent is not None else (request.user_agent.string if has_request_context() and request.user_agent else None),
        job_id=job_id,
        payload=_json_safe(payload or {}),
        message=message,
    )
    db.session.add(row)
    return row


def record_model_change(
    *,
    action: str,
    target_type: str,
    target: Any,
    before: dict[str, Any] | None,
    after: dict[str, Any] | None,
    message: str | None = None,
    job_id: int | None = None,
) -> AuditLogEntries:
    """Record a create/update/delete style audit event with before/after payloads."""

    return record_audit_log(
        action=action,
        target_type=target_type,
        target=target,
        payload={"before": before, "after": after},
        message=message,
        job_id=job_id,
    )


__all__ = (
    "record_app_event",
    "record_audit_log",
    "record_model_change",
    "serialize_model_state",
)
