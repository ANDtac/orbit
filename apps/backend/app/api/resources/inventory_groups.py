"""
app/api/resources/inventory_groups.py
-------------------------------------
Inventory group endpoints (CRUD + membership helpers).

Responsibilities
----------------
- Expose `/inventory_groups` collection with pagination, sorting, and filters.
- Expose `/inventory_groups/<id>` item for read/update/delete.
- Manage group membership via:
    - `POST /inventory_groups/<id>/assign` to assign devices to the group.
    - `GET  /inventory_groups/<id>/devices` to list member devices.

Model Assumptions
-----------------
The ORM models exist in `app/models.py`:

- InventoryGroups
    id: int
    name: str
    description: str | None
    nornir_data: dict | None
    ansible_vars: dict | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

- Devices
    id: int
    name: str
    inventory_group_id: int | None  # FK to InventoryGroups.id

Endpoints
---------
GET    /inventory_groups
POST   /inventory_groups
GET    /inventory_groups/<int:id>
PATCH  /inventory_groups/<int:id>
DELETE /inventory_groups/<int:id>

POST   /inventory_groups/<int:id>/assign
GET    /inventory_groups/<int:id>/devices

Query Parameters (GET /inventory_groups)
----------------------------------------
page : int
per_page : int
sort : str
    Comma-separated fields; prefix with '-' for DESC. Example: `-id,name`.
name : str
is_active : bool-like

Security
--------
All endpoints require a valid JWT (see /auth/login).
"""

from __future__ import annotations

from flask import request
from flask_restx import Namespace, Resource, fields
from flask_restx._http import HTTPStatus
from flask_jwt_extended import jwt_required

from ...extensions import db
from ...models import InventoryGroups, Devices, DeviceInventoryGroups
from ..utils import get_pagination, apply_sorting, paginate_query

# ---------------------------------------------------------------------------
# Namespace
# ---------------------------------------------------------------------------
ns = Namespace("inventory_groups", description="Inventory groups for devices")


# ---------------------------------------------------------------------------
# Swagger Models (I/O)
# ---------------------------------------------------------------------------
GroupBase = ns.model(
    "InventoryGroupBase",
    {
        "name": fields.String(required=True, description="Group name"),
        "description": fields.String(required=False, description="Optional description"),
        "nornir_data": fields.Raw(required=False, description="Per-group Nornir variables (JSON)"),
        "ansible_vars": fields.Raw(required=False, description="Per-group Ansible variables (JSON)"),
        "is_active": fields.Boolean(required=False, description="Whether the group is active"),
    },
)
GroupCreate = ns.clone("InventoryGroupCreate", GroupBase, {})
GroupUpdate = ns.clone("InventoryGroupUpdate", GroupBase, {})
GroupOut = ns.model(
    "InventoryGroupOut",
    {
        "id": fields.Integer(required=True),
        "name": fields.String(required=True),
        "description": fields.String,
        "nornir_data": fields.Raw,
        "ansible_vars": fields.Raw,
        "is_active": fields.Boolean,
        "created_at": fields.DateTime,
        "updated_at": fields.DateTime,
    },
)

AssignIn = ns.model(
    "InventoryGroupAssignIn",
    {
        "device_ids": fields.List(fields.Integer, required=True, description="Devices to assign to this group")
    },
)
AssignOut = ns.model(
    "InventoryGroupAssignOut",
    {
        "group_id": fields.Integer,
        "assigned": fields.List(fields.Integer, description="Device IDs successfully assigned"),
        "not_found": fields.List(fields.Integer, description="Device IDs that did not exist"),
    },
)

