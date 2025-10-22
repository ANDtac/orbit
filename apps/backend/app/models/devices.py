"""Device, interface, and configuration ORM models."""

from __future__ import annotations

import gzip
import hashlib
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped

from ..extensions import db
from .annotations import CITEXT, INET, JSONB, mapped_column, utcnow
from .base import BaseModel
from .mixins import IdPkMixin, TimestampMixin, UuidPkMixin
from .inventory import DeviceInventoryGroups, Platforms


class Devices(UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel):
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

    # Identity
    name: Mapped[str | None] = mapped_column(CITEXT, index=True, default=None)
    fqdn: Mapped[str | None] = mapped_column(CITEXT, index=True, default=None)
    device_type_id: Mapped[int | None] = mapped_column(
        ForeignKey("device_types.id", ondelete="SET NULL"), default=None
    )
    manufacturer_id: Mapped[int | None] = mapped_column(
        ForeignKey("manufacturers.id", ondelete="SET NULL"), default=None
    )
    product_model_id: Mapped[int | None] = mapped_column(
        ForeignKey("product_models.id", ondelete="SET NULL"), default=None
    )

    serial_number: Mapped[str | None] = mapped_column(CITEXT, index=True, default=None)
    asset_tag: Mapped[str | None] = mapped_column(CITEXT, default=None)
    is_virtual: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Software
    os_name: Mapped[str | None] = mapped_column(CITEXT, default=None)
    os_version: Mapped[str | None] = mapped_column(String, default=None)

    # Management (IPv4-only)
    mgmt_ipv4: Mapped[str | None] = mapped_column(INET, index=True, default=None)
    mgmt_port: Mapped[int | None] = mapped_column(Integer, default=22, nullable=False)

    # Freeform facts
    facts: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Lifecycle
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Automation links
    platform_id: Mapped[int | None] = mapped_column(
        ForeignKey("platforms.id", ondelete="SET NULL"), default=None
    )
    credential_profile_id: Mapped[int | None] = mapped_column(
        ForeignKey("credential_profiles.id", ondelete="SET NULL"), default=None
    )
    nornir_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    ansible_host: Mapped[str | None] = mapped_column(CITEXT, default=None)
    ansible_vars: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, default=None)

    # Relationships
    platform = db.relationship("Platforms")
    device_type = db.relationship("DeviceTypes")
    manufacturer = db.relationship("Manufacturers")
    product_model = db.relationship("ProductModels")
    interfaces = db.relationship("Interfaces", back_populates="device", cascade="all, delete-orphan")
    config_snapshots = db.relationship(
        "DeviceConfigSnapshots", back_populates="device", cascade="all, delete-orphan"
    )
    physical_info = db.relationship(
        "PhysicalDeviceInfos", back_populates="device", uselist=False, cascade="all, delete-orphan"
    )
    virtual_info = db.relationship(
        "VirtualInstanceInfos",
        back_populates="device",
        uselist=False,
        cascade="all, delete-orphan",
        foreign_keys="VirtualInstanceInfos.device_id",
    )
    groups = db.relationship(
        "InventoryGroups",
        secondary="device_inventory_groups",
        primaryjoin="Devices.id==DeviceInventoryGroups.device_id",
        secondaryjoin="InventoryGroups.id==DeviceInventoryGroups.group_id",
        viewonly=True,
    )
    tag_assignments = db.relationship(
        "DeviceTagAssignments",
        back_populates="device",
        cascade="all, delete-orphan",
    )
    tags = db.relationship(
        "DeviceTags",
        secondary="device_tag_assignments",
        back_populates="devices",
        order_by="DeviceTags.name",
        overlaps="tag_assignments,assignments",
    )
    health_snapshots = db.relationship(
        "DeviceHealthSnapshots",
        back_populates="device",
        cascade="all, delete-orphan",
        order_by="DeviceHealthSnapshots.observed_at.desc()",
    )

    __table_args__ = (
        CheckConstraint(
            "(mgmt_port IS NULL) OR (mgmt_port > 0 AND mgmt_port <= 65535)",
            name="chk_devices_mgmt_port",
        ),
    )

    def __repr__(self) -> str:
        return f"<Device {self.name or self.fqdn or self.id}>"

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
            raise ValueError("Device must be persisted before assigning inventory groups")
        db.session.query(DeviceInventoryGroups).filter_by(device_id=self.id).delete()
        if group_id is not None:
            db.session.add(DeviceInventoryGroups(device_id=self.id, group_id=group_id))

    def save(self) -> None:
        """Save this device."""

        db.session.add(self)
        db.session.commit()

    def upsert_facts(self, new_facts: dict) -> None:
        """Merge new facts into the existing facts JSON."""

        self.facts = {**(self.facts or {}), **(new_facts or {})}
        db.session.commit()

    def set_platform(self, slug: str) -> None:
        """Attach a platform by slug (create if missing)."""

        plat = Platforms.get_or_create_slug(slug)
        self.platform = plat
        db.session.commit()

    @classmethod
    def get_by_id(cls, id: int) -> "Devices | None":
        """Fetch by id."""

        return cls.query.get(id)

    @classmethod
    def get_by_name(cls, name: str) -> "Devices | None":
        """Fetch by name."""

        return cls.query.filter_by(name=name).first()

    @classmethod
    def get_by_mgmt_ip(cls, ipv4: str) -> "Devices | None":
        """Fetch by management IPv4."""

        return cls.query.filter_by(mgmt_ipv4=ipv4).first()


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

    device_id: Mapped[int] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True
    )
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

    device_id: Mapped[int] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"), primary_key=True
    )
    hypervisor: Mapped[str | None] = mapped_column(CITEXT)
    host_device_id: Mapped[int | None] = mapped_column(
        ForeignKey("devices.id", ondelete="SET NULL")
    )
    vm_uuid: Mapped[str | None] = mapped_column(String, index=True)

    device = db.relationship("Devices", foreign_keys=[device_id], back_populates="virtual_info")
    host_device = db.relationship("Devices", foreign_keys=[host_device_id])


