"""Shared namespace, schemas, and helpers for device-related resources."""

from __future__ import annotations

from typing import Any

from flask import request
from flask_jwt_extended import get_jwt_identity
from flask_restx import Namespace, fields
from flask_restx._http import HTTPStatus
from sqlalchemy import inspect

from app.extensions import db
from app.models import (
    DeviceConfigSnapshots,
    DeviceHealthSnapshots,
    DeviceInventoryGroups,
    DeviceTags,
    Devices,
    Jobs,
)
from app.services import jobs as jobs_service
from ..utils import get_filter_args, interpret_bool

ns = Namespace("devices", description="Devices inventory")

mapper = inspect(Devices)
DEVICE_COLUMN_KEYS = {column.key for column in mapper.columns} if mapper is not None else set()


DeviceBase = ns.model(
    "DeviceBase",
    {
        "name": fields.String(required=True, description="Human-friendly device name"),
        "fqdn": fields.String(required=False, description="Fully-qualified domain name"),
        "mgmt_ipv4": fields.String(required=False, description="Management IPv4 address"),
        "mgmt_port": fields.Integer(required=False, description="Management TCP port (default 22)"),
        "platform_id": fields.Integer(required=False, description="Foreign key to Platforms.id"),
        "product_model_id": fields.Integer(required=False, description="Foreign key to ProductModels.id"),
        "inventory_group_id": fields.Integer(required=False, description="Foreign key to InventoryGroups.id"),
        "credential_profile_id": fields.Integer(required=False, description="Foreign key to CredentialProfiles.id"),
        "serial_number": fields.String(required=False, description="Hardware serial number (if any)"),
        "model_number": fields.String(required=False, description="Hardware model number (if any)"),
        "os_name": fields.String(required=False, description="OS family key (e.g., 'iosxe','nxos','junos')"),
        "os_version": fields.String(required=False, description="OS version string"),
        "facts": fields.Raw(required=False, description="Raw structured facts (JSON)"),
        "nornir_data": fields.Raw(required=False, description="Per-host Nornir extras (JSON)"),
        "ansible_host": fields.String(required=False, description="Optional Ansible host override"),
        "ansible_vars": fields.Raw(required=False, description="Arbitrary Ansible variables (JSON)"),
        "notes": fields.String(required=False, description="Freeform notes"),
        "is_active": fields.Boolean(required=False, description="Whether the device is active in inventory"),
    },
)

DeviceCreate = ns.clone("DeviceCreate", DeviceBase, {})
DeviceUpdate = ns.clone("DeviceUpdate", DeviceBase, {})

DeviceOut = ns.model(
    "DeviceOut",
    {
        "id": fields.Integer(required=True),
        "name": fields.String(required=True),
        "fqdn": fields.String,
        "mgmt_ipv4": fields.String,
        "mgmt_port": fields.Integer,
        "platform_id": fields.Integer,
        "product_model_id": fields.Integer,
        "inventory_group_id": fields.Integer,
        "credential_profile_id": fields.Integer,
        "serial_number": fields.String,
        "model_number": fields.String,
        "os_name": fields.String,
        "os_version": fields.String,
        "facts": fields.Raw,
        "nornir_data": fields.Raw,
        "ansible_host": fields.String,
        "ansible_vars": fields.Raw,
        "notes": fields.String,
        "is_active": fields.Boolean,
        "created_at": fields.DateTime,
        "updated_at": fields.DateTime,
    },
)

CursorPage = ns.model(
    "CursorPage",
    {
        "cursor": fields.String(required=True, description="Opaque cursor token for the current position."),
        "size": fields.Integer(required=True, description="Number of records requested per page."),
        "next": fields.String(required=False, description="Cursor token for the next page, if available."),
        "prev": fields.String(required=False, description="Cursor token for the previous page, if available."),
        "total": fields.Integer(required=True, description="Total number of records that match the filters."),
    },
)

DeviceCollection = ns.model(
    "DeviceCollection",
    {
        "data": fields.List(fields.Nested(DeviceOut), required=True),
        "page": fields.Nested(CursorPage, required=True),
    },
)

TagOut = ns.model(
    "DeviceTagOut",
    {
        "id": fields.Integer(required=True),
        "slug": fields.String(required=True),
        "name": fields.String(required=True),
        "description": fields.String,
        "color": fields.String,
        "attributes": fields.Raw,
    },
)

