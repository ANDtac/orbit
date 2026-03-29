"""
app/api/resources/devices.py
----------------------------
Devices resource endpoints (CRUD + list with filters).

Responsibilities
----------------
- Expose `/devices` collection with pagination, sorting, and common filters.
- Expose `/devices/<id>` item for read/update/delete.
- Validate inputs at the API boundary (basic type/shape checks).
- Marshal outputs to stable Swagger/OpenAPI schemas.

Endpoints
---------
GET    /devices
POST   /devices
GET    /devices/<int:id>
PATCH  /devices/<int:id>
DELETE /devices/<int:id>

Query Parameters (GET /devices)
-------------------------------
page[size] : int
    Number of records to return (cursor pagination). Defaults to 50.
page[cursor] : str
    Base64 cursor token pointing to the next slice of records.
sort : str
    Comma-separated fields; prefix with '-' for DESC. Example: `-id,name`.
filter[name] : str
filter[platform_id] : int
filter[mgmt_ipv4] : str
filter[os_name] : str
filter[os_version] : str
filter[inventory_group_id] : int
filter[is_active] : bool-like

Security
--------
All endpoints require a valid JWT (see /api/v1/auth/login).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from flask import jsonify, request
from flask_restx import Namespace, Resource, fields
from flask_restx._http import HTTPStatus
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import func, inspect

from app.extensions import db
from app.models import (
    DeviceConfigSnapshots,
    DeviceHealthSnapshots,
    DeviceInventoryGroups,
    DeviceProbeExecutions,
    DeviceProbeTemplates,
    DeviceTagAssignments,
    DeviceTags,
    Devices,
    InventoryGroups,
    Jobs,
    Platforms,
)
from app.services import jobs as jobs_service
from app.services.jobs import JobTaskSpec
from ..utils import (
    apply_sorting,
    cursor_paginate,
    get_cursor_pagination,
    get_filter_args,
    interpret_bool,
    problem_response,
    require_roles,
)

# ---------------------------------------------------------------------------
# Namespace
# ---------------------------------------------------------------------------
ns = Namespace("devices", description="Devices inventory")


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

mapper = inspect(Devices)

if mapper is not None:
    DEVICE_COLUMN_KEYS = {column.key for column in mapper.columns}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _current_user_id() -> int | None:
    identity = get_jwt_identity()
    if identity is None:
        return None
    try:
        return int(identity)
    except (TypeError, ValueError):  # pragma: no cover - defensive guard
        return None


def _slugify(value: str) -> str:
    import re

    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "tag"


def _get_device_or_404(device_id: int) -> Devices:
    device = Devices.query.get(device_id)
    if not device:
        raise ValueError("device-not-found")
    return device


# ---------------------------------------------------------------------------
# Swagger Models (I/O)
# ---------------------------------------------------------------------------
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
DeviceUpdate = ns.clone("DeviceUpdate", DeviceBase, {})  # all fields optional on PATCH

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
        "cursor": fields.String(
            required=True,
            description="Opaque cursor token for the current position.",
        ),
        "size": fields.Integer(
            required=True,
            description="Number of records requested per page.",
        ),
        "next": fields.String(
            required=False,
            description="Cursor token for the next page, if available.",
        ),
        "prev": fields.String(
            required=False,
            description="Cursor token for the previous page, if available.",
        ),
        "total": fields.Integer(
            required=True,
            description="Total number of records that match the filters.",
        ),
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


def _serialize_tag(tag: DeviceTags) -> dict:
    return {
        "id": tag.id,
        "slug": tag.slug,
        "name": tag.name,
        "description": tag.description,
        "color": tag.color,
        "attributes": tag.attributes or {},
    }


def _serialize_config_snapshot(snapshot: DeviceConfigSnapshots) -> dict:
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


def _serialize_health_snapshot(snapshot: DeviceHealthSnapshots) -> dict:
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
    payload = {
        "job": jobs_service.serialize_job(job),
        "enqueued": bool(created),
    }
    headers = {"Location": jobs_service.job_location(job)}
    return payload, HTTPStatus.ACCEPTED, headers


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _apply_device_filters(q):
    """
    Apply URL query filters to a base Device query.

    Parameters
    ----------
    q : sqlalchemy.orm.Query
        Base query.

    Returns
    -------
    sqlalchemy.orm.Query
        Filtered query.
    """
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
        q = q.filter(Devices.name.ilike(f"%{name}%"))

    platform_id_raw = filters.get("platform_id")
    if platform_id_raw is not None:
        try:
            platform_id = int(platform_id_raw)
        except (TypeError, ValueError):
            platform_id = None
        if platform_id is not None:
            q = q.filter(Devices.platform_id == platform_id)

    mgmt_ipv4 = filters.get("mgmt_ipv4")
    if mgmt_ipv4:
        q = q.filter(Devices.mgmt_ipv4.cast(db.String).ilike(f"%{mgmt_ipv4}%"))

    os_name = filters.get("os_name")
    if os_name:
        q = q.filter(Devices.os_name.ilike(os_name))

    os_version = filters.get("os_version")
    if os_version:
        q = q.filter(Devices.os_version.ilike(f"%{os_version}%"))

    inventory_group_raw = filters.get("inventory_group_id")
    if inventory_group_raw is not None:
        try:
            inventory_group_id = int(inventory_group_raw)
        except (TypeError, ValueError):
            inventory_group_id = None
        if inventory_group_id is not None:
            if hasattr(Devices, "inventory_group_id"):
                q = q.filter(getattr(Devices, "inventory_group_id") == inventory_group_id)
            else:
                q = q.join(
                    DeviceInventoryGroups,
                    DeviceInventoryGroups.device_id == Devices.id,
                ).filter(DeviceInventoryGroups.group_id == inventory_group_id)

    is_active_raw = filters.get("is_active")
    active_col = getattr(Devices, "is_active", getattr(Devices, "active", None))
    if is_active_raw is not None and active_col is not None:
        parsed = interpret_bool(is_active_raw, None)
        if parsed is True:
            q = q.filter(active_col.is_(True))
        elif parsed is False:
            q = q.filter(active_col.is_(False))

    return q


# ---------------------------------------------------------------------------
# Payload helpers
# ---------------------------------------------------------------------------
def _prepare_device_payload(force: bool = True) -> tuple[dict, int | None]:
    """Normalize incoming JSON payload for device mutations."""

    raw = request.get_json(force=force) or {}
    inventory_group_id = raw.pop("inventory_group_id", None)
    payload: dict[str, object] = {}

    for key, value in raw.items():
        if key == "is_active":
            payload["active"] = value
            continue
        if key in DEVICE_COLUMN_KEYS:
            payload[key] = value

    return payload, inventory_group_id


def _set_device_inventory_group(device_id: int, group_id: int | None) -> None:
    """Persist a single inventory group association for a device."""

    db.session.query(DeviceInventoryGroups).filter_by(device_id=device_id).delete()
    if group_id is not None:
        link = DeviceInventoryGroups(device_id=device_id, group_id=group_id)
        db.session.add(link)
    db.session.commit()


# ---------------------------------------------------------------------------
# Resources
# ---------------------------------------------------------------------------
@ns.route("")
class DeviceList(Resource):
    """
    Resource: /devices
    ------------------
    List devices (with filters, pagination, sorting) and create new devices.
    """

    @jwt_required()
    @ns.marshal_with(DeviceCollection, code=HTTPStatus.OK)
    def get(self):
        """
        List devices.

        Query Parameters
        ----------------
        page[size] : int
            Number of records to return (cursor pagination). Defaults to 50.
        page[cursor] : str
            Base64 cursor token pointing to the next slice of records.
        sort : str
            Comma-separated fields; prefix with '-' for DESC. Example: `-id,name`.
        filter[name] : str
        filter[platform_id] : int
        filter[mgmt_ipv4] : str
        filter[os_name] : str
        filter[os_version] : str
        filter[inventory_group_id] : int
        filter[is_active] : bool-like

        Returns
        -------
        dict
        """
        q = Devices.query
        q = _apply_device_filters(q)
        q = apply_sorting(
            q,
            Devices,
            default="-id",
            allowed={
                "id",
                "name",
                "mgmt_ipv4",
                "platform_id",
                "os_name",
                "os_version",
                "created_at",
                "updated_at",
            },
        )
        cursor, size = get_cursor_pagination()
        payload = cursor_paginate(q, cursor=cursor, size=size)
        return payload, HTTPStatus.OK

    @jwt_required()
    @ns.expect(DeviceCreate, validate=True)
    @ns.marshal_with(DeviceOut, code=HTTPStatus.CREATED)
    def post(self):
        """
        Create a device.

        Body
        ----
        DeviceCreate

        Returns
        -------
        DeviceOut
        """
        payload, inventory_group_id = _prepare_device_payload(force=True)
        dev = Devices(**payload)
        db.session.add(dev)
        db.session.commit()

        if inventory_group_id is not None and dev.id is not None:
            _set_device_inventory_group(dev.id, inventory_group_id)

        return dev, HTTPStatus.CREATED


@ns.route("/<int:id>")
class DeviceItem(Resource):
    """
    Resource: /devices/<id>
    -----------------------
    Retrieve, update, or delete a specific device.
    """

    @jwt_required()
    @ns.marshal_with(DeviceOut, code=HTTPStatus.OK)
    def get(self, id: int):
        """
        Retrieve a device by ID.

        Parameters
        ----------
        id : int
            Device primary key.

        Returns
        -------
        DeviceOut
        """
        return Devices.query.get_or_404(id), HTTPStatus.OK

    @jwt_required()
    @ns.expect(DeviceUpdate, validate=False)
    @ns.marshal_with(DeviceOut, code=HTTPStatus.OK)
    def patch(self, id: int):
        """
        Partially update a device.

        Parameters
        ----------
        id : int
            Device primary key.

        Body
        ----
        DeviceUpdate

        Returns
        -------
        DeviceOut
        """
        dev = Devices.query.get_or_404(id)
        payload, inventory_group_id = _prepare_device_payload(force=True)
        for key, value in payload.items():
            if hasattr(dev, key):
                setattr(dev, key, value)
        db.session.commit()

        if inventory_group_id is not None:
            _set_device_inventory_group(dev.id, inventory_group_id)

        return dev, HTTPStatus.OK

    @jwt_required()
    def delete(self, id: int):
        """
        Delete a device.

        Parameters
        ----------
        id : int
            Device primary key.

        Returns
        -------
        dict
            Confirmation message.
        """
        dev = Devices.query.get_or_404(id)
        db.session.delete(dev)
        db.session.commit()
        return {"message": "deleted"}, HTTPStatus.OK


@ns.route("/<int:device_id>/tags")
class DeviceTagCollection(Resource):
    """Attach tags to a device."""

    @jwt_required()
    @require_roles("network_admin")
    @ns.expect(ns.model("DeviceTagAssignIn", {"tags": fields.List(fields.String, required=True)}))
    @ns.marshal_with(TagAssignmentOut, code=HTTPStatus.OK)
    def post(self, device_id: int):
        payload = request.get_json(silent=True) or {}
        tags = payload.get("tags")
        if not isinstance(tags, list) or not tags:
            return problem_response(HTTPStatus.BAD_REQUEST, detail="Provide a non-empty list of tags")

        try:
            device = _get_device_or_404(device_id)
        except ValueError:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Device not found")

        actor_id = _current_user_id()
        normalized: list[DeviceTags] = []

        for raw in tags:
            if not isinstance(raw, str) or not raw.strip():
                continue
            slug = _slugify(raw)
            tag = (
                DeviceTags.query.filter(func.lower(DeviceTags.slug) == slug.lower()).one_or_none()
            )
            if not tag:
                tag = DeviceTags(slug=slug, name=raw.strip())
                db.session.add(tag)
                db.session.flush()

            assignment = DeviceTagAssignments.query.filter_by(
                device_id=device.id, tag_id=tag.id
            ).one_or_none()

            if assignment:
                normalized.append(tag)
                continue

            db.session.add(
                DeviceTagAssignments(
                    device_id=device.id,
                    tag_id=tag.id,
                    applied_by_id=actor_id,
                    source="api",
                )
            )
            normalized.append(tag)

        db.session.commit()

        return {"device_id": device.id, "tags": [_serialize_tag(tag) for tag in normalized]}


@ns.route("/<int:device_id>/tags/<string:tag_slug>")
class DeviceTagItem(Resource):
    """Remove a tag assignment from a device."""

    @jwt_required()
    @require_roles("network_admin")
    def delete(self, device_id: int, tag_slug: str):
        try:
            device = _get_device_or_404(device_id)
        except ValueError:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Device not found")

        tag = (
            DeviceTags.query.filter(func.lower(DeviceTags.slug) == tag_slug.lower()).one_or_none()
        )
        if not tag:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Tag not found")
        if tag.is_protected:
            return problem_response(HTTPStatus.CONFLICT, detail="Protected tags cannot be removed")

        assignment = DeviceTagAssignments.query.filter_by(
            device_id=device.id, tag_id=tag.id
        ).one_or_none()
        if not assignment:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Tag not assigned to device")

        db.session.delete(assignment)
        db.session.commit()
        return "", HTTPStatus.NO_CONTENT


@ns.route("/<int:device_id>/configs")
class DeviceConfigCollection(Resource):
    """List configuration snapshots for a device."""

    @jwt_required()
    @ns.marshal_with(ConfigSnapshotCollection, code=HTTPStatus.OK)
    def get(self, device_id: int):
        try:
            _get_device_or_404(device_id)
        except ValueError:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Device not found")

        cursor, size = get_cursor_pagination(default_size=20)
        query = (
            DeviceConfigSnapshots.query.filter_by(device_id=device_id)
            .order_by(DeviceConfigSnapshots.captured_at.desc())
        )
        payload = cursor_paginate(query, cursor=cursor, size=size)
        return {
            "data": [_serialize_config_snapshot(s) for s in payload["data"]],
            "page": payload["page"],
        }


@ns.route("/<int:device_id>/config:backup")
class DeviceConfigBackup(Resource):
    """Request a configuration backup for a specific device."""

    @jwt_required()
    @require_roles("network_admin")
    @ns.expect(ns.model("DeviceConfigBackupIn", {"reason": fields.String(required=False)}), validate=False)
    @ns.marshal_with(JobReferenceOut, code=HTTPStatus.ACCEPTED)
    def post(self, device_id: int):
        try:
            device = _get_device_or_404(device_id)
        except ValueError:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Device not found")

        payload = request.get_json(silent=True) or {}
        reason = payload.get("reason")

        task = JobTaskSpec(
            task_type="device.config.backup",
            sequence=0,
            device_id=device.id,
            parameters={"reason": reason} if reason else {},
        )

        job, created = jobs_service.enqueue_job(
            job_type="device.config.backup",
            owner_id=_current_user_id(),
            parameters={"device_id": device.id, "reason": reason},
            idempotency_key=request.headers.get("Idempotency-Key"),
            tasks=[task],
        )

        return _job_response(job, created)


@ns.route("/health")
class DeviceHealthSummary(Resource):
    """Return aggregated health metrics for the fleet."""

    @jwt_required()
    @ns.marshal_with(HealthSummaryOut, code=HTTPStatus.OK)
    def get(self):
        snapshots = (
            DeviceHealthSnapshots.query.order_by(DeviceHealthSnapshots.observed_at.desc()).all()
        )
        latest: dict[int, DeviceHealthSnapshots] = {}
        for snap in snapshots:
            if snap.device_id not in latest:
                latest[snap.device_id] = snap

        overall: dict[str, int] = {}
        by_platform: dict[int | None, dict[str, Any]] = {}
        by_group: dict[str, dict[str, Any]] = {}

        for snap in latest.values():
            status = snap.status or "unknown"
            overall[status] = overall.get(status, 0) + 1

            device = snap.device
            platform_id = getattr(device, "platform_id", None)
            platform_entry = by_platform.setdefault(
                platform_id,
                {
                    "scope": "platform",
                    "identifier": str(platform_id) if platform_id is not None else "none",
                    "name": getattr(device.platform, "name", None),
                    "total": 0,
                    "statuses": {},
                },
            )
            platform_entry["total"] += 1
            platform_entry["statuses"][status] = platform_entry["statuses"].get(status, 0) + 1

            for group in getattr(device, "groups", []) or []:
                key = group.slug or str(group.id)
                group_entry = by_group.setdefault(
                    key,
                    {
                        "scope": "group",
                        "identifier": key,
                        "name": group.name,
                        "total": 0,
                        "statuses": {},
                    },
                )
                group_entry["total"] += 1
                group_entry["statuses"][status] = group_entry["statuses"].get(status, 0) + 1

        return {
            "generated_at": datetime.now(timezone.utc),
            "overall": {"total": len(latest), "statuses": overall},
            "by_platform": list(by_platform.values()),
            "by_group": list(by_group.values()),
        }


@ns.route("/<int:device_id>/health")
class DeviceHealthDetail(Resource):
    """Return the latest health snapshot for a device."""

    @jwt_required()
    @ns.marshal_with(HealthDetailOut, code=HTTPStatus.OK)
    def get(self, device_id: int):
        try:
            _get_device_or_404(device_id)
        except ValueError:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Device not found")

        snapshot = (
            DeviceHealthSnapshots.query.filter_by(device_id=device_id)
            .order_by(DeviceHealthSnapshots.observed_at.desc())
            .first()
        )
        if not snapshot:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Health snapshot not found")
        return _serialize_health_snapshot(snapshot)


@ns.route(":bulk-update")
class DeviceBulkUpdate(Resource):
    """Queue a bulk update job for multiple devices."""

    @jwt_required()
    @require_roles("network_admin")
    @ns.expect(
        ns.model(
            "DeviceBulkUpdateIn",
            {
                "device_ids": fields.List(fields.Integer, required=False),
                "filters": fields.Raw(required=False, description="Filter mapping to select devices"),
                "updates": fields.Raw(required=True, description="Patch payload applied by the job"),
            },
        ),
        validate=False,
    )
    @ns.marshal_with(JobReferenceOut, code=HTTPStatus.ACCEPTED)
    def post(self):
        payload = request.get_json(silent=True) or {}
        device_ids = payload.get("device_ids") or []
        filters = payload.get("filters") or {}
        updates = payload.get("updates") or payload.get("patch")

        if not isinstance(updates, dict) or not updates:
            return problem_response(HTTPStatus.BAD_REQUEST, detail="Provide updates for the bulk operation")

        query = Devices.query

        if device_ids:
            valid_ids = [int(i) for i in device_ids if isinstance(i, (int, str))]
            if not valid_ids:
                return problem_response(HTTPStatus.BAD_REQUEST, detail="No valid device ids supplied")
            query = query.filter(Devices.id.in_(valid_ids))

        if isinstance(filters, dict):
            for key, value in filters.items():
                if key in DEVICE_COLUMN_KEYS:
                    query = query.filter(getattr(Devices, key) == value)

        targets = query.all()
        if not targets:
            return problem_response(HTTPStatus.NOT_FOUND, detail="No devices matched the selection criteria")

        tasks = [
            JobTaskSpec(
                task_type="device.bulk_update.apply",
                sequence=index,
                device_id=device.id,
                parameters={"updates": updates},
            )
            for index, device in enumerate(targets)
        ]

        job, created = jobs_service.enqueue_job(
            job_type="device.bulk_update",
            owner_id=_current_user_id(),
            parameters={
                "device_ids": [device.id for device in targets],
                "updates": updates,
            },
            idempotency_key=request.headers.get("Idempotency-Key"),
            tasks=tasks,
        )

        return _job_response(job, created)


@ns.route(":discover")
class DeviceDiscovery(Resource):
    """Queue discovery jobs for new devices based on seed networks."""

    @jwt_required()
    @require_roles("network_admin")
    @ns.expect(
        ns.model(
            "DeviceDiscoveryIn",
            {
                "seeds": fields.List(fields.String, required=True, description="CIDR blocks or host ranges"),
                "credentials": fields.Raw(required=False),
            },
        ),
        validate=False,
    )
    @ns.marshal_with(JobReferenceOut, code=HTTPStatus.ACCEPTED)
    def post(self):
        payload = request.get_json(silent=True) or {}
        seeds = payload.get("seeds")
        if not isinstance(seeds, list) or not seeds:
            return problem_response(HTTPStatus.BAD_REQUEST, detail="Provide one or more discovery seeds")

        credentials = payload.get("credentials") or {}

        tasks = [
            JobTaskSpec(
                task_type="device.discovery.scan",
                sequence=index,
                target_type="seed",
                target_id=None,
                parameters={"seed": seed, "credentials": credentials},
            )
            for index, seed in enumerate(seeds)
            if isinstance(seed, str) and seed.strip()
        ]

        if not tasks:
            return problem_response(HTTPStatus.BAD_REQUEST, detail="Seeds must be non-empty strings")

        job, created = jobs_service.enqueue_job(
            job_type="device.discovery",
            owner_id=_current_user_id(),
            parameters={"seeds": seeds, "credentials": credentials},
            idempotency_key=request.headers.get("Idempotency-Key"),
            tasks=tasks,
            run_as_internal=True,
        )

        return _job_response(job, created)


@ns.route(":probe")
class DeviceProbe(Resource):
    """Queue health probe jobs for devices."""

    @jwt_required()
    @require_roles("network_admin")
    @ns.expect(
        ns.model(
            "DeviceProbeIn",
            {
                "device_ids": fields.List(fields.Integer, required=True),
                "probe_type": fields.String(required=False),
                "template_id": fields.Integer(required=False),
                "variables": fields.Raw(required=False),
            },
        ),
        validate=False,
    )
    @ns.marshal_with(JobReferenceOut, code=HTTPStatus.ACCEPTED)
    def post(self):
        payload = request.get_json(silent=True) or {}
        device_ids = payload.get("device_ids") or []
        variables = payload.get("variables") or {}

        if not isinstance(device_ids, list) or not device_ids:
            return problem_response(HTTPStatus.BAD_REQUEST, detail="Provide one or more device_ids")

        template_id = payload.get("template_id")
        probe_type = payload.get("probe_type")
        template = None
        if template_id:
            template = DeviceProbeTemplates.query.get(template_id)
            if not template or not template.is_active:
                return problem_response(HTTPStatus.NOT_FOUND, detail="Probe template not found")
            probe_type = template.probe_type

        if not probe_type:
            return problem_response(HTTPStatus.BAD_REQUEST, detail="Provide probe_type or template_id")

        targets = (
            Devices.query.filter(Devices.id.in_([int(i) for i in device_ids if str(i).isdigit()])).all()
        )
        if not targets:
            return problem_response(HTTPStatus.NOT_FOUND, detail="No matching devices for probe request")

        tasks: list[JobTaskSpec] = []
        for index, device in enumerate(targets):
            tasks.append(
                JobTaskSpec(
                    task_type="device.probe.run",
                    sequence=index,
                    device_id=device.id,
                    parameters={
                        "probe_type": probe_type,
                        "template_id": template.id if template else None,
                        "variables": variables,
                    },
                )
            )

        job, created = jobs_service.enqueue_job(
            job_type="device.probe",
            owner_id=_current_user_id(),
            parameters={
                "device_ids": [device.id for device in targets],
                "probe_type": probe_type,
                "template_id": template.id if template else None,
                "variables": variables,
            },
            idempotency_key=request.headers.get("Idempotency-Key"),
            tasks=tasks,
        )

        # Record queued executions for observability
        if job.tasks:
            for task in job.tasks:
                if not task.device_id:
                    continue
                execution = DeviceProbeExecutions(
                    device_id=task.device_id,
                    job_id=job.id,
                    job_task_id=task.id,
                    template_id=template.id if template else None,
                    probe_type=probe_type,
                    status="queued",
                    diagnostics={"requested": task.parameters or {}},
                )
                db.session.add(execution)
            db.session.commit()

        return _job_response(job, created)