DeviceLight = ns.model(
    "DeviceLight",
    {
        "id": fields.Integer,
        "name": fields.String,
        "inventory_group_id": fields.Integer,
    },
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _apply_group_filters(q):
    """
    Apply URL query filters to a base InventoryGroups query.

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
        q = q.filter(InventoryGroups.name.ilike(f"%{name}%"))

    is_active = request.args.get("is_active")
    if is_active is not None:
        v = is_active.strip().lower()
        if v in {"1", "true", "yes", "on"}:
            q = q.filter(InventoryGroups.is_active.is_(True))
        elif v in {"0", "false", "no", "off"}:
            q = q.filter(InventoryGroups.is_active.is_(False))

    return q


# ---------------------------------------------------------------------------
# Resources
# ---------------------------------------------------------------------------
@ns.route("")
class GroupList(Resource):
    """
    Resource: /inventory_groups
    ---------------------------
    List groups (with filters, pagination, sorting) and create new groups.
    """

    @jwt_required()
    @ns.marshal_list_with(GroupOut, code=HTTPStatus.OK)
    def get(self):
        """
        List inventory groups.

        Query Parameters
        ----------------
        page : int
        per_page : int
        sort : str
        name : str
        is_active : bool-like

        Returns
        -------
        list[InventoryGroupOut]
        """
        page, per_page = get_pagination()
        q = InventoryGroups.query
        q = _apply_group_filters(q)
        q = apply_sorting(
            q,
            InventoryGroups,
            default="-id",
            allowed={"id", "name", "is_active", "created_at", "updated_at"},
        )
        rows = paginate_query(q, page=page, per_page=per_page).items
        return rows, HTTPStatus.OK

    @jwt_required()
    @ns.expect(GroupCreate, validate=True)
    @ns.marshal_with(GroupOut, code=HTTPStatus.CREATED)
    def post(self):
        """
        Create an inventory group.

        Body
        ----
        InventoryGroupCreate

        Returns
        -------
        InventoryGroupOut
        """
        payload = request.get_json(force=True) or {}
        row = InventoryGroups(**payload)
        db.session.add(row)
        db.session.commit()
        return row, HTTPStatus.CREATED


@ns.route("/<int:id>")
class GroupItem(Resource):
    """
    Resource: /inventory_groups/<id>
    --------------------------------
    Retrieve, update, or delete a specific group.
    """

    @jwt_required()
    @ns.marshal_with(GroupOut, code=HTTPStatus.OK)
    def get(self, id: int):
        """
        Retrieve a group by ID.

        Parameters
        ----------
        id : int

        Returns
        -------
        InventoryGroupOut
        """
        return InventoryGroups.query.get_or_404(id), HTTPStatus.OK

    @jwt_required()
    @ns.expect(GroupUpdate, validate=False)
    @ns.marshal_with(GroupOut, code=HTTPStatus.OK)
    def patch(self, id: int):
        """
        Update a group (partial).

        Parameters
        ----------
        id : int

        Body
        ----
        InventoryGroupUpdate

        Returns
        -------
        InventoryGroupOut
        """
        row = InventoryGroups.query.get_or_404(id)
        data = request.get_json(force=True) or {}
        for k, v in data.items():
            if not hasattr(row, k):
                continue
            setattr(row, k, v)
        db.session.commit()
        return row, HTTPStatus.OK

    @jwt_required()
    def delete(self, id: int):
        """
        Delete a group.

        Parameters
        ----------
        id : int

        Returns
        -------
        dict
            Confirmation message.
        """
        row = InventoryGroups.query.get_or_404(id)
        db.session.delete(row)
        db.session.commit()
        return {"message": "deleted"}, HTTPStatus.OK


@ns.route("/<int:id>/assign")
class GroupAssign(Resource):
    """
    Resource: /inventory_groups/<id>/assign
    ---------------------------------------
    Assign devices to a group in a single call.
    """

    @jwt_required()
    @ns.expect(AssignIn, validate=True)
    @ns.marshal_with(AssignOut, code=HTTPStatus.OK)
    def post(self, id: int):
        """
        Assign multiple devices to the given group.

        Parameters
        ----------
        id : int
            Inventory group ID.

        Body
        ----
        InventoryGroupAssignIn
            A list of `device_ids` to assign.

        Returns
        -------
        InventoryGroupAssignOut
            IDs assigned and IDs not found.
        """
        group = InventoryGroups.query.get_or_404(id)
        payload = request.get_json(force=True) or {}
        ids = payload.get("device_ids") or []

        found = Devices.query.filter(Devices.id.in_(ids)).all()
        found_ids = {d.id for d in found}
        not_found = [x for x in ids if x not in found_ids]

        for d in found:
            d.inventory_group_id = group.id

        db.session.commit()
        return {"group_id": group.id, "assigned": sorted(list(found_ids)), "not_found": not_found}, HTTPStatus.OK


@ns.route("/<int:id>/devices")
class GroupDevices(Resource):
    """
    Resource: /inventory_groups/<id>/devices
    ----------------------------------------
    List devices assigned to a specific group (lightweight view).
    """

    @jwt_required()
    @ns.marshal_list_with(DeviceLight, code=HTTPStatus.OK)
    def get(self, id: int):
        """
        List devices that belong to this group.

        Parameters
        ----------
        id : int
            Inventory group ID.

        Returns
        -------
        list[DeviceLight]
        """
        InventoryGroups.query.get_or_404(id)
        rows = (
            db.session.query(Devices)
            .join(DeviceInventoryGroups, DeviceInventoryGroups.device_id == Devices.id)
            .filter(DeviceInventoryGroups.group_id == id)
            .order_by(Devices.id.asc())
            .all()
        )
        return [
            {"id": dev.id, "name": dev.name, "inventory_group_id": id}
            for dev in rows
        ], HTTPStatus.OK