"""
app/api/resources/interfaces.py
--------------------------------
Network interface endpoints (CRUD + list with filters).

Responsibilities
----------------
- Expose `/interfaces` collection with pagination, sorting, and filters.
- Expose `/interfaces/<id>` item for read/update/delete.
- Keep interface data vendor-agnostic (name, status, MAC, speed, MTU, etc.).
- Defer IP assignment/linking to the `ip_addresses` resource.

Model Assumptions
-----------------
The ORM model `Interfaces` exists in `app/models.py` with fields like:

- id : int
- device_id : int                # FK -> Devices.id
- name : str                     # e.g., "GigabitEthernet1/0/1"
- description : str | None
- mac_address : str | None
- is_up : bool                   # link state
- is_enabled : bool              # admin state
- speed_mbps : int | None
- mtu : int | None
- facts : dict | None            # structured vendor-agnostic facts
- created_at : datetime
- updated_at : datetime

Related:
- Devices.id (FK target)

Endpoints
---------
GET    /interfaces
POST   /interfaces
GET    /interfaces/<int:id>
PATCH  /interfaces/<int:id>
DELETE /interfaces/<int:id>

Query Parameters (GET /interfaces)
----------------------------------
page : int
per_page : int
sort : str
    Comma-separated fields; prefix with '-' for DESC. Example: `-id,name`.
device_id : int
name : str
is_up : bool-like
is_enabled : bool-like
mac_address : str (substring match)

Security
--------
All endpoints require a valid JWT (see /api/v1/auth/login).
"""

from __future__ import annotations

from flask import request
from flask_restx import Namespace, Resource, fields
from flask_restx._http import HTTPStatus
from flask_jwt_extended import jwt_required

from app.extensions import db
from app.models import Interfaces
from ..utils import get_pagination, apply_sorting, paginate_query

# ---------------------------------------------------------------------------
# Namespace
# ---------------------------------------------------------------------------
ns = Namespace("interfaces", description="Network interfaces")


# ---------------------------------------------------------------------------
# Swagger Models (I/O)
# ---------------------------------------------------------------------------
IfaceBase = ns.model(
    "InterfaceBase",
    {
        "device_id": fields.Integer(required=True, description="FK to Devices.id"),
        "name": fields.String(required=True, description="Interface name (e.g., 'GigabitEthernet1/0/1')"),
        "description": fields.String(required=False, description="Optional description"),
        "mac_address": fields.String(required=False, description="MAC address (canonicalized if possible)"),
        "is_up": fields.Boolean(required=False, description="Operational state (link up/down)"),
        "is_enabled": fields.Boolean(required=False, description="Administrative state (enabled/disabled)"),
        "speed_mbps": fields.Integer(required=False, description="Advertised/operational speed in Mbps"),
        "mtu": fields.Integer(required=False, description="MTU"),
        "facts": fields.Raw(required=False, description="Structured vendor-agnostic facts (JSON)"),
    },
)
IfaceCreate = ns.clone("InterfaceCreate", IfaceBase, {})
IfaceUpdate = ns.clone("InterfaceUpdate", IfaceBase, {})  # all optional on PATCH

