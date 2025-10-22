"""Hardware and software lifecycle ORM models."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped

from ..extensions import db
from .annotations import CITEXT, mapped_column
from .base import BaseModel
from .mixins import IdPkMixin, UuidPkMixin


class HardwareLifecycle(UuidPkMixin, IdPkMixin, BaseModel):
    """
    HardwareLifecycle
    -----------------
    End-of-life milestones for hardware (per product model).
    """

    __tablename__ = "hardware_lifecycle"

    product_model_id: Mapped[int] = mapped_column(
        ForeignKey("product_models.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )

    end_of_sale_date: Mapped[datetime | None] = mapped_column(DateTime)
    end_of_software_maintenance_date: Mapped[datetime | None] = mapped_column(DateTime)
    end_of_security_fixes_date: Mapped[datetime | None] = mapped_column(DateTime)
    last_day_of_support_date: Mapped[datetime | None] = mapped_column(DateTime)

    source_url: Mapped[str | None] = mapped_column(String)
    notes: Mapped[str | None] = mapped_column(Text)

    product_model = db.relationship("ProductModels")

    def __repr__(self) -> str:
        return f"<HardwareLifecycle pm={self.product_model_id}>"

    def is_past(self, milestone: str, as_of: datetime | None = None) -> bool:
        """Return ``True`` if the given milestone date is in the past."""

        as_of = as_of or datetime.now(timezone.utc)
        field = {
            "eos": "end_of_sale_date",
            "eoswm": "end_of_software_maintenance_date",
            "eosec": "end_of_security_fixes_date",
            "ldos": "last_day_of_support_date",
        }.get(milestone.lower())
        if not field:
            return False
        dt = getattr(self, field, None)
        return bool(dt and dt < as_of)


class SoftwareLifecycle(UuidPkMixin, IdPkMixin, BaseModel):
    """End-of-life milestones for software releases."""

    __tablename__ = "software_lifecycle"

    platform_id: Mapped[int | None] = mapped_column(
        ForeignKey("platforms.id", ondelete="SET NULL"), index=True
    )
    os_name: Mapped[str] = mapped_column(CITEXT, index=True, nullable=False)
    match_value: Mapped[str] = mapped_column(String, nullable=False)
    match_operator: Mapped[str] = mapped_column(CITEXT, nullable=False, default="eq")

    end_of_software_maintenance_date: Mapped[datetime | None] = mapped_column(DateTime)
    end_of_security_fixes_date: Mapped[datetime | None] = mapped_column(DateTime)
    last_day_of_support_date: Mapped[datetime | None] = mapped_column(DateTime)
    end_of_sale_date: Mapped[datetime | None] = mapped_column(DateTime)

    source_url: Mapped[str | None] = mapped_column(String)
    notes: Mapped[str | None] = mapped_column(Text)

    platform = db.relationship("Platforms")

    __table_args__ = (
        Index("ix_softlife_os_platform", "os_name", "platform_id"),
        Index("ix_softlife_match", "match_operator", "match_value"),
        CheckConstraint("match_operator IN ('eq','prefix','regex')", name="chk_softlife_match_op"),
    )

    def __repr__(self) -> str:
        return f"<SoftwareLifecycle os={self.os_name} {self.match_operator}:{self.match_value}>"

    def matches_version(self, version: str) -> bool:
        """Return ``True`` when ``version`` satisfies this lifecycle row."""

        if version is None:
            return False
        op = (self.match_operator or "eq").lower()
        if op == "eq":
            return version == self.match_value
        if op == "prefix":
            return version.startswith(self.match_value)
        if op == "regex":
            import re

            return bool(re.search(self.match_value, version))
        return False


__all__ = ["HardwareLifecycle", "SoftwareLifecycle"]
