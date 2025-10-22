"""User and authentication related ORM models."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped

from ..extensions import db
from .annotations import CITEXT, INET, JSONB, mapped_column
from .base import BaseModel
from .mixins import DisableableMixin, IdPkMixin, TimestampMixin, UuidPkMixin


class Users(DisableableMixin, UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel):
    """
    Users
    -----
    Represents an application user.

    Attributes
    ----------
    id : int
        Primary key.
    username : str
        Unique username (CITEXT).
    email : str | None
        Optional unique email (CITEXT).
    jwt_auth_active : bool
        Whether JWT auth is active for this user.
    is_active : bool
        Derived active flag (False when ``disabled_at`` is set).
    disabled_at : datetime | None
        Timestamp when the account was disabled.
    date_joined : datetime
        UTC timestamp when the user registered.
    last_login_at : datetime | None
        Timestamp of the most recent successful authentication.

    Methods
    -------
    save() -> None
        Persist this row.
    update_email(new_email: str | None) -> None
        Set the email.
    update_username(new_username: str) -> None
        Set the username.
    check_jwt_auth_active() -> bool
        Return current JWT auth status.
    set_jwt_auth_active(set_status: bool) -> None
        Toggle JWT auth status.
    mark_login(timestamp: datetime | None = None) -> None
        Update the last successful login time.
    get_by_id(id: int) -> Users | None
        Fetch by id.
    get_by_email(email: str) -> Users | None
        Fetch by email.
    get_by_username(username: str) -> Users | None
        Fetch by username.
    toDICT() -> dict[str, Any]
        Minimal dict serialization.
    toJSON() -> dict[str, Any]
        Alias of toDICT().
    """

    __tablename__ = "users"

    username: Mapped[str] = mapped_column(CITEXT, nullable=False, unique=True, index=True)
    email: Mapped[str | None] = mapped_column(CITEXT, unique=True, index=True)
    roles: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    jwt_auth_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    date_joined: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    def __repr__(self) -> str:
        return f"<User {self.username}>"

    # ---- Methods ------------------------------------------------------------

    def save(self) -> None:
        """
        Save this user.

        Returns
        -------
        None
        """

        db.session.add(self)
        db.session.commit()

    def update_email(self, new_email: str | None) -> None:
        """
        Update email.

        Parameters
        ----------
        new_email : str | None

        Returns
        -------
        None
        """

        self.email = new_email

    def update_username(self, new_username: str) -> None:
        """
        Update username.

        Parameters
        ----------
        new_username : str

        Returns
        -------
        None
        """

        self.username = new_username

    def check_jwt_auth_active(self) -> bool:
        """
        Get current JWT auth status.

        Returns
        -------
        bool
        """

        return self.jwt_auth_active

    def set_jwt_auth_active(self, set_status: bool) -> None:
        """
        Set JWT auth status.

        Parameters
        ----------
        set_status : bool

        Returns
        -------
        None
        """

        self.jwt_auth_active = set_status

    def mark_login(self, timestamp: datetime | None = None) -> None:
        """
        Record the most recent successful login time.

        Parameters
        ----------
        timestamp : datetime | None
            Optional timestamp override.
        """

        self.last_login_at = timestamp or datetime.now(timezone.utc)

    @classmethod
    def get_by_id(cls, id: int) -> "Users" | None:
        """Return the user matching ``id`` if one exists."""

        return cls.query.get(id)

    @classmethod
    def get_by_email(cls, email: str) -> "Users" | None:
        """Return the user matching ``email`` if one exists."""

        return cls.query.filter_by(email=email).one_or_none()

    @classmethod
    def get_by_username(cls, username: str) -> "Users" | None:
        """Return the user matching ``username`` if one exists."""

        return cls.query.filter_by(username=username).one_or_none()

    def toDICT(self) -> dict[str, Any]:
        """Return a serialized representation of the user."""

        return {
            "id": self.id,
            "uuid": str(self.uuid),
            "username": self.username,
            "email": self.email,
            "roles": list(self.roles or []),
            "jwt_auth_active": self.jwt_auth_active,
            "is_active": self.is_active,
            "date_joined": self.date_joined.isoformat(),
            "last_login_at": self.last_login_at.isoformat() if self.last_login_at else None,
        }

    def toJSON(self) -> dict[str, Any]:
        """Alias for :meth:`toDICT`."""

        return self.toDICT()


class JWTTokenBlocklist(UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel):
    """
    JWTTokenBlocklist
    -----------------
    Blocklisted/revoked JWT tokens.

    Attributes
    ----------
    id : int
        Primary key.
    jwt_token : str
        Token string (consider storing a hash instead).
    user_id : int | None
        Optional reference to the user the token belonged to.
    reason : str | None
        Why the token was revoked (logout, rotation, etc.).
    """

    __tablename__ = "jwt_token_blocklist"

    jwt_token: Mapped[str] = mapped_column(String, nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    reason: Mapped[str | None] = mapped_column(String(64))

    def __repr__(self) -> str:
        return f"<Expired Token: {self.jwt_token}>"

    def save(self) -> None:
        """Persist this blocklist entry."""

        db.session.add(self)
        db.session.commit()


class LoginAttempts(UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel):
    """
    LoginAttempts
    --------------
    Audit table tracking authentication attempts for rate limiting and forensics.

    Attributes
    ----------
    id : int
        Primary key.
    username : str
        Username that attempted authentication.
    ip_address : str | None
        Source IP captured from the request.
    user_agent : str | None
        User agent string from the request.
    success : bool
        Whether the attempt succeeded.
    failure_reason : str | None
        Optional reason on failure.
    created_at : datetime
        Timestamp of the attempt (UTC).
    """

    __tablename__ = "login_attempts"
    __table_args__ = (
        Index("ix_login_attempts_username_created", "username", "created_at"),
        Index("ix_login_attempts_ip_created", "ip_address", "created_at"),
    )

    username: Mapped[str] = mapped_column(CITEXT, nullable=False, index=True)
    ip_address: Mapped[str | None] = mapped_column(INET)
    user_agent: Mapped[str | None] = mapped_column(Text)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    failure_reason: Mapped[str | None] = mapped_column(String(128))

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        status = "success" if self.success else "failure"
        return f"<LoginAttempt {self.username}:{status} at {self.created_at.isoformat()}>"
