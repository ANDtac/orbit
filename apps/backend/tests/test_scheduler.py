"""Phase 4 tests: scheduler service + schedules CRUD/fire-now API.

All device I/O is mocked.  No real NAPALM/Netmiko session is opened.
"""

from __future__ import annotations

import types
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

import pytest

from app.extensions import db
from app.models import Automations, Jobs, PlatformOperationTemplates
from app.models.schedule import Schedules
from app.services.scheduler import (
    PRESET_CRON,
    advance_next_run,
    get_due_schedules,
    run_scheduler_once,
)
from app.models.annotations import utcnow


# ---------------------------------------------------------------------------
# Helpers / factories
# ---------------------------------------------------------------------------
def _make_action(platform_id: int, name: str = "test-action") -> PlatformOperationTemplates:
    action = PlatformOperationTemplates(
        platform_id=platform_id,
        name=name,
        op_type="backup",
        template="show running-config",
        variables={},
        outputs={},
        is_mutating=False,
    )
    db.session.add(action)
    db.session.commit()
    return action


def _make_automation(action_id: int, name: str = "test-auto") -> Automations:
    auto = Automations(
        name=name,
        action_id=action_id,
        variable_values={},
        target={"device_ids": [1]},
        visibility="private",
        on_failure="stop",
        approval_required=False,
    )
    db.session.add(auto)
    db.session.commit()
    return auto


def _make_schedule(
    automation_id: int,
    *,
    cron_expr: str = "*/5 * * * *",
    next_run: datetime | None = None,
    enabled: bool = True,
    tz: str = "UTC",
) -> Schedules:
    _next = next_run or (utcnow() - timedelta(seconds=1))
    s = Schedules(
        target_type="automation",
        target_id=automation_id,
        cron_expr=cron_expr,
        next_run=_next,
        enabled=enabled,
        timezone=tz,
    )
    db.session.add(s)
    db.session.commit()
    return s


def _simple_schedule(cron_expr: str = "*/5 * * * *", tz: str = "UTC") -> types.SimpleNamespace:
    """Return a plain namespace object usable with advance_next_run (no DB)."""
    return types.SimpleNamespace(cron_expr=cron_expr, timezone=tz, next_run=None)


