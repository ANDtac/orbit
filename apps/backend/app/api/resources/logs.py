"""
app/api/resources/logs.py
-------------------------
Read-only endpoints to search structured request/response logs, error logs,
and application events.

Responsibilities
----------------
- Provide paginated, filterable access to RequestLogs, ErrorLogs, AppEvents.
- Keep responses JSON-friendly and consistent with our logging schema.
- Do not expose sensitive header fields (Authorization/Cookies).

Endpoints
---------
Requests:
    GET /logs/requests
    GET /logs/requests/<int:id>

Errors:
    GET /logs/errors
    GET /logs/errors/<int:id>

Events:
    GET /logs/events

Common Query Parameters
-----------------------
page : int
per_page : int
sort : str
    Comma-separated fields; prefix with '-' for DESC. Example: `-created_at,id`.

Requests-specific filters:
    user_id : int
    method : str                 (e.g., GET, POST, PATCH, DELETE)
    status_code : int
    status_from : int
    status_to : int
    path : str                   (substring match)
    route : str                  (exact endpoint name)
    correlation_id : str
    since : ISO8601              (inclusive)
    until : ISO8601              (exclusive)

Errors-specific filters:
    user_id : int
    level : str                  (e.g., ERROR, CRITICAL)
    correlation_id : str
    q : str                      (substring in message)
    since : ISO8601
    until : ISO8601

Events-specific filters:
    level : str                  (e.g., INFO, WARNING, ERROR)
    event : str                  (exact event key)
    since : ISO8601
    until : ISO8601

Security
--------
All endpoints require a valid JWT.

Notes
-----
- The underlying models are defined in `app/models.py`:
  RequestLogs, ErrorLogs, AppEvents.
"""

from __future__ import annotations

from datetime import datetime
from flask import request
from flask_restx import Namespace, Resource, fields
from flask_restx._http import HTTPStatus
from flask_jwt_extended import jwt_required

from ...extensions import db
from ...models import RequestLogs, ErrorLogs, AppEvents
from ..utils import get_pagination, apply_sorting, paginate_query

# ---------------------------------------------------------------------------
# Namespace
# ---------------------------------------------------------------------------
ns = Namespace("logs", description="Search request logs, error logs, and app events")


# ---------------------------------------------------------------------------
# Swagger Models (I/O)
# ---------------------------------------------------------------------------
RequestLogOut = ns.model(
    "RequestLogOut",
    {
        "id": fields.Integer(required=True),
        "created_at": fields.DateTime(attribute="occurred_at"),
        "correlation_id": fields.String,
        "user_id": fields.Integer,
        "auth_subject": fields.String,
        "method": fields.String,
        "path": fields.String,
        "route": fields.String,
        "blueprint": fields.String,
        "status_code": fields.Integer,
        "latency_ms": fields.Integer,
        "ip": fields.String,
        "user_agent": fields.String,
        "query_params": fields.Raw,
        "request_headers": fields.Raw,
        "response_headers": fields.Raw,
        "request_bytes": fields.Integer,
        "response_bytes": fields.Integer,
        "device_id_hint": fields.Integer,
        "platform_id_hint": fields.Integer,
    },
)

ErrorLogOut = ns.model(
    "ErrorLogOut",
    {
        "id": fields.Integer(required=True),
        "created_at": fields.DateTime(attribute="occurred_at"),
        "correlation_id": fields.String,
        "user_id": fields.Integer,
        "level": fields.String,
        "message": fields.String,
        "traceback": fields.String,
        "context": fields.Raw,
    },
)

