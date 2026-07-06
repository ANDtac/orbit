"""Dashboard REST API resources (Phase 7).

Endpoints
---------
GET  /dashboards/pinned          List dashboards pinned by the current user.
GET  /dashboards                 List dashboards (own + shared).
POST /dashboards                 Create a dashboard.
GET  /dashboards/<id>            Retrieve one dashboard (with panels + is_pinned).
PATCH /dashboards/<id>           Update a dashboard.
DELETE /dashboards/<id>          Delete a dashboard.
POST /dashboards/<id>/pin        Pin a dashboard (idempotent).
DELETE /dashboards/<id>/pin      Unpin a dashboard.
GET  /dashboards/<id>/panels     List panels for a dashboard.
POST /dashboards/<id>/panels     Add a panel to a dashboard.
PATCH /dashboards/<id>/panels/<panel_id>   Update a panel.
DELETE /dashboards/<id>/panels/<panel_id>  Delete a panel.
GET  /dashboards/<id>/panels/<panel_id>/data
                                 Return last N MonitorResults for the panel's
                                 monitor; query params ``from``, ``to``,
                                 ``device_id``, ``limit`` (default 50, max 200).

IMPORTANT: ``/dashboards/pinned`` is registered BEFORE ``/dashboards/<id>``
to avoid Flask-RESTX matching the literal path ``"pinned"`` as an integer id.
"""

from __future__ import annotations

from datetime import datetime, timezone

from flask import request
from flask_jwt_extended import get_jwt_identity, jwt_required
from flask_restx import Namespace, Resource, fields
from flask_restx._http import HTTPStatus

from app.extensions import db
from app.models.dashboard import DashboardPanels, Dashboards, UserPinnedDashboards
from app.models.monitor import MonitorResults, Monitors
from app.observability.activity import record_model_change, serialize_model_state
from app.services import monitors as monitors_service

from ..utils import (
    apply_sorting,
    cursor_paginate,
    get_cursor_pagination,
    get_filter_args,
    problem_response,
    require_roles,
)

ns = Namespace("dashboards", description="Dashboards and monitoring panels")

# ---------------------------------------------------------------------------
# Swagger models
# ---------------------------------------------------------------------------
PanelOut = ns.model(
    "PanelOut",
    {
        "id": fields.Integer(required=True),
        "uuid": fields.String(required=True),
        "dashboard_id": fields.Integer(required=True),
        "monitor_id": fields.Integer,
        "title": fields.String,
        "viz_type": fields.String,
        "position": fields.Raw,
        "config": fields.Raw,
        "created_at": fields.DateTime,
        "updated_at": fields.DateTime,
    },
)

DashboardOut = ns.model(
    "DashboardOut",
    {
        "id": fields.Integer(required=True),
        "uuid": fields.String(required=True),
        "name": fields.String(required=True),
        "description": fields.String,
        "visibility": fields.String,
        "layout": fields.Raw,
        "owner_id": fields.Integer,
        "is_pinned": fields.Boolean,
        "panels": fields.List(fields.Nested(PanelOut)),
        "created_at": fields.DateTime,
        "updated_at": fields.DateTime,
    },
)

DashboardIn = ns.model(
    "DashboardIn",
    {
        "name": fields.String(required=True),
        "description": fields.String(required=False),
        "visibility": fields.String(required=False, description="private | shared | role"),
        "layout": fields.Raw(required=False),
    },
)

DashboardUpdate = ns.clone(
    "DashboardUpdate",
    DashboardIn,
    {"name": fields.String(required=False)},
)

PanelIn = ns.model(
    "PanelIn",
    {
        "monitor_id": fields.Integer(required=False),
        "title": fields.String(required=False),
        "viz_type": fields.String(required=False, description="timechart | stat | statusgrid | table"),
        "position": fields.Raw(required=False, description="{col, row, w, h}"),
        "config": fields.Raw(required=False),
    },
)

PanelUpdate = ns.clone("PanelUpdate", PanelIn)

