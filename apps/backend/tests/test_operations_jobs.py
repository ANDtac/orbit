from __future__ import annotations

from app.extensions import db
from app.models import CompliancePolicies, Jobs, JobTasks, Users


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

    job = db.session.get(Jobs, job_id)
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


def test_jobs_list_accepts_admin_role_and_job_type_wildcard(client, auth_passwords, create_user, create_device):
    auth_passwords.add("pw")
    create_user("ops-admin", "pw", roles=["admin"])

    login = client.post("/api/v1/auth/login", json={"username": "ops-admin", "password": "pw"})
    headers = {"Authorization": f"Bearer {login.get_json()['access_token']}"}

    device = create_device()

    operation_resp = client.post(
        "/api/v1/operations/execute",
        json=_operation_payload([device.id]),
        headers=headers,
    )
    assert operation_resp.status_code == 202

    other_job = Jobs(job_type="compliance.evaluate", status="queued", queue="default", parameters={})
    db.session.add(other_job)
    db.session.commit()

    jobs_resp = client.get("/api/v1/jobs?job_type=operation.*", headers=headers)

    assert jobs_resp.status_code == 200
    payload = jobs_resp.get_json()
    assert [job["job_type"] for job in payload["data"]] == ["operation.execute"]


def test_jobs_list_filters_by_run_as_internal(client, auth_headers, create_job):
    headers = auth_headers("runs-admin", "pw")

    system_job = create_job(job_type="device.discovery", run_as_internal=True)
    operator_job = create_job(job_type="password_change.batch", run_as_internal=False)

    system_resp = client.get("/api/v1/jobs?run_as_internal=true", headers=headers)
    assert system_resp.status_code == 200
    system_ids = [job["id"] for job in system_resp.get_json()["data"]]
    assert system_ids == [system_job.id]

    operator_resp = client.get("/api/v1/jobs?run_as_internal=false", headers=headers)
    assert operator_resp.status_code == 200
    operator_ids = [job["id"] for job in operator_resp.get_json()["data"]]
    assert operator_ids == [operator_job.id]


def test_jobs_list_run_as_internal_case_insensitive(client, auth_headers, create_job):
    headers = auth_headers("runs-admin-ci", "pw")

    system_job = create_job(job_type="device.discovery", run_as_internal=True)
    create_job(job_type="password_change.batch", run_as_internal=False)

    resp = client.get("/api/v1/jobs?run_as_internal=TRUE", headers=headers)
    assert resp.status_code == 200
    assert [job["id"] for job in resp.get_json()["data"]] == [system_job.id]


def test_jobs_list_without_run_as_internal_returns_all(client, auth_headers, create_job):
    headers = auth_headers("runs-admin-all", "pw")

    system_job = create_job(job_type="device.discovery", run_as_internal=True)
    operator_job = create_job(job_type="password_change.batch", run_as_internal=False)

    resp = client.get("/api/v1/jobs", headers=headers)
    assert resp.status_code == 200
    returned_ids = {job["id"] for job in resp.get_json()["data"]}
    assert returned_ids == {system_job.id, operator_job.id}


def test_compliance_evaluate_creates_job(client, auth_headers):
    headers = auth_headers("compliance-user", "pw")
    user = Users.query.filter_by(username="compliance-user").one()

    policy = CompliancePolicies(name="Config Baseline", is_active=True)
    db.session.add(policy)
    db.session.commit()

    resp = client.post(
        "/api/v1/compliance/evaluate",
        json={"policy_ids": [policy.id], "async": True},
        headers=headers,
    )

    assert resp.status_code == 202
    payload = resp.get_json()
    job_id = payload["job"]["id"]

    job = db.session.get(Jobs, job_id)
    assert job is not None
    assert job.job_type == "compliance.evaluate"
    assert job.owner_id == user.id
    assert resp.headers["Location"].endswith(f"/jobs/{job_id}")

    tasks = JobTasks.query.filter_by(job_id=job_id).all()
    assert len(tasks) == 1
    assert tasks[0].target_type == "policy"
    assert tasks[0].target_id == policy.id
