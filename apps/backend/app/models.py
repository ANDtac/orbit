# models.py
# -----------------------------------------------------------------------------
# ORM models for users/auth + network inventory and automation (Nornir + NAPALM).
# Tables are pluralized to match existing style.
# Requires Postgres extensions: CITEXT (CREATE EXTENSION IF NOT EXISTS citext;)
# -----------------------------------------------------------------------------

from __future__ import annotations

import gzip
import hashlib
from importlib import import_module
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

try:  # Python 3.11+
    from typing import dataclass_transform
except ImportError:  # pragma: no cover - fallback for older runtimes
    from typing_extensions import dataclass_transform

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import (
    BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, Index,
    Integer, LargeBinary, String, Text, UniqueConstraint
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import CITEXT, INET, JSONB

db = SQLAlchemy()


@dataclass_transform(field_specifiers=(mapped_column,))
class _TypeCheckedModel:
    """Provide type-checker-friendly ``__init__`` for declarative models."""

    if TYPE_CHECKING:
        def __init__(self, **kwargs: Any) -> None: ...


class BaseModel(db.Model, _TypeCheckedModel):
    """Base class that equips SQLAlchemy models with typed ``__init__``."""

    __abstract__ = True

# =============================================================================
# Users & Auth
# =============================================================================

class Users(BaseModel):
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
        Application-level active flag for soft disabling accounts.
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

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(CITEXT, nullable=False, unique=True, index=True)
    email: Mapped[str | None] = mapped_column(CITEXT, unique=True, index=True)
    jwt_auth_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    date_joined: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), nullable=False
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
        Update the last successful authentication timestamp.

        Parameters
        ----------
        timestamp : datetime | None
            Explicit timestamp to record. Defaults to now (UTC).
        """

        self.last_login_at = timestamp or datetime.now(timezone.utc)

    @classmethod
    def get_by_id(cls, id: int) -> "Users | None":
        """
        Fetch by id.

        Parameters
        ----------
        id : int

        Returns
        -------
        Users | None
        """
        return cls.query.get(id)

    @classmethod
    def get_by_email(cls, email: str) -> "Users | None":
        """
        Fetch by email.

        Parameters
        ----------
        email : str

        Returns
        -------
        Users | None
        """
        return cls.query.filter_by(email=email).first()

    @classmethod
    def get_by_username(cls, username: str) -> "Users | None":
        """
        Fetch by username.

        Parameters
        ----------
        username : str

        Returns
        -------
        Users | None
        """
        return cls.query.filter_by(username=username).first()

    def toDICT(self) -> dict[str, Any]:
        """
        Serialize to a minimal dict.

        Returns
        -------
        dict[str, Any]
        """
        return {
            "_id": self.id,
            "username": self.username,
            "email": self.email,
            "is_active": self.is_active,
            "jwt_auth_active": self.jwt_auth_active,
            "last_login_at": self.last_login_at.isoformat() if self.last_login_at else None,
        }

    def toJSON(self) -> dict[str, Any]:
        """
        Alias of toDICT.

        Returns
        -------
        dict[str, Any]
        """
        return self.toDICT()


class JWTTokenBlocklist(BaseModel):
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
    created_at : datetime
        When it was added.
    reason : str | None
        Why the token was revoked (logout, rotation, etc.).

    Methods
    -------
    save() -> None
        Persist this row.
    """
    __tablename__ = "jwt_token_blocklist"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    jwt_token: Mapped[str] = mapped_column(String, nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    reason: Mapped[str | None] = mapped_column(String(64))

    def __repr__(self) -> str:
        return f"<Expired Token: {self.jwt_token}>"

    def save(self) -> None:
        """
        Save this blocklist entry.

        Returns
        -------
        None
        """
        db.session.add(self)
        db.session.commit()


class LoginAttempts(BaseModel):
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

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(CITEXT, nullable=False, index=True)
    ip_address: Mapped[str | None] = mapped_column(INET)
    user_agent: Mapped[str | None] = mapped_column(Text)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    failure_reason: Mapped[str | None] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    __table_args__ = (
        Index("ix_login_attempts_username_created", "username", "created_at"),
        Index("ix_login_attempts_ip_created", "ip_address", "created_at"),
    )

    def __repr__(self) -> str:
        status = "ok" if self.success else "fail"
        return f"<LoginAttempt {self.username}:{status} at {self.created_at.isoformat()}>"

# =============================================================================
# Basic lookups (Manufacturers / DeviceTypes / ProductModels)
# =============================================================================

class Manufacturers(BaseModel):
    """
    Manufacturers
    -------------
    Vendor/manufacturer names.

    Attributes
    ----------
    id : int
    name : str

    Methods
    -------
    get_or_create(name: str) -> Manufacturers
        Fetch or create by name.
    """
    __tablename__ = "manufacturers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False)

    def __repr__(self) -> str:
        return f"<Manufacturer {self.name}>"

    @classmethod
    def get_or_create(cls, name: str) -> "Manufacturers":
        """
        Fetch or create a manufacturer by name.

        Parameters
        ----------
        name : str

        Returns
        -------
        Manufacturers
        """
        inst = cls.query.filter_by(name=name).first()
        if inst:
            return inst
        inst = cls()  # construct-then-assign (type-checker friendly)
        inst.name = name
        db.session.add(inst)
        db.session.commit()
        return inst


class DeviceTypes(BaseModel):
    """
    DeviceTypes
    -----------
    Human taxonomy (router, switch, firewall, wlc, apic, etc.).

    Attributes
    ----------
    id : int
    name : str
    category : str | None
    """
    __tablename__ = "device_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False)
    category: Mapped[str | None] = mapped_column(CITEXT)

    def __repr__(self) -> str:
        return f"<DeviceType {self.name}>"


class ProductModels(BaseModel):
    """
    ProductModels
    -------------
    Normalized product model names per manufacturer.

    Attributes
    ----------
    id : int
    manufacturer_id : int | None
    name : str

    Constraints
    -----------
    UniqueConstraint(manufacturer_id, name)

    Methods
    -------
    get_or_create(mfg: Manufacturers | int, name: str) -> ProductModels
    """
    __tablename__ = "product_models"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    manufacturer_id: Mapped[int | None] = mapped_column(
        ForeignKey("manufacturers.id", ondelete="SET NULL")
    )
    name: Mapped[str] = mapped_column(CITEXT, nullable=False)

    __table_args__ = (UniqueConstraint("manufacturer_id", "name", name="uq_model_per_mfg"),)

    manufacturer = db.relationship("Manufacturers", backref="models")

    def __repr__(self) -> str:
        mfg = self.manufacturer.name if self.manufacturer else "Unknown"
        return f"<ProductModel {mfg}:{self.name}>"

    @classmethod
    def get_or_create(cls, mfg: Manufacturers | int, name: str) -> "ProductModels":
        """
        Fetch or create a product model within a manufacturer.

        Parameters
        ----------
        mfg : Manufacturers | int
        name : str

        Returns
        -------
        ProductModels
        """
        mfg_id = mfg.id if isinstance(mfg, Manufacturers) else mfg
        inst = cls.query.filter_by(manufacturer_id=mfg_id, name=name).first()
        if inst:
            return inst
        inst = cls()
        inst.manufacturer_id = mfg_id
        inst.name = name
        db.session.add(inst)
        db.session.commit()
        return inst


# =============================================================================
# Automation-facing platform + inventory
# =============================================================================

class Platforms(BaseModel):
    """
    Platforms
    ---------
    Automation-facing identity describing *how* to connect/operate.

    Typical slugs: 'apic', 'cimc', 'cisco_ftd', 'cisco_ios', 'cisco_nxos',
    'cisco_xe', 'cisco_xr', 'expressways', 'f5', 'f5_oshost', 'gigamon',
    'ise', 'juniper_junos', 'lantronix', 'ndo', 'wlc', 'wti'.

    Attributes
    ----------
    id : int
    slug : str
        Short unique key (CITEXT).
    display_name : str | None
    vendor_hint : str | None
        'cisco', 'f5', 'juniper', etc.
    # Library identifiers
    napalm_driver : str | None
        e.g., 'ios', 'nxos', 'junos', 'iosxr', or your custom driver name.
    napalm_optional_args : dict
        Per-driver optional args passed via Nornir connection options.
    netmiko_type : str | None
    scrapli_platform : str | None
    # Transport/handler
    default_transport : str | None
        'cli' | 'rest' | 'netconf' ...
    handler_entrypoint : str | None
        Dotted path to a Python class for custom operations.
    extras : dict
        Freeform JSON for parsers/quirks.
    # Ansible compatibility (future)
    ansible_network_os : str | None
    ansible_connection : str | None
    ansible_vars : dict

    Methods
    -------
    get_by_slug(slug: str) -> Platforms | None
    get_or_create_slug(slug: str, **kwargs) -> Platforms
    load_handler() -> Any | None
        Import and instantiate the handler class if defined.
    """
    __tablename__ = "platforms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False, index=True)
    display_name: Mapped[str | None] = mapped_column(CITEXT)
    vendor_hint: Mapped[str | None] = mapped_column(CITEXT)

    # NAPALM/Nornir identifiers
    napalm_driver: Mapped[str | None] = mapped_column(String)
    napalm_optional_args: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Other library identifiers (optional)
    netmiko_type: Mapped[str | None] = mapped_column(String)
    scrapli_platform: Mapped[str | None] = mapped_column(String)

    # Execution wiring
    default_transport: Mapped[str | None] = mapped_column(CITEXT)
    handler_entrypoint: Mapped[str | None] = mapped_column(String)
    extras: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Future Ansible compatibility
    ansible_network_os: Mapped[str | None] = mapped_column(CITEXT)
    ansible_connection: Mapped[str | None] = mapped_column(CITEXT)
    ansible_vars: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    def __repr__(self) -> str:
        return f"<Platform {self.slug}>"

    @classmethod
    def get_by_slug(cls, slug: str) -> "Platforms | None":
        """
        Fetch by slug.

        Parameters
        ----------
        slug : str

        Returns
        -------
        Platforms | None
        """
        return cls.query.filter_by(slug=slug).first()

    @classmethod
    def get_or_create_slug(cls, slug: str, **kwargs: Any) -> "Platforms":
        """
        Fetch or create by slug; optionally patch fields.

        Parameters
        ----------
        slug : str
        **kwargs : Any
            Fields to set/patch.

        Returns
        -------
        Platforms
        """
        inst = cls.query.filter_by(slug=slug).first()
        if inst:
            changed = False
            for k, v in kwargs.items():
                if getattr(inst, k, None) != v:
                    setattr(inst, k, v)
                    changed = True
            if changed:
                db.session.commit()
            return inst
        inst = cls()
        inst.slug = slug
        for k, v in kwargs.items():
            setattr(inst, k, v)
        db.session.add(inst)
        db.session.commit()
        return inst

    def load_handler(self) -> Any | None:
        """
        Import and instantiate the platform handler class if defined.

        Returns
        -------
        Any | None
        """
        if not self.handler_entrypoint:
            return None
        module_name, _, class_name = self.handler_entrypoint.rpartition(".")
        mod = import_module(module_name)
        cls = getattr(mod, class_name)
        return cls(platform=self)


class CredentialProfiles(BaseModel):
    """
    CredentialProfiles
    ------------------
    Metadata for retrieving device credentials from an external secrets
    backend (no secrets stored here).

    Attributes
    ----------
    id : int
    name : str
        Unique profile name.
    provider : str
        'vault', 'aws_secrets_manager', 'gcp_secret_manager', 'env', etc.
    secret_path : str
        Path/identifier in the provider (e.g., 'secret/data/net/dev1').
    username_key : str | None
        Key/name to fetch username.
    password_key : str | None
        Key/name to fetch password.
    extras : dict
        Provider-specific fields (role, region, mount, kv_version, etc).

    Methods
    -------
    get_or_create(name: str, **kwargs) -> CredentialProfiles
    """
    __tablename__ = "credential_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False, index=True)
    provider: Mapped[str] = mapped_column(CITEXT, nullable=False, default="vault")
    secret_path: Mapped[str] = mapped_column(String, nullable=False)
    username_key: Mapped[str | None] = mapped_column(String)
    password_key: Mapped[str | None] = mapped_column(String)
    extras: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    def __repr__(self) -> str:
        return f"<CredProfile {self.name}:{self.provider}>"

    @classmethod
    def get_or_create(cls, name: str, **kwargs: Any) -> "CredentialProfiles":
        """
        Fetch or create a credential profile.

        Parameters
        ----------
        name : str
        **kwargs : Any

        Returns
        -------
        CredentialProfiles
        """
        inst = cls.query.filter_by(name=name).first()
        if inst:
            return inst
        inst = cls()
        inst.name = name
        for k, v in kwargs.items():
            setattr(inst, k, v)
        db.session.add(inst)
        db.session.commit()
        return inst


class InventoryGroups(BaseModel):
    """
    InventoryGroups
    ---------------
    DB-native grouping to mirror Nornir groups and (optionally) Ansible groups.

    Attributes
    ----------
    id : int
    slug : str
        Unique key (CITEXT).
    title : str | None
    nornir_data : dict
        Group-level Nornir host vars (non-secret).
    ansible_vars : dict
        Group-level Ansible vars (optional).

    Relationships
    -------------
    devices : list[Devices]
        Many-to-many via DeviceInventoryGroups.
    """
    __tablename__ = "inventory_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False, index=True)
    title: Mapped[str | None] = mapped_column(CITEXT)
    nornir_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    ansible_vars: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    def __repr__(self) -> str:
        return f"<InventoryGroup {self.slug}>"


class DeviceInventoryGroups(BaseModel):
    """
    DeviceInventoryGroups
    ---------------------
    Association table for devices ↔ inventory groups.

    Attributes
    ----------
    device_id : int
    group_id : int
    """
    __tablename__ = "device_inventory_groups"

    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("inventory_groups.id", ondelete="CASCADE"), primary_key=True)

