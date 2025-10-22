"""Core SQLAlchemy base classes and session helpers."""

from __future__ import annotations

from typing import Iterator, cast

from sqlalchemy.orm import DeclarativeBase, Session

from ..extensions import db


class Base(DeclarativeBase):
    """Declarative base that reuses the global Flask-SQLAlchemy metadata."""

    metadata = db.metadata


class BaseModel(db.Model):
    """Compatibility base for legacy models built on Flask-SQLAlchemy."""

    __abstract__ = True


def get_session() -> Session:
    """Return the active SQLAlchemy session."""

    return cast(Session, db.session)


class SessionContext:
    """Context manager that yields the active SQLAlchemy session."""

    def __enter__(self) -> Session:  # pragma: no cover - simple context helper
        self._session = get_session()
        return self._session

    def __exit__(self, _exc_type, exc, _tb) -> None:
        # Flask-SQLAlchemy manages session lifecycle; just flush/rollback.
        session = getattr(self, "_session", None)
        if session is None:
            return
        if exc is None:
            session.flush()
        else:
            session.rollback()


def session_scope() -> Iterator[Session]:
    """Yield the active session for use with `with` statements."""

    with SessionContext() as session:
        yield session


__all__ = ["Base", "BaseModel", "get_session", "session_scope", "SessionContext"]
