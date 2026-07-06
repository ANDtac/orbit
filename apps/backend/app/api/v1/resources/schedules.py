"""Schedules API resource (Phase 4).

Exposes CRUD for :class:`~app.models.schedule.Schedules` plus a
``fire-now`` action endpoint:

* ``GET  /schedules``          -- paginated list with filter/sort.
* ``POST /schedules``          -- create; accepts a ``preset`` field that is
                                  converted to a cron expression before storage.
* ``GET  /schedules/<id>``     -- retrieve single row.
* ``PATCH /schedules/<id>``    -- update (partial).
* ``DELETE /schedules/<id>``   -- delete.
* ``POST /schedules/<id>/fire-now`` -- immediately fire the schedule (enqueues
                                  a job and advances ``next_run``).

Preset → cron mapping
---------------------
Users never need to write raw cron strings.  The API accepts a ``preset``
field whose value is one of:

    every_5m   → */5 * * * *
    every_15m  → */15 * * * *
    every_30m  → */30 * * * *
    hourly     → 0 * * * *
    daily      → 0 0 * * *
    weekly     → 0 0 * * 0

Raw ``cron_expr`` values are also accepted and validated via ``croniter``.
"""

from __future__ import annotations

from flask import request
from flask_restx import Namespace, Resource, fields
from flask_restx._http import HTTPStatus
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.extensions import db
from app.models import Automations
from app.models.schedule import Schedules
from app.observability.activity import record_model_change, serialize_model_state
from app.services import jobs as jobs_service
from app.services.scheduler import (
    PRESET_CRON,
    advance_next_run,
    fire_schedule,
)
from ..utils import (
    apply_sorting,
    cursor_paginate,
    get_cursor_pagination,
    get_filter_args,
    problem_response,
    require_roles,
)

ns = Namespace("schedules", description="Recurrence schedules for automations")

# ---------------------------------------------------------------------------
# Swagger models
# ---------------------------------------------------------------------------
_PRESET_CHOICES = list(PRESET_CRON.keys())

ScheduleCreate = ns.model(
    "ScheduleCreate",
    {
        "name": fields.String(required=False, description="Optional label"),
        "target_type": fields.String(required=True, description="automation | monitor"),
        "target_id": fields.Integer(required=True, description="PK of the target row"),
        "preset": fields.String(
            required=False,
            description=f"Convenience preset ({', '.join(_PRESET_CHOICES)}). "
                        "Ignored when cron_expr is provided.",
        ),
        "cron_expr": fields.String(
            required=False,
            description="Standard 5-field cron string (overrides preset).",
        ),
        "timezone": fields.String(required=False, description="IANA timezone (default UTC)"),
        "enabled": fields.Boolean(required=False, description="Active flag (default True)"),
    },
)

ScheduleUpdate = ns.clone("ScheduleUpdate", ScheduleCreate, {})

ScheduleOut = ns.model(
    "ScheduleOut",
    {
        "id": fields.Integer(required=True),
        "uuid": fields.String(required=True),
        "name": fields.String,
        "target_type": fields.String,
        "target_id": fields.Integer,
        "cron_expr": fields.String,
        "next_run": fields.DateTime,
        "last_run": fields.DateTime,
        "last_job_id": fields.Integer,
        "enabled": fields.Boolean,
        "timezone": fields.String,
        "owner_id": fields.Integer,
        "is_active": fields.Boolean,
        "created_at": fields.DateTime,
        "updated_at": fields.DateTime,
    },
)

