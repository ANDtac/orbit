"""Request and response persistence hooks."""

from __future__ import annotations

import logging
import re
import time

from flask import Flask, g, request

from ..extensions import db
from ..http.cors import apply_cors_headers
from ..models import RequestLogs

log = logging.getLogger(__name__)

DEVICE_ID_PATH_RE = re.compile(r"/devices/(\d+)(?:/|$)")
SENSITIVE_HEADERS = {"authorization", "cookie", "set-cookie"}


def _sanitize_headers(headers) -> dict[str, str]:
    return {key: value for key, value in headers.items() if key.lower() not in SENSITIVE_HEADERS}


def _extract_device_id_hint(path: str) -> int | None:
    match = DEVICE_ID_PATH_RE.search(path or "")
    if not match:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


def register_request_logging(app: Flask) -> None:
    """Register response logging and correlation header injection."""

    @app.after_request
    def _log_request(response):
        try:
            latency_ms = int((time.perf_counter() - getattr(g, "_t0", time.perf_counter())) * 1000)
            request_log = RequestLogs(
                correlation_id=g.correlation_id,
                user_id=getattr(g, "user_id", None),
                method=request.method,
                path=request.path,
                route=request.endpoint,
                blueprint=request.blueprint,
                status_code=response.status_code,
                latency_ms=latency_ms,
                ip=(request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or request.remote_addr),
                user_agent=(request.user_agent.string if request.user_agent else None),
                query_params=request.args.to_dict(flat=False),
                request_headers=_sanitize_headers(request.headers),
                response_headers=_sanitize_headers(response.headers),
                request_bytes=(request.content_length or None),
                response_bytes=(
                    response.calculate_content_length()
                    if hasattr(response, "calculate_content_length")
                    else None
                ),
                auth_subject=getattr(g, "auth_subject", None),
                device_id_hint=_extract_device_id_hint(request.path),
                platform_id_hint=None,
            )
            db.session.add(request_log)
            db.session.commit()

            response.headers["X-Request-ID"] = g.correlation_id
        except Exception:
            log.exception("request_logging_failed")
            db.session.rollback()

        return apply_cors_headers(app, response)
