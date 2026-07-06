"""Phase 6 tests: Monitor models, service, worker handler, scheduler, and REST API.

All device I/O is mocked — no real NAPALM/Netmiko session is opened.
"""

from __future__ import annotations

import types
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.extensions import db as _db
from app.models import Jobs, PlatformOperationTemplates
from app.models.monitor import MonitorResults, Monitors
from app.models.schedule import Schedules
from app.services import monitors as monitors_service
from app.services.monitors import (
    _apply_comparator,
    _worst_status,
    record_monitor_results,
    validate_monitor,
)


# ---------------------------------------------------------------------------
# Helpers / factories
# ---------------------------------------------------------------------------
def _make_action(
    platform_id: int,
    *,
    name: str = "Show Interface",
    op_type: str = "show_interface",
    template: str = "show interface {{ iface }}",
    outputs: dict | None = None,
    is_mutating: bool = False,
) -> PlatformOperationTemplates:
    action = PlatformOperationTemplates(
        platform_id=platform_id,
        name=name,
        op_type=op_type,
        template=template,
        variables={},
        outputs=outputs or {"bw_util": {"type": "number"}},
        is_mutating=is_mutating,
    )
    _db.session.add(action)
    _db.session.commit()
    return action


def _make_monitor(
    action_id: int,
    *,
    name: str = "BW Monitor",
    metric: str = "bw_util",
    comparator: str = "lt",
    threshold: float | None = 90.0,
    target: dict | None = None,
    visibility: str = "private",
) -> Monitors:
    m = Monitors(
        name=name,
        action_id=action_id,
        metric=metric,
        comparator=comparator,
        threshold=threshold,
        target=target or {},
        visibility=visibility,
    )
    _db.session.add(m)
    _db.session.commit()
    return m


def _make_schedule(
    target_type: str,
    target_id: int,
    *,
    cron_expr: str = "*/5 * * * *",
    owner_id: int | None = None,
) -> Schedules:
    now = datetime.now(timezone.utc)
    s = Schedules(
        name=f"{target_type}-schedule",
        target_type=target_type,
        target_id=target_id,
        cron_expr=cron_expr,
        next_run=now,
        enabled=True,
        owner_id=owner_id,
    )
    _db.session.add(s)
    _db.session.commit()
    return s


# ---------------------------------------------------------------------------
# validate_monitor
# ---------------------------------------------------------------------------
class TestValidateMonitor:
    def test_accepts_non_mutating(self, app, db, create_platform):
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id, is_mutating=False)
        validate_monitor(action)  # should not raise

    def test_rejects_mutating(self, app, db, create_platform):
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id, is_mutating=True)
        with pytest.raises(ValueError, match="mutating"):
            validate_monitor(action)


# ---------------------------------------------------------------------------
# _apply_comparator
# ---------------------------------------------------------------------------
class TestApplyComparator:
    @pytest.mark.parametrize(
        "value,comparator,threshold,expected",
        [
            (100.0, "gt", 90.0, True),
            (80.0, "gt", 90.0, False),
            (80.0, "lt", 90.0, True),
            (100.0, "lt", 90.0, False),
            (90.0, "gte", 90.0, True),
            (89.9, "gte", 90.0, False),
            (90.0, "lte", 90.0, True),
            (90.1, "lte", 90.0, False),
            (5.0, "eq", 5.0, True),
            (5.1, "eq", 5.0, False),
            (5.1, "ne", 5.0, True),
            (5.0, "ne", 5.0, False),
        ],
    )
    def test_comparators(self, value, comparator, threshold, expected):
        assert _apply_comparator(value, comparator, threshold) is expected


# ---------------------------------------------------------------------------
# _worst_status
# ---------------------------------------------------------------------------
class TestWorstStatus:
    def test_empty_returns_unknown(self):
        assert _worst_status([]) == "unknown"

    def test_all_passing(self):
        assert _worst_status(["passing", "passing"]) == "passing"

    def test_failing_beats_passing(self):
        assert _worst_status(["passing", "failing"]) == "failing"

    def test_error_beats_passing(self):
        assert _worst_status(["passing", "error"]) == "error"

    def test_failing_beats_error(self):
        assert _worst_status(["error", "failing"]) == "failing"