# =============================================================================
# Core device + networking (IPv4-only)
# =============================================================================

class Devices(BaseModel):
    """
    Devices
    -------
    Canonical record for any managed entity (physical/virtual).

    Attributes
    ----------
    id : int
    name : str | None
    fqdn : str | None
    device_type_id : int | None
    manufacturer_id : int | None
    product_model_id : int | None
    serial_number : str | None
    asset_tag : str | None
    is_virtual : bool
    os_name : str | None
    os_version : str | None
    mgmt_ipv4 : str | None
        IPv4 only (INET); CHECK family(...) = 4.
    mgmt_port : int | None
        TCP port for management (default 22).
    facts : dict
        Vendor/device details discovered (freeform).
    created_at : datetime
    updated_at : datetime
    last_seen_at : datetime | None
    active : bool
    platform_id : int | None
        FK to Platforms.
    credential_profile_id : int | None
        FK to CredentialProfiles.
    nornir_data : dict
        Per-host Nornir vars (non-secret). E.g. {"hostname": "x", "port": 22,
        "connection_options": {"napalm": {"extras": {"optional_args": {...}}}}}
    ansible_host : str | None
        Optional override for Ansible host.
    ansible_vars : dict
        Optional per-host Ansible vars.

    Relationships
    -------------
    platform : Platforms | None
    device_type : DeviceTypes | None
    manufacturer : Manufacturers | None
    product_model : ProductModels | None
    interfaces : list[Interfaces]
    config_snapshots : list[DeviceConfigSnapshots]
    physical_info : PhysicalDeviceInfos | None
    virtual_info : VirtualInstanceInfos | None
    groups : list[InventoryGroups] (via DeviceInventoryGroups)

    Methods
    -------
    save() -> None
    upsert_facts(new_facts: dict) -> None
    set_platform(slug: str) -> None
    get_by_id(id: int) -> Devices | None
    get_by_name(name: str) -> Devices | None
    get_by_mgmt_ip(ipv4: str) -> Devices | None
    """
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # Identity
    name: Mapped[str | None] = mapped_column(CITEXT, index=True)
    fqdn: Mapped[str | None] = mapped_column(CITEXT, index=True)
    device_type_id: Mapped[int | None] = mapped_column(ForeignKey("device_types.id", ondelete="SET NULL"))
    manufacturer_id: Mapped[int | None] = mapped_column(ForeignKey("manufacturers.id", ondelete="SET NULL"))
    product_model_id: Mapped[int | None] = mapped_column(ForeignKey("product_models.id", ondelete="SET NULL"))

    serial_number: Mapped[str | None] = mapped_column(CITEXT, index=True)
    asset_tag: Mapped[str | None] = mapped_column(CITEXT)
    is_virtual: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Software
    os_name: Mapped[str | None] = mapped_column(CITEXT)
    os_version: Mapped[str | None] = mapped_column(String)

    # Management (IPv4-only)
    mgmt_ipv4: Mapped[str | None] = mapped_column(INET, index=True)
    mgmt_port: Mapped[int | None] = mapped_column(Integer, default=22)

    # Freeform facts
    facts: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Lifecycle
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Automation links
    platform_id: Mapped[int | None] = mapped_column(ForeignKey("platforms.id", ondelete="SET NULL"))
    credential_profile_id: Mapped[int | None] = mapped_column(ForeignKey("credential_profiles.id", ondelete="SET NULL"))
    nornir_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    ansible_host: Mapped[str | None] = mapped_column(CITEXT)
    ansible_vars: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Relationships
    platform = db.relationship("Platforms")
    device_type = db.relationship("DeviceTypes")
    manufacturer = db.relationship("Manufacturers")
    product_model = db.relationship("ProductModels")
    interfaces = db.relationship("Interfaces", back_populates="device", cascade="all, delete-orphan")
    config_snapshots = db.relationship("DeviceConfigSnapshots", back_populates="device", cascade="all, delete-orphan")
    physical_info = db.relationship("PhysicalDeviceInfos", back_populates="device", uselist=False, cascade="all, delete-orphan")
    virtual_info = db.relationship("VirtualInstanceInfos", back_populates="device", uselist=False, cascade="all, delete-orphan")
    groups = db.relationship(
        "InventoryGroups",
        secondary="device_inventory_groups",
        primaryjoin="Devices.id==DeviceInventoryGroups.device_id",
        secondaryjoin="InventoryGroups.id==DeviceInventoryGroups.group_id",
        viewonly=True,
    )

    __table_args__ = (
        Index("ix_devices_name_ci", "name"),
        # Unique serial number when present (create via migration):
        # CREATE UNIQUE INDEX uq_devices_serial_not_null ON devices (serial_number) WHERE serial_number IS NOT NULL;
        CheckConstraint("(mgmt_ipv4 IS NULL) OR (family(mgmt_ipv4) = 4)", name="chk_devices_mgmt_ipv4"),
        CheckConstraint("(mgmt_port IS NULL) OR (mgmt_port > 0 AND mgmt_port <= 65535)", name="chk_devices_mgmt_port"),
    )

    def __repr__(self) -> str:
        return f"<Device {self.name or self.fqdn or self.id}>"

    # ---- Methods ------------------------------------------------------------

    @property
    def is_active(self) -> bool:
        """Alias the `active` column to `is_active` for API compatibility."""

        return bool(self.active)

    @is_active.setter
    def is_active(self, value: bool) -> None:
        self.active = bool(value)

    @property
    def inventory_group_id(self) -> int | None:
        """Return the first associated inventory group id if present."""

        if self.id is None:
            return None
        link = (
            db.session.query(DeviceInventoryGroups)
            .filter_by(device_id=self.id)
            .order_by(DeviceInventoryGroups.group_id)
            .first()
        )
        return link.group_id if link else None

    @inventory_group_id.setter
    def inventory_group_id(self, group_id: int | None) -> None:
        if self.id is None:
            # Device must be flushed/committed before managing association
            raise ValueError("Device must be persisted before assigning inventory groups")
        db.session.query(DeviceInventoryGroups).filter_by(device_id=self.id).delete()
        if group_id is not None:
            db.session.add(DeviceInventoryGroups(device_id=self.id, group_id=group_id))

    def save(self) -> None:
        """
        Save this device.

        Returns
        -------
        None
        """
        db.session.add(self)
        db.session.commit()

    def upsert_facts(self, new_facts: dict) -> None:
        """
        Merge new facts into the existing facts JSON.

        Parameters
        ----------
        new_facts : dict

        Returns
        -------
        None
        """
        self.facts = {**(self.facts or {}), **(new_facts or {})}
        db.session.commit()

    def set_platform(self, slug: str) -> None:
        """
        Attach a platform by slug (create if missing).

        Parameters
        ----------
        slug : str

        Returns
        -------
        None
        """
        plat = Platforms.get_or_create_slug(slug)
        self.platform = plat
        db.session.commit()

    @classmethod
    def get_by_id(cls, id: int) -> "Devices | None":
        """
        Fetch by id.

        Parameters
        ----------
        id : int

        Returns
        -------
        Devices | None
        """
        return cls.query.get(id)

    @classmethod
    def get_by_name(cls, name: str) -> "Devices | None":
        """
        Fetch by name.

        Parameters
        ----------
        name : str

        Returns
        -------
        Devices | None
        """
        return cls.query.filter_by(name=name).first()

    @classmethod
    def get_by_mgmt_ip(cls, ipv4: str) -> "Devices | None":
        """
        Fetch by management IPv4.

        Parameters
        ----------
        ipv4 : str

        Returns
        -------
        Devices | None
        """
        return cls.query.filter(cls.mgmt_ipv4 == ipv4).first()


