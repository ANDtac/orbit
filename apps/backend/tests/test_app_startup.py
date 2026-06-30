"""CLI and documentation startup smoke tests."""

from __future__ import annotations

import importlib
import sys

from click.testing import CliRunner


def test_swagger_docs_render(client):
    resp = client.get("/docs")

    assert resp.status_code == 200
    assert b"Orbit API Reference" in resp.data


def test_list_routes_cli_outputs_known_endpoints(monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")

    for module in ["manage", "app", "app.config"]:
        sys.modules.pop(module, None)

    manage = importlib.import_module("manage")
    runner = CliRunner()

    create_result = runner.invoke(manage.cli, ["create-db"])
    list_result = runner.invoke(manage.cli, ["list-routes"])

    assert create_result.exit_code == 0, create_result.output
    assert list_result.exit_code == 0, list_result.output
    assert "/healthz" in list_result.output
    assert "/api/v1/auth/login" in list_result.output