MonitorResultOut = ns.model(
    "PanelMonitorResultOut",
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

PanelDataOut = ns.model(
    "PanelDataOut",
    {
        "panel_id": fields.Integer(required=True),
        "monitor_id": fields.Integer,
        "data": fields.List(fields.Nested(MonitorResultOut), required=True),
        "total": fields.Integer,
    },
)

DashboardCollection = ns.model(
    "DashboardCollection",
    {
        "data": fields.List(fields.Nested(DashboardOut), required=True),
        "page": fields.Raw(required=True),
    },
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_VALID_VISIBILITY = frozenset({"private", "shared", "role"})
_VALID_VIZ_TYPES = frozenset({"timechart", "stat", "statusgrid", "table"})
_AUDIT_EXCLUDE = {"uuid"}
_MAX_PANEL_DATA_LIMIT = 200


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


def _serialize_panel(panel: DashboardPanels) -> dict:
    return {
        "id": panel.id,
        "uuid": str(panel.uuid),
        "dashboard_id": panel.dashboard_id,
        "monitor_id": panel.monitor_id,
        "title": panel.title,
        "viz_type": panel.viz_type,
        "position": panel.position or {},
        "config": panel.config or {},
        "created_at": _dt(panel.created_at),
        "updated_at": _dt(panel.updated_at),
    }


def _serialize_dashboard(
    dashboard: Dashboards,
    *,
    current_user_id: int | None = None,
    is_pinned: bool | None = None,
) -> dict:
    if is_pinned is None:
        is_pinned = False
        if current_user_id is not None:
            is_pinned = UserPinnedDashboards.query.filter_by(
                user_id=current_user_id,
                dashboard_id=dashboard.id,
            ).first() is not None

    return {
        "id": dashboard.id,
        "uuid": str(dashboard.uuid),
        "name": dashboard.name,
        "description": dashboard.description,
        "visibility": dashboard.visibility,
        "layout": dashboard.layout or {},
        "owner_id": dashboard.owner_id,
        "is_pinned": is_pinned,
        "panels": [_serialize_panel(p) for p in (dashboard.panels or [])],
        "created_at": _dt(dashboard.created_at),
        "updated_at": _dt(dashboard.updated_at),
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


def _get_dashboard_or_404(dashboard_id: int) -> Dashboards | None:
    return db.session.get(Dashboards, dashboard_id)


# ---------------------------------------------------------------------------
# /dashboards/pinned  (MUST be registered before /dashboards/<id>)
# ---------------------------------------------------------------------------
@ns.route("/pinned")
class DashboardPinnedList(Resource):
    """Return dashboards pinned by the current user."""

    @jwt_required()
    @require_roles("network_admin")
    def get(self):
        uid = _current_user_id()
        if uid is None:
            return problem_response(HTTPStatus.UNAUTHORIZED, detail="Cannot determine user identity")

        pins = (
            UserPinnedDashboards.query
            .filter_by(user_id=uid)
            .order_by(UserPinnedDashboards.pinned_at.desc())
            .all()
        )
        pin_ids = [p.dashboard_id for p in pins]
        if not pin_ids:
            return {"data": [], "total": 0}
        dashboards = Dashboards.query.filter(Dashboards.id.in_(pin_ids)).all()
        return {
            "data": [_serialize_dashboard(d, current_user_id=uid, is_pinned=True) for d in dashboards],
            "total": len(dashboards),
        }


# ---------------------------------------------------------------------------
# /dashboards  (list + create)
# ---------------------------------------------------------------------------
@ns.route("")
class DashboardList(Resource):
    """List dashboards visible to the current user, or create a new one."""

    @jwt_required()
    @require_roles("network_admin")
    def get(self):
        uid = _current_user_id()

        filters = get_filter_args(
            {"name", "visibility", "owner_id"},
            legacy={"name": "name", "visibility": "visibility", "owner_id": "owner_id"},
        )

        # The list returns dashboards the user owns OR that are "shared".
        from sqlalchemy import or_
        query = Dashboards.query.filter(
            or_(
                Dashboards.owner_id == uid,
                Dashboards.visibility == "shared",
            )
        )

        if name := filters.get("name"):
            query = query.filter(Dashboards.name.ilike(f"%{name}%"))
        if visibility := filters.get("visibility"):
            query = query.filter(Dashboards.visibility == visibility)
        if owner_id := filters.get("owner_id"):
            if str(owner_id).isdigit():
                query = query.filter(Dashboards.owner_id == int(owner_id))

        query = apply_sorting(
            query,
            Dashboards,
            default="-id",
            allowed={"id", "name", "visibility", "owner_id", "created_at", "updated_at"},
        )

        cursor, size = get_cursor_pagination()
        payload = cursor_paginate(query, cursor=cursor, size=size)

        # Batch-load pinned dashboard ids to avoid N+1 queries.
        pinned_ids: set[int] = set()
        if uid is not None:
            pinned_ids = {
                p.dashboard_id
                for p in UserPinnedDashboards.query.filter_by(user_id=uid).all()
            }

        return {
            "data": [
                _serialize_dashboard(row, current_user_id=uid, is_pinned=row.id in pinned_ids)
                for row in payload["data"]
            ],
            "page": payload["page"],
        }

    @jwt_required()
    @require_roles("network_admin")
    @ns.expect(DashboardIn, validate=False)
    @ns.doc(responses={201: "Created", 400: "Validation error"})
    def post(self):
        payload = request.get_json(silent=True) or {}
        uid = _current_user_id()

        name = (payload.get("name") or "").strip()
        if not name:
            return problem_response(HTTPStatus.BAD_REQUEST, detail="name is required")

        visibility = payload.get("visibility") or "private"
        if visibility not in _VALID_VISIBILITY:
            return problem_response(
                HTTPStatus.BAD_REQUEST,
                detail=f"visibility must be one of {sorted(_VALID_VISIBILITY)}",
            )

        row = Dashboards(
            name=name,
            description=payload.get("description"),
            visibility=visibility,
            layout=payload.get("layout") or {},
            owner_id=uid,
        )
        db.session.add(row)
        db.session.flush()

        record_model_change(
            action="dashboard.create",
            target_type="dashboard",
            target=row,
            before=None,
            after=serialize_model_state(row, exclude=_AUDIT_EXCLUDE),
            message=f"Created dashboard {row.name}",
        )
        db.session.commit()
        db.session.refresh(row)
        return _serialize_dashboard(row, current_user_id=uid), HTTPStatus.CREATED


# ---------------------------------------------------------------------------
# /dashboards/<id>  (retrieve, update, delete)
# ---------------------------------------------------------------------------
@ns.route("/<int:id>")
class DashboardItem(Resource):
    """Retrieve, update, or delete a dashboard."""

    @jwt_required()
    @require_roles("network_admin")
    def get(self, id: int):
        row = _get_dashboard_or_404(id)
        if row is None:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Dashboard not found")
        uid = _current_user_id()
        return _serialize_dashboard(row, current_user_id=uid)

    @jwt_required()
    @require_roles("network_admin")
    @ns.expect(DashboardUpdate, validate=False)
    @ns.doc(responses={200: "Updated", 400: "Validation error", 404: "Not found"})
    def patch(self, id: int):
        row = _get_dashboard_or_404(id)
        if row is None:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Dashboard not found")

        payload = request.get_json(silent=True) or {}
        before = serialize_model_state(row, exclude=_AUDIT_EXCLUDE)

        if "visibility" in payload and payload["visibility"] not in _VALID_VISIBILITY:
            return problem_response(
                HTTPStatus.BAD_REQUEST,
                detail=f"visibility must be one of {sorted(_VALID_VISIBILITY)}",
            )

        for key in ("name", "description", "visibility", "layout"):
            if key in payload:
                setattr(row, key, payload[key])

        db.session.flush()
        record_model_change(
            action="dashboard.update",
            target_type="dashboard",
            target=row,
            before=before,
            after=serialize_model_state(row, exclude=_AUDIT_EXCLUDE),
            message=f"Updated dashboard {row.name}",
        )
        db.session.commit()
        db.session.refresh(row)
        return _serialize_dashboard(row, current_user_id=_current_user_id())

    @jwt_required()
    @require_roles("network_admin")
    def delete(self, id: int):
        row = _get_dashboard_or_404(id)
        if row is None:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Dashboard not found")

        before = serialize_model_state(row, exclude=_AUDIT_EXCLUDE)
        record_model_change(
            action="dashboard.delete",
            target_type="dashboard",
            target=row,
            before=before,
            after=None,
            message=f"Deleted dashboard {row.name}",
        )
        db.session.delete(row)
        db.session.commit()
        return {"message": "deleted"}, HTTPStatus.OK


# ---------------------------------------------------------------------------
# /dashboards/<id>/pin  (pin / unpin)
# ---------------------------------------------------------------------------
@ns.route("/<int:id>/pin")
class DashboardPin(Resource):
    """Pin or unpin a dashboard for the current user."""

    @jwt_required()
    def post(self, id: int):
        row = _get_dashboard_or_404(id)
        if row is None:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Dashboard not found")

        uid = _current_user_id()
        if uid is None:
            return problem_response(HTTPStatus.UNAUTHORIZED, detail="Cannot determine user identity")

        existing = UserPinnedDashboards.query.filter_by(
            user_id=uid, dashboard_id=id
        ).first()
        if existing is not None:
            return {"message": "already pinned", "dashboard_id": id}, HTTPStatus.OK

        pin = UserPinnedDashboards(user_id=uid, dashboard_id=id)
        db.session.add(pin)
        db.session.commit()
        return {"message": "pinned", "dashboard_id": id}, HTTPStatus.OK

    @jwt_required()
    def delete(self, id: int):
        row = _get_dashboard_or_404(id)
        if row is None:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Dashboard not found")

        uid = _current_user_id()
        if uid is None:
            return problem_response(HTTPStatus.UNAUTHORIZED, detail="Cannot determine user identity")

        existing = UserPinnedDashboards.query.filter_by(
            user_id=uid, dashboard_id=id
        ).first()
        if existing is None:
            return {"message": "not pinned"}, HTTPStatus.OK

        db.session.delete(existing)
        db.session.commit()
        return {"message": "unpinned", "dashboard_id": id}, HTTPStatus.OK


# ---------------------------------------------------------------------------
# /dashboards/<id>/panels  (list + create)
# ---------------------------------------------------------------------------
@ns.route("/<int:id>/panels")
class DashboardPanelList(Resource):
    """List or create panels for a dashboard."""

    @jwt_required()
    @require_roles("network_admin")
    def get(self, id: int):
        row = _get_dashboard_or_404(id)
        if row is None:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Dashboard not found")

        panels = (
            DashboardPanels.query
            .filter_by(dashboard_id=id)
            .order_by(DashboardPanels.id)
            .all()
        )
        return {"data": [_serialize_panel(p) for p in panels], "total": len(panels)}

    @jwt_required()
    @require_roles("network_admin")
    @ns.expect(PanelIn, validate=False)
    @ns.doc(responses={201: "Created", 400: "Validation error", 404: "Dashboard not found"})
    def post(self, id: int):
        row = _get_dashboard_or_404(id)
        if row is None:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Dashboard not found")

        payload = request.get_json(silent=True) or {}

        monitor_id_raw = payload.get("monitor_id")
        monitor_id: int | None = None
        if monitor_id_raw is not None:
            try:
                monitor_id = int(monitor_id_raw)
            except (TypeError, ValueError):
                return problem_response(HTTPStatus.BAD_REQUEST, detail="monitor_id must be an integer")
            monitor = db.session.get(Monitors, monitor_id)
            if monitor is None:
                return problem_response(
                    HTTPStatus.BAD_REQUEST,
                    detail=f"monitor_id {monitor_id} not found",
                )

        viz_type = payload.get("viz_type") or "timechart"
        if viz_type not in _VALID_VIZ_TYPES:
            return problem_response(
                HTTPStatus.BAD_REQUEST,
                detail=f"viz_type must be one of {sorted(_VALID_VIZ_TYPES)}",
            )

        panel = DashboardPanels(
            dashboard_id=id,
            monitor_id=monitor_id,
            title=payload.get("title"),
            viz_type=viz_type,
            position=payload.get("position") or {},
            config=payload.get("config") or {},
        )
        db.session.add(panel)
        db.session.commit()
        db.session.refresh(panel)
        return _serialize_panel(panel), HTTPStatus.CREATED


# ---------------------------------------------------------------------------
# /dashboards/<id>/panels/<panel_id>  (update + delete)
# ---------------------------------------------------------------------------
@ns.route("/<int:id>/panels/<int:panel_id>")
class DashboardPanelItem(Resource):
    """Update or delete a single panel."""

    def _get_panel(self, id: int, panel_id: int):
        row = _get_dashboard_or_404(id)
        if row is None:
            return None, problem_response(HTTPStatus.NOT_FOUND, detail="Dashboard not found")
        panel = db.session.get(DashboardPanels, panel_id)
        if panel is None or panel.dashboard_id != id:
            return None, problem_response(HTTPStatus.NOT_FOUND, detail="Panel not found")
        return panel, None

    @jwt_required()
    @require_roles("network_admin")
    @ns.expect(PanelUpdate, validate=False)
    @ns.doc(responses={200: "Updated", 400: "Validation error", 404: "Not found"})
    def patch(self, id: int, panel_id: int):
        panel, err = self._get_panel(id, panel_id)
        if err:
            return err

        payload = request.get_json(silent=True) or {}

        if "monitor_id" in payload and payload["monitor_id"] is not None:
            try:
                mid = int(payload["monitor_id"])
            except (TypeError, ValueError):
                return problem_response(HTTPStatus.BAD_REQUEST, detail="monitor_id must be an integer")
            if db.session.get(Monitors, mid) is None:
                return problem_response(
                    HTTPStatus.BAD_REQUEST,
                    detail=f"monitor_id {mid} not found",
                )
            panel.monitor_id = mid
        elif "monitor_id" in payload and payload["monitor_id"] is None:
            panel.monitor_id = None

        if "viz_type" in payload:
            if payload["viz_type"] not in _VALID_VIZ_TYPES:
                return problem_response(
                    HTTPStatus.BAD_REQUEST,
                    detail=f"viz_type must be one of {sorted(_VALID_VIZ_TYPES)}",
                )
            panel.viz_type = payload["viz_type"]

        for key in ("title", "position", "config"):
            if key in payload:
                setattr(panel, key, payload[key])

        db.session.commit()
        db.session.refresh(panel)
        return _serialize_panel(panel)

    @jwt_required()
    @require_roles("network_admin")
    def delete(self, id: int, panel_id: int):
        panel, err = self._get_panel(id, panel_id)
        if err:
            return err

        db.session.delete(panel)
        db.session.commit()
        return {"message": "deleted"}, HTTPStatus.OK


# ---------------------------------------------------------------------------
# /dashboards/<id>/panels/<panel_id>/data  (monitor results for a panel)
# ---------------------------------------------------------------------------
@ns.route("/<int:id>/panels/<int:panel_id>/data")
class DashboardPanelData(Resource):
    """Return the last N MonitorResults for the panel's monitor."""

    @jwt_required()
    @require_roles("network_admin")
    def get(self, id: int, panel_id: int):
        dashboard = _get_dashboard_or_404(id)
        if dashboard is None:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Dashboard not found")

        panel = db.session.get(DashboardPanels, panel_id)
        if panel is None or panel.dashboard_id != id:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Panel not found")

        if panel.monitor_id is None:
            return {"panel_id": panel_id, "monitor_id": None, "data": [], "total": 0}

        # Parse query params
        device_id_raw = request.args.get("device_id")
        device_id: int | None = None
        if device_id_raw:
            try:
                device_id = int(device_id_raw)
            except ValueError:
                return problem_response(HTTPStatus.BAD_REQUEST, detail="device_id must be an integer")

        from_dt = _parse_dt(request.args.get("from"))
        to_dt = _parse_dt(request.args.get("to"))

        limit_raw = request.args.get("limit", "50")
        try:
            limit = min(int(limit_raw), _MAX_PANEL_DATA_LIMIT)
        except (TypeError, ValueError):
            limit = 50

        results = monitors_service.get_monitor_results(
            panel.monitor_id,
            device_id=device_id,
            from_dt=from_dt,
            to_dt=to_dt,
            limit=limit,
        )
        return {
            "panel_id": panel_id,
            "monitor_id": panel.monitor_id,
            "data": [_serialize_result(r) for r in results],
            "total": len(results),
        }
