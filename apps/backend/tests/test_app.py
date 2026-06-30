"""General application smoke tests for the Orbit backend."""

from __future__ import annotations

import importlib
import sys
from pathlib import Path

from click.testing import CliRunner

from app.models import AppEvents, ErrorLogs, RequestLogs
from app.observability.events import record_startup_event

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def test_healthz_endpoint(client):
    """The /healthz endpoint should return a JSON payload with status ok."""

    resp = client.get("/healthz")
    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["status"].lower() == "ok"


def test_healthz_request_is_logged_with_correlation_id(client):
    """Successful requests should persist a request log and expose the request ID."""

    resp = client.get("/healthz")

    assert resp.status_code == 200
    request_id = resp.headers["X-Request-ID"]
    request_log = RequestLogs.query.filter_by(correlation_id=request_id).one()
    assert request_log.path == "/healthz"
    assert request_log.status_code == 200


def test_auth_preflight_includes_cors_headers(client):
    """Allowed frontend origins should receive CORS headers on preflight requests."""

    resp = client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )

    assert resp.status_code == 200
    assert resp.headers["Access-Control-Allow-Origin"] == "http://localhost:5173"
    assert resp.headers["Access-Control-Allow-Credentials"] == "true"
    assert "POST" in resp.headers["Access-Control-Allow-Methods"]
    assert "authorization" in resp.headers["Access-Control-Allow-Headers"].lower()


def test_uncaught_exception_returns_problem_details_and_error_log(app, client):
    """Unhandled exceptions should produce RFC 7807 responses and persist an error log."""

    app.config["PROPAGATE_EXCEPTIONS"] = False

    @app.get("/boom")
    def boom():
        raise RuntimeError("boom")

    resp = client.get("/boom")

    assert resp.status_code == 500
    assert resp.headers["Content-Type"] == "application/problem+json"
    payload = resp.get_json()
    assert payload["status"] == 500
    assert payload["title"] == "Internal Server Error"
    assert payload["detail"] == "boom"
    assert payload["instance"] == "/boom"
    error_log = ErrorLogs.query.filter_by(message="boom").one()
    assert error_log.context["path"] == "/boom"


def test_record_startup_event_persists_when_table_exists(app, db):
    """Startup events should be persisted once the app-events table exists."""

    _ = db
    record_startup_event(app)

    event = AppEvents.query.filter_by(event="startup").one()
    assert event.level == "INFO"
    assert event.message == "App initialized"


def test_manage_create_db_creates_sqlite_file(tmp_path, monkeypatch):
    """create-db CLI should ensure the SQLite file exists in development."""

    db_path = tmp_path / "dev.sqlite3"
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")

    for module in ["apps.backend.manage", "app", "app.config"]:
        sys.modules.pop(module, None)

    manage = importlib.import_module("apps.backend.manage")
    runner = CliRunner()
    result = runner.invoke(manage.cli, ["create-db"])

    assert result.exit_code == 0, result.output
    assert db_path.exists()
    assert "SQLite file" in result.output


def test_seed_dev_cli_populates_core_entities(tmp_path, monkeypatch):
    """seed-dev should upsert the admin user, platforms, and sample device."""

    db_path = tmp_path / "dev.sqlite3"
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")

    for module in ["apps.backend.manage", "app", "app.config"]:
        sys.modules.pop(module, None)

    manage = importlib.import_module("apps.backend.manage")
    runner = CliRunner()

    assert runner.invoke(manage.cli, ["create-db"]).exit_code == 0

    # Run seed twice to validate idempotency
    first = runner.invoke(manage.cli, ["seed-dev"])
    second = runner.invoke(manage.cli, ["seed-dev"])

    assert first.exit_code == 0, first.output
    assert second.exit_code == 0, second.output

    app = manage._get_app()
    with app.app_context():
        from app.models import Devices, Platforms, Users

        admin = Users.query.filter_by(username="admin").all()
        assert len(admin) == 1
        platforms = Platforms.query.filter_by(slug="cisco_xe").all()
        assert len(platforms) == 1
        devices = Devices.query.filter_by(name="sample-switch").all()
        assert len(devices) == 1
