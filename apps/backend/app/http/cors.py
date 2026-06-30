"""CORS helpers for HTTP responses."""

from __future__ import annotations

from collections.abc import Iterable

from flask import Flask, request

DEFAULT_CORS_METHODS = ("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
DEFAULT_CORS_HEADERS = ("Authorization", "Content-Type", "X-Request-ID")
DEFAULT_CORS_EXPOSE_HEADERS = ("X-Request-ID",)


def _join_header_values(values: str | Iterable[str]) -> str:
    if isinstance(values, str):
        return values
    return ", ".join(str(item) for item in values if item)


def resolve_cors_origin(origin: str | None, allowed_origins: str | Iterable[str]) -> str | None:
    """Return the request origin when it is permitted by configuration."""

    if not origin:
        return None

    if isinstance(allowed_origins, str):
        normalized = [allowed_origins.rstrip("/")] if allowed_origins else []
    else:
        normalized = [str(item).rstrip("/") for item in allowed_origins if item]

    if "*" in normalized:
        return origin
    return origin if origin.rstrip("/") in normalized else None


def apply_cors_headers(app: Flask, response):
    """Apply configured CORS headers to an outgoing response."""

    origin = request.headers.get("Origin")
    allowed_origin = resolve_cors_origin(origin, app.config.get("CORS_ORIGINS", ()))
    if not allowed_origin:
        return response

    response.headers["Access-Control-Allow-Origin"] = allowed_origin
    response.headers.add("Vary", "Origin")

    if app.config.get("CORS_ALLOW_CREDENTIALS", False):
        response.headers["Access-Control-Allow-Credentials"] = "true"

    allowed_methods = _join_header_values(app.config.get("CORS_ALLOW_METHODS", DEFAULT_CORS_METHODS))
    if allowed_methods:
        response.headers["Access-Control-Allow-Methods"] = allowed_methods

    request_headers = request.headers.get("Access-Control-Request-Headers")
    if request_headers:
        response.headers["Access-Control-Allow-Headers"] = request_headers
        response.headers.add("Vary", "Access-Control-Request-Headers")
    else:
        allowed_headers = _join_header_values(app.config.get("CORS_ALLOW_HEADERS", DEFAULT_CORS_HEADERS))
        if allowed_headers:
            response.headers["Access-Control-Allow-Headers"] = allowed_headers

    if request.headers.get("Access-Control-Request-Method"):
        response.headers.add("Vary", "Access-Control-Request-Method")

    exposed_headers = _join_header_values(
        app.config.get("CORS_EXPOSE_HEADERS", DEFAULT_CORS_EXPOSE_HEADERS)
    )
    if exposed_headers:
        response.headers["Access-Control-Expose-Headers"] = exposed_headers

    return response
