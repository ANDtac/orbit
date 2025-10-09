"""General application smoke tests for the Orbit backend."""

from __future__ import annotations

import importlib
import sys
from pathlib import Path

from click.testing import CliRunner

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def test_healthz_endpoint(client):
    """The /healthz endpoint should return a JSON payload with status ok."""

    resp = client.get("/healthz")
    assert resp.status_code == 200
    payload = resp.get_json()
    assert payload["status"].lower() == "ok"


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
