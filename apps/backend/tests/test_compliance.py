from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.extensions import db
from app.models import ComplianceResults, ComplianceRules, JobTasks, Jobs


def test_compliance_policy_rule_and_result_flows(
    client,
    auth_headers,
    create_compliance_policy,
    create_device,
):
    headers = auth_headers("compliance-admin", "pw")
    device = create_device()
    policy = create_compliance_policy("Core Baseline")

    rule_resp = client.post(
        "/api/v1/compliance/rules",
        json={
            "policy_id": policy.id,
            "name": "Hostname present",
            "severity": "medium",
            "rule_type": "regex",
            "expression": "^hostname\\s+",
            "params": {"multiline": True},
        },
        headers=headers,
    )
    assert rule_resp.status_code == 201, rule_resp.data
    rule_id = rule_resp.get_json()["id"]

    patch_resp = client.patch(
        f"/api/v1/compliance/policies/{policy.id}",
        json={"description": "Applies to core switches"},
        headers=headers,
    )
    assert patch_resp.status_code == 200
    assert patch_resp.get_json()["description"] == "Applies to core switches"

    result = ComplianceResults(
        device_id=device.id,
        policy_id=policy.id,
        rule_id=rule_id,
        is_compliant=False,
        status="fail",
        summary="hostname missing",
        details={"line": "hostname"},
        evaluated_at=datetime.now(timezone.utc) - timedelta(minutes=5),
    )
    db.session.add(result)
    db.session.commit()

    results_resp = client.get(
        f"/api/v1/compliance/results?device_id={device.id}&policy_id={policy.id}&status=fail",
        headers=headers,
    )

    assert results_resp.status_code == 200
    payload = results_resp.get_json()
    assert len(payload) == 1
    assert payload[0]["status"] == "fail"
    assert payload[0]["rule_id"] == rule_id

    delete_rule_resp = client.delete(f"/api/v1/compliance/rules/{rule_id}", headers=headers)
    assert delete_rule_resp.status_code == 200
    assert db.session.get(ComplianceRules, rule_id) is None


def test_compliance_evaluate_validates_scope_and_creates_job(
    client,
    auth_headers,
    create_compliance_policy,
    create_device,
):
    headers = auth_headers("compliance-runner", "pw")
    device = create_device()
    policy = create_compliance_policy("WAN Baseline")

    missing_resp = client.post(
        "/api/v1/compliance/evaluate",
        json={"device_ids": [99999], "policy_ids": [policy.id], "async": True},
        headers=headers,
    )
    assert missing_resp.status_code == 404

    queued_resp = client.post(
        "/api/v1/compliance/evaluate",
        json={"device_ids": [device.id], "policy_ids": [policy.id], "async": True},
        headers=headers,
    )
    assert queued_resp.status_code == 202
    job_id = queued_resp.get_json()["job"]["id"]

    job = db.session.get(Jobs, job_id)
    assert job is not None
    assert job.job_type == "compliance.evaluate"
    assert job.parameters["scope"]["device_ids"] == [device.id]
    task = JobTasks.query.filter_by(job_id=job_id).one()
    assert task.target_type == "policy"
    assert task.target_id == policy.id
