"""Dashboard, DashboardPanel, and UserPinnedDashboard ORM models (Phase 7).

Three tables support the Dashboards feature:

:class:`Dashboards`
    Owner-visible or shared grid of monitoring panels.  Columns mirror the
    Monitors model: ``IdPkMixin``, ``UuidPkMixin``, ``TimestampMixin``,
    ``OwnedByUserMixin``, plus ``name`` (CITEXT), ``description`` (Text),
    ``visibility`` (CITEXT, private/shared/role), and ``layout`` (JSONB —
    optional grid metadata for the frontend).

:class:`DashboardPanels`
    One panel within a dashboard.  ``dashboard_id`` FK (CASCADE) + ``monitor_id``
    FK (SET NULL, nullable) + ``viz_type`` (CITEXT, timechart/stat/statusgrid/table)
    + ``position`` JSONB ({col, row, w, h}) + ``config`` JSONB (extra chart config).

:class:`UserPinnedDashboards`
    Many-to-many join between users and dashboards for pin-to-home.  A
    ``UniqueConstraint`` on ``(user_id, dashboard_id)`` enforces one pin per pair.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped

from ..extensions import db
from .annotations import CITEXT, JSONB, mapped_column
from .base import BaseModel
from .mixins import IdPkMixin, OwnedByUserMixin, TimestampMixin, UuidPkMixin


class Dashboards(OwnedByUserMixin, UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel):
    """Owner-visible or shared dashboard that groups monitoring panels.

    Columns
    -------
    name
        Human-readable dashboard name (case-insensitive text, required).
    description
        Optional free-text notes.
    visibility
        ``private`` (owner only), ``shared`` (any authenticated user), or
        ``role`` (future role-based gate).
    layout
        Optional grid metadata for the frontend (e.g. number of columns,
        breakpoints).  Stored as JSON; defaults to an empty dict.
    """

    __tablename__ = "dashboards"

    name: Mapped[str] = mapped_column(CITEXT, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    visibility: Mapped[str] = mapped_column(CITEXT, nullable=False, default="private")
    layout: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    panels = db.relationship(
        "DashboardPanels",
        back_populates="dashboard",
        cascade="all, delete-orphan",
        order_by="DashboardPanels.id",
    )
    pins = db.relationship(
        "UserPinnedDashboards",
        back_populates="dashboard",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Dashboard id={self.id} name={self.name!r} visibility={self.visibility}>"


class DashboardPanels(UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel):
    """One panel within a dashboard.

    Columns
    -------
    dashboard_id
        FK → ``dashboards.id`` CASCADE (indexed).
    monitor_id
        FK → ``monitors.id`` SET NULL, nullable (indexed).  ``None`` = empty
        placeholder panel.
    title
        Optional override for the panel header; falls back to the monitor name
        on the frontend when absent.
    viz_type
        Visualisation type: ``timechart`` (default), ``stat``, ``statusgrid``,
        or ``table``.
    position
        Grid placement: ``{col, row, w, h}`` in grid-layout units.
    config
        Extra chart / visualisation config (axis labels, colours, etc.).
    """

    __tablename__ = "dashboard_panels"

    dashboard_id: Mapped[int] = mapped_column(
        ForeignKey("dashboards.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    monitor_id: Mapped[int | None] = mapped_column(
        ForeignKey("monitors.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    title: Mapped[str | None] = mapped_column(String(128), nullable=True)
    viz_type: Mapped[str] = mapped_column(CITEXT, nullable=False, default="timechart")
    position: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    dashboard = db.relationship("Dashboards", back_populates="panels")
    monitor = db.relationship("Monitors")

    def __repr__(self) -> str:
        return (
            f"<DashboardPanel id={self.id} dashboard={self.dashboard_id} "
            f"monitor={self.monitor_id} viz={self.viz_type}>"
        )


class UserPinnedDashboards(BaseModel):
    """Pin-to-home record linking a user to a dashboard.

    Columns
    -------
    id
        Integer surrogate primary key.
    user_id
        FK → ``users.id`` CASCADE (indexed).
    dashboard_id
        FK → ``dashboards.id`` CASCADE (indexed).
    pinned_at
        Timezone-aware UTC timestamp when the pin was created.

    Constraints
    -----------
    ``uq_user_pinned_dashboards_user_id_dashboard_id``
        One pin per (user, dashboard) pair — enforces idempotency at the DB
        level.
    """

    __tablename__ = "user_pinned_dashboards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    dashboard_id: Mapped[int] = mapped_column(
        ForeignKey("dashboards.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    pinned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    dashboard = db.relationship("Dashboards", back_populates="pins")

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "dashboard_id",
            name="uq_user_pinned_dashboards_user_id_dashboard_id",
        ),
    )

    def __repr__(self) -> str:
        return f"<UserPinnedDashboard user={self.user_id} dashboard={self.dashboard_id}>"


__all__ = [
    "DashboardPanels",
    "Dashboards",
    "UserPinnedDashboards",
]