TagAssignmentOut = ns.model(
    "DeviceTagAssignmentOut",
    {
        "device_id": fields.Integer(required=True),
        "tags": fields.List(fields.Nested(TagOut), required=True),
    },
)

TagAssignIn = ns.model(
    "DeviceTagAssignIn",
    {"tags": fields.List(fields.String, required=True)},
)

ConfigSnapshotOut = ns.model(
    "DeviceConfigSnapshotOut",
    {
        "id": fields.Integer(required=True),
        "device_id": fields.Integer(required=True),
        "captured_at": fields.DateTime(required=True),
        "hash": fields.String(attribute="content_sha256"),
        "size_bytes": fields.Integer,
        "content_mime": fields.String,
        "storage_inline": fields.Boolean,
        "object_url": fields.String,
        "config_role": fields.String,
        "source": fields.String,
        "job_id": fields.Integer,
    },
)

ConfigSnapshotCollection = ns.model(
    "DeviceConfigSnapshotCollection",
    {
        "data": fields.List(fields.Nested(ConfigSnapshotOut), required=True),
        "page": fields.Nested(CursorPage, required=True),
    },
)

ConfigBackupIn = ns.model("DeviceConfigBackupIn", {"reason": fields.String(required=False)})

HealthBreakdown = ns.model(
    "DeviceHealthBreakdown",
    {
        "scope": fields.String(required=True, description="Grouping scope name (platform/group)"),
        "identifier": fields.String(description="Identifier for the grouping (slug or id)"),
        "name": fields.String(description="Human-friendly grouping name"),
        "total": fields.Integer(required=True),
        "statuses": fields.Raw(required=True, description="Status counts for the grouping"),
    },
)

HealthSummaryOut = ns.model(
    "DeviceHealthSummaryOut",
    {
        "generated_at": fields.DateTime(required=True),
        "overall": fields.Raw(required=True, description="Overall status counts"),
        "by_platform": fields.List(fields.Nested(HealthBreakdown), required=True),
        "by_group": fields.List(fields.Nested(HealthBreakdown), required=True),
    },
)

HealthDetailOut = ns.model(
    "DeviceHealthDetailOut",
    {
        "device_id": fields.Integer(required=True),
        "status": fields.String(required=True),
        "summary": fields.String,
        "observed_at": fields.DateTime(required=True),
        "latency_ms": fields.Float,
        "availability_percent": fields.Float,
        "metrics": fields.Raw,
        "checks": fields.Raw,
        "job_id": fields.Integer,
        "job_task_id": fields.Integer,
    },
)

JobReferenceOut = ns.model(
    "DeviceJobReferenceOut",
    {
        "job": fields.Raw(required=True, description="Serialized job object"),
        "enqueued": fields.Boolean(description="True when a new job was created"),
    },
)

BulkUpdateIn = ns.model(
    "DeviceBulkUpdateIn",
    {
        "device_ids": fields.List(fields.Integer, required=False),
        "filters": fields.Raw(required=False, description="Filter mapping to select devices"),
        "updates": fields.Raw(required=True, description="Patch payload applied by the job"),
    },
)

DiscoveryIn = ns.model(
    "DeviceDiscoveryIn",
    {
        "seeds": fields.List(fields.String, required=True, description="CIDR blocks or host ranges"),
        "credentials": fields.Raw(required=False),
    },
)

ProbeIn = ns.model(
    "DeviceProbeIn",
    {
        "device_ids": fields.List(fields.Integer, required=True),
        "probe_type": fields.String(required=False),
        "template_id": fields.Integer(required=False),
        "variables": fields.Raw(required=False),
    },
)


def _current_user_id() -> int | None:
    identity = get_jwt_identity()
    if identity is None:
        return None
    try:
        return int(identity)
    except (TypeError, ValueError):  # pragma: no cover
        return None


def _slugify(value: str) -> str:
    import re

    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "tag"


def _get_device_or_404(device_id: int) -> Devices:
    device = db.session.get(Devices, device_id)
    if not device:
        raise ValueError("device-not-found")
    return device


def _serialize_tag(tag: DeviceTags) -> dict[str, Any]:
    return {
        "id": tag.id,
        "slug": tag.slug,
        "name": tag.name,
        "description": tag.description,
        "color": tag.color,
        "attributes": tag.attributes or {},
    }


