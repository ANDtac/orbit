"""Audit log API resources."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from flask import request
from flask_restx import Namespace, Resource, fields
from flask_restx._http import HTTPStatus
from flask_jwt_extended import jwt_required

from app.models import AuditLogEntries
from ..utils import cursor_paginate, get_cursor_pagination, require_roles

ns = Namespace("audit", description="Audit log access")


AuditOut = ns.model(
    "AuditOut",
    {
        "id": fields.Integer(required=True),
        "uuid": fields.String(required=True),
        "occurred_at": fields.DateTime(required=True),
        "actor_id": fields.Integer,
        "actor_type": fields.String,
        "actor_display_name": fields.String,
        "action": fields.String(required=True),
        "target_type": fields.String(required=True),
        "target_id": fields.Integer,
        "target_uuid": fields.String,
        "target_repr": fields.String,
        "request_id": fields.String,
        "ip_address": fields.String,
        "user_agent": fields.String,
        "job_id": fields.Integer,
        "payload": fields.Raw,
        "message": fields.String,
    },
)

AuditCollection = ns.model(
    "AuditCollection",
    {
        "data": fields.List(fields.Nested(AuditOut), required=True),
        "page": fields.Raw(required=True),
    },
)


def _serialize_entry(entry: AuditLogEntries) -> dict:
    return {
        "id": entry.id,
        "uuid": str(entry.uuid),
        "occurred_at": entry.occurred_at,
        "actor_id": entry.actor_id,
        "actor_type": entry.actor_type,
        "actor_display_name": entry.actor_display_name,
        "action": entry.action,
        "target_type": entry.target_type,
        "target_id": entry.target_id,
        "target_uuid": entry.target_uuid,
        "target_repr": entry.target_repr,
        "request_id": entry.request_id,
        "ip_address": entry.ip_address,
        "user_agent": entry.user_agent,
        "job_id": entry.job_id,
        "payload": entry.payload or {},
        "message": entry.message,
    }


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


@ns.route("")
class AuditCollectionResource(Resource):
    """List audit log entries with filtering."""

    @jwt_required()
    @require_roles("network_admin")
    @ns.marshal_with(AuditCollection, code=HTTPStatus.OK)
    def get(self):
        query = AuditLogEntries.query.order_by(AuditLogEntries.occurred_at.desc())

        filters = request.args
        if actor := filters.get("filter[actor_id]"):
            if str(actor).isdigit():
                query = query.filter(AuditLogEntries.actor_id == int(actor))
        if action := filters.get("filter[action]"):
            query = query.filter(AuditLogEntries.action == action)
        if target_type := filters.get("filter[target_type]"):
            query = query.filter(AuditLogEntries.target_type == target_type)
        if target_id := filters.get("filter[target_id]"):
            if str(target_id).isdigit():
                query = query.filter(AuditLogEntries.target_id == int(target_id))
        if job_id := filters.get("filter[job_id]"):
            if str(job_id).isdigit():
                query = query.filter(AuditLogEntries.job_id == int(job_id))

        occurred_after = _parse_dt(filters.get("filter[occurred_after]"))
        occurred_before = _parse_dt(filters.get("filter[occurred_before]"))
        if occurred_after:
            query = query.filter(AuditLogEntries.occurred_at >= occurred_after)
        if occurred_before:
            query = query.filter(AuditLogEntries.occurred_at <= occurred_before)

        cursor, size = get_cursor_pagination()
        payload = cursor_paginate(query, cursor=cursor, size=size)
        return {"data": [_serialize_entry(entry) for entry in payload["data"]], "page": payload["page"]}