class PhysicalDeviceInfos(BaseModel):
    """
    PhysicalDeviceInfos
    -------------------
    Extra details for physical devices (site/rack/position).

    Attributes
    ----------
    device_id : int
        PK/FK to Devices.id
    site : str | None
    rack : str | None
    position_u : int | None
    """
    __tablename__ = "physical_device_infos"

    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True)
    site: Mapped[str | None] = mapped_column(CITEXT)
    rack: Mapped[str | None] = mapped_column(String)
    position_u: Mapped[int | None] = mapped_column(Integer)

    device = db.relationship("Devices", back_populates="physical_info")


class VirtualInstanceInfos(BaseModel):
    """
    VirtualInstanceInfos
    --------------------
    Extra details for virtual instances.

    Attributes
    ----------
    device_id : int
    hypervisor : str | None
    host_device_id : int | None
    vm_uuid : str | None
    """
    __tablename__ = "virtual_instance_infos"

    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True)
    hypervisor: Mapped[str | None] = mapped_column(CITEXT)   # ESXi, KVM, UCS, etc.
    host_device_id: Mapped[int | None] = mapped_column(ForeignKey("devices.id", ondelete="SET NULL"))
    vm_uuid: Mapped[str | None] = mapped_column(String, index=True)

    device = db.relationship("Devices", foreign_keys=[device_id], back_populates="virtual_info")
    host_device = db.relationship("Devices", foreign_keys=[host_device_id])


