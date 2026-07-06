"""Schedule model (Phase 4).

A :class:`Schedules` row drives recurrence for an Automation (or, in Phase 6,
a Monitor). The scheduler service polls rows where ``enabled=True AND
next_run <= now()``, fires the target, advances ``next_run`` via
``croniter``, and stamps ``last_run`` / ``last_job_id``.

The user picks a *preset* in the UI (every_5m / every_15m / every_30m /
hourly / daily / weekly) which the REST resource converts to a standard
5-field cron expression before the row is stored; raw cron is also accepted.
"""

from __future__ import annotations

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped

from ..extensions import db
from .annotations import CITEXT, mapped_column
from .base import BaseModel
from .mixins import (
    DisableableMixin,
    IdPkMixin,
    OwnedByUserMixin,
    TimestampMixin,
    UuidPkMixin,
)


class Schedules(
    DisableableMixin,
    OwnedByUserMixin,
    UuidPkMixin,
    IdPkMixin,
    TimestampMixin,
    BaseModel,
):
    """
    Schedules
    ---------
    A recurring trigger that fires an Automation (or Monitor in Phase 6).

    Attributes
    ----------
    id : int
    uuid : uuid
    owner_id : int | None
        Authoring user (from :class:`OwnedByUserMixin`).
    name : str | None
        Optional human-friendly label (case-insensitive).
    target_type : str
        ``"automation"`` or ``"monitor"``.
    target_id : int
        PK of the target row in the corresponding table.
    cron_expr : str
        Standard 5-field cron string (``"*/5 * * * *"``).  Generated from
        the ``preset`` input field at create/update time; never stored raw
        unless the caller submits a raw expression directly.
    next_run : datetime (tz-aware)
        UTC timestamp of the next scheduled fire.  Indexed for fast polling.
    last_run : datetime | None
        UTC timestamp of the most-recent successful fire.
    last_job_id : int | None
        FK to ``jobs.id`` (SET NULL on delete) for the most-recent job.
    enabled : bool
        ``True`` while the schedule is active.  Set to ``False`` by the
        scheduler when the target no longer exists or is disabled.
    timezone : str
        IANA timezone name used when advancing ``next_run`` (default
        ``"UTC"``).
    disabled_at : datetime | None
        Provided by :class:`DisableableMixin`.
    created_at / updated_at : datetime
        Provided by :class:`TimestampMixin`.
    """

    __tablename__ = "schedules"

    name: Mapped[str | None] = mapped_column(CITEXT, nullable=True)

    target_type: Mapped[str] = mapped_column(CITEXT, nullable=False)
    target_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)

    cron_expr: Mapped[str] = mapped_column(String(64), nullable=False)

    next_run: Mapped[object] = mapped_column(
        DateTime(timezone=True), index=True, nullable=False
    )
    last_run: Mapped[object | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_job_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("jobs.id", ondelete="SET NULL"),
        nullable=True,
    )

    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), default="UTC", nullable=False)

    last_job = db.relationship("Jobs", foreign_keys=[last_job_id])

    __table_args__ = (
        Index("ix_schedules_target", "target_type", "target_id"),
        Index("ix_schedules_enabled_next_run", "enabled", "next_run"),
    )

    def __repr__(self) -> str:
        return f"<Schedule {self.id} {self.target_type}:{self.target_id} cron={self.cron_expr!r}>"


__all__ = ["Schedules"]