# ===========================================================================
# advance_next_run
# ===========================================================================
class TestAdvanceNextRun:
    def test_advances_from_default_base(self, app, db):
        """advance_next_run sets next_run to a future datetime."""
        s = _simple_schedule("*/5 * * * *")
        before = utcnow()
        advance_next_run(s)
        assert s.next_run is not None
        assert s.next_run > before

    def test_advances_from_explicit_base(self, app, db):
        """advance_next_run respects the from_dt parameter."""
        s = _simple_schedule("0 * * * *")  # every hour, on the hour
        base = datetime(2025, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        advance_next_run(s, from_dt=base)
        expected = datetime(2025, 1, 1, 13, 0, 0, tzinfo=timezone.utc)
        assert s.next_run == expected

    @pytest.mark.parametrize("preset,expr", list(PRESET_CRON.items()))
    def test_all_presets_advance(self, app, db, preset, expr):
        """Every preset produces a valid future next_run."""
        s = _simple_schedule(expr)
        before = utcnow()
        advance_next_run(s)
        assert s.next_run is not None
        assert s.next_run > before

    def test_timezone_field_respected(self, app, db):
        """A schedule with a non-UTC timezone still produces a UTC next_run."""
        s = _simple_schedule("0 0 * * *", tz="America/New_York")
        base = datetime(2025, 6, 1, 0, 0, 0, tzinfo=timezone.utc)
        advance_next_run(s, from_dt=base)
        assert s.next_run is not None
        # Result must be tz-aware (UTC).
        assert s.next_run.tzinfo is not None

    def test_advances_db_schedule(self, app, db, create_platform):
        """advance_next_run works on a real persisted Schedules row."""
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        automation = _make_automation(action.id)
        s = _make_schedule(automation.id, cron_expr="0 * * * *")
        # SQLite returns naive datetimes; normalise for comparison.
        before_next = s.next_run
        if before_next.tzinfo is None:
            before_next = before_next.replace(tzinfo=timezone.utc)
        advance_next_run(s)
        assert s.next_run > before_next


# ===========================================================================
# run_scheduler_once
# ===========================================================================
class TestRunSchedulerOnce:
    def _setup_env(self, create_platform):
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        automation = _make_automation(action.id)
        return automation

    def test_fires_due_schedules(self, app, db, create_platform):
        """run_scheduler_once fires schedules whose next_run is in the past."""
        automation = self._setup_env(create_platform)
        sched = _make_schedule(automation.id, next_run=utcnow() - timedelta(seconds=10))

        orig_next = sched.next_run

        fake_job = MagicMock(spec=Jobs)
        fake_job.id = 999

        with patch("app.services.scheduler.run_automation", return_value=fake_job):
            count = run_scheduler_once(app)

        assert count >= 1

        db.session.refresh(sched)
        # next_run must have advanced past its original value.
        assert sched.next_run > orig_next
        assert sched.last_job_id == 999

    def test_skips_not_yet_due(self, app, db, create_platform):
        """run_scheduler_once skips schedules whose next_run is in the future."""
        automation = self._setup_env(create_platform)
        _make_schedule(automation.id, next_run=utcnow() + timedelta(hours=1))

        with patch("app.services.scheduler.run_automation") as mock_run:
            count = run_scheduler_once(app)

        assert count == 0
        mock_run.assert_not_called()

    def test_skips_disabled_schedules(self, app, db, create_platform):
        """run_scheduler_once never fires disabled schedules."""
        automation = self._setup_env(create_platform)
        _make_schedule(
            automation.id,
            next_run=utcnow() - timedelta(seconds=10),
            enabled=False,
        )

        with patch("app.services.scheduler.run_automation") as mock_run:
            count = run_scheduler_once(app)

        assert count == 0
        mock_run.assert_not_called()

    def test_idempotency_key_prevents_double_enqueue(self, app, db, create_platform):
        """Calling run_scheduler_once twice within the same minute produces the
        same idempotency_key (truncated to the minute), so the jobs service
        deduplicates the second enqueue."""
        automation = self._setup_env(create_platform)
        now = utcnow()
        sched = _make_schedule(
            automation.id,
            next_run=now - timedelta(seconds=5),
        )

        captured_keys: list[str] = []
        fake_job = MagicMock(spec=Jobs)
        fake_job.id = 42

        def fake_run_automation(automation, *, dry_run, owner_id, idempotency_key):
            captured_keys.append(idempotency_key or "")
            return fake_job

        with patch("app.services.scheduler.run_automation", side_effect=fake_run_automation):
            # First tick: should fire.
            count1 = run_scheduler_once(app)

            # Manually reset next_run to trigger again in the same minute.
            db.session.refresh(sched)
            sched.next_run = utcnow() - timedelta(seconds=1)
            db.session.commit()

            count2 = run_scheduler_once(app)

        assert count1 == 1
        assert count2 == 1
        assert len(captured_keys) == 2

        # Both calls produced the same minute-truncated key.
        minute1 = ":".join(captured_keys[0].split(":")[:3])[:20]
        minute2 = ":".join(captured_keys[1].split(":")[:3])[:20]
        # Keys are "schedule:<id>:<YYYY-MM-DDTHH:MM>" -- compare up to minute.
        ts1 = captured_keys[0].rsplit(":", 1)[-1][:16]  # "YYYY-MM-DDTHH:MM"
        ts2 = captured_keys[1].rsplit(":", 1)[-1][:16]
        assert ts1 == ts2, f"idempotency keys must share the same minute bucket: {captured_keys}"


# ===========================================================================
# Schedule CRUD API
# ===========================================================================
class TestScheduleListCreate:
    def test_create_with_preset(self, client, auth_headers, db, create_platform):
        """POST /schedules with a preset → cron_expr stored, next_run computed."""
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        automation = _make_automation(action.id)

        hdrs = auth_headers()
        payload = {
            "target_type": "automation",
            "target_id": automation.id,
            "preset": "every_5m",
        }
        resp = client.post("/api/v1/schedules", json=payload, headers=hdrs)
        assert resp.status_code == 201, resp.get_data(as_text=True)

        data = resp.get_json()
        assert data["cron_expr"] == PRESET_CRON["every_5m"]
        assert data["next_run"] is not None
        assert data["target_type"] == "automation"
        assert data["target_id"] == automation.id
        assert data["enabled"] is True

    def test_create_with_raw_cron(self, client, auth_headers, db, create_platform):
        """POST /schedules with an explicit cron_expr is stored verbatim."""
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        automation = _make_automation(action.id)

        hdrs = auth_headers()
        payload = {
            "target_type": "automation",
            "target_id": automation.id,
            "cron_expr": "0 2 * * *",
        }
        resp = client.post("/api/v1/schedules", json=payload, headers=hdrs)
        assert resp.status_code == 201
        assert resp.get_json()["cron_expr"] == "0 2 * * *"

    def test_create_bad_cron_returns_400(self, client, auth_headers, db, create_platform):
        """POST /schedules with an invalid cron expression returns 400."""
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        automation = _make_automation(action.id)

        hdrs = auth_headers()
        payload = {
            "target_type": "automation",
            "target_id": automation.id,
            "cron_expr": "not a cron",
        }
        resp = client.post("/api/v1/schedules", json=payload, headers=hdrs)
        assert resp.status_code == 400

    def test_create_missing_cron_and_preset_returns_400(self, client, auth_headers, db, create_platform):
        """POST /schedules without cron_expr or preset returns 400."""
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        automation = _make_automation(action.id)

        hdrs = auth_headers()
        payload = {"target_type": "automation", "target_id": automation.id}
        resp = client.post("/api/v1/schedules", json=payload, headers=hdrs)
        assert resp.status_code == 400

    def test_create_unknown_target_returns_400(self, client, auth_headers, db):
        """POST /schedules with a non-existent automation target_id returns 400."""
        hdrs = auth_headers()
        payload = {
            "target_type": "automation",
            "target_id": 99999,
            "preset": "hourly",
        }
        resp = client.post("/api/v1/schedules", json=payload, headers=hdrs)
        assert resp.status_code == 400

    def test_list_returns_created(self, client, auth_headers, db, create_platform):
        """GET /schedules returns recently created schedules."""
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        automation = _make_automation(action.id)
        _make_schedule(automation.id)

        hdrs = auth_headers()
        resp = client.get("/api/v1/schedules", headers=hdrs)
        assert resp.status_code == 200
        data = resp.get_json()
        assert "data" in data
        assert len(data["data"]) >= 1


class TestScheduleItemPatchDelete:
    def _create_schedule(self, client, auth_headers, create_platform):
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        automation = _make_automation(action.id)
        hdrs = auth_headers()
        resp = client.post(
            "/api/v1/schedules",
            json={
                "target_type": "automation",
                "target_id": automation.id,
                "preset": "hourly",
            },
            headers=hdrs,
        )
        assert resp.status_code == 201
        return resp.get_json()["id"], automation.id, hdrs

    def test_patch_enabled_false_disables(self, client, auth_headers, db, create_platform):
        """PATCH enabled=False disables the schedule."""
        sched_id, _, hdrs = self._create_schedule(client, auth_headers, create_platform)

        resp = client.patch(
            f"/api/v1/schedules/{sched_id}",
            json={"enabled": False},
            headers=hdrs,
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["enabled"] is False

    def test_patch_cron_recomputes_next_run(self, client, auth_headers, db, create_platform):
        """PATCH cron_expr stores the new expression and next_run is present."""
        sched_id, _, hdrs = self._create_schedule(client, auth_headers, create_platform)

        resp = client.patch(
            f"/api/v1/schedules/{sched_id}",
            json={"cron_expr": "*/15 * * * *"},
            headers=hdrs,
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["cron_expr"] == "*/15 * * * *"
        assert data["next_run"] is not None

    def test_patch_bad_cron_returns_400(self, client, auth_headers, db, create_platform):
        """PATCH with an invalid cron_expr returns 400."""
        sched_id, _, hdrs = self._create_schedule(client, auth_headers, create_platform)
        resp = client.patch(
            f"/api/v1/schedules/{sched_id}",
            json={"cron_expr": "bad expr"},
            headers=hdrs,
        )
        assert resp.status_code == 400

    def test_delete_schedule(self, client, auth_headers, db, create_platform):
        """DELETE removes the schedule row."""
        sched_id, _, hdrs = self._create_schedule(client, auth_headers, create_platform)

        resp = client.delete(f"/api/v1/schedules/{sched_id}", headers=hdrs)
        assert resp.status_code == 200

        resp2 = client.get(f"/api/v1/schedules/{sched_id}", headers=hdrs)
        assert resp2.status_code == 404

    def test_get_not_found(self, client, auth_headers, db):
        """GET on a missing id returns 404."""
        hdrs = auth_headers()
        resp = client.get("/api/v1/schedules/99999", headers=hdrs)
        assert resp.status_code == 404


class TestFireNow:
    def test_fire_now_enqueues_job(self, client, auth_headers, app, db, create_platform):
        """POST /schedules/<id>/fire-now enqueues a job and advances next_run."""
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        automation = _make_automation(action.id)

        hdrs = auth_headers()
        resp = client.post(
            "/api/v1/schedules",
            json={
                "target_type": "automation",
                "target_id": automation.id,
                "preset": "every_15m",
            },
            headers=hdrs,
        )
        assert resp.status_code == 201
        sched_id = resp.get_json()["id"]

        fake_job = MagicMock(spec=Jobs)
        fake_job.id = 777

        with patch("app.services.scheduler.run_automation", return_value=fake_job):
            resp2 = client.post(f"/api/v1/schedules/{sched_id}/fire-now", headers=hdrs)

        assert resp2.status_code == 202
        data = resp2.get_json()
        assert data["last_job_id"] == 777

    def test_fire_now_not_found(self, client, auth_headers, db):
        """POST /schedules/99999/fire-now returns 404."""
        hdrs = auth_headers()
        resp = client.post("/api/v1/schedules/99999/fire-now", headers=hdrs)
        assert resp.status_code == 404
