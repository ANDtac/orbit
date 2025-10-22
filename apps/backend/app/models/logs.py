"""Logging and event ORM models."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped

from ..extensions import db
from .annotations import CITEXT, JSONB, mapped_column, utcnow
from .base import BaseModel
from .mixins import IdPkMixin, TimestampMixin, UuidPkMixin


class RequestLogs(UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel):
    """
    RequestLogs
    -----------
    One row per HTTP request/response.
    """

    __tablename__ = "request_logs"

    correlation_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)

    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    method: Mapped[str] = mapped_column(String(10), nullable=False)
    path: Mapped[str] = mapped_column(String, index=True, nullable=False)
    route: Mapped[str | None] = mapped_column(String)
    blueprint: Mapped[str | None] = mapped_column(String)

    status_code: Mapped[int] = mapped_column(Integer, index=True, nullable=False)

    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String)

    request_bytes: Mapped[int | None] = mapped_column(Integer)
    response_bytes: Mapped[int | None] = mapped_column(Integer)

    auth_subject: Mapped[str | None] = mapped_column(String, index=True)

    device_id_hint: Mapped[int | None] = mapped_column(Integer, index=True)
    platform_id_hint: Mapped[int | None] = mapped_column(Integer, index=True)

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True, nullable=False
    )
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    query_params: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    request_headers: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    response_headers: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    __table_args__ = (
        Index("ix_requestlogs_time", "occurred_at"),
        Index("ix_requestlogs_user", "user_id"),
        Index("ix_requestlogs_status", "status_code"),
        Index("ix_requestlogs_path", "path"),
    )


class ErrorLogs(UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel):
    """Application errors/exceptions."""

    __tablename__ = "error_logs"

    correlation_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)

    level: Mapped[str] = mapped_column(CITEXT, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    traceback: Mapped[str | None] = mapped_column(Text)

    request_log_id: Mapped[int | None] = mapped_column(ForeignKey("request_logs.id", ondelete="SET NULL"))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True, nullable=False
    )
    context: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)


class AppEvents(UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel):
    """General runtime/system events (startup, config chosen, job notes)."""

    __tablename__ = "app_events"

    event: Mapped[str] = mapped_column(CITEXT, nullable=False)
    message: Mapped[str | None] = mapped_column(Text)

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True, nullable=False
    )
    level: Mapped[str] = mapped_column(CITEXT, nullable=False, default="INFO")
    extra: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)


class AuditLogEntries(UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel):
    """Append-only audit events for tracking who changed what."""

    __tablename__ = "audit_log_entries"

    actor_type: Mapped[str | None] = mapped_column(CITEXT)
    actor_display_name: Mapped[str | None] = mapped_column(String(255))

    action: Mapped[str] = mapped_column(CITEXT, nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(CITEXT, nullable=False, index=True)
    target_uuid: Mapped[str | None] = mapped_column(String(36), index=True)
    target_repr: Mapped[str | None] = mapped_column(String)

    request_id: Mapped[str | None] = mapped_column(String(64), index=True)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String)

    actor_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True, default=None
    )
    target_id: Mapped[int | None] = mapped_column(Integer, index=True, default=None)
    job_id: Mapped[int | None] = mapped_column(
        ForeignKey("jobs.id", ondelete="SET NULL"), index=True, default=None
    )

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True, nullable=False
    )
    payload: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    message: Mapped[str | None] = mapped_column(Text)

    actor = db.relationship("Users")
    job = db.relationship("Jobs")

    __table_args__ = (
        Index("ix_audit_actor", "actor_id", "action"),
        Index("ix_audit_target", "target_type", "target_id"),
    )


__all__ = ["AppEvents", "AuditLogEntries", "ErrorLogs", "RequestLogs"]
