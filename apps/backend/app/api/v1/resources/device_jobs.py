"""Job kickoff routes for device-adjacent operations."""

from __future__ import annotations

from flask import request
from flask_jwt_extended import jwt_required
from flask_restx import Resource
from flask_restx._http import HTTPStatus

from app.extensions import db
from app.models import DeviceProbeExecutions, DeviceProbeTemplates, Devices
from app.services import jobs as jobs_service
from app.services.jobs import JobTaskSpec
from ..utils import problem_response, require_roles
from .devices_shared import (
    BulkUpdateIn,
    DEVICE_COLUMN_KEYS,
    DiscoveryIn,
    JobReferenceOut,
    ProbeIn,
    _current_user_id,
    _job_response,
    ns,
)


@ns.route(":bulk-update")
class DeviceBulkUpdate(Resource):
    @jwt_required()
    @require_roles("network_admin")
    @ns.expect(BulkUpdateIn, validate=False)
    @ns.marshal_with(JobReferenceOut, code=HTTPStatus.ACCEPTED)
    def post(self):
        payload = request.get_json(silent=True) or {}
        device_ids = payload.get("device_ids") or []
        filters = payload.get("filters") or {}
        updates = payload.get("updates") or payload.get("patch")

        if not isinstance(updates, dict) or not updates:
            return problem_response(HTTPStatus.BAD_REQUEST, detail="Provide updates for the bulk operation")

        query = Devices.query

        if device_ids:
            valid_ids = [int(item) for item in device_ids if isinstance(item, (int, str)) and str(item).isdigit()]
            if not valid_ids:
                return problem_response(HTTPStatus.BAD_REQUEST, detail="No valid device ids supplied")
            query = query.filter(Devices.id.in_(valid_ids))

        if isinstance(filters, dict):
            for key, value in filters.items():
                if key in DEVICE_COLUMN_KEYS:
                    query = query.filter(getattr(Devices, key) == value)

        targets = query.all()
        if not targets:
            return problem_response(HTTPStatus.NOT_FOUND, detail="No devices matched the selection criteria")

        tasks = [
            JobTaskSpec(
                task_type="device.bulk_update.apply",
                sequence=index,
                device_id=device.id,
                parameters={"updates": updates},
            )
            for index, device in enumerate(targets)
        ]

        job, created = jobs_service.enqueue_job(
            job_type="device.bulk_update",
            owner_id=_current_user_id(),
            parameters={"device_ids": [device.id for device in targets], "updates": updates},
            idempotency_key=request.headers.get("Idempotency-Key"),
            tasks=tasks,
        )
        return _job_response(job, created)


@ns.route(":discover")
class DeviceDiscovery(Resource):
    @jwt_required()
    @require_roles("network_admin")
    @ns.expect(DiscoveryIn, validate=False)
    @ns.marshal_with(JobReferenceOut, code=HTTPStatus.ACCEPTED)
    def post(self):
        payload = request.get_json(silent=True) or {}
        seeds = payload.get("seeds")
        if not isinstance(seeds, list) or not seeds:
            return problem_response(HTTPStatus.BAD_REQUEST, detail="Provide one or more discovery seeds")

        credentials = payload.get("credentials") or {}
        tasks = [
            JobTaskSpec(
                task_type="device.discovery.scan",
                sequence=index,
                target_type="seed",
                target_id=None,
                parameters={"seed": seed, "credentials": credentials},
            )
            for index, seed in enumerate(seeds)
            if isinstance(seed, str) and seed.strip()
        ]
        if not tasks:
            return problem_response(HTTPStatus.BAD_REQUEST, detail="Seeds must be non-empty strings")

        job, created = jobs_service.enqueue_job(
            job_type="device.discovery",
            owner_id=_current_user_id(),
            parameters={"seeds": seeds, "credentials": credentials},
            idempotency_key=request.headers.get("Idempotency-Key"),
            tasks=tasks,
            run_as_internal=True,
        )
        return _job_response(job, created)


@ns.route(":probe")
class DeviceProbe(Resource):
    @jwt_required()
    @require_roles("network_admin")
    @ns.expect(ProbeIn, validate=False)
    @ns.marshal_with(JobReferenceOut, code=HTTPStatus.ACCEPTED)
    def post(self):
        payload = request.get_json(silent=True) or {}
        device_ids = payload.get("device_ids") or []
        variables = payload.get("variables") or {}

        if not isinstance(device_ids, list) or not device_ids:
            return problem_response(HTTPStatus.BAD_REQUEST, detail="Provide one or more device_ids")

        template_id = payload.get("template_id")
        probe_type = payload.get("probe_type")
        template = None
        if template_id:
            template = db.session.get(DeviceProbeTemplates, template_id)
            if not template or not template.is_active:
                return problem_response(HTTPStatus.NOT_FOUND, detail="Probe template not found")
            probe_type = template.probe_type

        if not probe_type:
            return problem_response(HTTPStatus.BAD_REQUEST, detail="Provide probe_type or template_id")

        targets = Devices.query.filter(
            Devices.id.in_([int(item) for item in device_ids if str(item).isdigit()])
        ).all()
        if not targets:
            return problem_response(HTTPStatus.NOT_FOUND, detail="No matching devices for probe request")

        tasks = [
            JobTaskSpec(
                task_type="device.probe.run",
                sequence=index,
                device_id=device.id,
                parameters={
                    "probe_type": probe_type,
                    "template_id": template.id if template else None,
                    "variables": variables,
                },
            )
            for index, device in enumerate(targets)
        ]

        job, created = jobs_service.enqueue_job(
            job_type="device.probe",
            owner_id=_current_user_id(),
            parameters={
                "device_ids": [device.id for device in targets],
                "probe_type": probe_type,
                "template_id": template.id if template else None,
                "variables": variables,
            },
            idempotency_key=request.headers.get("Idempotency-Key"),
            tasks=tasks,
        )

        if job.tasks:
            for task in job.tasks:
                if not task.device_id:
                    continue
                db.session.add(
                    DeviceProbeExecutions(
                        device_id=task.device_id,
                        job_id=job.id,
                        job_task_id=task.id,
                        template_id=template.id if template else None,
                        probe_type=probe_type,
                        status="queued",
                        diagnostics={"requested": task.parameters or {}},
                    )
                )
            db.session.commit()

        return _job_response(job, created)
