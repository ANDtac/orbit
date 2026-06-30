"""Flask application factory for the Orbit backend."""

from __future__ import annotations

import logging as std_logging

from flask import Flask

from .api import api_bp
from .api.docs import register_docs_routes
from .auth.jwt_handlers import register_jwt_handlers
from .auth.routes import auth_bp
from .config import BaseConfig, select_config
from .extensions import db, jwt, migrate
from .http import register_error_handlers, register_health_routes, register_request_context
from .logging import setup_logging
from .observability import record_startup_event, register_request_logging
from .runtime import maybe_enable_debugpy

log = std_logging.getLogger(__name__)


def _configure_app(app: Flask, config_object: type[BaseConfig] | BaseConfig | None) -> None:
    """Load the selected Flask configuration into the app."""

    if config_object is not None:
        app.config.from_object(config_object)
    else:
        app.config.from_object(select_config())


def _register_extensions(app: Flask) -> None:
    """Initialize shared Flask extensions."""

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)


def _register_runtime_policy(app: Flask) -> None:
    """Attach auth callbacks, request hooks, and error handling."""

    register_jwt_handlers(jwt)
    register_request_context(app)
    register_request_logging(app)
    register_error_handlers(app)


def _register_routes(app: Flask) -> None:
    """Register blueprints and lightweight app routes."""

    app.register_blueprint(auth_bp, url_prefix="/api/v1/auth")
    app.register_blueprint(api_bp)
    register_docs_routes(app)
    register_health_routes(app)


def create_app(config_object: type[BaseConfig] | BaseConfig | None = None) -> Flask:
    """Build and return a configured Flask application instance."""

    maybe_enable_debugpy()

    app = Flask(__name__)
    _configure_app(app, config_object)

    setup_logging(app)
    log.info("app_starting", extra={"extra": {"env": app.config.get("ENV", "unknown")}})

    _register_extensions(app)
    _register_runtime_policy(app)
    _register_routes(app)
    record_startup_event(app)

    log.info("app_started")
    return app
