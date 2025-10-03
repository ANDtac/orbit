"""
app/api/resources/snapshots.py
------------------------------
Device configuration snapshot endpoints (CRUD + list with filters).

Responsibilities
----------------
- Expose `/snapshots` collection with pagination, sorting, and filters.
- Expose `/snapshots/<id>` item for read/update/delete.
- Store vendor-agnostic configuration text (and optional metadata) captured
  via Nornir/NAPALM or other collectors.

Model Assumptions
-----------------
The ORM model `DeviceConfigSnapshots` exists in `app/models.py` with fields like:

- id : int
- device_id : int                 # FK -> Devices.id
- captured_at : datetime          # capture timestamp (UTC)
- source : str | None             # e.g., "napalm:get_config", "cli:show running-config"
- config_text : str               # raw configuration content (UTF-8)
- config_hash : str | None        # stable hash for deduplication (e.g., SHA256)
- config_format : str | None      # e.g., "ios", "nxos", "json", "yaml"
- metadata : dict | None          # arbitrary capture metadata (JSON)
- notes : str | None
- created_at : datetime
- updated_at : datetime

Endpoints
---------
GET    /snapshots
POST   /snapshots
GET    /snapshots/<int:id>
PATCH  /snapshots/<int:id>
DELETE /snapshots/<int:id>

Query Parameters (GET /snapshots)
---------------------------------
page : int
per_page : int
sort : str
    Comma-separated fields; prefix with '-' for DESC. Example: `-captured_at,id`.
device_id : int
since : ISO8601 (inclusive)
until : ISO8601 (exclusive)
source : str
hash : str   (exact match on config_hash)

Security
--------
All endpoints require a valid JWT (see /auth/login).

Notes
-----
- Large configs are stored as TEXT; consider compression/dedup at the ingestion
  service if size becomes a concern.
"""

from __future__ import annotations

from datetime import datetime
from flask import request
from flask_restx import Namespace, Resource, fields
from flask_restx._http import HTTPStatus
from flask_jwt_extended import jwt_required

from ...extensions import db
from ...models import DeviceConfigSnapshots
from ..utils import get_pagination, apply_sorting, paginate_query

# ---------------------------------------------------------------------------
# Namespace
# ---------------------------------------------------------------------------
ns = Namespace("snapshots", description="Device configuration snapshots")


# ---------------------------------------------------------------------------
# Swagger Models (I/O)
# ---------------------------------------------------------------------------
SnapshotBase = ns.model(
    "SnapshotBase",
    {
        "device_id": fields.Integer(required=True, description="FK to Devices.id"),
        "captured_at": fields.DateTime(required=False, description="Capture time (UTC); defaults to now if omitted"),
        "source": fields.String(required=False, description="Capture source (e.g., 'napalm:get_config')"),
        "config_text": fields.String(required=True, description="Raw configuration text (UTF-8)"),
        "config_hash": fields.String(required=False, description="Optional content hash (e.g., SHA256)"),
        "config_format": fields.String(required=False, description="Format hint (e.g., 'ios','nxos','json')"),
        "metadata": fields.Raw(required=False, description="Arbitrary capture metadata (JSON)"),
        "notes": fields.String(required=False, description="Freeform notes"),
    },
)

SnapshotCreate = ns.clone("SnapshotCreate", SnapshotBase, {})
SnapshotUpdate = ns.clone("SnapshotUpdate", SnapshotBase, {})  # all optional on PATCH

