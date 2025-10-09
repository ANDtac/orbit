"""
app/__init__.py
---------------
Flask application factory and global setup.

Responsibilities
----------------
- Create and configure the Flask app using environment-specific config.
- Initialize extensions (SQLAlchemy, Migrate, JWT).
- Configure JSON logging and attach before/after request hooks.
- Handle request/response logging to the database.
- Handle global error logging with optional SMTP alerts.
- Register all blueprints and API namespaces.
- Provide health check endpoint.

Key Globals
-----------
- DEVICE_ID_PATH_RE : regex pattern for extracting device IDs from paths.
"""

from __future__ import annotations

import logging as std_logging
import os
import time
import traceback
import uuid
import re

from flask import Flask, jsonify, g, request
try:
    from flask_jwt_extended import get_jwt, verify_jwt_in_request, JWTDecodeError
    from flask_jwt_extended.exceptions import WrongTokenError
except ImportError:  # pragma: no cover - compatibility with older flask-jwt-extended
    from flask_jwt_extended import get_jwt, verify_jwt_in_request

    try:
        from jwt import DecodeError as JWTDecodeError  # type: ignore
    except ImportError:  # pragma: no cover - extremely defensive fallback
        JWTDecodeError = Exception  # type: ignore[assignment]

    WrongTokenError = Exception  # type: ignore[assignment]

from .config import BaseConfig, select_config
from .extensions import db, migrate, jwt
from .api import api_bp
from .auth.routes import auth_bp
from .logging import setup_logging
from .models import RequestLogs, ErrorLogs, AppEvents, JWTTokenBlocklist
from .utils.mailer import send_critical_email
from sqlalchemy import inspect

# Module-level logger
log = std_logging.getLogger(__name__)

# Debugpy hook ---------------------------------------------------------------

def _maybe_enable_debugpy() -> None:
    """Enable debugpy when running inside the dev/debug container."""

    flag = os.getenv("ENABLE_DEBUGPY", "").strip().lower()
    if flag not in {"1", "true", "yes", "on"}:
        return

    port = int(os.getenv("DEBUGPY_PORT", "5678") or "5678")
    wait_flag = os.getenv("DEBUGPY_WAIT_FOR_CLIENT", "").strip().lower()
    should_wait = wait_flag in {"1", "true", "yes", "on"}

    try:
        import debugpy

        debugpy.listen(("0.0.0.0", port))
        log.info("debugpy_listening", extra={"extra": {"port": port}})
        if should_wait:
            log.info("debugpy_waiting_for_client")
            debugpy.wait_for_client()
    except RuntimeError:
        log.debug("debugpy_already_active", extra={"extra": {"port": port}})
    except Exception:  # pragma: no cover - defensive logging only
        log.exception("debugpy_enable_failed")

# Regex to extract device IDs from paths like /devices/{id}/
DEVICE_ID_PATH_RE = re.compile(r"/devices/(\d+)(?:/|$)")