# =============================================================================
# Interfaces + IPv4 addressing
# =============================================================================

class Interfaces(BaseModel):
    """
    Interfaces
    ----------
    Logical/physical network interfaces per device.

    Attributes
    ----------
    id : int
    device_id : int
    name : str
    description : str | None
    mac_address : str | None
    type : str | None
    speed_mbps : int | None
    is_up : bool

    Relationships
    -------------
    ip_assignments : list[InterfaceIPAddresses]

    Methods
    -------
    get_by_device_and_name(device_id: int, name: str) -> Interfaces | None
    """
    __tablename__ = "interfaces"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String)
    mac_address: Mapped[str | None] = mapped_column(String, index=True)
    type: Mapped[str | None] = mapped_column(CITEXT)           # physical, svi, loopback, port-channel, mgmt
    speed_mbps: Mapped[int | None] = mapped_column(Integer)
    is_up: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    device = db.relationship("Devices", back_populates="interfaces")
    ip_assignments = db.relationship("InterfaceIPAddresses", back_populates="interface", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("device_id", "name", name="uq_interface_per_device"),)

    def __repr__(self) -> str:
        return f"<Interface {self.device_id}:{self.name}>"

    @classmethod
    def get_by_device_and_name(cls, device_id: int, name: str) -> "Interfaces | None":
        """
        Fetch an interface by device and name.

        Parameters
        ----------
        device_id : int
        name : str

        Returns
        -------
        Interfaces | None
        """
        return cls.query.filter_by(device_id=device_id, name=name).first()


