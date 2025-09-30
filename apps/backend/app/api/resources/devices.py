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
page : int
per_page : int
sort : str
    Comma-separated fields; prefix with '-' for DESC. Example: `-id,name`.
name : str
platform_id : int
mgmt_ipv4 : str
os_name : str
os_version : str
inventory_group_id : int

Security
--------
All endpoints require a valid JWT (see /auth/login).
"""

from __future__ import annotations

from flask import request
from flask_restx import Namespace, Resource, fields
from flask_jwt_extended import jwt_required

from ...extensions import db
from ...models import Devices
from ..utils import get_pagination, apply_sorting

# ---------------------------------------------------------------------------
# Namespace
# ---------------------------------------------------------------------------
ns = Namespace("devices", description="Devices inventory")


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
    name = request.args.get("name")
    if name:
        q = q.filter(Devices.name.ilike(f"%{name}%"))

    platform_id = request.args.get("platform_id", type=int)
    if platform_id is not None:
        q = q.filter(Devices.platform_id == platform_id)

    mgmt_ipv4 = request.args.get("mgmt_ipv4")
    if mgmt_ipv4:
        q = q.filter(Devices.mgmt_ipv4.cast(db.String).ilike(f"%{mgmt_ipv4}%"))

    os_name = request.args.get("os_name")
    if os_name:
        q = q.filter(Devices.os_name.ilike(os_name))

    os_version = request.args.get("os_version")
    if os_version:
        q = q.filter(Devices.os_version.ilike(f"%{os_version}%"))

    inventory_group_id = request.args.get("inventory_group_id", type=int)
    if inventory_group_id is not None:
        q = q.filter(Devices.inventory_group_id == inventory_group_id)

    is_active = request.args.get("is_active")
    if is_active is not None:
        v = is_active.strip().lower()
        if v in {"1", "true", "yes", "on"}:
            q = q.filter(Devices.is_active.is_(True))
        elif v in {"0", "false", "no", "off"}:
            q = q.filter(Devices.is_active.is_(False))

    return q


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
    @ns.marshal_list_with(DeviceOut, code=200)
    def get(self):
        """
        List devices.

        Query Parameters
        ----------------
        page : int
        per_page : int
        sort : str
        name : str
        platform_id : int
        mgmt_ipv4 : str
        os_name : str
        os_version : str
        inventory_group_id : int
        is_active : bool-like

        Returns
        -------
        list[DeviceOut]
        """
        page, per_page = get_pagination()
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
        rows = q.paginate(page=page, per_page=per_page, error_out=False).items
        return rows, 200

    @jwt_required()
    @ns.expect(DeviceCreate, validate=True)
    @ns.marshal_with(DeviceOut, code=201)
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
        payload = request.get_json(force=True) or {}
        dev = Devices(**payload)
        db.session.add(dev)
        db.session.commit()
        return dev, 201


@ns.route("/<int:id>")
class DeviceItem(Resource):
    """
    Resource: /devices/<id>
    -----------------------
    Retrieve, update, or delete a specific device.
    """

    @jwt_required()
    @ns.marshal_with(DeviceOut, code=200)
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
        return Devices.query.get_or_404(id), 200

    @jwt_required()
    @ns.expect(DeviceUpdate, validate=False)
    @ns.marshal_with(DeviceOut, code=200)
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
        data = request.get_json(force=True) or {}
        for k, v in data.items():
            if not hasattr(dev, k):
                continue
            setattr(dev, k, v)
        db.session.commit()
        return dev, 200

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
        return {"message": "deleted"}, 200