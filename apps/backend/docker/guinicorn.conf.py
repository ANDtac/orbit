"""
apps/backend/docker/gunicorn.conf.py
------------------------------------
Gunicorn configuration for the Orbit Flask API.

Responsibilities
----------------
- Configure worker model, concurrency, timeouts, and logging for containerized deployment.
- Emit JSON-like logs to stdout/stderr for aggregation by Docker/Compose.
- Provide lifecycle hooks to log worker crashes and readiness events.

Environment Variables
---------------------
BIND                    : str   Bind address (default: "0.0.0.0:8000")
GUNICORN_WORKERS        : int   Worker processes (default: 2 * CPU + 1, min 2)
GUNICORN_THREADS        : int   Threads per worker (default: 2)
GUNICORN_TIMEOUT        : int   Hard worker timeout seconds (default: 120)
GUNICORN_GRACEFUL       : int   Graceful timeout seconds (default: 30)
GUNICORN_KEEPALIVE      : int   Keepalive seconds (default: 5)
GUNICORN_LOGLEVEL       : str   "info" | "debug" | "warning" | "error" (default: "info")
GUNICORN_MAX_REQUESTS   : int   Recycle worker after N requests (default: 1000)
GUNICORN_MAX_JITTER     : int   Random jitter added to max_requests (default: 100)
GUNICORN_RELOAD         : bool  Auto-reload on code changes (dev only). Default: "false"
PRELOAD_APP             : bool  Preload app in master (default: "true")

Notes
-----
- Worker class uses 'gthread' for a good balance of I/O concurrency with Flask.
- Actual process restarts on fatal crashes should be handled by Docker's restart policy
  (e.g., `restart: always` in compose). This config logs crashes and exits cleanly.
"""

from __future__ import annotations

import json
import multiprocessing
import os
import sys
from datetime import datetime

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _bool_env(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}

def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default

def _now() -> str:
    return datetime.utcnow().isoformat(timespec="milliseconds") + "Z"

def _jlog(event: str, **extra):
    payload = {"ts": _now(), "event": event, **extra}
    print(json.dumps(payload, ensure_ascii=False), file=sys.stdout)


# ---------------------------------------------------------------------------
# Core settings
# ---------------------------------------------------------------------------
bind = os.getenv("BIND", "0.0.0.0:8000")

_default_workers = max(2, multiprocessing.cpu_count() * 2 + 1)
workers = _int_env("GUNICORN_WORKERS", _default_workers)
threads = _int_env("GUNICORN_THREADS", 2)

worker_class = "gthread"
preload_app = _bool_env("PRELOAD_APP", True)

timeout = _int_env("GUNICORN_TIMEOUT", 120)
graceful_timeout = _int_env("GUNICORN_GRACEFUL", 30)
keepalive = _int_env("GUNICORN_KEEPALIVE", 5)

max_requests = _int_env("GUNICORN_MAX_REQUESTS", 1000)
max_requests_jitter = _int_env("GUNICORN_MAX_JITTER", 100)

loglevel = os.getenv("GUNICORN_LOGLEVEL", "info")

# Log to stdout/stderr so Docker can collect
accesslog = "-"
errorlog = "-"
capture_output = True

# Dev convenience: live reload (do not enable in prod)
reload = _bool_env("GUNICORN_RELOAD", False)


# ---------------------------------------------------------------------------
# Server hooks (structured logs)
# ---------------------------------------------------------------------------
def on_starting(server):
    _jlog("gunicorn_on_starting", bind=bind, workers=workers, threads=threads, preload_app=preload_app)

def when_ready(server):
    _jlog("gunicorn_when_ready", master_pid=os.getpid())

def pre_fork(server, worker):
    _jlog("gunicorn_pre_fork", worker_pid=worker.pid if worker else None)

def post_fork(server, worker):
    _jlog("gunicorn_post_fork", worker_pid=worker.pid)

def post_worker_init(worker):
    _jlog("gunicorn_post_worker_init", worker_pid=worker.pid)

def worker_int(worker):
    _jlog("gunicorn_worker_int", worker_pid=worker.pid)

def worker_abort(worker):
    _jlog("gunicorn_worker_abort", worker_pid=worker.pid)

def worker_exit(server, worker):
    # This is emitted whenever a worker exits (graceful or crash). Container
    # restart policy should handle hard crashes; we log for observability.
    _jlog("gunicorn_worker_exit", worker_pid=worker.pid, exitcode=getattr(worker, "exitcode", None))

def on_exit(server):
    _jlog("gunicorn_on_exit", master_pid=os.getpid())