# ---------------------------------------------------------------------------
# record_monitor_results
# ---------------------------------------------------------------------------
class TestRecordMonitorResults:
    def test_passing_when_threshold_satisfied(self, app, db, create_platform):
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id, metric="bw_util", comparator="lt", threshold=90.0)

        record_monitor_results(monitor, [{"device_id": None, "fields": {"bw_util": 50.0}}])

        results = MonitorResults.query.filter_by(monitor_id=monitor.id).all()
        assert len(results) == 1
        assert results[0].status == "passing"
        assert results[0].value == pytest.approx(50.0)
        assert monitor.status == "passing"

    def test_failing_when_threshold_violated(self, app, db, create_platform):
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id, metric="bw_util", comparator="lt", threshold=90.0)

        record_monitor_results(monitor, [{"device_id": None, "fields": {"bw_util": 95.0}}])

        results = MonitorResults.query.filter_by(monitor_id=monitor.id).all()
        assert results[0].status == "failing"
        assert monitor.status == "failing"

    def test_missing_metric_yields_error(self, app, db, create_platform):
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id, metric="bw_util", comparator="lt", threshold=90.0)

        record_monitor_results(monitor, [{"device_id": None, "fields": {"other": 1.0}}])

        results = MonitorResults.query.filter_by(monitor_id=monitor.id).all()
        assert results[0].status == "error"
        assert results[0].value is None
        assert monitor.status == "error"

    def test_null_threshold_passing_when_metric_present(self, app, db, create_platform):
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id, metric="bw_util", comparator="gt", threshold=None)

        record_monitor_results(monitor, [{"device_id": None, "fields": {"bw_util": 42.0}}])

        results = MonitorResults.query.filter_by(monitor_id=monitor.id).all()
        assert results[0].status == "passing"

    def test_null_threshold_error_when_metric_missing(self, app, db, create_platform):
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id, metric="bw_util", comparator="gt", threshold=None)

        record_monitor_results(monitor, [{"device_id": None, "fields": {}}])

        results = MonitorResults.query.filter_by(monitor_id=monitor.id).all()
        assert results[0].status == "error"

    def test_rollup_status_worst_case(self, app, db, create_platform):
        """Worst status across multiple devices is used for monitor.status."""
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id, metric="bw_util", comparator="lt", threshold=90.0)

        record_monitor_results(
            monitor,
            [
                {"device_id": None, "fields": {"bw_util": 50.0}},   # passing
                {"device_id": None, "fields": {"bw_util": 95.0}},   # failing
            ],
        )

        assert monitor.status == "failing"

    def test_multiple_rows_written(self, app, db, create_platform):
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id, metric="bw_util", comparator="lt", threshold=90.0)

        record_monitor_results(
            monitor,
            [
                {"device_id": None, "fields": {"bw_util": 10.0}},
                {"device_id": None, "fields": {"bw_util": 20.0}},
                {"device_id": None, "fields": {"bw_util": 30.0}},
            ],
        )

        assert MonitorResults.query.filter_by(monitor_id=monitor.id).count() == 3

    def test_non_numeric_metric_yields_error(self, app, db, create_platform):
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id, metric="bw_util", comparator="gt", threshold=0.0)

        record_monitor_results(monitor, [{"device_id": None, "fields": {"bw_util": "n/a"}}])

        results = MonitorResults.query.filter_by(monitor_id=monitor.id).all()
        assert results[0].status == "error"
        assert results[0].value is None


# ---------------------------------------------------------------------------
# run_monitor (enqueue)
# ---------------------------------------------------------------------------
class TestRunMonitor:
    def test_enqueues_monitoring_run_job(self, app, db, create_platform, create_user):
        create_user("owner", "pw")
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id)

        job = monitors_service.run_monitor(monitor)

        assert job.job_type == "monitoring.run"
        assert job.status == "queued"
        job_params = job.parameters or {}
        assert job_params.get("monitor_id") == monitor.id

    def test_job_has_task(self, app, db, create_platform):
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id)

        job = monitors_service.run_monitor(monitor)

        assert len(job.tasks) == 1
        assert job.tasks[0].task_type == "monitoring.run"


