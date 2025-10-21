"""Reusable model mixins for Orbit ORM models."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from .annotations import id_pk_column, utcnow, uuid_pk_column


class TimestampMixin:
    """Provide created/updated timestamp columns."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class SoftDeleteMixin:
    """Provide a nullable ``deleted_at`` column and helpers."""

    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    @classmethod
    def alive(cls):  # pragma: no cover - thin helper
        """Return a SQL expression matching non-deleted rows."""

        return cls.deleted_at.is_(None)


class TenantMixin:
    """Provide a ``tenant_id`` foreign key for multi-tenant tables."""

    tenant_id: Mapped[int] = mapped_column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)

    @classmethod
    def for_tenant(cls, tenant_id: int):  # pragma: no cover - thin helper
        """Return a SQL expression filtering rows by ``tenant_id``."""

        return cls.tenant_id == tenant_id


class UuidPkMixin:
    """Add a ``uuid`` column for stable external identifiers."""

    uuid: Mapped[uuid.UUID] = uuid_pk_column()


class IdPkMixin:
    """Add an integer ``id`` primary key."""

    id: Mapped[int] = id_pk_column()


class OwnedByUserMixin:
    """Associate a row with the owning user."""

    owner_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), index=True)

    @classmethod
    def owned_by(cls, user_id: int):  # pragma: no cover - thin helper
        """Return a SQL expression for filtering by ``owner_id``."""

        return cls.owner_id == user_id


__all__ = [
    "IdPkMixin",
    "OwnedByUserMixin",
    "SoftDeleteMixin",
    "TenantMixin",
    "TimestampMixin",
    "UuidPkMixin",
]
