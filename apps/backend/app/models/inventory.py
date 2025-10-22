"""Inventory and platform related ORM models."""

from __future__ import annotations

from datetime import datetime
from importlib import import_module
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, validates

from ..extensions import db
from .annotations import CITEXT, JSONB, mapped_column
from .base import BaseModel
from .mixins import DisableableMixin, IdPkMixin, TimestampMixin, UuidPkMixin


class Manufacturers(UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel):
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

    name: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False)

    def __repr__(self) -> str:
        return f"<Manufacturer {self.name}>"

    @classmethod
    def get_or_create(cls, name: str) -> "Manufacturers":
        """Fetch or create a manufacturer by name."""

        inst = cls.query.filter_by(name=name).first()
        if inst:
            return inst
        inst = Manufacturers(name=name)
        db.session.add(inst)
        db.session.commit()
        return inst


class DeviceTypes(UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel):
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

    name: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False)
    category: Mapped[str | None] = mapped_column(CITEXT, default=None)

    def __repr__(self) -> str:
        return f"<DeviceType {self.name}>"


class ProductModels(UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel):
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

    manufacturer_id: Mapped[int | None] = mapped_column(
        ForeignKey("manufacturers.id", ondelete="SET NULL"), default=None
    )
    name: Mapped[str] = mapped_column(CITEXT, nullable=False)
    model_number: Mapped[str | None] = mapped_column(CITEXT, default=None)

    __table_args__ = (UniqueConstraint("manufacturer_id", "name", name="uq_model_per_mfg"),)

    manufacturer = db.relationship("Manufacturers", backref="models")

    def __repr__(self) -> str:
        mfg = self.manufacturer.name if self.manufacturer else "Unknown"
        return f"<ProductModel {mfg}:{self.name}>"

    @classmethod
    def get_or_create(cls, mfg: Manufacturers | int, name: str) -> "ProductModels":
        """Fetch or create a product model within a manufacturer."""

        mfg_id = mfg.id if isinstance(mfg, Manufacturers) else mfg
        inst = cls.query.filter_by(manufacturer_id=mfg_id, name=name).first()
        if inst:
            return inst
        inst = ProductModels(manufacturer_id=mfg_id, name=name)
        db.session.add(inst)
        db.session.commit()
        return inst


class Platforms(DisableableMixin, UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel):
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

    slug: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False, index=True)
    display_name: Mapped[str | None] = mapped_column(CITEXT, default=None)
    vendor_hint: Mapped[str | None] = mapped_column(CITEXT, default=None)

    # NAPALM/Nornir identifiers
    napalm_driver: Mapped[str | None] = mapped_column(String, default=None)
    napalm_optional_args: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Other library identifiers (optional)
    netmiko_type: Mapped[str | None] = mapped_column(String, default=None)
    scrapli_platform: Mapped[str | None] = mapped_column(String, default=None)

    # Execution wiring
    default_transport: Mapped[str | None] = mapped_column(CITEXT, default=None)
    handler_entrypoint: Mapped[str | None] = mapped_column(String, default=None)
    extras: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Future Ansible compatibility
    ansible_network_os: Mapped[str | None] = mapped_column(CITEXT, default=None)
    ansible_connection: Mapped[str | None] = mapped_column(CITEXT, default=None)
    ansible_vars: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, default=None)
    
    def __repr__(self) -> str:
        return f"<Platform {self.slug}>"

    @classmethod
    def get_by_slug(cls, slug: str) -> "Platforms | None":
        """Fetch by slug."""

        return cls.query.filter_by(slug=slug).first()

    @classmethod
    def get_or_create_slug(cls, slug: str, **kwargs: Any) -> "Platforms":
        """Fetch or create by slug; optionally patch fields."""

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
        inst = Platforms(slug=slug, **kwargs)
        db.session.add(inst)
        db.session.commit()
        return inst

    def load_handler(self) -> Any | None:
        """Import and instantiate the platform handler class if defined."""

        if not self.handler_entrypoint:
            return None
        module_name, _, class_name = self.handler_entrypoint.rpartition(".")
        mod = import_module(module_name)
        cls = getattr(mod, class_name)
        return cls(platform=self)