def create_app(config_object: type[BaseConfig] | BaseConfig | None = None) -> Flask:
    """
    Application factory.

    Returns
    -------
    Flask
        A configured Flask application instance.
    """
    _maybe_enable_debugpy()

    app = Flask(__name__)
    if config_object is not None:
        app.config.from_object(config_object)
    else:
        app.config.from_object(select_config())

    # ---------------------------------------------------------------------
    # Logging setup
    # ---------------------------------------------------------------------
    setup_logging(app)
    log.info("app_starting", extra={"extra": {"env": app.config.get('ENV', 'unknown')}})

    # ---------------------------------------------------------------------
    # Extension initialization
    # ---------------------------------------------------------------------
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)

    # ---------------------------------------------------------------------
    # JWT configuration
    # ---------------------------------------------------------------------
    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(jwt_header: dict, jwt_payload: dict) -> bool:
        """
        Determine if a JWT is revoked.

        Parameters
        ----------
        jwt_header : dict
            JWT header data.
        jwt_payload : dict
            JWT claims/payload.

        Returns
        -------
        bool
            True if the token is revoked, False otherwise.
        """
        jti = jwt_payload.get("jti")
        return bool(jti and JWTTokenBlocklist.query.filter_by(jwt_token=jti).first())

    @jwt.invalid_token_loader
    def invalid_token(reason: str):
        """
        Handle invalid token errors.

        Parameters
        ----------
        reason : str
            Explanation for why token was invalid.

        Returns
        -------
        tuple[dict, int]
            JSON error response and HTTP status.
        """
        return jsonify({"message": "Invalid token", "reason": reason}), 401

    @jwt.unauthorized_loader
    def missing_token(reason: str):
        """
        Handle missing token errors.

        Parameters
        ----------
        reason : str
            Explanation for why token was missing.

        Returns
        -------
        tuple[dict, int]
            JSON error response and HTTP status.
        """
        return jsonify({"message": "Missing token", "reason": reason}), 401

    # ---------------------------------------------------------------------
    # Request/response logging
    # ---------------------------------------------------------------------
    @app.before_request
    def _start_timer_and_corr() -> None:
        """
        Before-request hook.

        Starts request timer and assigns a correlation ID.
        Attempts to extract JWT subject if present.
        """
        g._t0 = time.perf_counter()
        g.correlation_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        g.user_id = None
        g.auth_subject = None

        try:
            verify_jwt_in_request(optional=True)
            claims = get_jwt()
            if claims:
                g.auth_subject = str(claims.get("sub") or "")
                g.user_id = int(claims.get("sub")) if str(claims.get("sub") or "").isdigit() else None
        except (JWTDecodeError, WrongTokenError):
            pass

    @app.after_request
    def _log_request(resp):
        """
        After-request hook.

        Logs request and response metadata into the database.

        Parameters
        ----------
        resp : flask.Response
            The outgoing response object.

        Returns
        -------
        flask.Response
            Response with correlation ID header injected.
        """
        try:
            latency_ms = int((time.perf_counter() - getattr(g, "_t0", time.perf_counter())) * 1000)

            def sanitize(headers: dict) -> dict:
                return {k: v for k, v in headers.items() if k.lower() not in {"authorization", "cookie", "set-cookie"}}

            # Extract device ID from path if available
            device_id_hint = None
            match = DEVICE_ID_PATH_RE.search(request.path or "")
            if match:
                try:
                    device_id_hint = int(match.group(1))
                except ValueError:
                    pass

            rl = RequestLogs(
                correlation_id=g.correlation_id,
                user_id=getattr(g, "user_id", None),
                method=request.method,
                path=request.path,
                route=request.endpoint,
                blueprint=request.blueprint,
                status_code=resp.status_code,
                latency_ms=latency_ms,
                ip=(request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or request.remote_addr),
                user_agent=(request.user_agent.string if request.user_agent else None),
                query_params=request.args.to_dict(flat=False),
                request_headers=sanitize(request.headers),
                response_headers=sanitize(resp.headers),
                request_bytes=(request.content_length or None),
                response_bytes=(resp.calculate_content_length() if hasattr(resp, "calculate_content_length") else None),
                auth_subject=getattr(g, "auth_subject", None),
                device_id_hint=device_id_hint,
                platform_id_hint=None,
            )
            db.session.add(rl)
            db.session.commit()

            resp.headers["X-Request-ID"] = g.correlation_id
        except Exception:
            log.exception("request_logging_failed")
            db.session.rollback()
        return resp

    # ---------------------------------------------------------------------
    # Global error handler
    # ---------------------------------------------------------------------
    @app.errorhandler(Exception)
    def _handle_exception(e: Exception):
        """
        Handle uncaught exceptions.

        Logs to database, sends critical email for 500+ errors,
        and returns JSON error response.

        Parameters
        ----------
        e : Exception
            The raised exception.

        Returns
        -------
        tuple[dict, int]
            JSON error response and HTTP status.
        """
        status = getattr(e, "code", 500)
        try:
            status_int = int(status)
        except (TypeError, ValueError):
            status_int = 500
        msg = getattr(e, "description", str(e))
        tb = traceback.format_exc()

        try:
            el = ErrorLogs(
                correlation_id=getattr(g, "correlation_id", str(uuid.uuid4())),
                level=("CRITICAL" if status_int >= 500 else "ERROR"),
                message=str(e),
                traceback=tb,
                context={
                    "path": request.path if request else None,
                    "method": request.method if request else None,
                },
                user_id=getattr(g, "user_id", None),
            )
            db.session.add(el)
            db.session.commit()
        except Exception:
            log.exception("error_logging_failed")
            db.session.rollback()

        if status_int >= 500:
            try:
                send_critical_email(
                    subject=f"[API CRITICAL] {type(e).__name__} {status_int}",
                    body=f"Correlation-ID: {getattr(g,'correlation_id','-')}\nPath: {request.path}\n\n{tb}"
                )
            except Exception:
                log.exception("critical_email_failed")

        return jsonify({
            "error": "internal_error" if status_int >= 500 else "error",
            "message": msg,
            "correlation_id": getattr(g, "correlation_id", None)
        }), status_int

    # ---------------------------------------------------------------------
    # App startup event
    # ---------------------------------------------------------------------
    with app.app_context():
        try:
            if inspect(db.engine).has_table(AppEvents.__tablename__):
                db.session.add(
                    AppEvents(
                        level="INFO", event="startup", message="App initialized", extra={}
                    )
                )
                db.session.commit()
        except Exception:
            log.exception("app_event_startup_failed")
            db.session.rollback()

    # ---------------------------------------------------------------------
    # Blueprint registration
    # ---------------------------------------------------------------------
    app.register_blueprint(auth_bp, url_prefix="/auth")
    app.register_blueprint(api_bp)

    @app.get("/healthz")
    def healthz():
        """
        Health check endpoint.

        Returns
        -------
        tuple[dict, int]
            Simple JSON object with status and HTTP 200.
        """
        return {"status": "ok"}, 200

    log.info("app_started")
    return app
