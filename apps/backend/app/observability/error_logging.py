"""Persistence and notification helpers for unhandled exceptions."""

from __future__ import annotations

import logging
import traceback
import uuid

from flask import g, has_request_context, request

from ..extensions import db
from ..models import ErrorLogs
from ..utils.mailer import send_critical_email

log = logging.getLogger(__name__)


def record_exception(exc: Exception, status_code: int) -> str:
    """Persist an unhandled exception and notify on critical failures."""

    correlation_id = getattr(g, "correlation_id", None) if has_request_context() else None
    if not correlation_id:
        correlation_id = str(uuid.uuid4())

    path = request.path if has_request_context() else None
    method = request.method if has_request_context() else None
    traceback_text = traceback.format_exc()

    try:
        error_log = ErrorLogs(
            correlation_id=correlation_id,
            level=("CRITICAL" if status_code >= 500 else "ERROR"),
            message=str(exc),
            traceback=traceback_text,
            context={"path": path, "method": method},
            user_id=getattr(g, "user_id", None) if has_request_context() else None,
        )
        db.session.add(error_log)
        db.session.commit()
    except Exception:
        log.exception("error_logging_failed")
        db.session.rollback()

    if status_code >= 500:
        try:
            send_critical_email(
                subject=f"[API CRITICAL] {type(exc).__name__} {status_code}",
                body=(
                    f"Correlation-ID: {correlation_id}\n"
                    f"Path: {path or '-'}\n\n"
                    f"{traceback_text}"
                ),
            )
        except Exception:
            log.exception("critical_email_failed")

    return correlation_id
