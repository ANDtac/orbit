"""Global HTTP error handling."""

from __future__ import annotations

from flask import Flask, has_request_context, request
from werkzeug.exceptions import HTTPException

from ..api.v1.utils import problem_response
from ..observability.error_logging import record_exception


def register_error_handlers(app: Flask) -> None:
    """Register global exception handling for the Flask app."""

    @app.errorhandler(Exception)
    def _handle_exception(exc: Exception):
        status_code = 500
        detail = str(exc)
        title = "Internal Server Error"

        if isinstance(exc, HTTPException):
            try:
                status_code = int(exc.code or 500)
            except (TypeError, ValueError):
                status_code = 500
            detail = exc.description or detail
            title = getattr(exc, "name", title)

        correlation_id = record_exception(exc, status_code)
        response = problem_response(
            status_code,
            title=title,
            detail=detail,
            extra={"correlation_id": correlation_id},
            instance=request.path if has_request_context() else None,
        )
        response.headers["X-Request-ID"] = correlation_id
        return response
