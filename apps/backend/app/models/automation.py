"""No-code Automation definitions.

An :class:`Automations` row is a saved, operator-authored form: it pins a vetted
Action (``platform_operation_templates`` row) plus the operator-filled input
values and a device/group target.  Running it enqueues an ``operation.execute``
job (see :mod:`app.services.automations`).

Single-action automations use ``action_id`` / ``variable_values`` directly and
have *zero* :class:`~app.models.automation_step.AutomationSteps` children.
Multi-step sequence automations carry one or more ordered
:class:`~app.models.automation_step.AutomationSteps` rows instead; the
``steps`` relationship returns them ordered by ``sequence``.
"""

from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Index, Text
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


class Automations(
    DisableableMixin,
    OwnedByUserMixin,
    UuidPkMixin,
    IdPkMixin,
    TimestampMixin,
    BaseModel,
):
    """
    Automations
    -----------
    A single-action, no-code automation definition.

    Attributes
    ----------
    id : int
    uuid : uuid
    owner_id : int | None
        Authoring user (from :class:`OwnedByUserMixin`).
    name : str
        Human-friendly name (required, case-insensitive).
    description : str | None
    action_id : int
        FK to :class:`PlatformOperationTemplates` (the vetted Action).
    variable_values : dict
        Operator-filled inputs, validated against the Action's ``variables``
        schema before a job is created.
    target : dict
        Target selector, e.g. ``{"device_ids": [1, 2]}`` or a group selector.
    visibility : str
        ``private`` | ``shared`` | ``role`` (default ``private``).
    on_failure : str
        Author-chosen failure behaviour default: ``stop`` | ``continue``.
    approval_required : bool
        Maker/checker seam -- unused in this phase (default ``False``).
    is_active : bool
        Provided by :class:`DisableableMixin` (``disabled_at is None``).
    created_at : datetime
    updated_at : datetime
    """

    __tablename__ = "automations"

    name: Mapped[str] = mapped_column(CITEXT, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    action_id: Mapped[int | None] = mapped_column(
        ForeignKey("platform_operation_templates.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    variable_values: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    target: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    visibility: Mapped[str] = mapped_column(CITEXT, default="private", nullable=False)
    on_failure: Mapped[str] = mapped_column(CITEXT, default="stop", nullable=False)
    approval_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    action = db.relationship("PlatformOperationTemplates")
    steps = db.relationship(
        "AutomationSteps",
        backref="automation",
        order_by="AutomationSteps.sequence",
        cascade="all, delete-orphan",
        lazy="select",
    )

    __table_args__ = (
        Index("ix_automations_owner_visibility", "owner_id", "visibility"),
    )

    def __repr__(self) -> str:
        return f"<Automation {self.name} action={self.action_id}>"


__all__ = ["Automations"]
