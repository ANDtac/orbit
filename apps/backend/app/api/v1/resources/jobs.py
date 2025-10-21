"""Async job orchestration API resources."""

from __future__ import annotations

from typing import Any, Iterable

from flask import jsonify, request
from flask_restx import Namespace, Resource, fields
from flask_restx._http import HTTPStatus
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.models import JobEvents, JobTasks, Jobs
from app.services import jobs as jobs_service
from app.services.jobs import JobTaskSpec
from ..utils import (
    apply_sorting,
    cursor_paginate,
    get_cursor_pagination,
    get_filter_args,
    problem_response,
    require_roles,
)

ns = Namespace("jobs", description="Async job orchestration")


JobTaskOut = ns.model(
    "JobTaskOut",
    {
        "id": fields.Integer(required=True),
        "job_id": fields.Integer(required=True),
        "sequence": fields.Integer(required=True),
        "task_type": fields.String(required=True),
        "status": fields.String(required=True),
        "device_id": fields.Integer,
        "group_id": fields.Integer,
        "target_type": fields.String,
        "target_id": fields.Integer,
        "started_at": fields.DateTime,
        "finished_at": fields.DateTime,
        "progress_total": fields.Integer,
        "progress_completed": fields.Integer,
        "result": fields.Raw,
        "error": fields.Raw,
    },
)

JobEventOut = ns.model(
    "JobEventOut",
    {
        "id": fields.Integer(required=True),
        "job_id": fields.Integer(required=True),
        "event_type": fields.String(required=True),
        "message": fields.String,
        "context": fields.Raw,
        "occurred_at": fields.DateTime(required=True),
    },
)

JobOut = ns.model(
    "JobOut",
    {
        "id": fields.Integer(required=True),
        "uuid": fields.String(required=True),
        "job_type": fields.String(required=True),
        "status": fields.String(required=True),
        "queue": fields.String,
        "priority": fields.Integer,
        "idempotency_key": fields.String,
        "owner_id": fields.Integer,
        "run_as_internal": fields.Boolean,
        "progress": fields.Raw,
        "timestamps": fields.Raw,
        "parameters": fields.Raw,
        "result": fields.Raw,
        "error": fields.Raw,
        "tasks": fields.List(fields.Nested(JobTaskOut)),
        "events": fields.List(fields.Nested(JobEventOut)),
    },
)

JobCollection = ns.model(
    "JobCollection",
    {
        "data": fields.List(fields.Nested(JobOut), required=True),
        "page": fields.Raw(required=True),
    },
)


JobQueuedOut = ns.model(
    "JobQueuedOut",
    {
        "job": fields.Nested(JobOut, required=True),
        "enqueued": fields.Boolean(required=True),
    },
)


def _current_user_id() -> int | None:
    identity = get_jwt_identity()
    if identity is None:
        return None
    try:
        return int(identity)
    except (TypeError, ValueError):  # pragma: no cover - defensive
        return None


def _serialize_task(task: JobTasks) -> dict:
    return {
        "id": task.id,
        "job_id": task.job_id,
        "sequence": task.sequence,
        "task_type": task.task_type,
        "status": task.status,
        "device_id": task.device_id,
        "group_id": task.group_id,
        "target_type": task.target_type,
        "target_id": task.target_id,
        "started_at": task.started_at,
        "finished_at": task.finished_at,
        "progress_total": task.progress_total,
        "progress_completed": task.progress_completed,
        "result": task.result or {},
        "error": task.error or {},
    }


def _serialize_event(event: JobEvents) -> dict:
    return {
        "id": event.id,
        "job_id": event.job_id,
        "event_type": event.event_type,
        "message": event.message,
        "context": event.context or {},
        "occurred_at": event.occurred_at,
    }


def _serialize_job(job: Jobs, *, include_related: bool = False) -> dict:
    data = jobs_service.serialize_job(job)
    if include_related:
        data["tasks"] = [_serialize_task(task) for task in job.tasks]
        data["events"] = [_serialize_event(event) for event in job.events]
    else:
        data["tasks"] = []
        data["events"] = []
    return data


