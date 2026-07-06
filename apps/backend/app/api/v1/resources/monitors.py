"""Monitor REST API resources (Phase 6).

Endpoints
---------
GET  /monitors            List monitors (filter/sort/cursor pagination).
POST /monitors            Create a monitor; rejects mutating actions with 400.
GET  /monitors/alerts     Monitors with ``status='failing'`` (for AlertsPanel).
GET  /monitors/<id>       Retrieve one monitor.
PATCH /monitors/<id>      Update a monitor; re-validates action if changed.
DELETE /monitors/<id>     Delete a monitor.
POST /monitors/<id>/run   Enqueue an immediate run; returns 202 + job.
GET  /monitors/<id>/results
                          Paginated MonitorResults; query params ``device_id``,
                          ``from``, ``to``, ``limit`` (max 500).

IMPORTANT: The ``/monitors/alerts`` route is registered BEFORE
``/monitors/<id>`` so Flask-RESTX matches the literal path ``"alerts"``
correctly and does not treat it as an integer ``<id>``.
"""

from __future__ import annotations

from datetime import datetime, timezone

from flask import request
from flask_jwt_extended import get_jwt_identity, jwt_required
from flask_restx import Namespace, Resource, fields
from flask_restx._http import HTTPStatus

from app.extensions import db
from app.models import PlatformOperationTemplates
from app.models.monitor import MonitorResults, Monitors
from app.observability.activity import record_model_change, serialize_model_state
from app.services import jobs as jobs_service
from app.services import monitors as monitors_service

from ..utils import (
    apply_sorting,
    cursor_paginate,
    get_cursor_pagination,
    get_filter_args,
    problem_response,
    require_roles,
)

ns = Namespace("monitors", description="Read-only monitors and time-series results")

# ---------------------------------------------------------------------------
# Swagger models
# ---------------------------------------------------------------------------
MonitorIn = ns.model(
    "MonitorIn",
    {
        "name": fields.String(required=True, description="Monitor name"),
        "description": fields.String(required=False),
        "action_id": fields.Integer(required=True, description="FK to PlatformOperationTemplates.id (must be read-only)"),
        "target": fields.Raw(required=False, description='Target selector e.g. {"device_ids": [1]}'),
        "metric": fields.String(required=True, description="Output field name to track"),
        "comparator": fields.String(required=True, description="gt | lt | gte | lte | eq | ne"),
        "threshold": fields.Float(required=False, description="Threshold value; null = always passing when metric present"),
        "visibility": fields.String(required=False, description="private | shared"),
    },
)

MonitorUpdate = ns.clone("MonitorUpdate", MonitorIn, {
    "action_id": fields.Integer(required=False),
    "name": fields.String(required=False),
    "metric": fields.String(required=False),
    "comparator": fields.String(required=False),
})

MonitorOut = ns.model(
    "MonitorOut",
    {
        "id": fields.Integer(required=True),
        "uuid": fields.String(required=True),
        "name": fields.String(required=True),
        "description": fields.String,
        "action_id": fields.Integer,
        "target": fields.Raw,
        "metric": fields.String,
        "comparator": fields.String,
        "threshold": fields.Float,
        "status": fields.String,
        "visibility": fields.String,
        "owner_id": fields.Integer,
        "is_active": fields.Boolean,
        "created_at": fields.DateTime,
        "updated_at": fields.DateTime,
    },
)

MonitorCollection = ns.model(
    "MonitorCollection",
    {
        "data": fields.List(fields.Nested(MonitorOut), required=True),
        "page": fields.Raw(required=True),
    },
)

MonitorResultOut = ns.model(
    "MonitorResultOut",
    {
        "id": fields.Integer(required=True),
        "monitor_id": fields.Integer(required=True),
        "device_id": fields.Integer,
        "observed_at": fields.DateTime(required=True),
        "value": fields.Float,
        "status": fields.String(required=True),
        "payload": fields.Raw,
    },
)