def _serialize_config_snapshot(snapshot: DeviceConfigSnapshots) -> dict[str, Any]:
    return {
        "id": snapshot.id,
        "device_id": snapshot.device_id,
        "captured_at": snapshot.captured_at,
        "hash": snapshot.content_sha256,
        "size_bytes": snapshot.size_bytes,
        "content_mime": snapshot.content_mime,
        "storage_inline": snapshot.storage_inline,
        "object_url": snapshot.object_url,
        "config_role": snapshot.config_role,
        "source": snapshot.source,
        "job_id": snapshot.job_id,
    }


def _serialize_health_snapshot(snapshot: DeviceHealthSnapshots) -> dict[str, Any]:
    return {
        "device_id": snapshot.device_id,
        "status": snapshot.status,
        "summary": snapshot.summary,
        "observed_at": snapshot.observed_at,
        "latency_ms": snapshot.latency_ms,
        "availability_percent": snapshot.availability_percent,
        "metrics": snapshot.metrics or {},
        "checks": snapshot.checks or {},
        "job_id": snapshot.job_id,
        "job_task_id": snapshot.job_task_id,
    }


def _job_response(job: Jobs, created: bool):
    payload = {"job": jobs_service.serialize_job(job), "enqueued": bool(created)}
    headers = {"Location": jobs_service.job_location(job)}
    return payload, HTTPStatus.ACCEPTED, headers


def _apply_device_filters(query):
    filters = get_filter_args(
        {
            "name",
            "platform_id",
            "mgmt_ipv4",
            "os_name",
            "os_version",
            "inventory_group_id",
            "is_active",
        },
        legacy={
            "name": "name",
            "platform_id": "platform_id",
            "mgmt_ipv4": "mgmt_ipv4",
            "os_name": "os_name",
            "os_version": "os_version",
            "inventory_group_id": "inventory_group_id",
            "is_active": "is_active",
        },
    )

    name = filters.get("name")
    if name:
        query = query.filter(Devices.name.ilike(f"%{name}%"))

    platform_id_raw = filters.get("platform_id")
    if platform_id_raw is not None:
        try:
            platform_id = int(platform_id_raw)
        except (TypeError, ValueError):
            platform_id = None
        if platform_id is not None:
            query = query.filter(Devices.platform_id == platform_id)

    mgmt_ipv4 = filters.get("mgmt_ipv4")
    if mgmt_ipv4:
        query = query.filter(Devices.mgmt_ipv4.cast(db.String).ilike(f"%{mgmt_ipv4}%"))

    os_name = filters.get("os_name")
    if os_name:
        query = query.filter(Devices.os_name.ilike(os_name))

    os_version = filters.get("os_version")
    if os_version:
        query = query.filter(Devices.os_version.ilike(f"%{os_version}%"))

    inventory_group_raw = filters.get("inventory_group_id")
    if inventory_group_raw is not None:
        try:
            inventory_group_id = int(inventory_group_raw)
        except (TypeError, ValueError):
            inventory_group_id = None
        if inventory_group_id is not None:
            if hasattr(Devices, "inventory_group_id"):
                query = query.filter(getattr(Devices, "inventory_group_id") == inventory_group_id)
            else:
                query = query.join(
                    DeviceInventoryGroups,
                    DeviceInventoryGroups.device_id == Devices.id,
                ).filter(DeviceInventoryGroups.group_id == inventory_group_id)

    is_active_raw = filters.get("is_active")
    active_col = getattr(Devices, "is_active", getattr(Devices, "active", None))
    if is_active_raw is not None and active_col is not None:
        parsed = interpret_bool(is_active_raw, None)
        if parsed is True:
            query = query.filter(active_col.is_(True))
        elif parsed is False:
            query = query.filter(active_col.is_(False))

    return query


def _prepare_device_payload(force: bool = True) -> tuple[dict[str, object], int | None]:
    raw = request.get_json(force=force) or {}
    inventory_group_id = raw.pop("inventory_group_id", None)
    payload: dict[str, object] = {}

    for key, value in raw.items():
        if key == "is_active":
            payload["is_active"] = value
            continue
        if key in DEVICE_COLUMN_KEYS:
            payload[key] = value

    return payload, inventory_group_id


def _set_device_inventory_group(device_id: int, group_id: int | None, *, commit: bool = True) -> None:
    db.session.query(DeviceInventoryGroups).filter_by(device_id=device_id).delete()
    if group_id is not None:
        db.session.add(DeviceInventoryGroups(device_id=device_id, group_id=group_id))
    if commit:
        db.session.commit()