# ---------------------------------------------------------------------------
# get_monitor_results
# ---------------------------------------------------------------------------
class TestGetMonitorResults:
    def _seed(self, monitor: Monitors, n: int = 5):
        now = datetime.now(timezone.utc)
        for i in range(n):
            r = MonitorResults(
                monitor_id=monitor.id,
                device_id=None,
                observed_at=datetime(2024, 1, i + 1, tzinfo=timezone.utc),
                value=float(i),
                status="passing",
                payload={},
            )
            _db.session.add(r)
        _db.session.commit()

    def test_returns_all_for_monitor(self, app, db, create_platform):
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id)
        self._seed(monitor, 5)

        results = monitors_service.get_monitor_results(monitor.id)
        assert len(results) == 5

    def test_limit_respected(self, app, db, create_platform):
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id)
        self._seed(monitor, 10)

        results = monitors_service.get_monitor_results(monitor.id, limit=3)
        assert len(results) == 3

    def test_from_dt_filter(self, app, db, create_platform):
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id)
        self._seed(monitor, 5)  # days 1-5 of Jan 2024

        from_dt = datetime(2024, 1, 3, tzinfo=timezone.utc)
        results = monitors_service.get_monitor_results(monitor.id, from_dt=from_dt)
        # SQLite may return offset-naive datetimes; normalise before comparison.
        from_naive = from_dt.replace(tzinfo=None)
        for r in results:
            obs = r.observed_at.replace(tzinfo=None) if r.observed_at.tzinfo else r.observed_at
            assert obs >= from_naive
        assert len(results) == 3  # days 3, 4, 5

    def test_to_dt_filter(self, app, db, create_platform):
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id)
        self._seed(monitor, 5)

        to_dt = datetime(2024, 1, 3, tzinfo=timezone.utc)
        results = monitors_service.get_monitor_results(monitor.id, to_dt=to_dt)
        to_naive = to_dt.replace(tzinfo=None)
        for r in results:
            obs = r.observed_at.replace(tzinfo=None) if r.observed_at.tzinfo else r.observed_at
            assert obs <= to_naive

    def test_device_id_filter(self, app, db, create_platform, create_device):
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id)
        device = create_device()

        r1 = MonitorResults(
            monitor_id=monitor.id, device_id=device.id, observed_at=datetime.now(timezone.utc),
            value=1.0, status="passing", payload={}
        )
        r2 = MonitorResults(
            monitor_id=monitor.id, device_id=None, observed_at=datetime.now(timezone.utc),
            value=2.0, status="passing", payload={}
        )
        _db.session.add_all([r1, r2])
        _db.session.commit()

        results = monitors_service.get_monitor_results(monitor.id, device_id=device.id)
        assert len(results) == 1
        assert results[0].device_id == device.id