class Interfaces(UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel):
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

    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String)
    mac_address: Mapped[str | None] = mapped_column(String, index=True)
    type: Mapped[str | None] = mapped_column(CITEXT)
    speed_mbps: Mapped[int | None] = mapped_column(Integer)
    is_up: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    mtu: Mapped[int | None] = mapped_column(Integer)
    facts: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    device = db.relationship("Devices", back_populates="interfaces")
    ip_assignments = db.relationship(
        "InterfaceIPAddresses", back_populates="interface", cascade="all, delete-orphan"
    )

    __table_args__ = (UniqueConstraint("device_id", "name", name="uq_interface_per_device"),)

    def __repr__(self) -> str:
        return f"<Interface {self.device_id}:{self.name}>"

    @classmethod
    def get_by_device_and_name(cls, device_id: int, name: str) -> "Interfaces | None":
        """Fetch an interface by device and name."""

        return cls.query.filter_by(device_id=device_id, name=name).first()


class IPAddresses(UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel):
    """
    IPAddresses (IPv4 only)
    -----------------------
    Canonical IPv4 addresses with optional direct device/interface assignment.

    Attributes
    ----------
    id : int
    device_id : int | None
    interface_id : int | None
    address : str
    prefix_length : int
    is_primary : bool
    role : str | None
    vrf : str | None
    notes : str | None
    meta : dict
    created_at : datetime
    updated_at : datetime

    Methods
    -------
    get_or_create(ipv4: str) -> IPAddresses
    """

    __tablename__ = "ip_addresses"

    device_id: Mapped[int | None] = mapped_column(ForeignKey("devices.id", ondelete="SET NULL"), index=True)
    interface_id: Mapped[int | None] = mapped_column(
        ForeignKey("interfaces.id", ondelete="SET NULL"), index=True
    )
    address: Mapped[str] = mapped_column(INET, unique=True, nullable=False)
    prefix_length: Mapped[int] = mapped_column(Integer, nullable=False, default=32)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    role: Mapped[str | None] = mapped_column(CITEXT)
    vrf: Mapped[str | None] = mapped_column(CITEXT)
    notes: Mapped[str | None] = mapped_column(Text)
    meta: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    device = db.relationship("Devices")
    interface = db.relationship("Interfaces")

    def __repr__(self) -> str:
        return f"<IP {self.address}/{self.prefix_length}>"

    @classmethod
    def get_or_create(cls, ipv4: str) -> "IPAddresses":
        """Fetch or create an IPv4 address row."""

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

    interface_id: Mapped[int] = mapped_column(
        ForeignKey("interfaces.id", ondelete="CASCADE"), primary_key=True
    )
    ip_address_id: Mapped[int] = mapped_column(
        ForeignKey("ip_addresses.id", ondelete="CASCADE"), primary_key=True
    )
    primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    assigned_from: Mapped[datetime | None] = mapped_column(DateTime)
    assigned_to: Mapped[datetime | None] = mapped_column(DateTime)

    interface = db.relationship("Interfaces", back_populates="ip_assignments")
    ip_address = db.relationship("IPAddresses")


