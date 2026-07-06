"""Database-backed scheduler service (Phase 4).

Polls the ``schedules`` table for enabled rows whose ``next_run`` is in the
past, fires each one by enqueuing an ``operation.execute`` job via
:func:`app.services.automations.run_automation`, then advances ``next_run``
using :mod:`croniter`.

Key seams (all unit-testable without a real loop):

* :func:`get_due_schedules` -- query enabled schedules ready to fire.
* :func:`advance_next_run` -- compute + set the next ``next_run`` via croniter.
* :func:`fire_schedule` -- load the target, enqueue, record housekeeping, commit.
* :func:`run_scheduler_once` -- fire all due schedules; returns count fired.
* :func:`run_scheduler_loop` -- long-running CLI loop around
  :func:`run_scheduler_once` with graceful stop.

Idempotency
-----------
Each ``fire_schedule`` call derives an ``idempotency_key`` of the form
``schedule:<id>:<YYYY-MM-DDTHH:MM>`` (truncated to the minute of the current
UTC time). The unique constraint on ``jobs.idempotency_key`` guarantees that
a double-tick within the same minute enqueues exactly one job.
"""

from __future__ import annotations

import signal
import threading
from contextlib import nullcontext
from datetime import datetime, timezone

from flask import Flask, current_app, has_app_context

from app.extensions import db
from app.models import Automations
from app.models.annotations import utcnow
from app.models.schedule import Schedules
from app.services.automations import run_automation  # module-level for test patching
from app.services import monitors as monitors_service  # module-level for test patching

DEFAULT_POLL_INTERVAL = 60  # seconds