SnapshotOut = ns.model(
    "SnapshotOut",
    {
        "id": fields.Integer(required=True),
        "device_id": fields.Integer(required=True),
        "captured_at": fields.DateTime(required=True),
        "source": fields.String,
        "config_text": fields.String,
        "config_hash": fields.String,
        "config_format": fields.String,
        "metadata": fields.Raw,
        "notes": fields.String,
        "created_at": fields.DateTime,
        "updated_at": fields.DateTime,
    },
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _parse_iso_dt(value: str | None) -> datetime | None:
    """
    Parse an ISO8601 timestamp from a query parameter.

    Parameters
    ----------
    value : str | None
        The raw string value (e.g., '2025-01-31T00:00:00Z').

    Returns
    -------
    datetime | None
        Parsed UTC datetime or None on failure/absence.
    """
    if not value:
        return None
    try:
        v = value.rstrip("Z")
        return datetime.fromisoformat(v)
    except Exception:
        return None


def _apply_filters(q):
    """
    Apply URL query filters to a base DeviceConfigSnapshots query.

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
        q = q.filter(DeviceConfigSnapshots.device_id == device_id)

    since = _parse_iso_dt(request.args.get("since"))
    if since:
        q = q.filter(DeviceConfigSnapshots.captured_at >= since)

    until = _parse_iso_dt(request.args.get("until"))
    if until:
        q = q.filter(DeviceConfigSnapshots.captured_at < until)

    source = request.args.get("source")
    if source:
        q = q.filter(DeviceConfigSnapshots.source.ilike(source))

    cfg_hash = request.args.get("hash")
    if cfg_hash:
        q = q.filter(DeviceConfigSnapshots.config_hash == cfg_hash)

    return q


# ---------------------------------------------------------------------------
# Resources
# ---------------------------------------------------------------------------
@ns.route("")
class SnapshotList(Resource):
    """
    Resource: /snapshots
    --------------------
    List snapshots (with filters, pagination, sorting) and create new snapshots.
    """

    @jwt_required()
    @ns.marshal_list_with(SnapshotOut, code=HTTPStatus.OK)
    def get(self):
        """
        List device configuration snapshots.

        Query Parameters
        ----------------
        page : int
        per_page : int
        sort : str
        device_id : int
        since : ISO8601
        until : ISO8601
        source : str
        hash : str

        Returns
        -------
        list[SnapshotOut]
        """
        page, per_page = get_pagination()
        q = DeviceConfigSnapshots.query
        q = _apply_filters(q)
        q = apply_sorting(
            q,
            DeviceConfigSnapshots,
            default="-captured_at",
            allowed={"id", "device_id", "captured_at", "config_hash", "created_at", "updated_at"},
        )
        rows = paginate_query(q, page=page, per_page=per_page).items
        return rows, HTTPStatus.OK

    @jwt_required()
    @ns.expect(SnapshotCreate, validate=True)
    @ns.marshal_with(SnapshotOut, code=HTTPStatus.CREATED)
    def post(self):
        """
        Create a configuration snapshot.

        Body
        ----
        SnapshotCreate

        Returns
        -------
        SnapshotOut
        """
        payload = request.get_json(force=True) or {}
        # Default captured_at to now if not provided
        payload.setdefault("captured_at", datetime.utcnow().isoformat() + "Z")
        row = DeviceConfigSnapshots(**payload)
        db.session.add(row)
        db.session.commit()
        return row, HTTPStatus.CREATED


@ns.route("/<int:id>")
class SnapshotItem(Resource):
    """
    Resource: /snapshots/<id>
    -------------------------
    Retrieve, update, or delete a specific snapshot.
    """

    @jwt_required()
    @ns.marshal_with(SnapshotOut, code=HTTPStatus.OK)
    def get(self, id: int):
        """
        Retrieve a snapshot by ID.

        Parameters
        ----------
        id : int

        Returns
        -------
        SnapshotOut
        """
        return DeviceConfigSnapshots.query.get_or_404(id), HTTPStatus.OK

    @jwt_required()
    @ns.expect(SnapshotUpdate, validate=False)
    @ns.marshal_with(SnapshotOut, code=HTTPStatus.OK)
    def patch(self, id: int):
        """
        Update a snapshot (partial).

        Parameters
        ----------
        id : int

        Body
        ----
        SnapshotUpdate

        Returns
        -------
        SnapshotOut
        """
        row = DeviceConfigSnapshots.query.get_or_404(id)
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
        Delete a snapshot.

        Parameters
        ----------
        id : int

        Returns
        -------
        dict
            Confirmation message.
        """
        row = DeviceConfigSnapshots.query.get_or_404(id)
        db.session.delete(row)
        db.session.commit()
        return {"message": "deleted"}, HTTPStatus.OK