class IPAddresses(BaseModel):
    """
    IPAddresses (IPv4 only)
    -----------------------
    Unique IPv4 addresses; enforced via CHECK.

    Attributes
    ----------
    id : int
    address : str
        INET IPv4.

    Methods
    -------
    get_or_create(ipv4: str) -> IPAddresses
    """
    __tablename__ = "ip_addresses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    address: Mapped[str] = mapped_column(INET, unique=True, nullable=False)

    __table_args__ = (
        CheckConstraint("family(address) = 4", name="chk_ip_addresses_ipv4_only"),
    )

    def __repr__(self) -> str:
        return f"<IP {self.address}>"

    @classmethod
    def get_or_create(cls, ipv4: str) -> "IPAddresses":
        """
        Fetch or create an IPv4 address row.

        Parameters
        ----------
        ipv4 : str

        Returns
        -------
        IPAddresses
        """
        inst = cls.query.filter_by(address=ipv4).first()
        if inst:
            return inst
        inst = cls()
        inst.address = ipv4
        db.session.add(inst)
        db.session.commit()
        return inst


class InterfaceIPAddresses(BaseModel):
    """
    InterfaceIPAddresses
    --------------------
    Association for interface ↔ IPv4 address (N-to-N), with optional
    primary flag and assignment window.

    Attributes
    ----------
    interface_id : int
    ip_address_id : int
    primary : bool
    assigned_from : datetime | None
    assigned_to : datetime | None
    """
    __tablename__ = "interface_ip_addresses"

    interface_id: Mapped[int] = mapped_column(ForeignKey("interfaces.id", ondelete="CASCADE"), primary_key=True)
    ip_address_id: Mapped[int] = mapped_column(ForeignKey("ip_addresses.id", ondelete="CASCADE"), primary_key=True)
    primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    assigned_from: Mapped[datetime | None] = mapped_column(DateTime)
    assigned_to: Mapped[datetime | None] = mapped_column(DateTime)

    interface = db.relationship("Interfaces", back_populates="ip_assignments")
    ip_address = db.relationship("IPAddresses")


# =============================================================================
# Config snapshots & diffs (vendor-agnostic)
# =============================================================================

