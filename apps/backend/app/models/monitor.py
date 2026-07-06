"""Monitor and MonitorResults ORM models (Phase 6).

A :class:`Monitors` row pins a read-only
:class:`~app.models.operations.PlatformOperationTemplates` action plus a
``metric`` field name, a ``comparator``, and an optional numeric ``threshold``.
Each scheduled (or on-demand) run appends :class:`MonitorResults` rows — one
per target device — forming the time-series "index" that Dashboard panels
query for charts.

Design mirrors :class:`~app.models.compliance.ComplianceResults`:
    * integer PK ``id``
    * ``monitor_id`` + ``device_id`` foreign keys (indexed)
    * indexed ``observed_at`` timestamp
    * ``value`` (Float) + ``status`` (String) + ``payload`` (JSONB)
    * composite index ``ix_monitor_results_monitor_time`` on
      ``(monitor_id, observed_at)``
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped

from ..extensions import db
from .annotations import CITEXT, JSONB, mapped_column
from .base import BaseModel
from .mixins import (
    DisableableMixin,
    IdPkMixin,
    OwnedByUserMixin,
    TimestampMixin,
    UuidPkMixin,
)


class Monitors(DisableableMixin, OwnedByUserMixin, UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel):
    """Read-only action + threshold definition that generates time-series results.

    Columns
    -------
    name
        Human-readable monitor name (case-insensitive text, required).
    description
        Optional free-text notes.
    action_id
        FK → ``platform_operation_templates.id`` SET NULL; the vetted read-only
        action to execute on each run.  ``validate_monitor`` rejects actions
        where ``is_mutating=True`` before a row is ever saved.
    target
        Device/group selector JSON (same shape as
        :attr:`~app.models.automation.Automations.target`).
    metric
        Output field name to extract from each device result's ``fields``
        mapping.
    comparator
        One of ``gt / lt / gte / lte / eq / ne``.
    threshold
        Numeric bound.  ``None`` means "no threshold — pass if metric present".
    status
        Aggregated worst-case status across the last run's results: one of
        ``passing / failing / error / unknown``.  Updated by
        :func:`~app.services.monitors.record_monitor_results`.
    visibility
        ``private`` (owner only) or ``shared`` (any authenticated user).
    """

    __tablename__ = "monitors"

    name: Mapped[str] = mapped_column(CITEXT, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    action_id: Mapped[int | None] = mapped_column(
        ForeignKey("platform_operation_templates.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    target: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    metric: Mapped[str] = mapped_column(String(64), nullable=False)
    comparator: Mapped[str] = mapped_column(String(16), nullable=False)
    threshold: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(CITEXT, nullable=False, default="unknown")
    visibility: Mapped[str] = mapped_column(CITEXT, nullable=False, default="private")

    action = db.relationship("PlatformOperationTemplates", foreign_keys=[action_id])
    results = db.relationship(
        "MonitorResults",
        back_populates="monitor",
        cascade="all, delete-orphan",
        order_by="MonitorResults.observed_at.desc()",
    )

    def __repr__(self) -> str:
        return f"<Monitor id={self.id} name={self.name!r} status={self.status}>"


class MonitorResults(BaseModel):
    """Time-series record of one monitor run against one device.

    Columns
    -------
    id
        Integer surrogate primary key.
    monitor_id
        FK → ``monitors.id`` CASCADE (indexed).
    device_id
        FK → ``devices.id`` SET NULL, nullable (indexed).
    observed_at
        Timezone-aware UTC timestamp of the observation (indexed, not null).
    value
        Numeric value extracted from the device's operation result fields.
        ``None`` when the metric field is absent or non-numeric.
    status
        ``passing`` / ``failing`` / ``error`` — result of comparing *value*
        against the monitor's comparator+threshold.
    payload
        Full structured output returned by the operation, stored for
        auditability and ad-hoc queries.
    """

    __tablename__ = "monitor_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    monitor_id: Mapped[int] = mapped_column(
        ForeignKey("monitors.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    device_id: Mapped[int | None] = mapped_column(
        ForeignKey("devices.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    observed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False,
    )
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    monitor = db.relationship("Monitors", back_populates="results")
    device = db.relationship("Devices")

    # Composite index mirrors ComplianceResults.ix_compliance_device_time naming.
    __table_args__ = (
        Index("ix_monitor_results_monitor_time", "monitor_id", "observed_at"),
    )

    def __repr__(self) -> str:
        return (
            f"<MonitorResult id={self.id} monitor={self.monitor_id} "
            f"device={self.device_id} status={self.status}>"
        )


__all__ = [
    "MonitorResults",
    "Monitors",
]
