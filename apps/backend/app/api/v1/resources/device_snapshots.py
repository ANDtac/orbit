"""Configuration snapshot routes for the devices namespace."""

from __future__ import annotations

from flask import request
from flask_jwt_extended import jwt_required
from flask_restx import Resource
from flask_restx._http import HTTPStatus

from app.models import DeviceConfigSnapshots
from app.services import jobs as jobs_service
from app.services.jobs import JobTaskSpec
from ..utils import cursor_paginate, get_cursor_pagination, problem_response, require_roles
from .devices_shared import (
    ConfigBackupIn,
    ConfigSnapshotCollection,
    JobReferenceOut,
    _current_user_id,
    _get_device_or_404,
    _job_response,
    _serialize_config_snapshot,
    ns,
)


@ns.route("/<int:device_id>/configs")
class DeviceConfigCollection(Resource):
    @jwt_required()
    @ns.marshal_with(ConfigSnapshotCollection, code=HTTPStatus.OK)
    def get(self, device_id: int):
        try:
            _get_device_or_404(device_id)
        except ValueError:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Device not found")

        cursor, size = get_cursor_pagination(default_size=20)
        query = DeviceConfigSnapshots.query.filter_by(device_id=device_id).order_by(
            DeviceConfigSnapshots.captured_at.desc()
        )
        payload = cursor_paginate(query, cursor=cursor, size=size)
        return {
            "data": [_serialize_config_snapshot(snapshot) for snapshot in payload["data"]],
            "page": payload["page"],
        }


@ns.route("/<int:device_id>/config:backup")
class DeviceConfigBackup(Resource):
    @jwt_required()
    @require_roles("network_admin")
    @ns.expect(ConfigBackupIn, validate=False)
    @ns.marshal_with(JobReferenceOut, code=HTTPStatus.ACCEPTED)
    def post(self, device_id: int):
        try:
            device = _get_device_or_404(device_id)
        except ValueError:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Device not found")

        payload = request.get_json(silent=True) or {}
        reason = payload.get("reason")

        task = JobTaskSpec(
            task_type="device.config.backup",
            sequence=0,
            device_id=device.id,
            parameters={"reason": reason} if reason else {},
        )
        job, created = jobs_service.enqueue_job(
            job_type="device.config.backup",
            owner_id=_current_user_id(),
            parameters={"device_id": device.id, "reason": reason},
            idempotency_key=request.headers.get("Idempotency-Key"),
            tasks=[task],
        )
        return _job_response(job, created)