class CredentialProfiles(DisableableMixin, UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel):
    """
    CredentialProfiles
    ------------------
    Metadata describing *where* and *how* to retrieve credentials for a device.

    Attributes
    ----------
    id : int
    name : str
        Unique profile name.
    description : str | None
    auth_type : str
        High level auth style ("username_password", "ssh_key", "api_token", etc.).
    username : str | None
        Optional username hint (no secrets stored in Orbit).
    secret_ref : str | None
        Reference/path in an external secrets backend.
    secret_metadata : dict
        Non-sensitive metadata for the external secret (version, mount, etc.).
    params : dict
        Provider/driver specific extras (region, kv_version, etc.).
    is_active : bool
        Derived active flag (False when ``disabled_at`` is set).
    disabled_at : datetime | None
        Timestamp when the profile was disabled.
    created_at : datetime
    updated_at : datetime

    Methods
    -------
    get_or_create(name: str, **kwargs) -> CredentialProfiles
    """

    __tablename__ = "credential_profiles"

    name: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, default=None)
    auth_type: Mapped[str] = mapped_column(CITEXT, nullable=False, default="username_password")
    username: Mapped[str | None] = mapped_column(CITEXT, default=None)
    secret_ref: Mapped[str | None] = mapped_column(String, default=None)
    secret_metadata: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    params: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    
    def __repr__(self) -> str:
        return f"<CredProfile {self.name}:{self.auth_type}>"

    @classmethod
    def get_or_create(cls, name: str, **kwargs: Any) -> "CredentialProfiles":
        """Fetch or create a credential profile."""

        inst = cls.query.filter_by(name=name).first()
        if inst:
            return inst
        inst = CredentialProfiles(name=name, **kwargs)
        db.session.add(inst)
        db.session.commit()
        return inst


class InventoryGroups(DisableableMixin, UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel):
    """
    InventoryGroups
    ---------------
    DB-native grouping to mirror Nornir groups and (optionally) Ansible groups.

    Attributes
    ----------
    id : int
    name : str
        Unique name for the group.
    description : str | None
    nornir_data : dict
        Group-level Nornir host vars (non-secret).
    ansible_vars : dict
        Group-level Ansible vars (optional).
    is_active : bool
        Derived active flag (False when ``disabled_at`` is set).
    disabled_at : datetime | None
        Timestamp when the group was disabled.
    created_at : datetime
    updated_at : datetime

    Relationships
    -------------
    devices : list[Devices]
        Many-to-many via DeviceInventoryGroups.
    """

    __tablename__ = "inventory_groups"

    slug: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, default=None)
    nornir_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    ansible_vars: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    is_dynamic: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    definition: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    evaluation_scope: Mapped[str | None] = mapped_column(CITEXT, default=None)
    cached_device_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_evaluated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)

    def __repr__(self) -> str:
        return f"<InventoryGroup {self.slug}>"

    __table_args__ = (
        Index("ix_inventory_groups_dynamic", "is_dynamic", "disabled_at"),
    )

    def __init__(self, **kwargs: Any):
        name = kwargs.get("name")
        slug = kwargs.get("slug")
        if name and not slug:
            kwargs["slug"] = self._slugify(name)
        super().__init__(**kwargs)

    @staticmethod
    def _slugify(value: str) -> str:
        import re

        slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
        return slug or "group"

    @validates("name")
    def _on_name_change(self, key: str, value: str) -> str:
        if value and not self.slug:
            self.slug = self._slugify(value)
        return value


class DeviceInventoryGroups(TimestampMixin, BaseModel):
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

    device_id: Mapped[int] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True
    )
    group_id: Mapped[int] = mapped_column(
        ForeignKey("inventory_groups.id", ondelete="CASCADE"), primary_key=True
    )


__all__ = [
    "CredentialProfiles",
    "DeviceInventoryGroups",
    "DeviceTypes",
    "InventoryGroups",
    "Manufacturers",
    "Platforms",
    "ProductModels",
]