class DeviceConfigSnapshots(BaseModel):
    """
    DeviceConfigSnapshots
    ---------------------
    Immutable configuration snapshots for devices. Deduplicated by SHA-256.

    Attributes
    ----------
    id : int
    device_id : int
    captured_at : datetime
    content_sha256 : str
    size_bytes : int
    storage_inline : bool
    content_inline_text : str | None
    content_inline_bytes : bytes | None
    object_url : str | None
    content_mime : str
    content_encoding : str | None
    vendor_hint : str | None
    config_role : str | None
    parsed_facts : dict

    Methods
    -------
    latest_for_device(device_id: int) -> DeviceConfigSnapshots | None
    create_if_changed(device_id: int, blob: bytes, mime: str = 'text/plain',
                      role: str | None = 'running', vendor_hint: str | None = None,
                      externalize: bool = False) -> DeviceConfigSnapshots | None
    """
    __tablename__ = "device_config_snapshots"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"), index=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True, nullable=False)

    content_sha256: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)

    storage_inline: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    content_inline_text: Mapped[str | None] = mapped_column(Text)
    content_inline_bytes: Mapped[bytes | None] = mapped_column(LargeBinary)
    object_url: Mapped[str | None] = mapped_column(String)

    content_mime: Mapped[str] = mapped_column(String, default="text/plain")
    content_encoding: Mapped[str | None] = mapped_column(String)
    vendor_hint: Mapped[str | None] = mapped_column(CITEXT)
    config_role: Mapped[str | None] = mapped_column(CITEXT)

    parsed_facts: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    device = db.relationship("Devices", back_populates="config_snapshots")

    __table_args__ = (
        UniqueConstraint("device_id", "content_sha256", name="uq_config_dedup"),
        Index("ix_config_device_time", "device_id", "captured_at"),
    )

    def __repr__(self) -> str:
        return f"<ConfigSnapshot d={self.device_id} at={self.captured_at.isoformat()}>"

    @classmethod
    def latest_for_device(cls, device_id: int) -> "DeviceConfigSnapshots | None":
        """
        Fetch the most recent snapshot for a device.

        Parameters
        ----------
        device_id : int

        Returns
        -------
        DeviceConfigSnapshots | None
        """
        return (
            cls.query.filter_by(device_id=device_id)
            .order_by(cls.captured_at.desc())
            .first()
        )

    @classmethod
    def create_if_changed(
        cls,
        device_id: int,
        blob: bytes,
        mime: str = "text/plain",
        role: str | None = "running",
        vendor_hint: str | None = None,
        externalize: bool = False,
    ) -> "DeviceConfigSnapshots | None":
        """
        Create a new snapshot only if the content hash is new.

        Parameters
        ----------
        device_id : int
        blob : bytes
        mime : str, default 'text/plain'
        role : str | None, default 'running'
        vendor_hint : str | None
        externalize : bool, default False

        Returns
        -------
        DeviceConfigSnapshots | None
        """
        content_sha = hashlib.sha256(blob).hexdigest()
        existing = cls.query.filter_by(device_id=device_id, content_sha256=content_sha).first()
        if existing:
            return existing

        size = len(blob)
        storage_inline = not externalize
        inline_text = None
        inline_bytes = None
        object_url = None
        encoding = None

        if storage_inline:
            try:
                inline_text = blob.decode("utf-8")
            except UnicodeDecodeError:
                inline_bytes = gzip.compress(blob, compresslevel=6)
                encoding = "gzip"
        else:
            inline_bytes = gzip.compress(blob, compresslevel=6)
            encoding = "gzip"

        snap = cls(
            device_id=device_id,
            captured_at=datetime.utcnow(),
            content_sha256=content_sha,
            size_bytes=size,
            storage_inline=storage_inline,
            content_inline_text=inline_text,
            content_inline_bytes=inline_bytes,
            object_url=object_url,
            content_mime=mime,
            content_encoding=encoding,
            vendor_hint=vendor_hint,
            config_role=role,
            parsed_facts={},
        )
        db.session.add(snap)
        db.session.commit()
        return snap


class DeviceConfigDiffs(BaseModel):
    """
    DeviceConfigDiffs
    -----------------
    Cached unified diffs between two snapshots.

    Attributes
    ----------
    id : int
    device_id : int
    from_snapshot_id : int
    to_snapshot_id : int
    diff_text : str
    created_at : datetime
    """
    __tablename__ = "device_config_diffs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"), index=True)
    from_snapshot_id: Mapped[int] = mapped_column(ForeignKey("device_config_snapshots.id", ondelete="CASCADE"))
    to_snapshot_id: Mapped[int] = mapped_column(ForeignKey("device_config_snapshots.id", ondelete="CASCADE"))
    diff_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    device = db.relationship("Devices")
    from_snapshot = db.relationship("DeviceConfigSnapshots", foreign_keys=[from_snapshot_id])
    to_snapshot = db.relationship("DeviceConfigSnapshots", foreign_keys=[to_snapshot_id])

    def __repr__(self) -> str:
        return f"<ConfigDiff d={self.device_id} from={self.from_snapshot_id} to={self.to_snapshot_id}>"


# =============================================================================
# Data-driven operation templates (fallback when drivers don't exist)
# =============================================================================

class PlatformOperationTemplates(BaseModel):
    """
    PlatformOperationTemplates
    --------------------------
    Data-driven CLI/REST templates per platform+operation.
    Useful when a NAPALM driver doesn't cover a task yet.

    Attributes
    ----------
    id : int
    platform_id : int
    operation : str
        e.g., 'password_change', 'save_config'.
    channel : str
        'cli' | 'rest' | 'netconf'
    template : str
        Command script or HTTP payload/template (Jinja or str.format friendly).
    success_patterns : list
        Regex strings checked against output.
    extras : dict
        Extra driver/transport hints.
    created_at : datetime

    Methods
    -------
    get(platform_id: int, operation: str) -> PlatformOperationTemplates | None
    """
    __tablename__ = "platform_operation_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    platform_id: Mapped[int] = mapped_column(ForeignKey("platforms.id", ondelete="CASCADE"), index=True)
    operation: Mapped[str] = mapped_column(CITEXT, index=True, nullable=False)
    channel: Mapped[str] = mapped_column(CITEXT, nullable=False, default="cli")
    template: Mapped[str] = mapped_column(Text, nullable=False)
    success_patterns: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    extras: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    platform = db.relationship("Platforms", backref="operation_templates")

    __table_args__ = (
        UniqueConstraint("platform_id", "operation", name="uq_platform_operation"),
        Index("ix_platform_op", "platform_id", "operation"),
    )

    def __repr__(self) -> str:
        return f"<PlatformOpTemplate {self.platform_id}:{self.operation}>"

    @classmethod
    def get(cls, platform_id: int, operation: str) -> "PlatformOperationTemplates | None":
        """
        Fetch a template by platform and operation.

        Parameters
        ----------
        platform_id : int
        operation : str

        Returns
        -------
        PlatformOperationTemplates | None
        """
        return cls.query.filter_by(platform_id=platform_id, operation=operation).first()


