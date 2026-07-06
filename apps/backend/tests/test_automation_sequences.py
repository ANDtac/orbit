"""Phase 5 tests: linear sequences + typed bindings.

Tests cover:
- validate_bindings: accepts valid bindings, rejects ordering violations,
  undeclared output fields, and type mismatches.
- resolve_bindings: resolves __ref__ values from prior results, raises on
  missing values.
- Sequence CRUD: POST/PATCH with steps persists AutomationSteps rows; invalid
  bindings return 400; step replacement on PATCH.
- Sequence execution (run_worker_once + mocked device I/O):
  * 2-step automation runs step 1, passes output to step 2 via binding.
  * on_failure=stop on step 1 failure causes step 2 to be skipped.

CRITICAL: all device I/O is mocked. No real NAPALM/Netmiko session is opened.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.extensions import db
from app.models import Automations, JobTasks, Jobs, PlatformOperationTemplates
from app.models.automation_step import AutomationSteps
from app.services import automations as automations_service
from app.services import operations as ops
from app.services.worker import run_worker_once


# ---------------------------------------------------------------------------
# Helpers / shared fixtures
# ---------------------------------------------------------------------------
def _make_action(
    platform_id: int,
    *,
    name: str = "Show Version",
    op_type: str = "show_version",
    template: str = "show version",
    variables: dict | None = None,
    outputs: dict | None = None,
    is_mutating: bool = False,
) -> PlatformOperationTemplates:
    action = PlatformOperationTemplates(
        platform_id=platform_id,
        name=name,
        op_type=op_type,
        template=template,
        variables=variables or {},
        outputs=outputs or {},
        is_mutating=is_mutating,
    )
    db.session.add(action)
    db.session.commit()
    return action


def _make_step(
    automation_id: int,
    sequence: int,
    action_id: int,
    *,
    variable_bindings: dict | None = None,
    on_failure: str = "stop",
) -> AutomationSteps:
    step = AutomationSteps(
        automation_id=automation_id,
        sequence=sequence,
        action_id=action_id,
        variable_bindings=variable_bindings or {},
        on_failure=on_failure,
    )
    db.session.add(step)
    db.session.commit()
    return step


# ---------------------------------------------------------------------------
# validate_bindings
# ---------------------------------------------------------------------------
class TestValidateBindings:
    def test_accepts_valid_literal_bindings(self, app, db, create_platform):
        platform = create_platform("cisco_xe", "ios")
        a1 = _make_action(
            platform.id,
            name="A1",
            op_type="op1",
            outputs={"version": {"type": "string"}},
        )
        a2 = _make_action(
            platform.id,
            name="A2",
            op_type="op2",
            variables={"server": {"type": "string"}},
        )
        auto = Automations(name="t", action_id=a1.id, variable_values={}, target={})
        db.session.add(auto)
        db.session.commit()

        step1 = _make_step(auto.id, 1, a1.id)
        step2 = _make_step(auto.id, 2, a2.id, variable_bindings={"server": "1.2.3.4"})

        # Should not raise
        automations_service.validate_bindings([step1, step2], {a1.id: a1, a2.id: a2})

    def test_accepts_valid_ref_binding(self, app, db, create_platform):
        platform = create_platform("cisco_xe", "ios")
        a1 = _make_action(
            platform.id,
            name="A1",
            op_type="op1",
            outputs={"peer_ip": {"type": "string"}},
        )
        a2 = _make_action(
            platform.id,
            name="A2",
            op_type="op2",
            variables={"target_ip": {"type": "string"}},
        )
        auto = Automations(name="t", action_id=a1.id, variable_values={}, target={})
        db.session.add(auto)
        db.session.commit()

        step1 = _make_step(auto.id, 1, a1.id)
        step2 = _make_step(
            auto.id,
            2,
            a2.id,
            variable_bindings={
                "target_ip": {"__ref__": True, "step": 1, "output": "peer_ip"}
            },
        )

        # Should not raise
        automations_service.validate_bindings([step1, step2], {a1.id: a1, a2.id: a2})

    def test_rejects_out_of_order_ref(self, app, db, create_platform):
        """Step 2 binding references step 3 which does not precede it."""
        platform = create_platform("cisco_xe", "ios")
        a1 = _make_action(
            platform.id,
            name="A1",
            op_type="op1",
            outputs={"peer_ip": {"type": "string"}},
        )
        a2 = _make_action(
            platform.id,
            name="A2",
            op_type="op2",
            variables={"target_ip": {"type": "string"}},
        )
        auto = Automations(name="t", action_id=a1.id, variable_values={}, target={})
        db.session.add(auto)
        db.session.commit()

        step1 = _make_step(auto.id, 1, a1.id)
        step2 = _make_step(
            auto.id,
            2,
            a2.id,
            variable_bindings={
                # references step 3 (>= current sequence 2) — invalid
                "target_ip": {"__ref__": True, "step": 3, "output": "peer_ip"}
            },
        )

        with pytest.raises(ValueError, match="does not precede"):
            automations_service.validate_bindings([step1, step2], {a1.id: a1, a2.id: a2})

    def test_rejects_same_step_ref(self, app, db, create_platform):
        """A step may not reference its own sequence (S >= current)."""
        platform = create_platform("cisco_xe", "ios")
        a1 = _make_action(
            platform.id,
            name="A1",
            op_type="op1",
            outputs={"ver": {"type": "string"}},
            variables={"ver": {"type": "string"}},
        )
        auto = Automations(name="t", action_id=a1.id, variable_values={}, target={})
        db.session.add(auto)
        db.session.commit()

        step1 = _make_step(
            auto.id,
            1,
            a1.id,
            variable_bindings={"ver": {"__ref__": True, "step": 1, "output": "ver"}},
        )

        with pytest.raises(ValueError, match="does not precede"):
            automations_service.validate_bindings([step1], {a1.id: a1})

    def test_rejects_undeclared_output_field(self, app, db, create_platform):
        platform = create_platform("cisco_xe", "ios")
        a1 = _make_action(
            platform.id,
            name="A1",
            op_type="op1",
            outputs={"version": {"type": "string"}},
        )
        a2 = _make_action(
            platform.id,
            name="A2",
            op_type="op2",
            variables={"target_ip": {"type": "string"}},
        )
        auto = Automations(name="t", action_id=a1.id, variable_values={}, target={})
        db.session.add(auto)
        db.session.commit()

        step1 = _make_step(auto.id, 1, a1.id)
        step2 = _make_step(
            auto.id,
            2,
            a2.id,
            variable_bindings={
                # "peer_ip" is not in a1.outputs
                "target_ip": {"__ref__": True, "step": 1, "output": "peer_ip"}
            },
        )

        with pytest.raises(ValueError, match="not declared in the outputs"):
            automations_service.validate_bindings([step1, step2], {a1.id: a1, a2.id: a2})

    def test_rejects_type_mismatch(self, app, db, create_platform):
        platform = create_platform("cisco_xe", "ios")
        # a1 outputs "count" as "number"
        a1 = _make_action(
            platform.id,
            name="A1",
            op_type="op1",
            outputs={"count": {"type": "number"}},
        )
        # a2 input "hostname" expects "string"
        a2 = _make_action(
            platform.id,
            name="A2",
            op_type="op2",
            variables={"hostname": {"type": "string"}},
        )
        auto = Automations(name="t", action_id=a1.id, variable_values={}, target={})
        db.session.add(auto)
        db.session.commit()

        step1 = _make_step(auto.id, 1, a1.id)
        step2 = _make_step(
            auto.id,
            2,
            a2.id,
            variable_bindings={
                "hostname": {"__ref__": True, "step": 1, "output": "count"}
            },
        )

        with pytest.raises(ValueError, match="type mismatch"):
            automations_service.validate_bindings([step1, step2], {a1.id: a1, a2.id: a2})


# ---------------------------------------------------------------------------
# resolve_bindings
# ---------------------------------------------------------------------------
class TestResolveBindings:
    def test_resolves_ref_from_prior_results(self, app, db, create_platform):
        platform = create_platform("cisco_xe", "ios")
        a1 = _make_action(platform.id, name="A1", op_type="op1")
        a2 = _make_action(
            platform.id,
            name="A2",
            op_type="op2",
            variables={"peer_ip": {"type": "string"}},
        )
        auto = Automations(name="t", action_id=a1.id, variable_values={}, target={})
        db.session.add(auto)
        db.session.commit()

        step2 = _make_step(
            auto.id,
            2,
            a2.id,
            variable_bindings={"peer_ip": {"__ref__": True, "step": 1, "output": "discovered_ip"}},
        )

        prior_results = {1: {"fields": {"discovered_ip": "10.0.0.5"}}}
        resolved = automations_service.resolve_bindings(step2, prior_results)
        assert resolved == {"peer_ip": "10.0.0.5"}

    def test_passes_through_literal_values(self, app, db, create_platform):
        platform = create_platform("cisco_xe", "ios")
        a1 = _make_action(platform.id, name="A1", op_type="op1")
        auto = Automations(name="t", action_id=a1.id, variable_values={}, target={})
        db.session.add(auto)
        db.session.commit()

        step = _make_step(auto.id, 2, a1.id, variable_bindings={"server": "1.2.3.4"})

        resolved = automations_service.resolve_bindings(step, {})
        assert resolved == {"server": "1.2.3.4"}

    def test_raises_on_missing_step_result(self, app, db, create_platform):
        platform = create_platform("cisco_xe", "ios")
        a1 = _make_action(platform.id, name="A1", op_type="op1")
        auto = Automations(name="t", action_id=a1.id, variable_values={}, target={})
        db.session.add(auto)
        db.session.commit()

        step = _make_step(
            auto.id,
            2,
            a1.id,
            variable_bindings={"x": {"__ref__": True, "step": 1, "output": "x"}},
        )

        with pytest.raises(ValueError, match="no prior result"):
            automations_service.resolve_bindings(step, {})

    def test_raises_on_missing_field_in_result(self, app, db, create_platform):
        platform = create_platform("cisco_xe", "ios")
        a1 = _make_action(platform.id, name="A1", op_type="op1")
        auto = Automations(name="t", action_id=a1.id, variable_values={}, target={})
        db.session.add(auto)
        db.session.commit()

        step = _make_step(
            auto.id,
            2,
            a1.id,
            variable_bindings={"x": {"__ref__": True, "step": 1, "output": "missing_field"}},
        )

        with pytest.raises(ValueError, match="not present in prior results"):
            automations_service.resolve_bindings(step, {1: {"fields": {"other": "val"}}})


# ---------------------------------------------------------------------------
# Sequence CRUD via REST API
# ---------------------------------------------------------------------------
class TestSequenceCRUD:
    def test_post_with_steps_stores_step_rows(self, app, client, auth_headers, create_device):
        headers = auth_headers("seq-admin", "pw")
        device = create_device()

        a1 = _make_action(
            device.platform_id,
            name="Step1Action",
            op_type="op_s1",
            outputs={"version": {"type": "string"}},
        )
        a2 = _make_action(
            device.platform_id,
            name="Step2Action",
            op_type="op_s2",
            variables={"ver": {"type": "string"}},
        )

        resp = client.post(
            "/api/v1/automations",
            json={
                "name": "My Sequence",
                "action_id": a1.id,
                "steps": [
                    {"sequence": 1, "action_id": a1.id, "on_failure": "stop"},
                    {
                        "sequence": 2,
                        "action_id": a2.id,
                        "variable_bindings": {
                            "ver": {"__ref__": True, "step": 1, "output": "version"}
                        },
                    },
                ],
                "target": {"device_ids": [device.id]},
            },
            headers=headers,
        )
        assert resp.status_code == 201, resp.data
        body = resp.get_json()
        assert body["name"] == "My Sequence"
        assert len(body["steps"]) == 2
        assert body["steps"][0]["sequence"] == 1
        assert body["steps"][0]["action_id"] == a1.id
        assert body["steps"][1]["sequence"] == 2
        assert body["steps"][1]["variable_bindings"]["ver"]["__ref__"] is True

        # Verify rows in DB.
        auto = db.session.get(Automations, body["id"])
        assert len(auto.steps) == 2

    def test_post_with_invalid_binding_returns_400(
        self, app, client, auth_headers, create_device
    ):
        headers = auth_headers("seq-admin2", "pw")
        device = create_device()

        a1 = _make_action(
            device.platform_id,
            name="A1x",
            op_type="op_a1x",
            outputs={"count": {"type": "number"}},
        )
        a2 = _make_action(
            device.platform_id,
            name="A2x",
            op_type="op_a2x",
            variables={"hostname": {"type": "string"}},
        )

        resp = client.post(
            "/api/v1/automations",
            json={
                "name": "Bad Seq",
                "steps": [
                    {"sequence": 1, "action_id": a1.id},
                    {
                        "sequence": 2,
                        "action_id": a2.id,
                        "variable_bindings": {
                            # type mismatch: number → string
                            "hostname": {"__ref__": True, "step": 1, "output": "count"}
                        },
                    },
                ],
                "target": {"device_ids": [device.id]},
            },
            headers=headers,
        )
        assert resp.status_code == 400
        assert "type mismatch" in (resp.get_json().get("detail") or "")

    def test_patch_replaces_steps(self, app, client, auth_headers, create_device):
        headers = auth_headers("seq-admin3", "pw")
        device = create_device()

        a1 = _make_action(
            device.platform_id,
            name="A1r",
            op_type="op_a1r",
            outputs={"version": {"type": "string"}},
        )
        a2 = _make_action(
            device.platform_id,
            name="A2r",
            op_type="op_a2r",
            variables={"ver": {"type": "string"}},
        )

        # Create with 1 step.
        create_resp = client.post(
            "/api/v1/automations",
            json={
                "name": "Patch Seq",
                "steps": [{"sequence": 1, "action_id": a1.id}],
                "target": {"device_ids": [device.id]},
            },
            headers=headers,
        )
        assert create_resp.status_code == 201
        auto_id = create_resp.get_json()["id"]

        # PATCH to replace with 2 steps.
        patch_resp = client.patch(
            f"/api/v1/automations/{auto_id}",
            json={
                "steps": [
                    {"sequence": 1, "action_id": a1.id},
                    {
                        "sequence": 2,
                        "action_id": a2.id,
                        "variable_bindings": {
                            "ver": {"__ref__": True, "step": 1, "output": "version"}
                        },
                    },
                ]
            },
            headers=headers,
        )
        assert patch_resp.status_code == 200, patch_resp.data
        body = patch_resp.get_json()
        assert len(body["steps"]) == 2

        # Only 2 AutomationSteps rows should exist for this automation.
        count = AutomationSteps.query.filter_by(automation_id=auto_id).count()
        assert count == 2

    def test_post_with_out_of_order_ref_returns_400(
        self, app, client, auth_headers, create_device
    ):
        headers = auth_headers("seq-admin4", "pw")
        device = create_device()

        a1 = _make_action(
            device.platform_id,
            name="A1oo",
            op_type="op_a1oo",
            outputs={"x": {"type": "string"}},
            variables={"x": {"type": "string"}},
        )

        resp = client.post(
            "/api/v1/automations",
            json={
                "name": "OOO Seq",
                "steps": [
                    {
                        "sequence": 1,
                        "action_id": a1.id,
                        "variable_bindings": {
                            # self-reference: step 1 references step 1
                            "x": {"__ref__": True, "step": 1, "output": "x"}
                        },
                    }
                ],
                "target": {"device_ids": [device.id]},
            },
            headers=headers,
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Sequence execution with run_worker_once
# ---------------------------------------------------------------------------
class TestSequenceExecution:
    """Integration tests for the multi-step worker execution path."""

    def _mock_run_cli(self, output: str):
        """Return a monkeypatch target that always produces *output*."""
        return lambda target, command, timeout: output

    def test_two_step_automation_passes_binding_to_step2(
        self, app, db, create_device, monkeypatch
    ):
        """Step 1 produces a version field; step 2 receives it via a binding."""
        device = create_device()
        platform_id = device.platform_id

        # Step 1 action: outputs 'version' field parsed from CLI
        a1 = _make_action(
            platform_id,
            name="GetVer",
            op_type="get_ver",
            template="show version",
            outputs={"version": {"type": "string", "source": "regex", "pattern": r"Version (\S+)"}},
        )
        # Step 2 action: accepts 'ver' as string input
        a2 = _make_action(
            platform_id,
            name="SetVer",
            op_type="set_ver",
            template="set version {{ ver }}",
            variables={"ver": {"type": "string"}},
        )

        auto = Automations(
            name="GetAndSet",
            action_id=a1.id,
            variable_values={},
            target={"device_ids": [device.id]},
        )
        db.session.add(auto)
        db.session.flush()

        step1 = AutomationSteps(
            automation_id=auto.id,
            sequence=1,
            action_id=a1.id,
            variable_bindings={},
            on_failure="stop",
        )
        step2 = AutomationSteps(
            automation_id=auto.id,
            sequence=2,
            action_id=a2.id,
            variable_bindings={
                "ver": {"__ref__": True, "step": 1, "output": "version"}
            },
            on_failure="stop",
        )
        db.session.add_all([step1, step2])
        db.session.commit()

        # Reload to get steps relationship populated.
        db.session.expire(auto)
        auto = db.session.get(Automations, auto.id)

        # Enqueue the job.
        job = automations_service.run_automation(auto)
        job_id = job.id
        db.session.commit()

        # Mock device I/O so step 1 returns "Version 17.6.4"
        monkeypatch.setattr(
            ops, "_run_cli", lambda target, command, timeout: "Cisco IOS XE Software, Version 17.6.4"
        )

        # Execute via the worker inline path.
        did_work = run_worker_once(app)
        assert did_work

        # Verify job succeeded.
        job = db.session.get(Jobs, job_id)
        assert job.status == "succeeded", f"Job failed: {job.error}"

        tasks = JobTasks.query.filter_by(job_id=job_id).order_by(JobTasks.sequence).all()
        assert len(tasks) == 2

        # Both tasks should have succeeded.
        for task in tasks:
            assert task.status == "succeeded", f"Task {task.sequence} failed: {task.error}"

        # Step 2 task's parameters should have the resolved 'ver' value.
        step2_task = next(
            t for t in tasks
            if (t.parameters or {}).get("__sequence_step__") == 2
        )
        assert step2_task.parameters.get("variables", {}).get("ver") == "17.6.4"

    def test_on_failure_stop_skips_step2_when_step1_fails(
        self, app, db, create_device, monkeypatch
    ):
        """When step 1 fails and on_failure=stop, step 2 must be skipped."""
        device = create_device()
        platform_id = device.platform_id

        # Use source="raw" so needs_cli=True and _run_cli is actually invoked.
        a1 = _make_action(
            platform_id,
            name="FailAction",
            op_type="fail_op",
            template="fail command",
            outputs={"output": {"type": "string", "source": "raw"}},
        )
        a2 = _make_action(
            platform_id,
            name="SafeAction",
            op_type="safe_op",
            template="safe command",
            outputs={"output": {"type": "string", "source": "raw"}},
        )

        auto = Automations(
            name="StopOnFail",
            action_id=a1.id,
            variable_values={},
            target={"device_ids": [device.id]},
        )
        db.session.add(auto)
        db.session.flush()

        step1 = AutomationSteps(
            automation_id=auto.id,
            sequence=1,
            action_id=a1.id,
            variable_bindings={},
            on_failure="stop",
        )
        step2 = AutomationSteps(
            automation_id=auto.id,
            sequence=2,
            action_id=a2.id,
            variable_bindings={},
            on_failure="stop",
        )
        db.session.add_all([step1, step2])
        db.session.commit()

        db.session.expire(auto)
        auto = db.session.get(Automations, auto.id)
        job = automations_service.run_automation(auto)
        job_id = job.id
        db.session.commit()

        # Make _run_cli raise (device connection error) — ops service captures
        # it as ok=False in the result, which the sequence worker detects.
        def _always_fail(target, command, timeout):
            raise RuntimeError("connection refused")

        monkeypatch.setattr(ops, "_run_cli", _always_fail)

        did_work = run_worker_once(app)
        assert did_work

        job = db.session.get(Jobs, job_id)
        assert job.status == "failed"

        tasks = JobTasks.query.filter_by(job_id=job_id).order_by(JobTasks.sequence).all()
        assert len(tasks) == 2

        step1_task = next(
            t for t in tasks
            if (t.parameters or {}).get("__sequence_step__") == 1
        )
        step2_task = next(
            t for t in tasks
            if (t.parameters or {}).get("__sequence_step__") == 2
        )
        assert step1_task.status == "failed"
        # Step 2 must have been skipped (marked failed/skipped).
        assert step2_task.status == "failed"
        assert "skipped" in (step2_task.error or {}).get("message", "")

    def test_on_failure_continue_runs_step2_despite_step1_failure(
        self, app, db, create_device, monkeypatch
    ):
        """When on_failure=continue, step 2 executes even if step 1 failed."""
        device = create_device()
        platform_id = device.platform_id

        # Use source="raw" so needs_cli=True and _run_cli is actually invoked.
        a1 = _make_action(
            platform_id,
            name="FailContinue",
            op_type="fail_cont",
            template="might fail",
            outputs={"output": {"type": "string", "source": "raw"}},
        )
        a2 = _make_action(
            platform_id,
            name="AlwaysRun",
            op_type="always_run",
            template="always command",
            outputs={"output": {"type": "string", "source": "raw"}},
        )

        auto = Automations(
            name="ContinueOnFail",
            action_id=a1.id,
            variable_values={},
            target={"device_ids": [device.id]},
        )
        db.session.add(auto)
        db.session.flush()

        step1 = AutomationSteps(
            automation_id=auto.id,
            sequence=1,
            action_id=a1.id,
            variable_bindings={},
            on_failure="continue",  # key: don't stop on failure
        )
        step2 = AutomationSteps(
            automation_id=auto.id,
            sequence=2,
            action_id=a2.id,
            variable_bindings={},
            on_failure="stop",
        )
        db.session.add_all([step1, step2])
        db.session.commit()

        db.session.expire(auto)
        auto = db.session.get(Automations, auto.id)
        job = automations_service.run_automation(auto)
        job_id = job.id
        db.session.commit()

        call_count = {"n": 0}

        def _selective_fail(target, command, timeout):
            call_count["n"] += 1
            if call_count["n"] == 1:
                raise RuntimeError("step 1 error")
            return "ok output"

        monkeypatch.setattr(ops, "_run_cli", _selective_fail)

        did_work = run_worker_once(app)
        assert did_work

        tasks = JobTasks.query.filter_by(job_id=job_id).order_by(JobTasks.sequence).all()
        step1_task = next(
            t for t in tasks
            if (t.parameters or {}).get("__sequence_step__") == 1
        )
        step2_task = next(
            t for t in tasks
            if (t.parameters or {}).get("__sequence_step__") == 2
        )
        # Step 1 failed but step 2 should have run (not skipped).
        assert step1_task.status == "failed"
        assert step2_task.status == "succeeded", f"step2 not run: {step2_task.error}"