EventOut = ns.model(
    "EventOut",
    {
        "id": fields.Integer(required=True),
        "created_at": fields.DateTime(attribute="occurred_at"),
        "level": fields.String,
        "event": fields.String,
        "message": fields.String,
        "extra": fields.Raw,
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
        Raw string (e.g., '2025-01-31T00:00:00Z').

    Returns
    -------
    datetime | None
        Parsed datetime or None if missing/invalid.
    """
    if not value:
        return None
    try:
        v = value.rstrip("Z")
        return datetime.fromisoformat(v)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Requests
# ---------------------------------------------------------------------------
@ns.route("/requests")
class RequestLogList(Resource):
    """
    Resource: /logs/requests
    ------------------------
    List request/response logs with pagination and filters.
    """

    @jwt_required()
    @ns.marshal_list_with(RequestLogOut, code=HTTPStatus.OK)
    def get(self):
        """
        List request logs.

        Query Parameters
        ----------------
        page, per_page, sort,
        user_id, method, status_code, status_from, status_to,
        path, route, correlation_id, since, until

        Returns
        -------
        list[RequestLogOut]
        """
        page, per_page = get_pagination()
        q = RequestLogs.query

        user_id = request.args.get("user_id", type=int)
        if user_id is not None:
            q = q.filter(RequestLogs.user_id == user_id)

        method = request.args.get("method")
        if method:
            q = q.filter(RequestLogs.method.ilike(method))

        status_code = request.args.get("status_code", type=int)
        if status_code is not None:
            q = q.filter(RequestLogs.status_code == status_code)

        status_from = request.args.get("status_from", type=int)
        if status_from is not None:
            q = q.filter(RequestLogs.status_code >= status_from)

        status_to = request.args.get("status_to", type=int)
        if status_to is not None:
            q = q.filter(RequestLogs.status_code <= status_to)

        path_sub = request.args.get("path")
        if path_sub:
            q = q.filter(RequestLogs.path.ilike(f"%{path_sub}%"))

        route = request.args.get("route")
        if route:
            q = q.filter(RequestLogs.route.ilike(route))

        corr = request.args.get("correlation_id")
        if corr:
            q = q.filter(RequestLogs.correlation_id == corr)

        since = _parse_iso_dt(request.args.get("since"))
        if since:
            q = q.filter(RequestLogs.occurred_at >= since)

        until = _parse_iso_dt(request.args.get("until"))
        if until:
            q = q.filter(RequestLogs.occurred_at < until)

        q = apply_sorting(
            q,
            RequestLogs,
            default="-occurred_at",
            allowed={
                "id",
                "occurred_at",
                "status_code",
                "latency_ms",
                "user_id",
            },
        )
        rows = paginate_query(q, page=page, per_page=per_page).items
        return rows, HTTPStatus.OK


@ns.route("/requests/<int:id>")
class RequestLogItem(Resource):
    """
    Resource: /logs/requests/<id>
    -----------------------------
    Retrieve a single request log entry by ID.
    """

    @jwt_required()
    @ns.marshal_with(RequestLogOut, code=HTTPStatus.OK)
    def get(self, id: int):
        """
        Retrieve a request log.

        Parameters
        ----------
        id : int

        Returns
        -------
        RequestLogOut
        """
        return RequestLogs.query.get_or_404(id), HTTPStatus.OK


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------
@ns.route("/errors")
class ErrorLogList(Resource):
    """
    Resource: /logs/errors
    ----------------------
    List error logs with pagination and filters.
    """

    @jwt_required()
    @ns.marshal_list_with(ErrorLogOut, code=HTTPStatus.OK)
    def get(self):
        """
        List error logs.

        Query Parameters
        ----------------
        page, per_page, sort,
        user_id, level, correlation_id, q, since, until

        Returns
        -------
        list[ErrorLogOut]
        """
        page, per_page = get_pagination()
        qy = ErrorLogs.query

        user_id = request.args.get("user_id", type=int)
        if user_id is not None:
            qy = qy.filter(ErrorLogs.user_id == user_id)

        level = request.args.get("level")
        if level:
            qy = qy.filter(ErrorLogs.level.ilike(level))

        corr = request.args.get("correlation_id")
        if corr:
            qy = qy.filter(ErrorLogs.correlation_id == corr)

        qtext = request.args.get("q")
        if qtext:
            qy = qy.filter(ErrorLogs.message.ilike(f"%{qtext}%"))

        since = _parse_iso_dt(request.args.get("since"))
        if since:
            qy = qy.filter(ErrorLogs.occurred_at >= since)

        until = _parse_iso_dt(request.args.get("until"))
        if until:
            qy = qy.filter(ErrorLogs.occurred_at < until)

        qy = apply_sorting(
            qy,
            ErrorLogs,
            default="-occurred_at",
            allowed={"id", "occurred_at", "level"},
        )
        rows = paginate_query(qy, page=page, per_page=per_page).items
        return rows, HTTPStatus.OK


@ns.route("/errors/<int:id>")
class ErrorLogItem(Resource):
    """
    Resource: /logs/errors/<id>
    ---------------------------
    Retrieve a single error log entry by ID.
    """

    @jwt_required()
    @ns.marshal_with(ErrorLogOut, code=HTTPStatus.OK)
    def get(self, id: int):
        """
        Retrieve an error log.

        Parameters
        ----------
        id : int

        Returns
        -------
        ErrorLogOut
        """
        return ErrorLogs.query.get_or_404(id), HTTPStatus.OK


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------
@ns.route("/events")
class EventList(Resource):
    """
    Resource: /logs/events
    ----------------------
    List application events (startup, migrations, cron, etc.).
    """

    @jwt_required()
    @ns.marshal_list_with(EventOut, code=HTTPStatus.OK)
    def get(self):
        """
        List app events.

        Query Parameters
        ----------------
        page, per_page, sort,
        level, event, since, until

        Returns
        -------
        list[EventOut]
        """
        page, per_page = get_pagination()
        q = AppEvents.query

        level = request.args.get("level")
        if level:
            q = q.filter(AppEvents.level.ilike(level))

        event = request.args.get("event")
        if event:
            q = q.filter(AppEvents.event.ilike(event))

        since = _parse_iso_dt(request.args.get("since"))
        if since:
            q = q.filter(AppEvents.occurred_at >= since)

        until = _parse_iso_dt(request.args.get("until"))
        if until:
            q = q.filter(AppEvents.occurred_at < until)

        q = apply_sorting(
            q,
            AppEvents,
            default="-occurred_at",
            allowed={"id", "occurred_at", "level", "event"},
        )
        rows = paginate_query(q, page=page, per_page=per_page).items
        return rows, HTTPStatus.OK