# =============================================================================
# Compliance (optional)
# =============================================================================

class CompliancePolicies(BaseModel):
    """
    CompliancePolicies
    ------------------
    Stores compliance rules/policies as data (JSON).

    Attributes
    ----------
    id : int
    name : str
    description : str | None
    is_active : bool
    scope : dict
    rules : dict
    created_at : datetime
    updated_at : datetime
    """
    __tablename__ = "compliance_policies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    scope: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    rules: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    def __repr__(self) -> str:
        return f"<CompliancePolicy {self.name}>"


class ComplianceRules(BaseModel):
    """
    ComplianceRules
    ---------------
    Individual rule definitions that belong to a policy.

    Attributes
    ----------
    id : int
    policy_id : int
    name : str
    description : str | None
    severity : str
    rule_type : str
    expression : str
    params : dict
    created_at : datetime
    updated_at : datetime
    """

    __tablename__ = "compliance_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    policy_id: Mapped[int] = mapped_column(
        ForeignKey("compliance_policies.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(50), nullable=False, default="unknown")
    rule_type: Mapped[str] = mapped_column(String(100), nullable=False)
    expression: Mapped[str] = mapped_column(Text, nullable=False)
    params: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    policy = db.relationship("CompliancePolicies", backref="rules", lazy="joined")
    results = db.relationship("ComplianceResults", back_populates="rule")

    def __repr__(self) -> str:
        return f"<ComplianceRule {self.name} p={self.policy_id}>"


class ComplianceResults(BaseModel):
    """
    ComplianceResults
    -----------------
    Time-series results of evaluating a device against a policy.

    Attributes
    ----------
    id : int
    device_id : int
    policy_id : int
    rule_id : int | None
    evaluated_at : datetime
    status : str
    summary : str | None
    details : dict
    snapshot_id : int | None
    """
    __tablename__ = "compliance_results"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"), index=True)
    policy_id: Mapped[int] = mapped_column(ForeignKey("compliance_policies.id", ondelete="CASCADE"))
    rule_id: Mapped[int | None] = mapped_column(
        ForeignKey("compliance_rules.id", ondelete="SET NULL"), index=True
    )
    evaluated_at: Mapped[datetime] = mapped_column(
        "checked_at", DateTime, default=datetime.utcnow, index=True, nullable=False
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="unknown")
    is_compliant: Mapped[bool] = mapped_column(Boolean, nullable=False)
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
        return (
            f"<ComplianceResult d={self.device_id} p={self.policy_id} "
            f"status={self.status or ('pass' if self.is_compliant else 'fail')}>"
        )

# --- Logging & Events ---------------------------------------------------------

class RequestLogs(BaseModel):
    """
    RequestLogs
    -----------
    One row per HTTP request/response.

    Attributes
    ----------
    id : int
    occurred_at : datetime
    correlation_id : str
    user_id : int | None
    method : str
    path : str
    route : str | None          # Flask endpoint name
    blueprint : str | None
    status_code : int
    latency_ms : int
    ip : str | None
    user_agent : str | None
    query_params : dict
    request_headers : dict      # sanitized (no auth/cookies)
    response_headers : dict     # sanitized
    request_bytes : int | None
    response_bytes : int | None
    auth_subject : str | None   # JWT identity if present
    device_id_hint : int | None # pulled from path or body when obvious
    platform_id_hint : int | None

    Indexes
    -------
    ix_requestlogs_time, ix_requestlogs_user, ix_requestlogs_status, ix_requestlogs_path
    """
    __tablename__ = "request_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True, nullable=False)
    correlation_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)

    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    method: Mapped[str] = mapped_column(String(10), nullable=False)
    path: Mapped[str] = mapped_column(String, index=True, nullable=False)
    route: Mapped[str | None] = mapped_column(String)
    blueprint: Mapped[str | None] = mapped_column(String)

    status_code: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String)

    query_params: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    request_headers: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    response_headers: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    request_bytes: Mapped[int | None] = mapped_column(Integer)
    response_bytes: Mapped[int | None] = mapped_column(Integer)

    auth_subject: Mapped[str | None] = mapped_column(String, index=True)

    device_id_hint: Mapped[int | None] = mapped_column(Integer, index=True)
    platform_id_hint: Mapped[int | None] = mapped_column(Integer, index=True)

    __table_args__ = (
        Index("ix_requestlogs_time", "occurred_at"),
        Index("ix_requestlogs_user", "user_id"),
        Index("ix_requestlogs_status", "status_code"),
        Index("ix_requestlogs_path", "path"),
    )


