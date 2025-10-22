"""Type annotations and column helpers for Orbit ORM models."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated, Any

from sqlalchemy import Boolean, DateTime, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import TypeDecorator

try:  # pragma: no cover - optional Postgres dialects may be unavailable in tests
    from sqlalchemy.dialects.postgresql import CITEXT as PG_CITEXT
except ImportError:  # pragma: no cover - fallback when dialect extras missing
    PG_CITEXT = None  # type: ignore[assignment]

try:  # pragma: no cover - optional Postgres dialects may be unavailable in tests
    from sqlalchemy.dialects.postgresql import INET as PG_INET
except ImportError:  # pragma: no cover
    PG_INET = None  # type: ignore[assignment]

try:  # pragma: no cover - optional Postgres dialects may be unavailable in tests
    from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB
except ImportError:  # pragma: no cover
    PG_JSONB = None  # type: ignore[assignment]

try:  # pragma: no cover - optional Postgres dialects may be unavailable in tests
    from sqlalchemy.dialects.postgresql import UUID as PG_UUID
except ImportError:  # pragma: no cover
    PG_UUID = None  # type: ignore[assignment]


def utcnow() -> datetime:
    """Return a timezone-aware UTC timestamp."""

    return datetime.now(timezone.utc)


class CITEXT(TypeDecorator):
    """Case-insensitive text column with SQLite fallback."""

    impl = String
    cache_ok = True

    def load_dialect_impl(self, dialect):  # type: ignore[override]
        if getattr(dialect, "name", None) == "postgresql":
            citext_type = PG_CITEXT
            if citext_type is not None:
                return dialect.type_descriptor(citext_type())
        return dialect.type_descriptor(String())


class INET(TypeDecorator):
    """IPv4/IPv6 string column with graceful SQLite fallback."""

    impl = String
    cache_ok = True

    def load_dialect_impl(self, dialect):  # type: ignore[override]
        if getattr(dialect, "name", None) == "postgresql":
            inet_type = PG_INET
            if inet_type is not None:
                return dialect.type_descriptor(inet_type())
        return dialect.type_descriptor(String())


class JSONB(TypeDecorator):
    """JSON column that downgrades to generic JSON on SQLite."""

    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):  # type: ignore[override]
        if getattr(dialect, "name", None) == "postgresql":
            jsonb_type = PG_JSONB
            if jsonb_type is not None:
                return dialect.type_descriptor(jsonb_type())
        return dialect.type_descriptor(JSON())


if PG_UUID is not None:  # pragma: no cover - dependent on optional postgres extras
    def uuid_pk_column(**kwargs: Any) -> Any:
        uuid_type = PG_UUID
        if uuid_type is None:  # defensive guard for static analyzers
            raise RuntimeError("PostgreSQL UUID type not available")
        kwargs.setdefault("init", False)
        return mapped_column(
            uuid_type(as_uuid=True), default=uuid.uuid4, nullable=False, unique=True, **kwargs
        )

else:  # pragma: no cover - fallback for SQLite tests
    def uuid_pk_column(**kwargs: Any) -> Any:
        kwargs.setdefault("init", False)
        return mapped_column(
            String(36), default=lambda: str(uuid.uuid4()), nullable=False, unique=True, **kwargs
        )


def id_pk_column(**kwargs: Any) -> Any:
    """Return a configured integer primary key column."""

    return mapped_column(Integer, primary_key=True, **kwargs)


IdPk = Annotated[int, id_pk_column()]
"""Integer primary key alias used by most tables."""

UuidPk = Annotated[uuid.UUID, uuid_pk_column()]
"""UUID column alias used alongside integer primary keys."""

BoolTrue = Annotated[bool, mapped_column(Boolean, default=True, nullable=False)]
BoolFalse = Annotated[bool, mapped_column(Boolean, default=False, nullable=False)]
Str50 = Annotated[str, mapped_column(String(50), nullable=False)]
Str255 = Annotated[str, mapped_column(String(255), nullable=False)]
JSONDict = Annotated[dict[str, Any], mapped_column(JSONB)]
Timestamp = Annotated[datetime, mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)]
NullableTimestamp = Annotated[
    datetime | None,
    mapped_column(DateTime(timezone=True), default=None),
]

__all__ = [
    "Annotated",
    "BoolFalse",
    "BoolTrue",
    "CITEXT",
    "INET",
    "IdPk",
    "id_pk_column",
    "JSONB",
    "JSONDict",
    "Mapped",
    "NullableTimestamp",
    "Str255",
    "Str50",
    "Timestamp",
    "UuidPk",
    "uuid_pk_column",
    "mapped_column",
    "utcnow",
]
