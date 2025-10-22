"""Compliance policy and result ORM models."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped

from ..extensions import db
from .annotations import CITEXT, JSONB, mapped_column
from .base import BaseModel
from .mixins import DisableableMixin, IdPkMixin, TimestampMixin, UuidPkMixin


class CompliancePolicies(DisableableMixin, UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel):
    """
    CompliancePolicies
    ------------------
    Stores compliance rules/policies as data (JSON).
    """

    __tablename__ = "compliance_policies"

    name: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    scope: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    rules: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    rule_items = db.relationship(
        "ComplianceRules",
        back_populates="policy",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<CompliancePolicy {self.name}>"


class ComplianceRules(UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel):
    """
    ComplianceRules
    ---------------
    Individual rule definitions that belong to a policy.
    """

    __tablename__ = "compliance_rules"

    policy_id: Mapped[int] = mapped_column(
        ForeignKey("compliance_policies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    rule_type: Mapped[str] = mapped_column(String(100), nullable=False)
    severity: Mapped[str] = mapped_column(String(50), nullable=False, default="unknown")
    expression: Mapped[str] = mapped_column(Text, nullable=False)
    params: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    policy = db.relationship("CompliancePolicies", back_populates="rule_items", lazy="joined")
    results = db.relationship("ComplianceResults", back_populates="rule")

    def __repr__(self) -> str:
        return f"<ComplianceRule {self.name} p={self.policy_id}>"


class ComplianceResults(TimestampMixin, BaseModel):
    """Time-series results of evaluating a device against a policy."""

    __tablename__ = "compliance_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"), index=True)
    policy_id: Mapped[int] = mapped_column(ForeignKey("compliance_policies.id", ondelete="CASCADE"))
    rule_id: Mapped[int | None] = mapped_column(
        ForeignKey("compliance_rules.id", ondelete="SET NULL"), index=True
    )
    is_compliant: Mapped[bool] = mapped_column(Boolean, nullable=False)
    evaluated_at: Mapped[datetime] = mapped_column(
        "checked_at",
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="unknown")
    summary: Mapped[str | None] = mapped_column(Text)
    details: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    snapshot_id: Mapped[int | None] = mapped_column(
        ForeignKey("device_config_snapshots.id", ondelete="SET NULL"), index=True
    )

    device = db.relationship("Devices")
    policy = db.relationship("CompliancePolicies")
    rule = db.relationship("ComplianceRules", back_populates="results")
    snapshot = db.relationship("DeviceConfigSnapshots")

    __table_args__ = (Index("ix_compliance_device_time", "device_id", "checked_at"),)

    def __repr__(self) -> str:
        status = self.status or ("pass" if self.is_compliant else "fail")
        return f"<ComplianceResult d={self.device_id} p={self.policy_id} status={status}>"


__all__ = [
    "CompliancePolicies",
    "ComplianceResults",
    "ComplianceRules",
]
