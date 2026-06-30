"""Tag assignment routes for the devices namespace."""

from __future__ import annotations

from flask import request
from flask_jwt_extended import jwt_required
from flask_restx import Resource
from flask_restx._http import HTTPStatus
from sqlalchemy import func

from app.extensions import db
from app.models import DeviceTagAssignments, DeviceTags
from ..utils import problem_response, require_roles
from .devices_shared import (
    TagAssignIn,
    TagAssignmentOut,
    _current_user_id,
    _get_device_or_404,
    _serialize_tag,
    _slugify,
    ns,
)


@ns.route("/<int:device_id>/tags")
class DeviceTagCollection(Resource):
    @jwt_required()
    @require_roles("network_admin")
    @ns.expect(TagAssignIn)
    @ns.marshal_with(TagAssignmentOut, code=HTTPStatus.OK)
    def post(self, device_id: int):
        payload = request.get_json(silent=True) or {}
        tags = payload.get("tags")
        if not isinstance(tags, list) or not tags:
            return problem_response(HTTPStatus.BAD_REQUEST, detail="Provide a non-empty list of tags")

        try:
            device = _get_device_or_404(device_id)
        except ValueError:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Device not found")

        actor_id = _current_user_id()
        normalized: list[DeviceTags] = []

        for raw in tags:
            if not isinstance(raw, str) or not raw.strip():
                continue

            slug = _slugify(raw)
            tag = DeviceTags.query.filter(func.lower(DeviceTags.slug) == slug.lower()).one_or_none()
            if not tag:
                tag = DeviceTags(slug=slug, name=raw.strip())
                db.session.add(tag)
                db.session.flush()

            assignment = DeviceTagAssignments.query.filter_by(
                device_id=device.id,
                tag_id=tag.id,
            ).one_or_none()
            if assignment:
                normalized.append(tag)
                continue

            db.session.add(
                DeviceTagAssignments(
                    device_id=device.id,
                    tag_id=tag.id,
                    applied_by_id=actor_id,
                    source="api",
                )
            )
            normalized.append(tag)

        db.session.commit()
        return {"device_id": device.id, "tags": [_serialize_tag(tag) for tag in normalized]}


@ns.route("/<int:device_id>/tags/<string:tag_slug>")
class DeviceTagItem(Resource):
    @jwt_required()
    @require_roles("network_admin")
    def delete(self, device_id: int, tag_slug: str):
        try:
            device = _get_device_or_404(device_id)
        except ValueError:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Device not found")

        tag = DeviceTags.query.filter(func.lower(DeviceTags.slug) == tag_slug.lower()).one_or_none()
        if not tag:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Tag not found")
        if tag.is_protected:
            return problem_response(HTTPStatus.CONFLICT, detail="Protected tags cannot be removed")

        assignment = DeviceTagAssignments.query.filter_by(
            device_id=device.id,
            tag_id=tag.id,
        ).one_or_none()
        if not assignment:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Tag not assigned to device")

        db.session.delete(assignment)
        db.session.commit()
        return "", HTTPStatus.NO_CONTENT
