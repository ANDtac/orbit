"""
app/logging.py
---------------
Structured JSON logging for the Orbit backend.

Responsibilities
----------------
- Define a compact JSON log formatter suitable for Docker/centralized log stacks.
- Initialize root logging with sane defaults and minimal noise.
- Provide hooks to adjust library log levels via environment variables.

Environment Variables
---------------------
LOG_LEVEL : str
    Root log level (e.g., "INFO", "DEBUG"). Default "INFO".
LOG_SQL : str
    Log level for SQLAlchemy engine (e.g., "WARNING", "INFO"). Default "WARNING".

Usage
-----
Call `setup_logging()` early in the app factory:

    from .logging import setup_logging
    setup_logging(app)

After that, use the standard logging API:

    import logging
    log = logging.getLogger(__name__)
    log.info("message", extra={"extra": {"key": "value"}})
"""

from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime
from typing import Any


class JsonFormatter(logging.Formatter):
    """
    JsonFormatter
    -------------
    Lightweight JSON formatter producing a single-line JSON object per record.

    Output Schema
    -------------
    {
      "ts": "<UTC ISO8601>",
      "level": "<LEVELNAME>",
      "logger": "<logger name>",
      "msg": "<formatted message>",
      "exc_info": "<traceback string, optional>",
      ... any key/values provided under record.extra ...
    }

    Notes
    -----
    - To attach structured fields, pass `extra={"extra": {...}}` to logging calls.
    - The `exc_info` field is included when exception info is present.
    """

    def format(self, record: logging.LogRecord) -> str:
        """
        Format a log record as a compact JSON string.

        Parameters
        ----------
        record : logging.LogRecord
            The record to format.

        Returns
        -------
        str
            A JSON-encoded string representing the log record.
        """
        payload: dict[str, Any] = {
            "ts": datetime.utcnow().isoformat(timespec="milliseconds") + "Z",
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        # Merge user-provided structured extras under the "extra" key, if present
        if hasattr(record, "extra"):
            extra = getattr(record, "extra")
            if isinstance(extra, dict):
                payload.update(extra)
        return json.dumps(payload, ensure_ascii=False)


def setup_logging(app=None) -> None:
    """
    Initialize application-wide logging.

    Parameters
    ----------
    app : flask.Flask | None
        Optional Flask app (not required, included for signature symmetry).

    Behavior
    --------
    - Sets the root logger level from `LOG_LEVEL` (default "INFO").
    - Replaces any existing handlers with a single stdout JSON handler.
    - Lowers verbosity of common noisy libraries (configurable via env).
    """
    level = os.getenv("LOG_LEVEL", "INFO").upper()
    root = logging.getLogger()
    root.setLevel(level)

    # Remove any pre-configured handlers (e.g., gunicorn defaults) to avoid duplicates
    for h in list(root.handlers):
        root.removeHandler(h)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)

    # Tame noisy libs (adjustable via env)
    logging.getLogger("sqlalchemy.engine").setLevel(os.getenv("LOG_SQL", "WARNING").upper())
    logging.getLogger("urllib3.connectionpool").setLevel("WARNING")