# ---------------------------------------------------------------------------
# CRUD API
# ---------------------------------------------------------------------------
class TestMonitorCRUD:
    def test_create_monitor(self, app, client, auth_headers, create_platform):
        headers = auth_headers("admin", "pw")
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id, is_mutating=False)

        resp = client.post(
            "/api/v1/monitors",
            json={
                "name": "BW Monitor",
                "action_id": action.id,
                "metric": "bw_util",
                "comparator": "lt",
                "threshold": 90.0,
                "target": {"device_ids": []},
                "visibility": "private",
            },
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["name"] == "BW Monitor"
        assert data["metric"] == "bw_util"
        assert data["comparator"] == "lt"
        assert data["threshold"] == pytest.approx(90.0)
        assert data["id"] is not None

    def test_create_rejects_mutating_action(self, app, client, auth_headers, create_platform):
        headers = auth_headers("admin", "pw")
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id, is_mutating=True)

        resp = client.post(
            "/api/v1/monitors",
            json={
                "name": "Bad Monitor",
                "action_id": action.id,
                "metric": "bw_util",
                "comparator": "lt",
            },
            headers=headers,
        )
        assert resp.status_code == 400
        assert "mutating" in (resp.get_json() or {}).get("detail", "")

    def test_list_monitors(self, app, client, auth_headers, create_platform):
        headers = auth_headers("admin", "pw")
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        _make_monitor(action.id, name="M1")
        _make_monitor(action.id, name="M2")

        resp = client.get("/api/v1/monitors", headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data["data"]) >= 2

    def test_get_monitor(self, app, client, auth_headers, create_platform):
        headers = auth_headers("admin", "pw")
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id)

        resp = client.get(f"/api/v1/monitors/{monitor.id}", headers=headers)
        assert resp.status_code == 200
        assert resp.get_json()["id"] == monitor.id

    def test_get_missing_monitor_returns_404(self, app, client, auth_headers, create_platform):
        headers = auth_headers("admin", "pw")
        create_platform("cisco_xe", "ios")
        resp = client.get("/api/v1/monitors/99999", headers=headers)
        assert resp.status_code == 404

    def test_patch_monitor(self, app, client, auth_headers, create_platform):
        headers = auth_headers("admin", "pw")
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id, name="Old Name")

        resp = client.patch(
            f"/api/v1/monitors/{monitor.id}",
            json={"name": "New Name", "threshold": 80.0},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["name"] == "New Name"
        assert data["threshold"] == pytest.approx(80.0)

    def test_patch_rejects_mutating_action(self, app, client, auth_headers, create_platform):
        headers = auth_headers("admin", "pw")
        platform = create_platform("cisco_xe", "ios")
        read_action = _make_action(platform.id, name="Read Only")
        mutating_action = _make_action(platform.id, name="Mutating", is_mutating=True)
        monitor = _make_monitor(read_action.id)

        resp = client.patch(
            f"/api/v1/monitors/{monitor.id}",
            json={"action_id": mutating_action.id},
            headers=headers,
        )
        assert resp.status_code == 400

    def test_delete_monitor(self, app, client, auth_headers, create_platform):
        headers = auth_headers("admin", "pw")
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id)

        resp = client.delete(f"/api/v1/monitors/{monitor.id}", headers=headers)
        assert resp.status_code == 200

        assert _db.session.get(Monitors, monitor.id) is None

    def test_create_writes_audit_log(self, app, client, auth_headers, create_platform):
        from app.models import AuditLogEntries
        headers = auth_headers("admin", "pw")
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)

        client.post(
            "/api/v1/monitors",
            json={
                "name": "Audited Monitor",
                "action_id": action.id,
                "metric": "bw_util",
                "comparator": "lt",
            },
            headers=headers,
        )

        entry = AuditLogEntries.query.filter_by(action="monitor.create").first()
        assert entry is not None

    def test_create_requires_auth(self, app, client, create_platform):
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        resp = client.post(
            "/api/v1/monitors",
            json={"name": "X", "action_id": action.id, "metric": "m", "comparator": "lt"},
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /monitors/<id>/run
# ---------------------------------------------------------------------------
class TestMonitorRun:
    def test_enqueue_immediate_run(self, app, client, auth_headers, create_platform):
        headers = auth_headers("admin", "pw")
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id)

        resp = client.post(f"/api/v1/monitors/{monitor.id}/run", headers=headers)
        assert resp.status_code == 202
        data = resp.get_json()
        assert data["status"] == "queued"
        assert data["job"]["job_type"] == "monitoring.run"
        # Job should exist in DB
        job_id = data["job"]["id"]
        job = _db.session.get(Jobs, job_id)
        assert job is not None
        assert job.parameters.get("monitor_id") == monitor.id

    def test_run_missing_monitor_returns_404(self, app, client, auth_headers, create_platform):
        headers = auth_headers("admin", "pw")
        create_platform("cisco_xe", "ios")
        resp = client.post("/api/v1/monitors/99999/run", headers=headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /monitors/<id>/results
# ---------------------------------------------------------------------------
class TestMonitorResultsEndpoint:
    def _seed_results(self, monitor: Monitors, n: int):
        for i in range(n):
            r = MonitorResults(
                monitor_id=monitor.id,
                device_id=None,
                observed_at=datetime(2024, 1, i + 1, tzinfo=timezone.utc),
                value=float(i),
                status="passing",
                payload={},
            )
            _db.session.add(r)
        _db.session.commit()

    def test_returns_results(self, app, client, auth_headers, create_platform):
        headers = auth_headers("admin", "pw")
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id)
        self._seed_results(monitor, 5)

        resp = client.get(f"/api/v1/monitors/{monitor.id}/results", headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data["data"]) == 5
        assert data["total"] == 5

    def test_limit_param(self, app, client, auth_headers, create_platform):
        headers = auth_headers("admin", "pw")
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id)
        self._seed_results(monitor, 10)

        resp = client.get(
            f"/api/v1/monitors/{monitor.id}/results?limit=3", headers=headers
        )
        assert resp.status_code == 200
        assert len(resp.get_json()["data"]) == 3

    def test_from_to_filter(self, app, client, auth_headers, create_platform):
        headers = auth_headers("admin", "pw")
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id)
        self._seed_results(monitor, 5)  # Jan 1-5

        resp = client.get(
            f"/api/v1/monitors/{monitor.id}/results?from=2024-01-03&to=2024-01-05",
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        # Inclusive: Jan 3, 4, 5
        assert len(data) == 3

    def test_missing_monitor_returns_404(self, app, client, auth_headers, create_platform):
        headers = auth_headers("admin", "pw")
        create_platform("cisco_xe", "ios")
        resp = client.get("/api/v1/monitors/99999/results", headers=headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /monitors/alerts
# ---------------------------------------------------------------------------
class TestMonitorAlerts:
    def test_returns_only_failing_monitors(self, app, client, auth_headers, create_platform):
        headers = auth_headers("admin", "pw")
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)

        passing = _make_monitor(action.id, name="OK Monitor")
        passing.status = "passing"

        failing = _make_monitor(action.id, name="Alert Monitor")
        failing.status = "failing"

        _db.session.commit()

        resp = client.get("/api/v1/monitors/alerts", headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        ids = [d["id"] for d in data]
        assert failing.id in ids
        assert passing.id not in ids

    def test_empty_when_none_failing(self, app, client, auth_headers, create_platform):
        headers = auth_headers("admin", "pw")
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)

        m = _make_monitor(action.id)
        m.status = "passing"
        _db.session.commit()

        resp = client.get("/api/v1/monitors/alerts", headers=headers)
        assert resp.status_code == 200
        assert resp.get_json()["data"] == []


# ---------------------------------------------------------------------------
# Scheduler fires monitor schedule
# ---------------------------------------------------------------------------
class TestSchedulerMonitorFire:
    def test_fire_monitor_schedule_enqueues_job_and_advances_next_run(
        self, app, db, create_platform
    ):
        from app.services.scheduler import fire_schedule

        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id)
        schedule = _make_schedule("monitor", monitor.id)

        original_next_run = schedule.next_run

        fire_schedule(app, schedule)

        # next_run must have advanced
        assert schedule.next_run > original_next_run
        # last_run must be set
        assert schedule.last_run is not None
        # A monitoring.run job must exist
        job = Jobs.query.filter_by(job_type="monitoring.run").first()
        assert job is not None
        assert schedule.last_job_id == job.id

    def test_fire_schedule_disables_when_monitor_missing(self, app, db, create_platform):
        from app.services.scheduler import fire_schedule

        create_platform("cisco_xe", "ios")
        schedule = _make_schedule("monitor", 99999)

        fire_schedule(app, schedule)

        assert schedule.enabled is False

    def test_fire_schedule_disables_when_monitor_disabled(self, app, db, create_platform):
        from app.services.scheduler import fire_schedule

        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id)
        monitor.disabled_at = datetime.now(timezone.utc)
        _db.session.commit()

        schedule = _make_schedule("monitor", monitor.id)
        fire_schedule(app, schedule)

        assert schedule.enabled is False
