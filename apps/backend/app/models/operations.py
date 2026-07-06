"""Data-driven operation templates for platforms."""

from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped

from ..extensions import db
from .annotations import CITEXT, JSONB, mapped_column
from .base import BaseModel
from .mixins import DisableableMixin, IdPkMixin, TimestampMixin, UuidPkMixin


class PlatformOperationTemplates(
    DisableableMixin, UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel
):
    """
    PlatformOperationTemplates
    --------------------------
    Data-driven templates for per-platform operations.

    Attributes
    ----------
    id : int
    platform_id : int
    name : str
    description : str | None
    op_type : str
        High level operation category (e.g., 'backup', 'password_change').
    template : str
    variables : dict
        Expected input variables schema/hints (typed inputs).
    outputs : dict
        Typed output-field schema describing how to parse device output into
        structured fields, e.g.
        ``{ "<field>": {"type": "string|number|boolean|enum",
                          "source": "textfsm|napalm_getter|regex|raw", ...} }``.
    is_mutating : bool
        Flags change-type actions (drive dry-run/confirm gating).
    is_active : bool
        Provided by :class:`DisableableMixin` (``disabled_at is None``).
    notes : str | None
    created_at : datetime
    updated_at : datetime

    Methods
    -------
    get(platform_id: int, op_type: str) -> PlatformOperationTemplates | None
    """

    __tablename__ = "platform_operation_templates"

    platform_id: Mapped[int] = mapped_column(ForeignKey("platforms.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    op_type: Mapped[str] = mapped_column(CITEXT, index=True, nullable=False)
    template: Mapped[str] = mapped_column(Text, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    variables: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    outputs: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    is_mutating: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    platform = db.relationship("Platforms", backref="operation_templates")

    __table_args__ = (
        UniqueConstraint("platform_id", "op_type", "name", name="uq_platform_op_template"),
        Index("ix_platform_op", "platform_id", "op_type"),
    )

    def __repr__(self) -> str:
        return f"<PlatformOpTemplate {self.platform_id}:{self.op_type}:{self.name}>"

    @classmethod
    def get(cls, platform_id: int, op_type: str) -> "PlatformOperationTemplates | None":
        """Fetch a template by platform and operation type."""

        return cls.query.filter_by(platform_id=platform_id, op_type=op_type).first()


__all__ = ["PlatformOperationTemplates"]
