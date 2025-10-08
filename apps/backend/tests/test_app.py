"""General application smoke tests for the Orbit backend."""

from __future__ import annotations

import importlib
import sys

from click.testing import CliRunner


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
