"""Application lifecycle event persistence."""

from __future__ import annotations

import logging

from flask import Flask
from sqlalchemy import inspect

from ..extensions import db
from ..models import AppEvents

log = logging.getLogger(__name__)


def record_startup_event(app: Flask) -> None:
    """Persist a startup event when the backing table is available."""

    with app.app_context():
        try:
            if inspect(db.engine).has_table(AppEvents.__tablename__):
                db.session.add(AppEvents(level="INFO", event="startup", message="App initialized", extra={}))
                db.session.commit()
        except Exception:
            log.exception("app_event_startup_failed")
            db.session.rollback()
