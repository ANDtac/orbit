"""Dynamic inventory group API resources."""

from __future__ import annotations

from flask import request
from flask_restx import Namespace, Resource, fields
from flask_restx._http import HTTPStatus
from flask_jwt_extended import jwt_required

from app.extensions import db
from app.models import InventoryGroups
from ..utils import (
    apply_sorting,
    cursor_paginate,
    get_cursor_pagination,
    get_filter_args,
    problem_response,
    require_roles,
)

ns = Namespace("groups", description="Saved dynamic device groups")


GroupIn = ns.model(
    "GroupIn",
    {
        "name": fields.String(required=True),
        "description": fields.String(required=False),
        "slug": fields.String(required=False),
        "is_dynamic": fields.Boolean(required=False, default=True),
        "definition": fields.Raw(required=False, description="JSON definition for dynamic groups"),
        "evaluation_scope": fields.String(required=False),
        "attributes": fields.Raw(required=False),
    },
)

GroupOut = ns.model(
    "GroupOut",
    {
        "id": fields.Integer(required=True),
        "uuid": fields.String(required=True),
        "slug": fields.String(required=True),
        "name": fields.String(required=True),
        "description": fields.String,
        "is_active": fields.Boolean,
        "is_dynamic": fields.Boolean,
        "definition": fields.Raw,
        "evaluation_scope": fields.String,
        "cached_device_count": fields.Integer,
        "last_evaluated_at": fields.DateTime,
        "created_at": fields.DateTime,
        "updated_at": fields.DateTime,
    },
)

GroupCollection = ns.model(
    "GroupCollection",
    {
        "data": fields.List(fields.Nested(GroupOut), required=True),
        "page": fields.Raw(required=True),
    },
)


def _serialize_group(group: InventoryGroups) -> dict:
    return {
        "id": group.id,
        "uuid": str(group.uuid),
        "slug": group.slug,
        "name": group.name,
        "description": group.description,
        "is_active": group.is_active,
        "is_dynamic": group.is_dynamic,
        "definition": group.definition or {},
        "evaluation_scope": group.evaluation_scope,
        "cached_device_count": group.cached_device_count,
        "last_evaluated_at": group.last_evaluated_at,
        "created_at": group.created_at,
        "updated_at": group.updated_at,
    }


@ns.route("")
class GroupCollectionResource(Resource):
    """List or create inventory groups."""

    @jwt_required()
    @require_roles("network_admin")
    @ns.marshal_with(GroupCollection, code=HTTPStatus.OK)
    def get(self):
        filters = get_filter_args({"slug", "is_dynamic", "name"})
        query = InventoryGroups.query

        if slug := filters.get("slug"):
            query = query.filter(InventoryGroups.slug == slug)
        if name := filters.get("name"):
            query = query.filter(InventoryGroups.name.ilike(f"%{name}%"))
        if is_dynamic := filters.get("is_dynamic"):
            if is_dynamic.lower() in {"1", "true", "yes"}:
                query = query.filter(InventoryGroups.is_dynamic.is_(True))
            elif is_dynamic.lower() in {"0", "false", "no"}:
                query = query.filter(InventoryGroups.is_dynamic.is_(False))

        query = apply_sorting(
            query,
            InventoryGroups,
            default="name",
            allowed={"id", "name", "slug", "created_at", "updated_at", "cached_device_count"},
        )

        cursor, size = get_cursor_pagination()
        payload = cursor_paginate(query, cursor=cursor, size=size)
        return {"data": [_serialize_group(g) for g in payload["data"]], "page": payload["page"]}

    @jwt_required()
    @require_roles("network_admin")
    @ns.expect(GroupIn, validate=False)
    @ns.marshal_with(GroupOut, code=HTTPStatus.CREATED)
    def post(self):
        payload = request.get_json(silent=True) or {}
        name = (payload.get("name") or "").strip()
        if not name:
            return problem_response(HTTPStatus.BAD_REQUEST, detail="name is required")

        is_dynamic = bool(payload.get("is_dynamic", True))
        definition = payload.get("definition") or {}
        if is_dynamic and not isinstance(definition, dict):
            return problem_response(HTTPStatus.BAD_REQUEST, detail="definition must be an object")

        group = InventoryGroups(
            name=name,
            slug=payload.get("slug") or None,
            description=payload.get("description"),
            is_active=True,
            is_dynamic=is_dynamic,
            definition=definition if isinstance(definition, dict) else {},
            evaluation_scope=payload.get("evaluation_scope"),
        )

        db.session.add(group)
        db.session.commit()

        return _serialize_group(group), HTTPStatus.CREATED


@ns.route("/<int:group_id>")
class GroupItemResource(Resource):
    """Retrieve a single inventory group."""

    @jwt_required()
    @require_roles("network_admin")
    @ns.marshal_with(GroupOut, code=HTTPStatus.OK)
    def get(self, group_id: int):
        group = InventoryGroups.query.get(group_id)
        if not group:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Group not found")
        return _serialize_group(group)