IfaceOut = ns.model(
    "InterfaceOut",
    {
        "id": fields.Integer(required=True),
        "device_id": fields.Integer(required=True),
        "name": fields.String(required=True),
        "description": fields.String,
        "mac_address": fields.String,
        "is_up": fields.Boolean,
        "is_enabled": fields.Boolean,
        "speed_mbps": fields.Integer,
        "mtu": fields.Integer,
        "facts": fields.Raw,
        "created_at": fields.DateTime,
        "updated_at": fields.DateTime,
    },
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _apply_filters(q):
    """
    Apply URL query filters to a base Interfaces query.

    Parameters
    ----------
    q : sqlalchemy.orm.Query
        Base query.

    Returns
    -------
    sqlalchemy.orm.Query
        Filtered query.
    """
    device_id = request.args.get("device_id", type=int)
    if device_id is not None:
        q = q.filter(Interfaces.device_id == device_id)

    name = request.args.get("name")
    if name:
        q = q.filter(Interfaces.name.ilike(f"%{name}%"))

    mac = request.args.get("mac_address")
    if mac:
        q = q.filter(Interfaces.mac_address.ilike(f"%{mac}%"))

    is_up = request.args.get("is_up")
    if is_up is not None:
        v = is_up.strip().lower()
        if v in {"1", "true", "yes", "on"}:
            q = q.filter(Interfaces.is_up.is_(True))
        elif v in {"0", "false", "no", "off"}:
            q = q.filter(Interfaces.is_up.is_(False))

    is_enabled = request.args.get("is_enabled")
    if is_enabled is not None:
        v = is_enabled.strip().lower()
        if v in {"1", "true", "yes", "on"}:
            q = q.filter(Interfaces.is_enabled.is_(True))
        elif v in {"0", "false", "no", "off"}:
            q = q.filter(Interfaces.is_enabled.is_(False))

    return q


# ---------------------------------------------------------------------------
# Resources
# ---------------------------------------------------------------------------
@ns.route("")
class InterfaceList(Resource):
    """
    Resource: /interfaces
    ---------------------
    List interfaces (with filters, pagination, sorting) and create new interfaces.
    """

    @jwt_required()
    @ns.marshal_list_with(IfaceOut, code=HTTPStatus.OK)
    def get(self):
        """
        List interfaces.

        Query Parameters
        ----------------
        page : int
        per_page : int
        sort : str
        device_id : int
        name : str
        is_up : bool-like
        is_enabled : bool-like
        mac_address : str

        Returns
        -------
        list[InterfaceOut]
        """
        page, per_page = get_pagination()
        q = Interfaces.query
        q = _apply_filters(q)
        q = apply_sorting(
            q,
            Interfaces,
            default="-id",
            allowed={"id", "device_id", "name", "is_up", "is_enabled", "speed_mbps", "mtu", "created_at", "updated_at"},
        )
        rows = paginate_query(q, page=page, per_page=per_page).items
        return rows, HTTPStatus.OK

    @jwt_required()
    @ns.expect(IfaceCreate, validate=True)
    @ns.marshal_with(IfaceOut, code=HTTPStatus.CREATED)
    def post(self):
        """
        Create an interface.

        Body
        ----
        InterfaceCreate

        Returns
        -------
        InterfaceOut
        """
        payload = request.get_json(force=True) or {}
        row = Interfaces(**payload)
        db.session.add(row)
        db.session.commit()
        return row, HTTPStatus.CREATED


@ns.route("/<int:id>")
class InterfaceItem(Resource):
    """
    Resource: /interfaces/<id>
    --------------------------
    Retrieve, update, or delete a specific interface.
    """

    @jwt_required()
    @ns.marshal_with(IfaceOut, code=HTTPStatus.OK)
    def get(self, id: int):
        """
        Retrieve an interface by ID.

        Parameters
        ----------
        id : int

        Returns
        -------
        InterfaceOut
        """
        return Interfaces.query.get_or_404(id), HTTPStatus.OK

    @jwt_required()
    @ns.expect(IfaceUpdate, validate=False)
    @ns.marshal_with(IfaceOut, code=HTTPStatus.OK)
    def patch(self, id: int):
        """
        Update an interface (partial).

        Parameters
        ----------
        id : int

        Body
        ----
        InterfaceUpdate

        Returns
        -------
        InterfaceOut
        """
        row = Interfaces.query.get_or_404(id)
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
        Delete an interface.

        Parameters
        ----------
        id : int

        Returns
        -------
        dict
            Confirmation message.
        """
        row = Interfaces.query.get_or_404(id)
        db.session.delete(row)
        db.session.commit()
        return {"message": "deleted"}, HTTPStatus.OK