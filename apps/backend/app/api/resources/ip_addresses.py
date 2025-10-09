"""
app/api/resources/ip_addresses.py
---------------------------------
IP address endpoints (CRUD + list with filters).

Responsibilities
----------------
- Expose `/ip_addresses` collection with pagination, sorting, and filters.
- Expose `/ip_addresses/<id>` item for read/update/delete.
- Keep assignment flexible: an IP can belong to a device or an interface.
- IPv4-only per project scope; store canonical string plus optional metadata.

Model Assumptions
-----------------
The ORM model `IPAddresses` exists in `app/models.py` with fields like:

- id : int
- device_id : int | None          # optional FK -> Devices.id
- interface_id : int | None       # optional FK -> Interfaces.id
- address : str                   # canonical IPv4 string (e.g., "10.0.0.1")
- prefix_length : int             # CIDR prefix length (0..32)
- is_primary : bool               # primary mgmt/service IP flag
- role : str | None               # e.g., "mgmt","loopback","vip"
- vrf : str | None
- notes : str | None
- meta : dict | None              # arbitrary driver/vendor metadata
- created_at : datetime
- updated_at : datetime

Endpoints
---------
GET    /ip_addresses
POST   /ip_addresses
GET    /ip_addresses/<int:id>
PATCH  /ip_addresses/<int:id>
DELETE /ip_addresses/<int:id>

Query Parameters (GET /ip_addresses)
------------------------------------
page : int
per_page : int
sort : str
    Comma-separated fields; prefix with '-' for DESC. Example: `-id,address`.
device_id : int
interface_id : int
address : str   (substring match)
role : str
is_primary : bool-like
vrf : str

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
from ...models import IPAddresses
from ..utils import get_pagination, apply_sorting, paginate_query

# ---------------------------------------------------------------------------
# Namespace
# ---------------------------------------------------------------------------
ns = Namespace("ip_addresses", description="IPv4 addresses and assignments")


# ---------------------------------------------------------------------------
# Swagger Models (I/O)
# ---------------------------------------------------------------------------
IPBase = ns.model(
    "IPAddressBase",
    {
        "device_id": fields.Integer(required=False, description="Optional FK to Devices.id"),
        "interface_id": fields.Integer(required=False, description="Optional FK to Interfaces.id"),
        "address": fields.String(required=True, description="Canonical IPv4 address, e.g., '10.0.0.1'"),
        "prefix_length": fields.Integer(required=True, description="CIDR prefix length (0..32)"),
        "is_primary": fields.Boolean(required=False, description="Whether this IP is primary"),
        "role": fields.String(required=False, description="Role hint (e.g., 'mgmt','loopback','vip')"),
        "vrf": fields.String(required=False, description="VRF name"),
        "notes": fields.String(required=False, description="Freeform notes"),
        "meta": fields.Raw(required=False, description="Arbitrary metadata (JSON)"),
    },
)

IPCreate = ns.clone("IPAddressCreate", IPBase, {})
IPUpdate = ns.clone("IPAddressUpdate", IPBase, {})  # all optional on PATCH

IPOut = ns.model(
    "IPAddressOut",
    {
        "id": fields.Integer(required=True),
        "device_id": fields.Integer,
        "interface_id": fields.Integer,
        "address": fields.String(required=True),
        "prefix_length": fields.Integer(required=True),
        "is_primary": fields.Boolean,
        "role": fields.String,
        "vrf": fields.String,
        "notes": fields.String,
        "meta": fields.Raw,
        "created_at": fields.DateTime,
        "updated_at": fields.DateTime,
    },
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _apply_filters(q):
    """
    Apply URL query filters to a base IPAddresses query.

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
        q = q.filter(IPAddresses.device_id == device_id)

    interface_id = request.args.get("interface_id", type=int)
    if interface_id is not None:
        q = q.filter(IPAddresses.interface_id == interface_id)

    address = request.args.get("address")
    if address:
        q = q.filter(IPAddresses.address.ilike(f"%{address}%"))

    role = request.args.get("role")
    if role:
        q = q.filter(IPAddresses.role.ilike(role))

    vrf = request.args.get("vrf")
    if vrf:
        q = q.filter(IPAddresses.vrf.ilike(vrf))

    is_primary = request.args.get("is_primary")
    if is_primary is not None:
        v = is_primary.strip().lower()
        if v in {"1", "true", "yes", "on"}:
            q = q.filter(IPAddresses.is_primary.is_(True))
        elif v in {"0", "false", "no", "off"}:
            q = q.filter(IPAddresses.is_primary.is_(False))

    return q


# ---------------------------------------------------------------------------
# Resources
# ---------------------------------------------------------------------------
@ns.route("")
class IPList(Resource):
    """
    Resource: /ip_addresses
    -----------------------
    List IP addresses (with filters, pagination, sorting) and create new entries.
    """

    @jwt_required()
    @ns.marshal_list_with(IPOut, code=HTTPStatus.OK)
    def get(self):
        """
        List IP addresses.

        Query Parameters
        ----------------
        page : int
        per_page : int
        sort : str
        device_id : int
        interface_id : int
        address : str
        role : str
        is_primary : bool-like
        vrf : str

        Returns
        -------
        list[IPAddressOut]
        """
        page, per_page = get_pagination()
        q = IPAddresses.query
        q = _apply_filters(q)
        q = apply_sorting(
            q,
            IPAddresses,
            default="-id",
            allowed={"id", "address", "prefix_length", "device_id", "interface_id", "is_primary", "created_at", "updated_at"},
        )
        rows = paginate_query(q, page=page, per_page=per_page).items
        return rows, HTTPStatus.OK

    @jwt_required()
    @ns.expect(IPCreate, validate=True)
    @ns.marshal_with(IPOut, code=HTTPStatus.CREATED)
    def post(self):
        """
        Create an IP address record.

        Body
        ----
        IPAddressCreate

        Returns
        -------
        IPAddressOut
        """
        payload = request.get_json(force=True) or {}
        row = IPAddresses(**payload)
        db.session.add(row)
        db.session.commit()
        return row, HTTPStatus.CREATED


@ns.route("/<int:id>")
class IPItem(Resource):
    """
    Resource: /ip_addresses/<id>
    ----------------------------
    Retrieve, update, or delete a specific IP address record.
    """

    @jwt_required()
    @ns.marshal_with(IPOut, code=HTTPStatus.OK)
    def get(self, id: int):
        """
        Retrieve an IP address record by ID.

        Parameters
        ----------
        id : int

        Returns
        -------
        IPAddressOut
        """
        return IPAddresses.query.get_or_404(id), HTTPStatus.OK

    @jwt_required()
    @ns.expect(IPUpdate, validate=False)
    @ns.marshal_with(IPOut, code=HTTPStatus.OK)
    def patch(self, id: int):
        """
        Update an IP address record (partial).

        Parameters
        ----------
        id : int

        Body
        ----
        IPAddressUpdate

        Returns
        -------
        IPAddressOut
        """
        row = IPAddresses.query.get_or_404(id)
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
        Delete an IP address record.

        Parameters
        ----------
        id : int

        Returns
        -------
        dict
            Confirmation message.
        """
        row = IPAddresses.query.get_or_404(id)
        db.session.delete(row)
        db.session.commit()
        return {"message": "deleted"}, HTTPStatus.OK