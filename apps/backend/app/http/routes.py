"""Small application-scoped HTTP routes."""

from __future__ import annotations

from flask import Flask


def register_health_routes(app: Flask) -> None:
    """Register the lightweight health-check endpoint."""

    @app.get("/healthz")
    def healthz():
        return {"status": "ok"}, 200