def _job_response(job: Jobs, created: bool):
    payload = {"job": _serialize_job(job, include_related=True), "enqueued": bool(created)}
    headers = {"Location": jobs_service.job_location(job)}
    return payload, HTTPStatus.ACCEPTED, headers


def _parse_task_specs(tasks_payload: Iterable[dict[str, Any]]) -> list[JobTaskSpec]:
    specs: list[JobTaskSpec] = []
    for index, raw in enumerate(tasks_payload):
        if not isinstance(raw, dict):
            raise ValueError("Invalid task payload")
        task_type = raw.get("task_type")
        if not task_type:
            raise ValueError("task_type is required for each task")
        specs.append(
            JobTaskSpec(
                task_type=task_type,
                sequence=raw.get("sequence", index),
                target_type=raw.get("target_type"),
                target_id=raw.get("target_id"),
                device_id=raw.get("device_id"),
                group_id=raw.get("group_id"),
                parameters=raw.get("parameters") or {},
            )
        )
    return specs


@ns.route("")
class JobCollectionResource(Resource):
    """List or create asynchronous jobs."""

    @jwt_required()
    @require_roles("network_admin")
    @ns.marshal_with(JobCollection, code=HTTPStatus.OK)
    def get(self):
        filters = get_filter_args({"job_type", "status", "owner_id", "queue"})
        query = Jobs.query

        if job_type := filters.get("job_type"):
            query = query.filter(Jobs.job_type == job_type)
        if status := filters.get("status"):
            query = query.filter(Jobs.status == status)
        if owner := filters.get("owner_id"):
            if str(owner).isdigit():
                query = query.filter(Jobs.owner_id == int(owner))
        if queue := filters.get("queue"):
            query = query.filter(Jobs.queue == queue)

        query = apply_sorting(
            query,
            Jobs,
            default="-created_at",
            allowed={"id", "created_at", "status", "job_type", "priority"},
        )

        cursor, size = get_cursor_pagination()
        payload = cursor_paginate(query, cursor=cursor, size=size)
        data = [_serialize_job(job, include_related=True) for job in payload["data"]]
        return {"data": data, "page": payload["page"]}

    @jwt_required()
    @require_roles("network_admin")
    @ns.expect(
        ns.model(
            "JobCreateIn",
            {
                "job_type": fields.String(required=True),
                "queue": fields.String(required=False),
                "priority": fields.Integer(required=False),
                "parameters": fields.Raw(required=False),
                "run_as_internal": fields.Boolean(required=False),
                "tasks": fields.List(fields.Raw, required=False),
            },
        ),
        validate=False,
    )
    @ns.marshal_with(JobQueuedOut, code=HTTPStatus.ACCEPTED)
    def post(self):
        payload = request.get_json(silent=True) or {}
        job_type = payload.get("job_type")
        if not job_type:
            return problem_response(HTTPStatus.BAD_REQUEST, detail="job_type is required")

        tasks_payload = payload.get("tasks") or []
        if tasks_payload and not isinstance(tasks_payload, list):
            return problem_response(HTTPStatus.BAD_REQUEST, detail="tasks must be a list")

        try:
            specs = _parse_task_specs(tasks_payload)
        except ValueError as exc:  # pragma: no cover - defensive validation
            return problem_response(HTTPStatus.BAD_REQUEST, detail=str(exc))

        job, created = jobs_service.enqueue_job(
            job_type=job_type,
            owner_id=_current_user_id(),
            parameters=payload.get("parameters") or {},
            queue=payload.get("queue"),
            priority=payload.get("priority", 5),
            idempotency_key=request.headers.get("Idempotency-Key"),
            run_as_internal=bool(payload.get("run_as_internal", False)),
            tasks=specs,
        )

        return _job_response(job, created)


@ns.route("/<int:job_id>")
class JobItemResource(Resource):
    """Retrieve a single job with related events and tasks."""

    @jwt_required()
    @require_roles("network_admin")
    @ns.marshal_with(JobOut, code=HTTPStatus.OK)
    def get(self, job_id: int):
        job = Jobs.query.get(job_id)
        if not job:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Job not found")
        return _serialize_job(job, include_related=True)

