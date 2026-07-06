"""Tests for the generalized database-backed job worker (Phase 1)."""

from __future__ import annotations

from datetime import timedelta

from app.extensions import db
from app.models import JobEvents, JobTasks, Jobs, PlatformOperationTemplates
from app.models.annotations import utcnow
from app.services import jobs as jobs_service
from app.services import operations as ops_service
from app.services import worker as worker_service


def _enqueue_operation_job(device_id: int, *, priority: int = 5) -> Jobs:
    """Enqueue an ``operation.execute`` job mirroring the API's task shape."""

    job, _ = jobs_service.enqueue_job(
        job_type="operation.execute",
        owner_id=None,
        run_as_internal=True,
        priority=priority,
        parameters={
            "scope": {"device_ids": [device_id]},
            "operation": {"op_type": "backup", "template_id": None},
            "options": {"dry_run": True, "timeout_sec": 120, "stop_on_error": False},
            "variables": {"foo": "bar"},
        },
        tasks=[
            jobs_service.JobTaskSpec(
                task_type="operation.device",
                sequence=0,
                device_id=device_id,
                parameters={
                    "op_type": "backup",
                    "template_id": None,
                    "variables": {"foo": "bar"},
                    "dry_run": True,
                    "timeout_sec": 120,
                    "stop_on_error": False,
                },
            )
        ],
    )
    return job


def test_run_worker_once_executes_operation_job(app, db, create_device, monkeypatch):
    # Mock the device connection layer: never open a real session.
    monkeypatch.setattr(
        ops_service, "_run_cli", lambda target, command, timeout: "captured config"
    )
    device = create_device()
    job = _enqueue_operation_job(device.id)
    job_id = job.id

    did_work = worker_service.run_worker_once(app)
    assert did_work is True

    db.session.expire_all()
    finished = db.session.get(Jobs, job_id)
    assert finished.status == "succeeded"
    assert finished.started_at is not None
    assert finished.finished_at is not None
    assert finished.progress_completed == 1
    assert finished.result["summary"]["succeeded"] == 1

    # The task ran and stored the mock executor result.
    task = JobTasks.query.filter_by(job_id=job_id).one()
    assert task.status == "succeeded"
    assert task.result["summary"]["requested"] == 1
    assert task.result["results"][0]["device_id"] == device.id

    # started + completed JobEvents were recorded.
    event_types = {e.event_type for e in JobEvents.query.filter_by(job_id=job_id).all()}
    assert "started" in event_types
    assert "completed" in event_types

    # Nothing left to do on a second pass.
    assert worker_service.run_worker_once(app) is False


def test_operation_job_produces_structured_fields(app, db, create_device, monkeypatch):
    """A queued operation.execute job now completes with STRUCTURED results."""

    monkeypatch.setattr(
        ops_service,
        "_run_cli",
        lambda target, command, timeout: "Cisco IOS XE Software, Version 17.6.4",
    )
    device = create_device()

    template = PlatformOperationTemplates(
        platform_id=device.platform_id,
        name="Show Version",
        op_type="show_version",
        template="show version",
        outputs={"version": {"type": "string", "source": "regex", "pattern": r"Version (\S+)"}},
        is_mutating=False,
    )
    db.session.add(template)
    db.session.commit()
    template_id = template.id

    job, _ = jobs_service.enqueue_job(
        job_type="operation.execute",
        owner_id=None,
        run_as_internal=True,
        priority=5,
        parameters={"scope": {"device_ids": [device.id]}},
        tasks=[
            jobs_service.JobTaskSpec(
                task_type="operation.device",
                sequence=0,
                device_id=device.id,
                parameters={"template_id": template_id, "dry_run": True, "timeout_sec": 60},
            )
        ],
    )
    job_id = job.id

    assert worker_service.run_worker_once(app) is True

    db.session.expire_all()
    finished = db.session.get(Jobs, job_id)
    assert finished.status == "succeeded"

    task = JobTasks.query.filter_by(job_id=job_id).one()
    assert task.status == "succeeded"
    per_device = task.result["results"][0]
    assert per_device["device_id"] == device.id
    assert per_device["ok"] is True
    assert per_device["fields"] == {"version": "17.6.4"}


def test_run_worker_once_returns_false_when_idle(app, db):
    assert worker_service.run_worker_once(app) is False


def test_reaper_requeues_stale_running_job(app, db, create_job):
    stale = create_job(job_type="operation.execute", status="running")
    fresh = create_job(job_type="operation.execute", status="running")

    stale.last_heartbeat_at = utcnow() - timedelta(seconds=600)
    fresh.last_heartbeat_at = utcnow()
    db.session.commit()

    requeued = worker_service.requeue_stale_jobs(db.session, heartbeat_timeout_seconds=120)
    assert requeued == 1

    db.session.expire_all()
    assert db.session.get(Jobs, stale.id).status == "queued"
    assert db.session.get(Jobs, fresh.id).status == "running"

    events = JobEvents.query.filter_by(job_id=stale.id, event_type="requeued").all()
    assert len(events) == 1


def test_claim_next_job_respects_priority(app, db, create_device):
    device = create_device()
    low = _enqueue_operation_job(device.id, priority=1)
    high = _enqueue_operation_job(device.id, priority=9)

    claimed = worker_service.claim_next_job(db.session)
    assert claimed is not None
    assert claimed.id == high.id
    assert claimed.status == "running"
    assert claimed.id != low.id