MonitorResultsCollection = ns.model(
    "MonitorResultsCollection",
    {
        "data": fields.List(fields.Nested(MonitorResultOut), required=True),
        "total": fields.Integer,
    },
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_VALID_COMPARATORS = frozenset({"gt", "lt", "gte", "lte", "eq", "ne"})
_VALID_VISIBILITY = frozenset({"private", "shared"})
_AUDIT_EXCLUDE = {"uuid"}
_MAX_RESULTS_LIMIT = 500


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _current_user_id() -> int | None:
    identity = get_jwt_identity()
    if identity is None:
        return None
    try:
        return int(identity)
    except (TypeError, ValueError):
        return None


def _dt(value) -> str | None:
    return value.isoformat() if value is not None else None


def _serialize(monitor: Monitors) -> dict:
    return {
        "id": monitor.id,
        "uuid": str(monitor.uuid),
        "name": monitor.name,
        "description": monitor.description,
        "action_id": monitor.action_id,
        "target": monitor.target or {},
        "metric": monitor.metric,
        "comparator": monitor.comparator,
        "threshold": monitor.threshold,
        "status": monitor.status,
        "visibility": monitor.visibility,
        "owner_id": monitor.owner_id,
        "is_active": monitor.is_active,
        "created_at": _dt(monitor.created_at),
        "updated_at": _dt(monitor.updated_at),
    }


def _serialize_result(r: MonitorResults) -> dict:
    return {
        "id": r.id,
        "monitor_id": r.monitor_id,
        "device_id": r.device_id,
        "observed_at": _dt(r.observed_at),
        "value": r.value,
        "status": r.status,
        "payload": r.payload or {},
    }


def _parse_dt(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def _validate_and_get_action(action_id) -> tuple[PlatformOperationTemplates | None, str | None]:
    """Load and validate an action; return (action, error_message)."""
    if not action_id:
        return None, "action_id is required"
    action = db.session.get(PlatformOperationTemplates, int(action_id))
    if action is None:
        return None, f"action_id {action_id} not found"
    try:
        monitors_service.validate_monitor(action)
    except ValueError as exc:
        return None, str(exc)
    return action, None


# ---------------------------------------------------------------------------
# /monitors/alerts  (MUST be registered before /monitors/<id>)
# ---------------------------------------------------------------------------
@ns.route("/alerts")
class MonitorAlerts(Resource):
    """Return monitors whose aggregated status is 'failing' (for the AlertsPanel)."""

    @jwt_required()
    @require_roles("network_admin")
    def get(self):
        rows = (
            Monitors.query
            .filter(Monitors.status == "failing")
            .order_by(Monitors.updated_at.desc())
            .all()
        )
        return {"data": [_serialize(r) for r in rows], "total": len(rows)}


# ---------------------------------------------------------------------------
# /monitors  (list + create)
# ---------------------------------------------------------------------------
@ns.route("")
class MonitorList(Resource):
    """List all monitors or create a new one."""

    @jwt_required()
    @require_roles("network_admin")
    def get(self):
        filters = get_filter_args(
            {"name", "visibility", "action_id", "owner_id", "status"},
            legacy={
                "name": "name",
                "visibility": "visibility",
                "action_id": "action_id",
                "owner_id": "owner_id",
                "status": "status",
            },
        )
        query = Monitors.query

        if name := filters.get("name"):
            query = query.filter(Monitors.name.ilike(f"%{name}%"))
        if visibility := filters.get("visibility"):
            query = query.filter(Monitors.visibility == visibility)
        if action_id := filters.get("action_id"):
            if str(action_id).isdigit():
                query = query.filter(Monitors.action_id == int(action_id))
        if owner_id := filters.get("owner_id"):
            if str(owner_id).isdigit():
                query = query.filter(Monitors.owner_id == int(owner_id))
        if status := filters.get("status"):
            query = query.filter(Monitors.status == status)

        query = apply_sorting(
            query,
            Monitors,
            default="-id",
            allowed={"id", "name", "action_id", "visibility", "status", "created_at", "updated_at"},
        )

        cursor, size = get_cursor_pagination()
        payload = cursor_paginate(query, cursor=cursor, size=size)
        return {"data": [_serialize(row) for row in payload["data"]], "page": payload["page"]}

    @jwt_required()
    @require_roles("network_admin")
    @ns.expect(MonitorIn, validate=False)
    @ns.doc(responses={201: "Created", 400: "Validation error"})
    def post(self):
        payload = request.get_json(silent=True) or {}

        name = (payload.get("name") or "").strip()
        if not name:
            return problem_response(HTTPStatus.BAD_REQUEST, detail="name is required")

        metric = (payload.get("metric") or "").strip()
        if not metric:
            return problem_response(HTTPStatus.BAD_REQUEST, detail="metric is required")

        comparator = (payload.get("comparator") or "").strip()
        if comparator not in _VALID_COMPARATORS:
            return problem_response(
                HTTPStatus.BAD_REQUEST,
                detail=f"comparator must be one of {sorted(_VALID_COMPARATORS)}",
            )

        action, err = _validate_and_get_action(payload.get("action_id"))
        if err:
            return problem_response(HTTPStatus.BAD_REQUEST, detail=err)

        visibility = payload.get("visibility") or "private"
        if visibility not in _VALID_VISIBILITY:
            return problem_response(
                HTTPStatus.BAD_REQUEST,
                detail=f"visibility must be one of {sorted(_VALID_VISIBILITY)}",
            )

        threshold_raw = payload.get("threshold")
        threshold: float | None = None
        if threshold_raw is not None:
            try:
                threshold = float(threshold_raw)
            except (TypeError, ValueError):
                return problem_response(HTTPStatus.BAD_REQUEST, detail="threshold must be a number")

        row = Monitors(
            name=name,
            description=payload.get("description"),
            action_id=action.id,
            target=payload.get("target") or {},
            metric=metric,
            comparator=comparator,
            threshold=threshold,
            visibility=visibility,
            owner_id=_current_user_id(),
        )
        db.session.add(row)
        db.session.flush()

        record_model_change(
            action="monitor.create",
            target_type="monitor",
            target=row,
            before=None,
            after=serialize_model_state(row, exclude=_AUDIT_EXCLUDE),
            message=f"Created monitor {row.name}",
        )
        db.session.commit()
        db.session.refresh(row)
        return _serialize(row), HTTPStatus.CREATED


# ---------------------------------------------------------------------------
# /monitors/<id>  (retrieve, update, delete)
# ---------------------------------------------------------------------------
@ns.route("/<int:id>")
class MonitorItem(Resource):
    """Retrieve, update, or delete a monitor."""

    @jwt_required()
    @require_roles("network_admin")
    def get(self, id: int):
        row = db.session.get(Monitors, id)
        if row is None:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Monitor not found")
        return _serialize(row)

    @jwt_required()
    @require_roles("network_admin")
    @ns.expect(MonitorUpdate, validate=False)
    @ns.doc(responses={200: "Updated", 400: "Validation error", 404: "Not found"})
    def patch(self, id: int):
        row = db.session.get(Monitors, id)
        if row is None:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Monitor not found")

        payload = request.get_json(silent=True) or {}
        before = serialize_model_state(row, exclude=_AUDIT_EXCLUDE)

        if "action_id" in payload and payload["action_id"] is not None:
            action, err = _validate_and_get_action(payload["action_id"])
            if err:
                return problem_response(HTTPStatus.BAD_REQUEST, detail=err)
            row.action_id = action.id

        if "comparator" in payload:
            if payload["comparator"] not in _VALID_COMPARATORS:
                return problem_response(
                    HTTPStatus.BAD_REQUEST,
                    detail=f"comparator must be one of {sorted(_VALID_COMPARATORS)}",
                )

        if "visibility" in payload:
            if payload["visibility"] not in _VALID_VISIBILITY:
                return problem_response(
                    HTTPStatus.BAD_REQUEST,
                    detail=f"visibility must be one of {sorted(_VALID_VISIBILITY)}",
                )

        if "threshold" in payload and payload["threshold"] is not None:
            try:
                payload["threshold"] = float(payload["threshold"])
            except (TypeError, ValueError):
                return problem_response(HTTPStatus.BAD_REQUEST, detail="threshold must be a number")

        for key in ("name", "description", "target", "metric", "comparator", "threshold", "visibility"):
            if key in payload:
                setattr(row, key, payload[key])

        db.session.flush()
        record_model_change(
            action="monitor.update",
            target_type="monitor",
            target=row,
            before=before,
            after=serialize_model_state(row, exclude=_AUDIT_EXCLUDE),
            message=f"Updated monitor {row.name}",
        )
        db.session.commit()
        db.session.refresh(row)
        return _serialize(row)

    @jwt_required()
    @require_roles("network_admin")
    def delete(self, id: int):
        row = db.session.get(Monitors, id)
        if row is None:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Monitor not found")

        before = serialize_model_state(row, exclude=_AUDIT_EXCLUDE)
        record_model_change(
            action="monitor.delete",
            target_type="monitor",
            target=row,
            before=before,
            after=None,
            message=f"Deleted monitor {row.name}",
        )
        db.session.delete(row)
        db.session.commit()
        return {"message": "deleted"}, HTTPStatus.OK


# ---------------------------------------------------------------------------
# /monitors/<id>/run  (enqueue)
# ---------------------------------------------------------------------------
@ns.route("/<int:id>/run")
class MonitorRun(Resource):
    """Enqueue an immediate run of the monitor; returns 202 + job."""

    @jwt_required()
    @require_roles("network_admin")
    def post(self, id: int):
        row = db.session.get(Monitors, id)
        if row is None:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Monitor not found")
        if not row.is_active:
            return problem_response(HTTPStatus.BAD_REQUEST, detail="Monitor is disabled")

        job = monitors_service.run_monitor(row, owner_id=_current_user_id())
        headers = {"Location": jobs_service.job_location(job)}
        return (
            {"status": "queued", "job": jobs_service.serialize_job(job)},
            HTTPStatus.ACCEPTED,
            headers,
        )


# ---------------------------------------------------------------------------
# /monitors/<id>/results  (time-series query)
# ---------------------------------------------------------------------------
@ns.route("/<int:id>/results")
class MonitorResultsList(Resource):
    """Return paginated time-series results for a monitor."""

    @jwt_required()
    @require_roles("network_admin")
    def get(self, id: int):
        row = db.session.get(Monitors, id)
        if row is None:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Monitor not found")

        device_id_raw = request.args.get("device_id")
        device_id: int | None = None
        if device_id_raw:
            try:
                device_id = int(device_id_raw)
            except ValueError:
                return problem_response(HTTPStatus.BAD_REQUEST, detail="device_id must be an integer")

        from_dt = _parse_dt(request.args.get("from"))
        to_dt = _parse_dt(request.args.get("to"))

        limit_raw = request.args.get("limit", "200")
        try:
            limit = min(int(limit_raw), _MAX_RESULTS_LIMIT)
        except (TypeError, ValueError):
            limit = 200

        results = monitors_service.get_monitor_results(
            id,
            device_id=device_id,
            from_dt=from_dt,
            to_dt=to_dt,
            limit=limit,
        )
        return {"data": [_serialize_result(r) for r in results], "total": len(results)}
