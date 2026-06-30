"""HTTP request lifecycle context hooks."""

from __future__ import annotations

import time
import uuid

from flask import Flask, g, request

try:
    from flask_jwt_extended import JWTDecodeError, get_jwt, verify_jwt_in_request
    from flask_jwt_extended.exceptions import WrongTokenError
except ImportError:  # pragma: no cover - compatibility with older flask-jwt-extended
    from flask_jwt_extended import get_jwt, verify_jwt_in_request

    try:
        from jwt import DecodeError as JWTDecodeError  # type: ignore
    except ImportError:  # pragma: no cover - extremely defensive fallback
        JWTDecodeError = Exception  # type: ignore[assignment]

    WrongTokenError = Exception  # type: ignore[assignment]


def register_request_context(app: Flask) -> None:
    """Register request-scoped timing, correlation, and auth context."""

    @app.before_request
    def _start_timer_and_corr() -> None:
        g._t0 = time.perf_counter()
        g.correlation_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        g.user_id = None
        g.auth_subject = None

        try:
            verify_jwt_in_request(optional=True)
            claims = get_jwt()
            if claims:
                subject = str(claims.get("sub") or "")
                g.auth_subject = subject
                g.user_id = int(subject) if subject.isdigit() else None
        except (JWTDecodeError, WrongTokenError):
            pass