class ErrorLogs(BaseModel):
    """
    ErrorLogs
    ---------
    Application errors/exceptions.

    Attributes
    ----------
    id : int
    occurred_at : datetime
    correlation_id : str
    level : str          # ERROR or CRITICAL
    message : str
    traceback : str | None
    context : dict       # any extra fields (module, func, line, etc.)
    request_log_id : int | None  # link to RequestLogs when available
    user_id : int | None
    """
    __tablename__ = "error_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True, nullable=False)
    correlation_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)

    level: Mapped[str] = mapped_column(CITEXT, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    traceback: Mapped[str | None] = mapped_column(Text)
    context: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    request_log_id: Mapped[int | None] = mapped_column(ForeignKey("request_logs.id", ondelete="SET NULL"))
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)


class AppEvents(BaseModel):
    """
    AppEvents
    ---------
    General runtime/system events (startup, config chosen, background job notes).

    Attributes
    ----------
    id : int
    occurred_at : datetime
    level : str         # INFO/WARN/ERROR
    event : str         # short key, e.g., 'startup', 'reload', 'nornir_init'
    message : str | None
    extra : dict
    """
    __tablename__ = "app_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True, nullable=False)
    level: Mapped[str] = mapped_column(CITEXT, nullable=False, default="INFO")
    event: Mapped[str] = mapped_column(CITEXT, nullable=False)
    message: Mapped[str | None] = mapped_column(Text)
    extra: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

# =============================================================================
# Lifecycle (EoX) tracking
# =============================================================================

class HardwareLifecycle(BaseModel):
    """
    HardwareLifecycle
    -----------------
    End-of-life milestones for hardware (per product model).

    Attributes
    ----------
    id : int
    product_model_id : int
        FK to ProductModels.id (unique).
    end_of_sale_date : datetime | None
        Last date the hardware could be ordered (EoS).
    end_of_software_maintenance_date : datetime | None
        Last date bugfix/maintenance is provided for the product (EoSWM).
    end_of_security_fixes_date : datetime | None
        Last date security fixes are provided (EoSec).
    last_day_of_support_date : datetime | None
        Final support date (LDoS). Often what teams call “EoL”.
    source_url : str | None
        Link to vendor advisory/notice.
    notes : str | None
        Freeform notes.

    Constraints
    -----------
    UniqueConstraint(product_model_id)

    Methods
    -------
    is_past(milestone: str, as_of: datetime | None = None) -> bool
        True if the given milestone date is in the past.
    """
    __tablename__ = "hardware_lifecycle"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
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
        """
        Parameters
        ----------
        milestone : str
            One of: 'eos', 'eoswm', 'eosec', 'ldos'
        as_of : datetime | None
            Comparison timestamp (UTC now if None)

        Returns
        -------
        bool
        """
        as_of = as_of or datetime.utcnow()
        k = milestone.lower()
        field = {
            "eos": "end_of_sale_date",
            "eoswm": "end_of_software_maintenance_date",
            "eosec": "end_of_security_fixes_date",
            "ldos": "last_day_of_support_date",
        }.get(k)
        if not field:
            return False
        dt = getattr(self, field, None)
        return bool(dt and dt < as_of)


class SoftwareLifecycle(BaseModel):
    """
    SoftwareLifecycle
    -----------------
    End-of-life milestones for software releases.

    Matching Strategy
    -----------------
    A row applies to devices with matching (platform_id, os_name) AND whose
    os_version matches the (match_operator, match_value):

      - match_operator = 'eq'     -> exact string equality on version
      - match_operator = 'prefix' -> os_version startswith(match_value), e.g., '17.3'
      - match_operator = 'regex'  -> os_version matches a regex (use carefully)

    Attributes
    ----------
    id : int
    platform_id : int | None
        FK to Platforms.id; when NULL, applies to any platform that uses this os_name.
    os_name : str
        OS family key, e.g., 'iosxe', 'nxos', 'junos'.
    match_operator : str
        'eq' | 'prefix' | 'regex'
    match_value : str
        Version matcher value.
    end_of_software_maintenance_date : datetime | None  # EoSWM
    end_of_security_fixes_date : datetime | None        # EoSec
    last_day_of_support_date : datetime | None          # LDoS
    end_of_sale_date : datetime | None                  # if vendor uses for SW licensing
    source_url : str | None
    notes : str | None

    Indexes
    -------
    (os_name, platform_id), (match_operator, match_value)
    """
    __tablename__ = "software_lifecycle"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    platform_id: Mapped[int | None] = mapped_column(ForeignKey("platforms.id", ondelete="SET NULL"), index=True)
    os_name: Mapped[str] = mapped_column(CITEXT, index=True, nullable=False)
    match_operator: Mapped[str] = mapped_column(CITEXT, nullable=False, default="eq")
    match_value: Mapped[str] = mapped_column(String, nullable=False)

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

    # Simple matcher; regex evaluated in app code where needed
    def matches_version(self, version: str) -> bool:
        """
        Parameters
        ----------
        version : str

        Returns
        -------
        bool
        """
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

# -----------------------------------------------------------------------------
# Suggested Postgres DDL (run via migration):
# -----------------------------------------------------------------------------
# CREATE EXTENSION IF NOT EXISTS citext;
# CREATE UNIQUE INDEX IF NOT EXISTS uq_devices_serial_not_null
#   ON devices (serial_number) WHERE serial_number IS NOT NULL;
# CREATE INDEX IF NOT EXISTS ix_devices_facts_gin
#   ON devices USING GIN (facts);
# CREATE INDEX IF NOT EXISTS ix_config_parsed_facts_gin
#   ON device_config_snapshots USING GIN (parsed_facts);