# ---------------------------------------------------------------------------
# Preset → cron mapping (must stay consistent with the REST resource)
# ---------------------------------------------------------------------------
PRESET_CRON: dict[str, str] = {
    "every_5m":  "*/5 * * * *",
    "every_15m": "*/15 * * * *",
    "every_30m": "*/30 * * * *",
    "hourly":    "0 * * * *",
    "daily":     "0 0 * * *",
    "weekly":    "0 0 * * 0",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _maybe_app_context(app: Flask):
    """Reuse an active app context; open a new one if there isn't one."""

    if has_app_context():
        return nullcontext()
    return app.app_context()


def _get_tz(tz_name: str):
    """Return a timezone object for *tz_name*, falling back to UTC."""
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo(tz_name)
    except Exception:
        return timezone.utc


# ---------------------------------------------------------------------------
# Core functions
# ---------------------------------------------------------------------------
def get_due_schedules(session) -> list[Schedules]:
    """Return enabled schedules whose ``next_run`` is at or before utcnow().

    Only ``enabled=True`` rows are returned; disabled schedules are silently
    ignored so the scheduler never re-fires intentionally-paused schedules.
    """

    now = utcnow()
    return (
        session.query(Schedules)
        .filter(
            Schedules.enabled.is_(True),
            Schedules.disabled_at.is_(None),
            Schedules.next_run <= now,
        )
        .order_by(Schedules.next_run.asc())
        .all()
    )


def advance_next_run(schedule, *, from_dt: datetime | None = None) -> None:
    """Compute and set the next ``next_run`` for *schedule* using croniter.

    Parameters
    ----------
    schedule:
        Any object with ``cron_expr``, ``timezone``, and ``next_run``
        attributes.  Typically a :class:`~app.models.schedule.Schedules` row
        but also accepts a plain ``types.SimpleNamespace`` (useful in tests
        that do not need a live DB row).
    from_dt:
        The base datetime from which to advance.  Defaults to ``utcnow()``.
        Pass the current fire timestamp here for accurate cadence.

    The schedule's ``timezone`` field is honoured: croniter is constructed
    with the IANA tz name so DST transitions are handled correctly.
    """

    from croniter import croniter

    base = from_dt or utcnow()
    if base.tzinfo is None:
        base = base.replace(tzinfo=timezone.utc)

    tz_name = getattr(schedule, "timezone", None) or "UTC"
    tz = _get_tz(tz_name)

    cron = croniter(schedule.cron_expr, base)
    next_dt: datetime = cron.get_next(datetime)  # type: ignore[assignment]

    # Ensure the result is tz-aware UTC.
    if next_dt.tzinfo is None:
        next_dt = next_dt.replace(tzinfo=tz)
    next_dt = next_dt.astimezone(timezone.utc)
    schedule.next_run = next_dt


def fire_schedule(app: Flask, schedule: Schedules) -> None:
    """Fire *schedule*: load its target, enqueue a job, advance ``next_run``.

    Side-effects (all within the caller-supplied app context):

    * ``run_automation`` is called with an idempotency key truncated to the
      current minute -- safe to call twice within the same minute.
    * ``schedule.last_run`` and ``schedule.last_job_id`` are updated.
    * ``schedule.next_run`` is advanced via :func:`advance_next_run`.
    * Changes are committed.

    If the target Automation no longer exists or is disabled the schedule
    is disabled and a warning is logged.  No exception is raised.
    """

    fire_ts = utcnow()
    # Idempotency key: unique per (schedule, minute) -- double-tick safe.
    minute_str = fire_ts.strftime("%Y-%m-%dT%H:%M")
    idempotency_key = f"schedule:{schedule.id}:{minute_str}"

    if schedule.target_type == "automation":
        automation = db.session.get(Automations, schedule.target_id)
        if automation is None or not automation.is_active:
            reason = "not found" if automation is None else "disabled"
            current_app.logger.warning(
                "schedule.target_missing %s id=%s reason=%s",
                schedule.target_type,
                schedule.target_id,
                reason,
            )
            schedule.enabled = False
            schedule.disabled_at = fire_ts
            db.session.commit()
            return

        try:
            job = run_automation(
                automation,
                dry_run=False,
                owner_id=schedule.owner_id,
                idempotency_key=idempotency_key,
            )
            schedule.last_run = fire_ts
            schedule.last_job_id = job.id
            advance_next_run(schedule, from_dt=fire_ts)
            db.session.commit()
        except Exception as exc:
            current_app.logger.exception(
                "schedule.fire_failed schedule_id=%s error=%s",
                schedule.id,
                exc,
            )

    elif schedule.target_type == "monitor":
        # Phase 6: fire a monitoring.run job for the target Monitor.
        from app.models.monitor import Monitors as _Monitors

        monitor = db.session.get(_Monitors, schedule.target_id)
        if monitor is None or not monitor.is_active:
            reason = "not found" if monitor is None else "disabled"
            current_app.logger.warning(
                "schedule.target_missing %s id=%s reason=%s",
                schedule.target_type,
                schedule.target_id,
                reason,
            )
            schedule.enabled = False
            schedule.disabled_at = fire_ts
            db.session.commit()
            return

        try:
            job = monitors_service.run_monitor(
                monitor,
                owner_id=schedule.owner_id,
            )
            schedule.last_run = fire_ts
            schedule.last_job_id = job.id
            advance_next_run(schedule, from_dt=fire_ts)
            db.session.commit()
        except Exception as exc:
            current_app.logger.exception(
                "schedule.fire_failed schedule_id=%s error=%s",
                schedule.id,
                exc,
            )

    else:
        current_app.logger.warning(
            "schedule.unsupported_target_type id=%s type=%s",
            schedule.id,
            schedule.target_type,
        )
        schedule.enabled = False
        schedule.disabled_at = fire_ts
        db.session.commit()


def run_scheduler_once(app: Flask) -> int:
    """Fire all due schedules.  Returns the number of schedules fired.

    This is the unit-testable seam -- call it directly in tests without
    starting a real loop.
    """

    with _maybe_app_context(app):
        due = get_due_schedules(db.session)
        count = 0
        for schedule in due:
            fire_schedule(app, schedule)
            count += 1
        return count


def run_scheduler_loop(
    app: Flask,
    *,
    poll_interval: int = DEFAULT_POLL_INTERVAL,
    stop_event: threading.Event | None = None,
) -> None:
    """Continuously fire due schedules until ``stop_event`` is set.

    Mirrors the pattern of :func:`app.services.worker.run_worker_loop`:
    installs SIGINT/SIGTERM handlers in the main thread; sleeps
    ``poll_interval`` seconds between scans.
    """

    stop_event = stop_event or threading.Event()

    def _handle_signal(_signum, _frame):  # pragma: no cover - signal path
        stop_event.set()

    try:
        signal.signal(signal.SIGINT, _handle_signal)
        signal.signal(signal.SIGTERM, _handle_signal)
    except ValueError:  # pragma: no cover - not in main thread
        pass

    while not stop_event.is_set():
        try:
            run_scheduler_once(app)
        except Exception:  # noqa: BLE001 - keep the loop alive on unexpected errors
            app.logger.exception("scheduler_iteration_failed")
        stop_event.wait(poll_interval)


__all__ = [
    "PRESET_CRON",
    "advance_next_run",
    "fire_schedule",
    "get_due_schedules",
    "run_scheduler_loop",
    "run_scheduler_once",
]
