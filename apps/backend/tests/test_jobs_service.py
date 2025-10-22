from __future__ import annotations

from app.models import Jobs, Users
from app.services import jobs as jobs_service


def test_enqueue_job_creates_internal_user(db):
    _ = db
    job, created = jobs_service.enqueue_job(
        job_type="maintenance.check",
        owner_id=None,
        parameters={"foo": "bar"},
        run_as_internal=True,
        tasks=[],
    )

    assert created is True
    assert job.owner is not None
    assert job.owner.username == jobs_service.INTERNAL_JOBS_USERNAME
    assert job.run_as_internal is True

    # Subsequent call should reuse the same internal user
    second_job, second_created = jobs_service.enqueue_job(
        job_type="maintenance.other",
        owner_id=None,
        parameters={},
        run_as_internal=True,
        tasks=[],
    )

    assert second_created is True
    assert second_job.owner_id == job.owner_id


def test_enqueue_job_respects_idempotency(db, create_user):
    _ = db
    user = create_user("jobber")

    task = jobs_service.JobTaskSpec(task_type="unit")
    first, first_created = jobs_service.enqueue_job(
        job_type="unit.test",
        owner_id=user.id,
        parameters={"a": 1},
        idempotency_key="idem-key",
        tasks=[task],
    )
    assert first_created is True
    assert first.progress_total == 1

    second, second_created = jobs_service.enqueue_job(
        job_type="unit.test",
        owner_id=user.id,
        parameters={"a": 2},
        idempotency_key="idem-key",
        tasks=[task],
    )

    assert second_created is False
    assert first.id == second.id
    assert second.parameters["a"] == 1  # original payload persists
    assert Jobs.query.count() == 1
    assert Users.query.count() >= 1