class DeviceConfigSnapshots(UuidPkMixin, TimestampMixin, BaseModel):
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
    create_if_changed(...)
    """

    __tablename__ = "device_config_snapshots"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"), index=True)
    job_id: Mapped[int | None] = mapped_column(
        ForeignKey("jobs.id", ondelete="SET NULL"), index=True, default=None
    )
    captured_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True, default=None
    )
    captured_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, index=True, nullable=False
    )
    source: Mapped[str | None] = mapped_column(CITEXT)

    content_sha256: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    storage_inline: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    content_inline_text: Mapped[str | None] = mapped_column(Text)
    content_inline_bytes: Mapped[bytes | None] = mapped_column(LargeBinary)
    object_url: Mapped[str | None] = mapped_column(String)

    content_mime: Mapped[str] = mapped_column(String, default="text/plain", nullable=False)
    content_encoding: Mapped[str | None] = mapped_column(String)
    vendor_hint: Mapped[str | None] = mapped_column(CITEXT)
    config_role: Mapped[str | None] = mapped_column(CITEXT)

    parsed_facts: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    device = db.relationship("Devices", back_populates="config_snapshots")
    job = db.relationship("Jobs")
    captured_by = db.relationship("Users")

    __table_args__ = (
        UniqueConstraint("device_id", "content_sha256", name="uq_config_dedup"),
        Index("ix_config_device_time", "device_id", "captured_at"),
        Index("ix_config_job", "job_id", "captured_at"),
    )

    def __repr__(self) -> str:
        return f"<ConfigSnapshot d={self.device_id} at={self.captured_at.isoformat()}>"

    @property
    def config_text(self) -> str | None:
        return self.content_inline_text

    @config_text.setter
    def config_text(self, value: str | None) -> None:
        if value is None:
            self.content_inline_text = None
            self.content_inline_bytes = None
            self.storage_inline = True
            self.size_bytes = 0
            self.content_sha256 = hashlib.sha256(b"").hexdigest()
            return
        self.content_inline_text = value
        encoded = value.encode("utf-8")
        self.content_inline_bytes = None
        self.storage_inline = True
        self.size_bytes = len(encoded)
        self.content_sha256 = hashlib.sha256(encoded).hexdigest()

    @property
    def config_hash(self) -> str:
        return self.content_sha256

    @config_hash.setter
    def config_hash(self, value: str) -> None:
        if value:
            self.content_sha256 = value

    @property
    def config_format(self) -> str:
        return self.content_mime

    @config_format.setter
    def config_format(self, value: str) -> None:
        if value:
            self.content_mime = value

    @property
    def parsed_metadata(self) -> dict:
        """Return parsed configuration metadata (alias for parsed_facts)."""

        return self.parsed_facts

    @parsed_metadata.setter
    def parsed_metadata(self, value: dict | None) -> None:
        self.parsed_facts = value or {}

    @classmethod
    def latest_for_device(cls, device_id: int) -> "DeviceConfigSnapshots | None":
        """Fetch the most recent snapshot for a device."""

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
        """Create a new snapshot only if the content hash is new."""

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
            captured_at=utcnow(),
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
    from_snapshot_id: Mapped[int] = mapped_column(
        ForeignKey("device_config_snapshots.id", ondelete="CASCADE")
    )
    to_snapshot_id: Mapped[int] = mapped_column(
        ForeignKey("device_config_snapshots.id", ondelete="CASCADE")
    )
    diff_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    device = db.relationship("Devices")
    from_snapshot = db.relationship("DeviceConfigSnapshots", foreign_keys=[from_snapshot_id])
    to_snapshot = db.relationship("DeviceConfigSnapshots", foreign_keys=[to_snapshot_id])

    def __repr__(self) -> str:
        return (
            f"<ConfigDiff d={self.device_id} from={self.from_snapshot_id} to={self.to_snapshot_id}>"
        )


class DeviceTags(UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel):
    """User-managed labels that can be attached to devices."""

    __tablename__ = "device_tags"

    slug: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    color: Mapped[str | None] = mapped_column(String(16))
    attributes: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    is_protected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    assignments = db.relationship(
        "DeviceTagAssignments",
        back_populates="tag",
        cascade="all, delete-orphan",
    )
    devices = db.relationship(
        "Devices",
        secondary="device_tag_assignments",
        back_populates="tags",
        overlaps="assignments,tag_assignments",
    )

    __table_args__ = (
        Index("ix_device_tags_slug", "slug"),
    )

    def __repr__(self) -> str:
        return f"<DeviceTag {self.slug}>"


class DeviceTagAssignments(UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel):
    """Association table storing device tag application history."""

    __tablename__ = "device_tag_assignments"

    device_id: Mapped[int] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"), index=True, nullable=False
    )
    tag_id: Mapped[int] = mapped_column(
        ForeignKey("device_tags.id", ondelete="CASCADE"), index=True, nullable=False
    )
    job_id: Mapped[int | None] = mapped_column(
        ForeignKey("jobs.id", ondelete="SET NULL"), index=True, default=None
    )
    applied_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True, default=None
    )
    source: Mapped[str | None] = mapped_column(CITEXT)
    notes: Mapped[str | None] = mapped_column(Text)
    attributes: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    device = db.relationship("Devices", back_populates="tag_assignments", overlaps="tags,devices")
    tag = db.relationship("DeviceTags", back_populates="assignments", overlaps="devices,tags")
    job = db.relationship("Jobs")
    applied_by = db.relationship("Users")

    __table_args__ = (
        UniqueConstraint("device_id", "tag_id", name="uq_device_tag"),
    )


class DeviceHealthSnapshots(UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel):
    """Aggregated health status derived from probe executions and telemetry."""

    __tablename__ = "device_health_snapshots"

    device_id: Mapped[int] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"), index=True, nullable=False
    )
    observed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True, nullable=False
    )
    status: Mapped[str] = mapped_column(CITEXT, default="unknown", index=True, nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)
    metrics: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    checks: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    latency_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    availability_percent: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    job_id: Mapped[int | None] = mapped_column(
        ForeignKey("jobs.id", ondelete="SET NULL"), index=True, default=None
    )
    job_task_id: Mapped[int | None] = mapped_column(
        ForeignKey("job_tasks.id", ondelete="SET NULL"), index=True, default=None
    )

    device = db.relationship("Devices", back_populates="health_snapshots")
    job = db.relationship("Jobs")
    job_task = db.relationship("JobTasks")

    __table_args__ = (
        Index("ix_device_health_latest", "device_id", "observed_at"),
    )


class DeviceProbeTemplates(UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel):
    """Reusable probe definitions for health checks and diagnostics."""

    __tablename__ = "device_probe_templates"

    slug: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    probe_type: Mapped[str] = mapped_column(CITEXT, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    expected_outcome: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    executions = db.relationship("DeviceProbeExecutions", back_populates="template")


class DeviceProbeExecutions(UuidPkMixin, IdPkMixin, TimestampMixin, BaseModel):
    """Individual probe runs initiated by asynchronous jobs."""

    __tablename__ = "device_probe_executions"

    device_id: Mapped[int] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"), index=True, nullable=False
    )
    job_id: Mapped[int | None] = mapped_column(
        ForeignKey("jobs.id", ondelete="SET NULL"), index=True, default=None
    )
    job_task_id: Mapped[int | None] = mapped_column(
        ForeignKey("job_tasks.id", ondelete="SET NULL"), index=True, default=None
    )
    template_id: Mapped[int | None] = mapped_column(
        ForeignKey("device_probe_templates.id", ondelete="SET NULL"), index=True, default=None
    )

    probe_type: Mapped[str] = mapped_column(CITEXT, nullable=False)
    status: Mapped[str] = mapped_column(CITEXT, default="pending", index=True, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    latency_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    is_success: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    response: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    diagnostics: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    error: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    device = db.relationship("Devices")
    job = db.relationship("Jobs")
    job_task = db.relationship("JobTasks")
    template = db.relationship("DeviceProbeTemplates", back_populates="executions")

    __table_args__ = (
        Index("ix_probe_status", "status", "probe_type"),
        Index("ix_probe_job", "job_id", "job_task_id"),
    )


__all__ = [
    "DeviceConfigDiffs",
    "DeviceConfigSnapshots",
    "Devices",
    "IPAddresses",
    "InterfaceIPAddresses",
    "Interfaces",
    "PhysicalDeviceInfos",
    "DeviceHealthSnapshots",
    "DeviceProbeExecutions",
    "DeviceProbeTemplates",
    "DeviceTagAssignments",
    "DeviceTags",
    "VirtualInstanceInfos",
]
