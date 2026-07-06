"""AutomationSteps: ordered sequence steps for multi-step automations (Phase 5).

Each :class:`AutomationSteps` row is one ordered step in a parent
:class:`~app.models.automation.Automations` sequence.  Single-action automations
have *zero* steps and continue to use the top-level ``action_id`` /
``variable_values`` columns on :class:`Automations` directly.

``variable_bindings`` carries both literal values **and** typed
``{"__ref__": true, "step": N, "output": "<field>"}`` references to a prior
step's declared output field.  Bindings are validated at save time (type-match
+ ordering) and resolved at runtime by the worker before each step executes.
"""

from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped

from ..extensions import db
from .annotations import CITEXT, JSONB, mapped_column
from .base import BaseModel
from .mixins import IdPkMixin, TimestampMixin, UuidPkMixin


class AutomationSteps(IdPkMixin, UuidPkMixin, TimestampMixin, BaseModel):
    """
    AutomationSteps
    ---------------
    One ordered step in a multi-step automation sequence.

    Attributes
    ----------
    id : int
    uuid : uuid
    automation_id : int
        FK to :data:`automations.id` (CASCADE delete).  Indexed.
    sequence : int
        1-based ordering within the automation.  (automation_id, sequence)
        is unique.
    action_id : int | None
        FK to :data:`platform_operation_templates.id` (SET NULL on delete).
        Indexed.  Nullable so a step can be created with the action to be
        specified later.
    variable_bindings : dict
        Per-field input values for the step.  Each value is either a plain
        literal or a typed reference:
        ``{"__ref__": true, "step": <int sequence>, "output": "<field_name>"}``.
        Validated at save time; resolved at runtime before execution.
    on_failure : str
        Per-step failure handler: ``"stop"`` (default) or ``"continue"``.
    created_at : datetime
    updated_at : datetime
    """

    __tablename__ = "automation_steps"

    automation_id: Mapped[int] = mapped_column(
        ForeignKey("automations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    action_id: Mapped[int | None] = mapped_column(
        ForeignKey("platform_operation_templates.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    variable_bindings: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    on_failure: Mapped[str] = mapped_column(CITEXT, default="stop", nullable=False)

    action = db.relationship("PlatformOperationTemplates")

    __table_args__ = (
        UniqueConstraint(
            "automation_id",
            "sequence",
            name="uq_automation_steps_sequence",
        ),
    )

    def __repr__(self) -> str:
        return f"<AutomationStep automation={self.automation_id} seq={self.sequence}>"


__all__ = ["AutomationSteps"]
