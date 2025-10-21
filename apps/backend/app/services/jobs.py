"""Job orchestration helpers for async workflows."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Sequence

from flask import current_app
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import JobEvents, JobTasks, Jobs, Users
from app.models.annotations import utcnow

INTERNAL_JOBS_USERNAME = "jobs-system"
INTERNAL_JOBS_EMAIL = "jobs-system@internal.local"


@dataclass(frozen=True)
class JobTaskSpec:
    """Specification for creating a :class:`JobTasks` row."""

    task_type: str
    sequence: int | None = None
    target_type: str | None = None
    target_id: int | None = None
    device_id: int | None = None
    group_id: int | None = None
    parameters: dict = field(default_factory=dict)


def ensure_internal_jobs_user() -> Users:
    """Return the internal automation user, creating it if missing."""

    user = Users.query.filter_by(username=INTERNAL_JOBS_USERNAME).one_or_none()
    if user:
        return user

    user = Users(
        username=INTERNAL_JOBS_USERNAME,
        email=INTERNAL_JOBS_EMAIL,
        jwt_auth_active=False,
        is_active=True,
    )
    db.session.add(user)
    db.session.flush()
    current_app.logger.info("jobs_internal_user_created", extra={"extra": {"user_id": user.id}})
    return user


def _coerce_owner(owner_id: int | None, run_as_internal: bool) -> int | None:
    if owner_id is not None:
        return owner_id
    if run_as_internal:
        return ensure_internal_jobs_user().id
    return None


def _iso(dt) -> str | None:
    return dt.isoformat() if dt else None


def serialize_job(job: Jobs) -> dict:
    """Return a stable dictionary representation of a job."""

    return {
        "id": job.id,
        "uuid": str(job.uuid),
        "job_type": job.job_type,
        "status": job.status,
        "queue": job.queue,
        "priority": job.priority,
        "idempotency_key": job.idempotency_key,
        "owner_id": job.owner_id,
        "run_as_internal": job.run_as_internal,
        "progress": {
            "total": job.progress_total,
            "completed": job.progress_completed,
        },
        "timestamps": {
            "created_at": _iso(job.created_at),
            "updated_at": _iso(job.updated_at),
            "scheduled_for": _iso(job.scheduled_for),
            "started_at": _iso(job.started_at),
            "finished_at": _iso(job.finished_at),
            "last_heartbeat_at": _iso(job.last_heartbeat_at),
        },
        "parameters": job.parameters or {},
        "result": job.result or {},
        "error": job.error or {},
    }


def job_location(job: Jobs) -> str:
    """Return the canonical API location for a job resource."""

    return f"/api/v1/jobs/{job.id}"


def create_job(
    *,
    job_type: str,
    owner_id: int | None,
    parameters: dict | None = None,
    queue: str | None = "default",
    priority: int = 5,
    idempotency_key: str | None = None,
    run_as_internal: bool = False,
    tasks: Sequence[JobTaskSpec] | None = None,
    initial_status: str = "queued",
    event_type: str = "queued",
    event_message: str | None = None,
    event_context: dict | None = None,
) -> tuple[Jobs, bool]:
    """Persist a job with optional child tasks and events."""

    if idempotency_key:
        existing = Jobs.query.filter_by(idempotency_key=idempotency_key).one_or_none()
        if existing:
            return existing, False

    owner = _coerce_owner(owner_id, run_as_internal)

    job = Jobs(
        job_type=job_type,
        status=initial_status,
        queue=queue,
        priority=priority,
        idempotency_key=idempotency_key,
        parameters=parameters or {},
        run_as_internal=bool(run_as_internal),
    )
    if owner is not None:
        job.owner_id = owner

    if tasks:
        job.progress_total = len(tasks)

    db.session.add(job)
    db.session.flush()

    for index, spec in enumerate(tasks or []):
        task = JobTasks(
            job_id=job.id,
            sequence=spec.sequence if spec.sequence is not None else index,
            task_type=spec.task_type,
            status="pending",
            target_type=spec.target_type,
            target_id=spec.target_id,
            device_id=spec.device_id,
            group_id=spec.group_id,
            parameters=spec.parameters or {},
        )
        db.session.add(task)

    db.session.add(
        JobEvents(
            job_id=job.id,
            event_type=event_type,
            message=event_message,
            context=event_context or {},
            occurred_at=utcnow(),
        )
    )

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        if idempotency_key:
            existing = Jobs.query.filter_by(idempotency_key=idempotency_key).one_or_none()
            if existing:
                return existing, False
        raise

    db.session.refresh(job)
    return job, True


def enqueue_job(
    *,
    job_type: str,
    owner_id: int | None,
    parameters: dict | None = None,
    queue: str | None = "default",
    priority: int = 5,
    idempotency_key: str | None = None,
    run_as_internal: bool = False,
    tasks: Sequence[JobTaskSpec] | None = None,
    event_message: str | None = None,
    event_context: dict | None = None,
) -> tuple[Jobs, bool]:
    """Wrapper around :func:`create_job` that defaults to queued status."""

    return create_job(
        job_type=job_type,
        owner_id=owner_id,
        parameters=parameters,
        queue=queue,
        priority=priority,
        idempotency_key=idempotency_key,
        run_as_internal=run_as_internal,
        tasks=tasks,
        initial_status="queued",
        event_type="queued",
        event_message=event_message or "job enqueued",
        event_context=event_context,
    )