ScheduleCollection = ns.model(
    "ScheduleCollection",
    {
        "data": fields.List(fields.Nested(ScheduleOut), required=True),
        "page": fields.Raw(required=True),
    },
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
_ALLOWED_TARGET_TYPES = {"automation", "monitor"}
_AUDIT_EXCLUDE = {"uuid"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _current_user_id() -> int | None:
    identity = get_jwt_identity()
    if identity is None:
        return None
    try:
        return int(identity)
    except (TypeError, ValueError):  # pragma: no cover
        return None


def _serialize(row: Schedules) -> dict:
    def _dt(value):
        return value.isoformat() if value is not None else None

    return {
        "id": row.id,
        "uuid": str(row.uuid),
        "name": row.name,
        "target_type": row.target_type,
        "target_id": row.target_id,
        "cron_expr": row.cron_expr,
        "next_run": _dt(row.next_run),
        "last_run": _dt(row.last_run),
        "last_job_id": row.last_job_id,
        "enabled": bool(row.enabled),
        "timezone": row.timezone,
        "owner_id": row.owner_id,
        "is_active": row.is_active,
        "created_at": _dt(row.created_at),
        "updated_at": _dt(row.updated_at),
    }


def _resolve_cron(payload: dict) -> str | None:
    """Extract a cron string from ``cron_expr`` or ``preset`` in *payload*.

    Returns ``None`` when neither is provided.  Raises ``ValueError`` when
    the supplied value is not parseable by croniter.
    """
    from croniter import croniter as CronIter

    raw_expr = (payload.get("cron_expr") or "").strip()
    if not raw_expr:
        preset = (payload.get("preset") or "").strip().lower()
        raw_expr = PRESET_CRON.get(preset, "")

    if not raw_expr:
        return None

    if not CronIter.is_valid(raw_expr):
        raise ValueError(
            f"Invalid cron expression {raw_expr!r}. "
            f"Available presets: {', '.join(PRESET_CRON.keys())}"
        )
    return raw_expr


def _validate_target(target_type: str, target_id: int) -> str | None:
    """Return an error string if the target is unknown, else ``None``."""

    if target_type == "automation":
        row = db.session.get(Automations, target_id)
        if row is None:
            return f"automation with id={target_id} not found"
    # monitor target types are validated in Phase 6
    return None


# ---------------------------------------------------------------------------
# List + create
# ---------------------------------------------------------------------------
@ns.route("")
class ScheduleList(Resource):
    """List or create schedules."""

    @jwt_required()
    @require_roles("network_admin")
    @ns.marshal_with(ScheduleCollection, code=HTTPStatus.OK)
    def get(self):
        filters = get_filter_args(
            {"target_type", "target_id", "enabled", "owner_id"},
            legacy={
                "target_type": "target_type",
                "target_id": "target_id",
                "enabled": "enabled",
                "owner_id": "owner_id",
            },
        )
        query = Schedules.query

        if target_type := filters.get("target_type"):
            query = query.filter(Schedules.target_type == target_type)
        if target_id := filters.get("target_id"):
            if str(target_id).isdigit():
                query = query.filter(Schedules.target_id == int(target_id))
        if "enabled" in filters:
            enabled_val = filters["enabled"]
            if str(enabled_val).lower() in ("true", "1"):
                query = query.filter(Schedules.enabled.is_(True))
            elif str(enabled_val).lower() in ("false", "0"):
                query = query.filter(Schedules.enabled.is_(False))
        if owner_id := filters.get("owner_id"):
            if str(owner_id).isdigit():
                query = query.filter(Schedules.owner_id == int(owner_id))

        query = apply_sorting(
            query,
            Schedules,
            default="-id",
            allowed={"id", "next_run", "last_run", "created_at", "updated_at", "enabled"},
        )

        cursor, size = get_cursor_pagination()
        payload = cursor_paginate(query, cursor=cursor, size=size)
        return {"data": [_serialize(row) for row in payload["data"]], "page": payload["page"]}

    @jwt_required()
    @require_roles("network_admin")
    @ns.expect(ScheduleCreate, validate=False)
    @ns.doc(responses={201: "Created", 400: "Validation error"})
    def post(self):
        payload = request.get_json(silent=True) or {}

        # -- resolve target type
        target_type = (payload.get("target_type") or "").strip().lower()
        if target_type not in _ALLOWED_TARGET_TYPES:
            return problem_response(
                HTTPStatus.BAD_REQUEST,
                detail=f"target_type must be one of {sorted(_ALLOWED_TARGET_TYPES)}",
            )

        # -- resolve target id
        raw_target_id = payload.get("target_id")
        if raw_target_id is None:
            return problem_response(HTTPStatus.BAD_REQUEST, detail="target_id is required")
        try:
            target_id = int(raw_target_id)
        except (TypeError, ValueError):
            return problem_response(HTTPStatus.BAD_REQUEST, detail="target_id must be an integer")

        target_err = _validate_target(target_type, target_id)
        if target_err:
            return problem_response(HTTPStatus.BAD_REQUEST, detail=target_err)

        # -- resolve cron expression
        try:
            cron_expr = _resolve_cron(payload)
        except ValueError as exc:
            return problem_response(HTTPStatus.BAD_REQUEST, detail=str(exc))

        if not cron_expr:
            return problem_response(
                HTTPStatus.BAD_REQUEST,
                detail=f"Provide cron_expr or preset (one of: {', '.join(PRESET_CRON.keys())})",
            )

        enabled = bool(payload.get("enabled", True))
        timezone = (payload.get("timezone") or "UTC").strip() or "UTC"

        row = Schedules(
            name=payload.get("name"),
            target_type=target_type,
            target_id=target_id,
            cron_expr=cron_expr,
            enabled=enabled,
            timezone=timezone,
            owner_id=_current_user_id(),
            # next_run is computed below
            next_run=None,  # type: ignore[arg-type]
        )
        # Compute the first next_run.
        advance_next_run(row)

        db.session.add(row)
        db.session.flush()
        record_model_change(
            action="schedule.create",
            target_type="schedule",
            target=row,
            before=None,
            after=serialize_model_state(row, exclude=_AUDIT_EXCLUDE),
            message=f"Created schedule {row.id} for {row.target_type}:{row.target_id}",
        )
        db.session.commit()
        return _serialize(row), HTTPStatus.CREATED


# ---------------------------------------------------------------------------
# Individual schedule
# ---------------------------------------------------------------------------
@ns.route("/<int:id>")
class ScheduleItem(Resource):
    """Retrieve, update, or delete a schedule."""

    @jwt_required()
    @require_roles("network_admin")
    @ns.doc(responses={200: "OK", 404: "Not found"})
    def get(self, id: int):
        row = db.session.get(Schedules, id)
        if row is None:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Schedule not found")
        return _serialize(row)

    @jwt_required()
    @require_roles("network_admin")
    @ns.expect(ScheduleUpdate, validate=False)
    @ns.doc(responses={200: "Updated", 400: "Validation error", 404: "Not found"})
    def patch(self, id: int):
        row = db.session.get(Schedules, id)
        if row is None:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Schedule not found")

        payload = request.get_json(silent=True) or {}
        before = serialize_model_state(row, exclude=_AUDIT_EXCLUDE)

        # -- target_type / target_id (both must be present together if being changed)
        if "target_type" in payload:
            new_type = (payload["target_type"] or "").strip().lower()
            if new_type not in _ALLOWED_TARGET_TYPES:
                return problem_response(
                    HTTPStatus.BAD_REQUEST,
                    detail=f"target_type must be one of {sorted(_ALLOWED_TARGET_TYPES)}",
                )
            row.target_type = new_type
        if "target_id" in payload:
            try:
                row.target_id = int(payload["target_id"])
            except (TypeError, ValueError):
                return problem_response(HTTPStatus.BAD_REQUEST, detail="target_id must be an integer")

        target_err = _validate_target(row.target_type, row.target_id)
        if target_err:
            return problem_response(HTTPStatus.BAD_REQUEST, detail=target_err)

        # -- cron expression
        if "cron_expr" in payload or "preset" in payload:
            try:
                new_cron = _resolve_cron(payload)
            except ValueError as exc:
                return problem_response(HTTPStatus.BAD_REQUEST, detail=str(exc))
            if new_cron:
                row.cron_expr = new_cron
                # Recompute next_run from now.
                advance_next_run(row)

        if "name" in payload:
            row.name = payload["name"]
        if "timezone" in payload:
            row.timezone = (payload["timezone"] or "UTC").strip() or "UTC"
            advance_next_run(row)
        if "enabled" in payload:
            enabled_val = payload["enabled"]
            if isinstance(enabled_val, bool):
                row.enabled = enabled_val
            elif str(enabled_val).lower() in ("true", "1"):
                row.enabled = True
            else:
                row.enabled = False
            # Keep disabled_at in sync with the DisableableMixin convention.
            if not row.enabled and row.disabled_at is None:
                from app.models.annotations import utcnow as _utcnow
                row.disabled_at = _utcnow()
            elif row.enabled:
                row.disabled_at = None

        db.session.flush()
        record_model_change(
            action="schedule.update",
            target_type="schedule",
            target=row,
            before=before,
            after=serialize_model_state(row, exclude=_AUDIT_EXCLUDE),
            message=f"Updated schedule {row.id}",
        )
        db.session.commit()
        return _serialize(row)

    @jwt_required()
    @require_roles("network_admin")
    def delete(self, id: int):
        row = db.session.get(Schedules, id)
        if row is None:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Schedule not found")

        before = serialize_model_state(row, exclude=_AUDIT_EXCLUDE)
        record_model_change(
            action="schedule.delete",
            target_type="schedule",
            target=row,
            before=before,
            after=None,
            message=f"Deleted schedule {row.id}",
        )
        db.session.delete(row)
        db.session.commit()
        return {"message": "deleted"}, HTTPStatus.OK


# ---------------------------------------------------------------------------
# Fire-now
# ---------------------------------------------------------------------------
@ns.route("/<int:id>/fire-now")
class ScheduleFireNow(Resource):
    """Immediately fire a schedule (manual trigger)."""

    @jwt_required()
    @require_roles("network_admin")
    @ns.doc(responses={202: "Accepted", 404: "Not found", 400: "Bad request"})
    def post(self, id: int):
        from flask import current_app

        row = db.session.get(Schedules, id)
        if row is None:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Schedule not found")

        try:
            fire_schedule(current_app._get_current_object(), row)  # type: ignore[attr-defined]
        except Exception as exc:  # noqa: BLE001
            return problem_response(HTTPStatus.BAD_REQUEST, detail=str(exc))

        return _serialize(row), HTTPStatus.ACCEPTED
