"""Phase 7 tests: Dashboard models and REST API.

Covers:
- Dashboard CRUD (create, list, get, patch, delete; audit; visibility rules).
- Pin/unpin (idempotent pin; unpin removes; pinned list returns correct rows).
- Panel CRUD (add, patch, delete; invalid monitor_id → 400).
- Panel data endpoint (returns MonitorResults; respects from/to/limit).
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.extensions import db as _db
from app.models import PlatformOperationTemplates
from app.models.dashboard import DashboardPanels, Dashboards, UserPinnedDashboards
from app.models.monitor import MonitorResults, Monitors


# ---------------------------------------------------------------------------
# Helpers / factories
# ---------------------------------------------------------------------------

def _make_action(platform_id: int, *, is_mutating: bool = False) -> PlatformOperationTemplates:
    action = PlatformOperationTemplates(
        platform_id=platform_id,
        name="Show Interface",
        op_type="show_interface",
        template="show interface {{ iface }}",
        variables={},
        outputs={"bw_util": {"type": "number"}},
        is_mutating=is_mutating,
    )
    _db.session.add(action)
    _db.session.commit()
    return action


def _make_monitor(action_id: int, *, name: str = "Test Monitor", visibility: str = "private") -> Monitors:
    m = Monitors(
        name=name,
        action_id=action_id,
        metric="bw_util",
        comparator="lt",
        threshold=90.0,
        target={},
        visibility=visibility,
    )
    _db.session.add(m)
    _db.session.commit()
    return m


def _make_dashboard(
    owner_id: int | None,
    *,
    name: str = "My Dashboard",
    visibility: str = "private",
) -> Dashboards:
    d = Dashboards(name=name, visibility=visibility, layout={}, owner_id=owner_id)
    _db.session.add(d)
    _db.session.commit()
    return d


def _make_panel(dashboard_id: int, monitor_id: int | None = None) -> DashboardPanels:
    p = DashboardPanels(
        dashboard_id=dashboard_id,
        monitor_id=monitor_id,
        title="Panel Title",
        viz_type="timechart",
        position={"col": 0, "row": 0, "w": 4, "h": 2},
        config={},
    )
    _db.session.add(p)
    _db.session.commit()
    return p


def _seed_results(monitor_id: int, n: int) -> None:
    for i in range(n):
        r = MonitorResults(
            monitor_id=monitor_id,
            device_id=None,
            observed_at=datetime(2024, 1, i + 1, tzinfo=timezone.utc),
            value=float(i),
            status="passing",
            payload={},
        )
        _db.session.add(r)
    _db.session.commit()


# ---------------------------------------------------------------------------
# Dashboard CRUD
# ---------------------------------------------------------------------------

class TestDashboardCRUD:
    def test_create_dashboard(self, app, client, auth_headers):
        headers = auth_headers("admin", "pw")
        resp = client.post(
            "/api/v1/dashboards",
            json={"name": "Ops Dashboard", "visibility": "private"},
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["name"] == "Ops Dashboard"
        assert data["visibility"] == "private"
        assert data["id"] is not None
        assert data["is_pinned"] is False
        assert data["panels"] == []

    def test_create_requires_name(self, app, client, auth_headers):
        headers = auth_headers("admin", "pw")
        resp = client.post("/api/v1/dashboards", json={"visibility": "private"}, headers=headers)
        assert resp.status_code == 400

    def test_create_rejects_invalid_visibility(self, app, client, auth_headers):
        headers = auth_headers("admin", "pw")
        resp = client.post(
            "/api/v1/dashboards",
            json={"name": "X", "visibility": "invalid"},
            headers=headers,
        )
        assert resp.status_code == 400

    def test_list_returns_own_dashboards(self, app, client, auth_headers, create_user):
        headers = auth_headers("admin", "pw")
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        _make_dashboard(owner.id, name="D1")
        _make_dashboard(owner.id, name="D2")

        resp = client.get("/api/v1/dashboards", headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()
        names = [d["name"] for d in data["data"]]
        assert "D1" in names
        assert "D2" in names

    def test_list_returns_shared_dashboards(self, app, client, auth_headers, create_user):
        """A shared dashboard should be visible to another user."""
        headers_admin = auth_headers("admin", "pw")
        # Create "other" user — their dashboard is shared
        create_user("other", "pw2")
        from app.models import Users
        other = Users.query.filter_by(username="other").first()
        _make_dashboard(other.id, name="OtherShared", visibility="shared")

        resp = client.get("/api/v1/dashboards", headers=headers_admin)
        assert resp.status_code == 200
        names = [d["name"] for d in resp.get_json()["data"]]
        assert "OtherShared" in names

    def test_list_does_not_return_other_private_dashboards(self, app, client, auth_headers, create_user):
        """A private dashboard owned by another user should NOT be visible."""
        headers_admin = auth_headers("admin", "pw")
        create_user("other2", "pw2")
        from app.models import Users
        other = Users.query.filter_by(username="other2").first()
        _make_dashboard(other.id, name="OtherPrivate", visibility="private")

        resp = client.get("/api/v1/dashboards", headers=headers_admin)
        assert resp.status_code == 200
        names = [d["name"] for d in resp.get_json()["data"]]
        assert "OtherPrivate" not in names

    def test_get_dashboard(self, app, client, auth_headers):
        headers = auth_headers("admin", "pw")
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d = _make_dashboard(owner.id, name="Specific")

        resp = client.get(f"/api/v1/dashboards/{d.id}", headers=headers)
        assert resp.status_code == 200
        assert resp.get_json()["id"] == d.id

    def test_get_missing_dashboard_returns_404(self, app, client, auth_headers):
        headers = auth_headers("admin", "pw")
        resp = client.get("/api/v1/dashboards/99999", headers=headers)
        assert resp.status_code == 404

    def test_patch_dashboard(self, app, client, auth_headers):
        headers = auth_headers("admin", "pw")
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d = _make_dashboard(owner.id, name="Old Name")

        resp = client.patch(
            f"/api/v1/dashboards/{d.id}",
            json={"name": "New Name", "visibility": "shared"},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["name"] == "New Name"
        assert data["visibility"] == "shared"

    def test_patch_rejects_invalid_visibility(self, app, client, auth_headers):
        headers = auth_headers("admin", "pw")
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d = _make_dashboard(owner.id)

        resp = client.patch(
            f"/api/v1/dashboards/{d.id}",
            json={"visibility": "bogus"},
            headers=headers,
        )
        assert resp.status_code == 400

    def test_delete_dashboard(self, app, client, auth_headers):
        headers = auth_headers("admin", "pw")
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d = _make_dashboard(owner.id)

        resp = client.delete(f"/api/v1/dashboards/{d.id}", headers=headers)
        assert resp.status_code == 200
        assert _db.session.get(Dashboards, d.id) is None

    def test_create_writes_audit_log(self, app, client, auth_headers):
        from app.models import AuditLogEntries
        headers = auth_headers("admin", "pw")
        client.post(
            "/api/v1/dashboards",
            json={"name": "Audited"},
            headers=headers,
        )
        entry = AuditLogEntries.query.filter_by(action="dashboard.create").first()
        assert entry is not None

    def test_create_requires_auth(self, app, client):
        resp = client.post("/api/v1/dashboards", json={"name": "No Auth"})
        assert resp.status_code == 401

    def test_response_includes_panels_and_is_pinned(self, app, client, auth_headers, create_platform):
        headers = auth_headers("admin", "pw")
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d = _make_dashboard(owner.id)
        monitor = _make_monitor(action.id)
        _make_panel(d.id, monitor.id)

        resp = client.get(f"/api/v1/dashboards/{d.id}", headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data["panels"]) == 1
        assert data["is_pinned"] is False


# ---------------------------------------------------------------------------
# Pin / unpin
# ---------------------------------------------------------------------------

class TestDashboardPin:
    def test_pin_dashboard(self, app, client, auth_headers):
        headers = auth_headers("admin", "pw")
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d = _make_dashboard(owner.id)

        resp = client.post(f"/api/v1/dashboards/{d.id}/pin", headers=headers)
        assert resp.status_code == 200
        assert resp.get_json()["dashboard_id"] == d.id

    def test_pin_is_idempotent(self, app, client, auth_headers):
        headers = auth_headers("admin", "pw")
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d = _make_dashboard(owner.id)

        client.post(f"/api/v1/dashboards/{d.id}/pin", headers=headers)
        resp = client.post(f"/api/v1/dashboards/{d.id}/pin", headers=headers)
        assert resp.status_code == 200
        assert resp.get_json()["message"] == "already pinned"

        # Only one pin row should exist
        count = UserPinnedDashboards.query.filter_by(dashboard_id=d.id).count()
        assert count == 1

    def test_unpin_dashboard(self, app, client, auth_headers):
        headers = auth_headers("admin", "pw")
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d = _make_dashboard(owner.id)

        client.post(f"/api/v1/dashboards/{d.id}/pin", headers=headers)
        resp = client.delete(f"/api/v1/dashboards/{d.id}/pin", headers=headers)
        assert resp.status_code == 200

        assert UserPinnedDashboards.query.filter_by(dashboard_id=d.id).first() is None

    def test_unpin_when_not_pinned_is_ok(self, app, client, auth_headers):
        headers = auth_headers("admin", "pw")
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d = _make_dashboard(owner.id)

        resp = client.delete(f"/api/v1/dashboards/{d.id}/pin", headers=headers)
        assert resp.status_code == 200

    def test_is_pinned_reflected_in_get(self, app, client, auth_headers):
        headers = auth_headers("admin", "pw")
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d = _make_dashboard(owner.id)

        client.post(f"/api/v1/dashboards/{d.id}/pin", headers=headers)
        resp = client.get(f"/api/v1/dashboards/{d.id}", headers=headers)
        assert resp.get_json()["is_pinned"] is True

    def test_pinned_list(self, app, client, auth_headers):
        headers = auth_headers("admin", "pw")
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d1 = _make_dashboard(owner.id, name="Pinned1")
        d2 = _make_dashboard(owner.id, name="Pinned2")
        _make_dashboard(owner.id, name="NotPinned")

        client.post(f"/api/v1/dashboards/{d1.id}/pin", headers=headers)
        client.post(f"/api/v1/dashboards/{d2.id}/pin", headers=headers)

        resp = client.get("/api/v1/dashboards/pinned", headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()
        ids = [d["id"] for d in data["data"]]
        assert d1.id in ids
        assert d2.id in ids
        assert data["total"] == 2

    def test_pin_missing_dashboard_returns_404(self, app, client, auth_headers):
        headers = auth_headers("admin", "pw")
        resp = client.post("/api/v1/dashboards/99999/pin", headers=headers)
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Panel CRUD
# ---------------------------------------------------------------------------

class TestDashboardPanelCRUD:
    def test_add_panel(self, app, client, auth_headers, create_platform):
        headers = auth_headers("admin", "pw")
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id)
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d = _make_dashboard(owner.id)

        resp = client.post(
            f"/api/v1/dashboards/{d.id}/panels",
            json={
                "monitor_id": monitor.id,
                "viz_type": "timechart",
                "position": {"col": 0, "row": 0, "w": 4, "h": 2},
            },
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["dashboard_id"] == d.id
        assert data["monitor_id"] == monitor.id
        assert data["viz_type"] == "timechart"

    def test_add_panel_without_monitor(self, app, client, auth_headers):
        headers = auth_headers("admin", "pw")
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d = _make_dashboard(owner.id)

        resp = client.post(
            f"/api/v1/dashboards/{d.id}/panels",
            json={"viz_type": "stat", "title": "Empty Panel"},
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["monitor_id"] is None
        assert data["title"] == "Empty Panel"

    def test_add_panel_invalid_monitor_id_returns_400(self, app, client, auth_headers):
        headers = auth_headers("admin", "pw")
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d = _make_dashboard(owner.id)

        resp = client.post(
            f"/api/v1/dashboards/{d.id}/panels",
            json={"monitor_id": 99999},
            headers=headers,
        )
        assert resp.status_code == 400
        assert "monitor_id" in resp.get_json().get("detail", "")

    def test_add_panel_invalid_viz_type_returns_400(self, app, client, auth_headers):
        headers = auth_headers("admin", "pw")
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d = _make_dashboard(owner.id)

        resp = client.post(
            f"/api/v1/dashboards/{d.id}/panels",
            json={"viz_type": "heatmap"},
            headers=headers,
        )
        assert resp.status_code == 400

    def test_list_panels(self, app, client, auth_headers, create_platform):
        headers = auth_headers("admin", "pw")
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id)
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d = _make_dashboard(owner.id)
        _make_panel(d.id, monitor.id)
        _make_panel(d.id, monitor.id)

        resp = client.get(f"/api/v1/dashboards/{d.id}/panels", headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data["data"]) == 2
        assert data["total"] == 2

    def test_patch_panel_position(self, app, client, auth_headers):
        headers = auth_headers("admin", "pw")
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d = _make_dashboard(owner.id)
        p = _make_panel(d.id)

        resp = client.patch(
            f"/api/v1/dashboards/{d.id}/panels/{p.id}",
            json={"position": {"col": 2, "row": 1, "w": 6, "h": 3}},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.get_json()["position"]["col"] == 2

    def test_patch_panel_viz_type(self, app, client, auth_headers):
        headers = auth_headers("admin", "pw")
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d = _make_dashboard(owner.id)
        p = _make_panel(d.id)

        resp = client.patch(
            f"/api/v1/dashboards/{d.id}/panels/{p.id}",
            json={"viz_type": "stat"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.get_json()["viz_type"] == "stat"

    def test_patch_panel_invalid_viz_type_returns_400(self, app, client, auth_headers):
        headers = auth_headers("admin", "pw")
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d = _make_dashboard(owner.id)
        p = _make_panel(d.id)

        resp = client.patch(
            f"/api/v1/dashboards/{d.id}/panels/{p.id}",
            json={"viz_type": "3d_chart"},
            headers=headers,
        )
        assert resp.status_code == 400

    def test_patch_panel_invalid_monitor_id_returns_400(self, app, client, auth_headers):
        headers = auth_headers("admin", "pw")
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d = _make_dashboard(owner.id)
        p = _make_panel(d.id)

        resp = client.patch(
            f"/api/v1/dashboards/{d.id}/panels/{p.id}",
            json={"monitor_id": 99999},
            headers=headers,
        )
        assert resp.status_code == 400

    def test_delete_panel(self, app, client, auth_headers):
        headers = auth_headers("admin", "pw")
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d = _make_dashboard(owner.id)
        p = _make_panel(d.id)

        resp = client.delete(f"/api/v1/dashboards/{d.id}/panels/{p.id}", headers=headers)
        assert resp.status_code == 200
        assert _db.session.get(DashboardPanels, p.id) is None

    def test_delete_nonexistent_panel_returns_404(self, app, client, auth_headers):
        headers = auth_headers("admin", "pw")
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d = _make_dashboard(owner.id)

        resp = client.delete(f"/api/v1/dashboards/{d.id}/panels/99999", headers=headers)
        assert resp.status_code == 404

    def test_panels_cascade_deleted_with_dashboard(self, app, client, auth_headers):
        headers = auth_headers("admin", "pw")
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d = _make_dashboard(owner.id)
        p = _make_panel(d.id)
        panel_id = p.id

        client.delete(f"/api/v1/dashboards/{d.id}", headers=headers)
        assert _db.session.get(DashboardPanels, panel_id) is None


# ---------------------------------------------------------------------------
# Panel data endpoint
# ---------------------------------------------------------------------------

class TestPanelData:
    def test_returns_monitor_results(self, app, client, auth_headers, create_platform):
        headers = auth_headers("admin", "pw")
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id)
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d = _make_dashboard(owner.id)
        p = _make_panel(d.id, monitor.id)
        _seed_results(monitor.id, 5)

        resp = client.get(f"/api/v1/dashboards/{d.id}/panels/{p.id}/data", headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["panel_id"] == p.id
        assert data["monitor_id"] == monitor.id
        assert data["total"] == 5
        assert len(data["data"]) == 5

    def test_limit_param(self, app, client, auth_headers, create_platform):
        headers = auth_headers("admin", "pw")
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id)
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d = _make_dashboard(owner.id)
        p = _make_panel(d.id, monitor.id)
        _seed_results(monitor.id, 10)

        resp = client.get(
            f"/api/v1/dashboards/{d.id}/panels/{p.id}/data?limit=3",
            headers=headers,
        )
        assert resp.status_code == 200
        assert len(resp.get_json()["data"]) == 3

    def test_from_to_filter(self, app, client, auth_headers, create_platform):
        headers = auth_headers("admin", "pw")
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id)
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d = _make_dashboard(owner.id)
        p = _make_panel(d.id, monitor.id)
        _seed_results(monitor.id, 5)  # Jan 1-5

        resp = client.get(
            f"/api/v1/dashboards/{d.id}/panels/{p.id}/data?from=2024-01-03&to=2024-01-05",
            headers=headers,
        )
        assert resp.status_code == 200
        assert len(resp.get_json()["data"]) == 3

    def test_device_id_filter(self, app, client, auth_headers, create_platform, create_device):
        headers = auth_headers("admin", "pw")
        platform = create_platform("cisco_xe", "ios")
        action = _make_action(platform.id)
        monitor = _make_monitor(action.id)
        device = create_device()
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d = _make_dashboard(owner.id)
        p = _make_panel(d.id, monitor.id)

        r1 = MonitorResults(
            monitor_id=monitor.id, device_id=device.id,
            observed_at=datetime.now(timezone.utc), value=1.0, status="passing", payload={}
        )
        r2 = MonitorResults(
            monitor_id=monitor.id, device_id=None,
            observed_at=datetime.now(timezone.utc), value=2.0, status="passing", payload={}
        )
        _db.session.add_all([r1, r2])
        _db.session.commit()

        resp = client.get(
            f"/api/v1/dashboards/{d.id}/panels/{p.id}/data?device_id={device.id}",
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.get_json()["data"]
        assert len(data) == 1
        assert data[0]["device_id"] == device.id

    def test_panel_without_monitor_returns_empty(self, app, client, auth_headers):
        headers = auth_headers("admin", "pw")
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d = _make_dashboard(owner.id)
        p = _make_panel(d.id, monitor_id=None)

        resp = client.get(f"/api/v1/dashboards/{d.id}/panels/{p.id}/data", headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["data"] == []
        assert data["monitor_id"] is None

    def test_missing_dashboard_returns_404(self, app, client, auth_headers):
        headers = auth_headers("admin", "pw")
        resp = client.get("/api/v1/dashboards/99999/panels/1/data", headers=headers)
        assert resp.status_code == 404

    def test_missing_panel_returns_404(self, app, client, auth_headers):
        headers = auth_headers("admin", "pw")
        from app.models import Users
        owner = Users.query.filter_by(username="admin").first()
        d = _make_dashboard(owner.id)

        resp = client.get(f"/api/v1/dashboards/{d.id}/panels/99999/data", headers=headers)
        assert resp.status_code == 404
