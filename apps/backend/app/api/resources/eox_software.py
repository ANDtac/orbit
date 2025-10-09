"""
app/api/resources/eox_software.py
---------------------------------
Software lifecycle (EoX) endpoints per OS/version matcher.

Responsibilities
----------------
- CRUD for software lifecycle milestones tied to (platform, os_name, version pattern).
- Filters by os_name / platform_id / match_operator.
- Version matching semantics are implemented on the model (`matches_version`).

Model Assumptions
-----------------
`SoftwareLifecycle` in app/models.py with fields:
- id : int
- platform_id : int | None (FK -> Platforms.id)
- os_name : str
- match_operator : str  ('eq'|'prefix'|'regex')
- match_value : str
- end_of_software_maintenance_date : datetime | None
- end_of_security_fixes_date : datetime | None
- last_day_of_support_date : datetime | None
- end_of_sale_date : datetime | None
- source_url : str | None
- notes : str | None

Endpoints
---------
GET    /eox_software
POST   /eox_software
GET    /eox_software/<int:id>
PATCH  /eox_software/<int:id>
DELETE /eox_software/<int:id>

Security
--------
All endpoints require a valid JWT.
"""

from __future__ import annotations

from datetime import datetime, timezone
from flask import request
from flask_restx import Namespace, Resource, fields
from flask_restx._http import HTTPStatus
from flask_jwt_extended import jwt_required

from ...extensions import db
from ...models import SoftwareLifecycle, Platforms

ns = Namespace("eox_software", description="Software lifecycle per OS/version matcher")

SoftwareIn = ns.model("SoftwareLifecycleIn", {
    "platform_id": fields.Integer(required=False, description="Optional FK to Platforms.id"),
    "os_name": fields.String(required=True),
    "match_operator": fields.String(enum=["eq", "prefix", "regex"], default="eq"),
    "match_value": fields.String(required=True),
    "end_of_software_maintenance_date": fields.DateTime,
    "end_of_security_fixes_date": fields.DateTime,
    "last_day_of_support_date": fields.DateTime,
    "end_of_sale_date": fields.DateTime,
    "source_url": fields.String,
    "notes": fields.String,
})
SoftwareOut = SoftwareIn.clone("SoftwareLifecycleOut", {"id": fields.Integer})


_DATE_FIELDS = {
    "end_of_software_maintenance_date",
    "end_of_security_fixes_date",
    "last_day_of_support_date",
    "end_of_sale_date",
}


def _parse_iso8601(value) -> datetime | None:
    """Convert ISO 8601 strings (or datetimes) into naive UTC datetimes."""

    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).replace(tzinfo=None) if value.tzinfo else value
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(raw)
        except ValueError:
            try:
                dt = datetime.strptime(raw, "%Y-%m-%d")
            except ValueError as exc2:
                raise ValueError from exc2
        return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt
    raise TypeError(f"Unsupported date value {value!r}")


def _coerce_date_fields(payload: dict) -> tuple[dict, dict[str, str]]:
    """Parse ISO 8601 strings into datetimes for known lifecycle date fields."""

    errors: dict[str, str] = {}
    for field in list(payload.keys()):
        if field not in _DATE_FIELDS:
            continue
        value = payload[field]
        if value in (None, ""):
            payload[field] = None
            continue
        try:
            payload[field] = _parse_iso8601(value)
        except (TypeError, ValueError):
            errors[field] = "Invalid ISO 8601 datetime"
    return payload, errors


@ns.route("")
class SoftwareList(Resource):
    """
    Resource: /eox_software
    -----------------------
    List and create software lifecycle rows.
    """

    @jwt_required()
    @ns.marshal_list_with(SoftwareOut)
    def get(self):
        """
        List software lifecycle rows.

        Query Parameters
        ----------------
        os_name : str
        platform_id : int
        match_operator : str

        Returns
        -------
        list[SoftwareLifecycleOut]
        """
        q = SoftwareLifecycle.query
        os_name = request.args.get("os_name")
        platform_id = request.args.get("platform_id", type=int)
        op = request.args.get("match_operator")

        if os_name:
            q = q.filter(SoftwareLifecycle.os_name.ilike(os_name))
        if platform_id is not None:
            q = q.filter(SoftwareLifecycle.platform_id == platform_id)
        if op:
            q = q.filter(SoftwareLifecycle.match_operator.ilike(op))

        return q.order_by(SoftwareLifecycle.os_name).all(), HTTPStatus.OK

    @jwt_required()
    @ns.expect(SoftwareIn, validate=True)
    @ns.marshal_with(SoftwareOut, code=HTTPStatus.CREATED)
    def post(self):
        """Create a software lifecycle row."""
        payload = request.get_json(force=True) or {}
        payload, errors = _coerce_date_fields(payload)
        if errors:
            return {"message": "Invalid date value", "errors": errors}, HTTPStatus.BAD_REQUEST
        pid = payload.get("platform_id")
        if pid:
            Platforms.query.get_or_404(pid)
        row = SoftwareLifecycle(**payload)
        db.session.add(row)
        db.session.commit()
        return row, HTTPStatus.CREATED


@ns.route("/<int:id>")
class SoftwareItem(Resource):
    """
    Resource: /eox_software/<id>
    ----------------------------
    Retrieve, update, or delete a software lifecycle row.
    """

    @jwt_required()
    @ns.marshal_with(SoftwareOut)
    def get(self, id: int):
        """Retrieve a lifecycle row by ID."""
        return SoftwareLifecycle.query.get_or_404(id), HTTPStatus.OK

    @jwt_required()
    @ns.expect(SoftwareIn, validate=False)
    @ns.marshal_with(SoftwareOut)
    def patch(self, id: int):
        """Partially update a lifecycle row."""
        row = SoftwareLifecycle.query.get_or_404(id)
        updates = request.get_json(force=True) or {}
        updates, errors = _coerce_date_fields(updates)
        if errors:
            return {"message": "Invalid date value", "errors": errors}, HTTPStatus.BAD_REQUEST
        for k, v in updates.items():
            setattr(row, k, v)
        db.session.commit()
        return row, HTTPStatus.OK

    @jwt_required()
    def delete(self, id: int):
        """Delete a lifecycle row."""
        row = SoftwareLifecycle.query.get_or_404(id)
        db.session.delete(row)
        db.session.commit()
        return {"message": "deleted"}, HTTPStatus.OK