from __future__ import annotations

from app.models import Jobs, JobTasks, Users


def _operation_payload(device_ids: list[int]) -> dict:
    return {
        "device_ids": device_ids,
        "op_type": "backup",
        "variables": {"foo": "bar"},
        "dry_run": True,
        "timeout_sec": 120,
        "stop_on_error": False,
        "async": True,
    }


def test_async_operation_creates_job(client, auth_headers, create_device):
    device = create_device()
    headers = auth_headers("async-user", "pw")
    user = Users.query.filter_by(username="async-user").one()

    resp = client.post(
        "/api/v1/operations/execute",
        json=_operation_payload([device.id]),
        headers=headers,
    )

    assert resp.status_code == 202
    data = resp.get_json()
    job_payload = data["job"]
    job_id = job_payload["id"]

    job = Jobs.query.get(job_id)
    assert job is not None
    assert job.owner_id == user.id
    assert job.status == "queued"
    assert job.progress_total == 1
    assert resp.headers["Location"].endswith(f"/jobs/{job_id}")

    tasks = JobTasks.query.filter_by(job_id=job_id).all()
    assert len(tasks) == 1
    assert tasks[0].device_id == device.id


def test_async_operation_idempotency_reuses_job(client, auth_headers, create_device):
    device = create_device()
    headers = auth_headers("async-user2", "pw")

    payload = _operation_payload([device.id])
    idem_headers = {**headers, "Idempotency-Key": "op-123"}

    first = client.post("/api/v1/operations/execute", json=payload, headers=idem_headers)
    assert first.status_code == 202
    first_job_id = first.get_json()["job"]["id"]

    second = client.post("/api/v1/operations/execute", json=payload, headers=idem_headers)
    assert second.status_code == 200
    second_job_id = second.get_json()["job"]["id"]

    assert first_job_id == second_job_id
    assert Jobs.query.count() == 1
