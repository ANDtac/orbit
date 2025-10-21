"""Asynchronous job orchestration models for network automation workflows."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped

from ..extensions import db
from .annotations import CITEXT, JSONB, mapped_column, utcnow
from .base import BaseModel
from .mixins import IdPkMixin, OwnedByUserMixin, TimestampMixin, UuidPkMixin


class Jobs(UuidPkMixin, IdPkMixin, TimestampMixin, OwnedByUserMixin, BaseModel):
    """Top-level orchestration record for long-running or bulk operations."""

    __tablename__ = "jobs"

    name: Mapped[str | None] = mapped_column(String(255))
    job_type: Mapped[str] = mapped_column(CITEXT, index=True, nullable=False)
    status: Mapped[str] = mapped_column(CITEXT, default="pending", index=True, nullable=False)
    status_detail: Mapped[str | None] = mapped_column(Text)

    queue: Mapped[str | None] = mapped_column(CITEXT, index=True)
    priority: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    idempotency_key: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)

    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None, index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    progress_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    progress_completed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    parameters: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    result: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    error: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    run_as_internal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    operation_template_id: Mapped[int | None] = mapped_column(
        ForeignKey("platform_operation_templates.id", ondelete="SET NULL"), index=True, default=None
    )

    operation_template = db.relationship("PlatformOperationTemplates")
    owner = db.relationship("Users", foreign_keys="Jobs.owner_id")
    tasks = db.relationship(
        "JobTasks",
        back_populates="job",
        cascade="all, delete-orphan",
        order_by="JobTasks.sequence",
    )
    events = db.relationship(
        "JobEvents",
        back_populates="job",
        cascade="all, delete-orphan",
        order_by="JobEvents.occurred_at.desc()",
    )

    __table_args__ = (
        Index("ix_jobs_type_status", "job_type", "status"),
    )

    def mark_in_progress(self) -> None:
        """Convenience helper to set the job state to ``running``."""

        self.status = "running"
        self.started_at = utcnow()

    def mark_finished(self, *, success: bool, result: dict | None = None) -> None:
        """Update the job to a terminal state and optionally store the result payload."""

        self.status = "succeeded" if success else "failed"
        self.finished_at = utcnow()
        if result is not None:
            self.result = result


class JobEvents(UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel):
    """State transitions and log messages associated with a job."""

    __tablename__ = "job_events"

    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True, nullable=False)
    event_type: Mapped[str] = mapped_column(CITEXT, index=True, nullable=False)
    message: Mapped[str | None] = mapped_column(Text)
    context: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True, nullable=False)

    job = db.relationship("Jobs", back_populates="events")


class JobTasks(UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel):
    """Discrete pieces of work that belong to a job."""

    __tablename__ = "job_tasks"

    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True, nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    task_type: Mapped[str] = mapped_column(CITEXT, index=True, nullable=False)
    status: Mapped[str] = mapped_column(CITEXT, default="pending", index=True, nullable=False)

    target_type: Mapped[str | None] = mapped_column(CITEXT)
    target_id: Mapped[int | None] = mapped_column(Integer)
    device_id: Mapped[int | None] = mapped_column(
        ForeignKey("devices.id", ondelete="SET NULL"), index=True, default=None
    )
    group_id: Mapped[int | None] = mapped_column(
        ForeignKey("inventory_groups.id", ondelete="SET NULL"), index=True, default=None
    )

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    last_error_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    progress_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    progress_completed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    idempotency_key: Mapped[str | None] = mapped_column(String(64), index=True)

    parameters: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    result: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    error: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    job = db.relationship("Jobs", back_populates="tasks")
    device = db.relationship("Devices")
    group = db.relationship("InventoryGroups")

    __table_args__ = (
        UniqueConstraint("job_id", "sequence", name="uq_jobtask_sequence"),
        Index("ix_job_tasks_device", "device_id", "status"),
    )

    def mark_started(self) -> None:
        """Mark the task as running."""

        self.status = "running"
        self.started_at = utcnow()

    def mark_finished(self, *, success: bool, result: dict | None = None) -> None:
        """Mark the task as finished and persist optional result payload."""

        self.status = "succeeded" if success else "failed"
        self.finished_at = utcnow()
        if result is not None:
            self.result = result


__all__ = ["JobEvents", "JobTasks", "Jobs"]
