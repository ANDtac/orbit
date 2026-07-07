"""Generalized database-backed job worker.

This module generalizes the execution shape proven by
``app/services/password_change.py::execute_password_change_job`` into a job
dispatcher that reads work purely from the ``jobs`` table (not from any
in-process dict), so it can run as a separate process/container and survive
restarts.

Key seams (all unit-testable without spinning a real loop):

* :func:`claim_next_job` - atomically claims one queued job. On PostgreSQL it
  uses ``SELECT ... FOR UPDATE SKIP LOCKED`` so N workers are safe; on SQLite
  (dev/tests) it degrades to an ordered query plus a status-guarded optimistic
  update.
* :func:`execute_job` - runs a claimed job's tasks in ``sequence`` order,
  dispatching by ``job_type`` to a registered handler, writing per-task
  results/heartbeat/progress and ``JobEvents``.
* :func:`requeue_stale_jobs` - the reaper; requeues ``running`` jobs whose
  heartbeat has gone stale (crash recovery).
* :func:`run_worker_once` - claim + execute at most one job; returns whether it
  did work. This is the seam tests drive inline.
* :func:`run_worker_loop` - the long-running CLI loop around
  :func:`run_worker_once` with a graceful stop.
"""

from __future__ import annotations

import signal
import threading
import traceback
from collections import defaultdict
from contextlib import nullcontext
from datetime import timedelta
from typing import Any, Callable, Iterable, Sequence

from flask import Flask, has_app_context
from sqlalchemy import or_

from app.extensions import db
from app.models import JobEvents, JobTasks, Jobs
from app.models.annotations import utcnow
from app.services import jobs as jobs_service
from app.services import operations as ops_service

DEFAULT_POLL_INTERVAL = 2.0
DEFAULT_HEARTBEAT_TIMEOUT = 120

# A handler receives the parent job and a single task (or ``None`` for a
# task-less job) and returns a JSON-serializable result payload for that task.
JobHandler = Callable[[Jobs, JobTasks | None], dict[str, Any]]

_JOB_HANDLERS: dict[str, JobHandler] = {}


# ---------------------------------------------------------------------------
# Handler registry
# ---------------------------------------------------------------------------
def register_handler(job_type: str, handler: JobHandler) -> None:
    """Register (or replace) the handler used to execute ``job_type`` tasks."""

    _JOB_HANDLERS[job_type] = handler


def get_handler(job_type: str) -> JobHandler | None:
    """Return the handler registered for ``job_type`` (or ``None``)."""

    return _JOB_HANDLERS.get(job_type)


# ---------------------------------------------------------------------------
# Context / dialect helpers
# ---------------------------------------------------------------------------
def _maybe_app_context(app: Flask):
    """Reuse an active app context if present, otherwise open a new one.

    Reusing the active context keeps the worker on the caller's SQLAlchemy
    session (important for the in-memory SQLite tests), while the CLI loop -
    which runs with no context - gets a fresh context/session per iteration.
    """

    if has_app_context():
        return nullcontext()
    return app.app_context()


def _dialect_name(session) -> str | None:
    bind = session.get_bind()
    return getattr(getattr(bind, "dialect", None), "name", None)


def _append_job_event(
    job: Jobs,
    event_type: str,
    message: str,
    context: dict[str, Any] | None = None,
) -> None:
    event = JobEvents()
    event.job_id = job.id
    event.event_type = event_type
    event.message = message
    event.context = context or {}
    event.occurred_at = utcnow()
    db.session.add(event)


# ---------------------------------------------------------------------------
# Claiming
# ---------------------------------------------------------------------------
def _mark_claimed(job: Jobs) -> None:
    now = utcnow()
    job.status = "running"
    job.started_at = now
    job.last_heartbeat_at = now


def claim_next_job(session, *, queues: Iterable[str] | None = None) -> Jobs | None:
    """Atomically claim the next runnable job, or return ``None``.

    Selection: ``status='queued' AND (scheduled_for IS NULL OR
    scheduled_for<=now())``, ordered by ``priority`` desc then ``created_at``
    asc. The claimed job is transitioned to ``running`` with fresh
    ``started_at``/``last_heartbeat_at`` before being returned.
    """

    now = utcnow()
    queue_list = [q for q in (queues or []) if q]

    def _base_query():
        query = session.query(Jobs).filter(
            Jobs.status == "queued",
            or_(Jobs.scheduled_for.is_(None), Jobs.scheduled_for <= now),
        )
        if queue_list:
            query = query.filter(Jobs.queue.in_(queue_list))
        return query.order_by(Jobs.priority.desc(), Jobs.created_at.asc())

    if _dialect_name(session) == "postgresql":
        # Multi-worker safe: skip rows other workers have locked.
        job = _base_query().with_for_update(skip_locked=True).first()
        if job is None:
            return None
        _mark_claimed(job)
        session.commit()
        return job

    # SQLite / other: no row locking. Degrade to an ordered scan plus a
    # status-guarded optimistic UPDATE so a concurrent claim can't double-run.
    while True:
        job = _base_query().first()
        if job is None:
            return None
        claim_ts = utcnow()
        updated = (
            session.query(Jobs)
            .filter(Jobs.id == job.id, Jobs.status == "queued")
            .update(
                {
                    Jobs.status: "running",
                    Jobs.started_at: claim_ts,
                    Jobs.last_heartbeat_at: claim_ts,
                },
                synchronize_session=False,
            )
        )
        session.commit()
        if updated == 1:
            session.refresh(job)
            return job
        # Lost the race for this row; try the next candidate.
        session.expire(job)


# ---------------------------------------------------------------------------
# Reaper
# ---------------------------------------------------------------------------
def requeue_stale_jobs(session, *, heartbeat_timeout_seconds: int = DEFAULT_HEARTBEAT_TIMEOUT) -> int:
    """Requeue ``running`` jobs whose heartbeat is older than the timeout.

    Returns the number of jobs requeued. Each requeue appends a ``requeued``
    :class:`JobEvents` row (crash-recovery audit trail).
    """

    cutoff = utcnow() - timedelta(seconds=heartbeat_timeout_seconds)
    stale = (
        session.query(Jobs)
        .filter(
            Jobs.status == "running",
            Jobs.last_heartbeat_at.isnot(None),
            Jobs.last_heartbeat_at < cutoff,
        )
        .all()
    )

    requeued = 0
    for job in stale:
        job.status = "queued"
        job.started_at = None
        # Bump per-task attempt counters so retries are observable.
        for task in job.tasks:
            if task.status == "running":
                task.status = "pending"
            task.attempt_count = (task.attempt_count or 0) + 1
        _append_job_event(
            job,
            "requeued",
            "job requeued after stale heartbeat",
            {
                "job_id": job.id,
                "heartbeat_timeout_seconds": heartbeat_timeout_seconds,
                "last_heartbeat_at": job.last_heartbeat_at.isoformat()
                if job.last_heartbeat_at
                else None,
            },
        )
        requeued += 1

    if requeued:
        session.commit()
    return requeued


# ---------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------
def _heartbeat(job: Jobs) -> None:
    job.last_heartbeat_at = utcnow()


def execute_job(app: Flask, job_id: int) -> None:
    """Execute a claimed job: run its tasks in order and finalize state.

    For jobs whose tasks carry ``__sequence_step__`` in their ``parameters``
    (multi-step sequence automations created by Phase 5), tasks are grouped by
    step, executed group-by-group with per-step ``on_failure`` semantics, and
    prior-step output fields are injected into each task's variables via
    binding resolution before execution.  All other jobs use the original flat
    per-task execution path.
    """

    with _maybe_app_context(app):
        session = db.session
        job = session.get(Jobs, job_id)
        if job is None:
            return

        handler = get_handler(job.job_type)

        previous_status = job.status
        if job.status != "running":
            job.mark_in_progress()
        job.progress_completed = 0
        job.progress_total = len(job.tasks) or job.progress_total
        _heartbeat(job)
        _append_job_event(job, "started", f"{job.job_type} started", {"job_id": job.id})
        jobs_service.record_job_state_change(
            job, previous_status, message=f"{job.job_type} started", extra={"job_id": job.id}
        )
        session.commit()

        if handler is None:
            message = f"no handler registered for job_type '{job.job_type}'"
            job.status = "failed"
            job.finished_at = utcnow()
            job.error = {"message": message}
            _append_job_event(job, "failed", message, {"job_id": job.id})
            session.commit()
            return

        try:
            tasks: Sequence[JobTasks] = sorted(job.tasks, key=lambda t: t.sequence)

            # Detect sequence mode: any task carries __sequence_step__ metadata.
            is_sequence = any(
                (t.parameters or {}).get("__sequence_step__") is not None
                for t in tasks
            )

            if is_sequence:
                task_results, failures = _execute_sequence_tasks(
                    session, job, tasks, handler
                )
            else:
                task_results, failures = _execute_flat_tasks(
                    session, job, tasks, handler
                )

            success = failures == 0
            previous_status = job.status
            job.mark_finished(
                success=success,
                result={
                    "tasks": task_results,
                    "summary": {
                        "total": len(task_results),
                        "succeeded": sum(1 for r in task_results if r["ok"]),
                        "failed": failures,
                    },
                },
            )
            if not success:
                job.error = {"message": f"{failures} task(s) failed"}
            _append_job_event(
                job,
                "completed" if success else "failed",
                f"{job.job_type} {'completed' if success else 'failed'}",
                {"job_id": job.id, "failed": failures},
            )
            jobs_service.record_job_state_change(
                job,
                previous_status,
                message=f"{job.job_type} {'completed' if success else 'failed'}",
                extra={"job_id": job.id, "failed": failures},
            )
            session.commit()
        except Exception as exc:  # noqa: BLE001 - job-level failure guard
            session.rollback()
            job = session.get(Jobs, job_id)
            if job is None:
                return
            previous_status = job.status
            job.status = "failed"
            job.finished_at = utcnow()
            job.error = {"message": str(exc), "traceback": traceback.format_exc()}
            _append_job_event(job, "failed", f"{job.job_type} failed", {"error": str(exc)})
            jobs_service.record_job_state_change(
                job, previous_status, message=f"{job.job_type} failed", extra={"error": str(exc)}
            )
            session.commit()


def _execute_flat_tasks(
    session,
    job: Jobs,
    tasks: Sequence[JobTasks],
    handler: JobHandler,
) -> tuple[list[dict[str, Any]], int]:
    """Execute tasks one-by-one in sequence order (original flat path).

    Returns ``(task_results, failure_count)``.
    """

    task_results: list[dict[str, Any]] = []
    failures = 0

    targets: Sequence[JobTasks | None] = tasks if tasks else [None]
    for task in targets:
        if task is not None:
            task.mark_started()
            task.progress_total = task.progress_total or 1
            session.commit()

        try:
            result = handler(job, task)
            if task is not None:
                task.mark_finished(success=True, result=result)
                task.progress_completed = task.progress_total or 1
            task_results.append({"ok": True, "result": result})
        except Exception as exc:  # noqa: BLE001 - capture per-task failure
            failures += 1
            error_payload = {"message": str(exc), "traceback": traceback.format_exc()}
            if task is not None:
                task.mark_finished(success=False)
                task.error = error_payload
                task.last_error_at = utcnow()
            task_results.append({"ok": False, "error": error_payload})

        job.progress_completed += 1
        _heartbeat(job)
        session.commit()

    return task_results, failures


def _execute_sequence_tasks(
    session,
    job: Jobs,
    tasks: Sequence[JobTasks],
    handler: JobHandler,
) -> tuple[list[dict[str, Any]], int]:
    """Execute tasks grouped by ``__sequence_step__`` with binding resolution.

    For each step group (ordered by step sequence):

    1. Resolve ``__ref__`` bindings in each task's ``variable_bindings`` using
       results from all prior steps.  Inject resolved values into the task's
       ``variables`` before calling the handler.
    2. Execute all device tasks in the group.
    3. Collect per-step field outputs into ``prior_results`` for the next step.
    4. If any task in the group failed and the step's ``on_failure == "stop"``,
       mark all remaining tasks as failed/skipped and stop execution.

    Returns ``(task_results, failure_count)``.
    """

    # Lazy import to avoid circular dependency at module load time.
    from app.services.automations import _resolve_bindings_from_dict

    # Group tasks by their automation-step sequence number.
    step_groups: dict[int, list[JobTasks]] = defaultdict(list)
    for task in tasks:
        step_seq = (task.parameters or {}).get("__sequence_step__", 0)
        step_groups[step_seq].append(task)

    # prior_results[step_seq] = {"fields": {field: value, ...}}
    prior_results: dict[int, dict[str, Any]] = {}

    task_results: list[dict[str, Any]] = []
    failures = 0
    stopped_early = False

    for step_seq in sorted(step_groups.keys()):
        step_tasks = step_groups[step_seq]

        # Determine this step's on_failure policy from the first task.
        first_params = step_tasks[0].parameters or {} if step_tasks else {}
        on_failure: str = first_params.get("__on_failure__") or "stop"

        step_failed = False
        step_fields: dict[str, Any] = {}

        for task in step_tasks:
            params = dict(task.parameters or {})
            bindings: dict[str, Any] = params.get("__variable_bindings__") or {}

            # Resolve any __ref__ bindings; inject results into task variables.
            has_refs = any(_is_ref_value(v) for v in bindings.values())
            if has_refs:
                try:
                    resolved = _resolve_bindings_from_dict(bindings, prior_results)
                    merged_vars = {**(params.get("variables") or {}), **resolved}
                    # Replace variables in the task parameters for the handler
                    # and persist so the resolved values are visible in history.
                    task.parameters = {**params, "variables": merged_vars}
                    session.commit()
                except ValueError as exc:
                    task.mark_started()
                    task.mark_finished(success=False)
                    task.error = {"message": str(exc)}
                    task.last_error_at = utcnow()
                    step_failed = True
                    failures += 1
                    task_results.append({"ok": False, "error": {"message": str(exc)}})
                    job.progress_completed += 1
                    _heartbeat(job)
                    session.commit()
                    continue

            task.mark_started()
            task.progress_total = task.progress_total or 1
            session.commit()

            try:
                result = handler(job, task)
            except Exception as exc:  # noqa: BLE001 - per-task failure
                failures += 1
                step_failed = True
                error_payload = {"message": str(exc), "traceback": traceback.format_exc()}
                task.mark_finished(success=False)
                task.error = error_payload
                task.last_error_at = utcnow()
                task_results.append({"ok": False, "error": error_payload})
                job.progress_completed += 1
                _heartbeat(job)
                session.commit()
                continue

            # The operation handler captures per-device failures in the result
            # dict (ok=False) rather than raising.  Check that so on_failure
            # semantics work correctly for sequence steps.
            device_results = result.get("results", [])
            any_device_failed = any(not r.get("ok", True) for r in device_results)

            if any_device_failed:
                failures += 1
                step_failed = True
                error_payload = {
                    "message": "one or more devices failed",
                    "failed_devices": [
                        r for r in device_results if not r.get("ok", True)
                    ],
                }
                task.mark_finished(success=False)
                task.error = error_payload
                task.last_error_at = utcnow()
                task_results.append({"ok": False, "error": error_payload})
            else:
                task.mark_finished(success=True, result=result)
                task.progress_completed = task.progress_total or 1
                task_results.append({"ok": True, "result": result})

                # Collect output fields for binding resolution in later steps.
                # Use first-wins merging across devices in the same step.
                for host_result in device_results:
                    if host_result.get("ok"):
                        for field, value in (host_result.get("fields") or {}).items():
                            step_fields.setdefault(field, value)

            job.progress_completed += 1
            _heartbeat(job)
            session.commit()

        # Record accumulated fields for this step so later steps can bind to them.
        prior_results[step_seq] = {"fields": step_fields}

        if step_failed and on_failure == "stop":
            # Mark all remaining tasks across all later steps as skipped.
            remaining_seqs = [s for s in sorted(step_groups.keys()) if s > step_seq]
            skip_msg = f"skipped: prior step {step_seq} failed with on_failure=stop"
            for remaining_seq in remaining_seqs:
                for remaining_task in step_groups[remaining_seq]:
                    remaining_task.status = "failed"
                    remaining_task.finished_at = utcnow()
                    remaining_task.error = {"message": skip_msg}
                    failures += 1
                    task_results.append({"ok": False, "error": {"message": skip_msg}})
                    job.progress_completed += 1
            _heartbeat(job)
            session.commit()
            stopped_early = True
            break

    return task_results, failures


def _is_ref_value(value: Any) -> bool:
    """Return True if *value* is a typed step-output reference."""

    return isinstance(value, dict) and value.get("__ref__") is True


# ---------------------------------------------------------------------------
# Worker loop seams
# ---------------------------------------------------------------------------
def run_worker_once(
    app: Flask,
    *,
    queues: Iterable[str] | None = None,
    heartbeat_timeout_seconds: int = DEFAULT_HEARTBEAT_TIMEOUT,
) -> bool:
    """Reap stale jobs, then claim+execute at most one job.

    Returns ``True`` if a job was executed, ``False`` if the queue was idle.
    This is the unit-testable seam (call it directly, inline, in tests).
    """

    job_id: int | None = None
    with _maybe_app_context(app):
        requeue_stale_jobs(db.session, heartbeat_timeout_seconds=heartbeat_timeout_seconds)
        job = claim_next_job(db.session, queues=queues)
        if job is not None:
            job_id = job.id

    if job_id is None:
        return False

    execute_job(app, job_id)
    return True


def run_worker_loop(
    app: Flask,
    *,
    poll_interval: float = DEFAULT_POLL_INTERVAL,
    queues: Iterable[str] | None = None,
    heartbeat_timeout_seconds: int = DEFAULT_HEARTBEAT_TIMEOUT,
    stop_event: threading.Event | None = None,
) -> None:
    """Continuously drain the queue until ``stop_event`` is set.

    Installs SIGINT/SIGTERM handlers when running in the main thread so the
    loop is killable rather than an unstoppable infinite loop.
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
            did_work = run_worker_once(
                app, queues=queues, heartbeat_timeout_seconds=heartbeat_timeout_seconds
            )
        except Exception:  # noqa: BLE001 - keep the loop alive on unexpected errors
            app.logger.exception("worker_iteration_failed")
            did_work = False
        if not did_work:
            stop_event.wait(poll_interval)


# ---------------------------------------------------------------------------
# Built-in handlers
# ---------------------------------------------------------------------------
def _handle_operation_execute(job: Jobs, task: JobTasks | None) -> dict[str, Any]:
    """Execute an ``operation.execute`` task via the ``run_with_nornir`` stub.

    Phase 1 proves the queue consumer end-to-end using the mock executor;
    Phase 2 swaps in real device execution behind the same seam.
    """

    params: dict[str, Any] = dict((task.parameters if task else {}) or {})
    job_params = job.parameters or {}

    if task is not None and task.device_id:
        device_ids = [task.device_id]
    else:
        scope = job_params.get("scope") or {}
        device_ids = [int(d) for d in (scope.get("device_ids") or []) if d]

    hosts = ops_service.build_inventory_for_devices(device_ids)

    first_platform = None
    for host in hosts.values():
        if host.get("platform"):
            first_platform = host["platform"]
            break

    tmpl = ops_service.resolve_operation_template(
        op_type=params.get("op_type"),
        template_id=params.get("template_id"),
        platform=first_platform,
    )

    render_context = {
        "op_type": tmpl.op_type,
        "requested_by": (job_params.get("requested_by") or ""),
        "host": "MULTI",
        **(params.get("variables") or {}),
    }
    rendered = ops_service.render_template_text(tmpl.text, render_context)

    run_params = {
        "dry_run": bool(params.get("dry_run", False)),
        "timeout_sec": int(params.get("timeout_sec", 300)),
        "stop_on_error": bool(params.get("stop_on_error", False)),
        "requested_by": render_context["requested_by"],
        "op_type": tmpl.op_type,
        "template_id": tmpl.id,
        "outputs": tmpl.outputs_schema or {},
        "is_mutating": bool(tmpl.is_mutating),
        "variables": params.get("variables") or {},
    }

    # Auto-snapshot running config before any mutating (non-dry-run) execution.
    if tmpl.is_mutating and not run_params["dry_run"]:
        ops_service.snapshot_devices_pre_mutate(
            device_ids=list(hosts.keys()),
            hosts=hosts,
            job_id=job.id,
        )

    summary, per_host = ops_service.run_with_nornir(
        hosts=hosts, operation_text=rendered, params=run_params
    )
    return {"summary": summary, "results": per_host}


register_handler("operation.execute", _handle_operation_execute)


# ---------------------------------------------------------------------------
# monitoring.run handler (Phase 6)
# ---------------------------------------------------------------------------
def _handle_monitoring_run(job: Jobs, task: JobTasks | None) -> dict[str, Any]:
    """Execute a ``monitoring.run`` task.

    Loads the :class:`~app.models.monitor.Monitors` row, executes its read-only
    action against target devices via the ``operation.execute`` execution path,
    then calls :func:`~app.services.monitors.record_monitor_results` to persist
    the time-series rows and roll up the monitor's status.

    Always uses ``dry_run=False`` (monitors are read-only by construction --
    :func:`~app.services.monitors.validate_monitor` enforces this at save time).
    """

    # Lazy imports to avoid circular dependencies at module load time.
    from app.models.monitor import Monitors
    from app.services.monitors import record_monitor_results
    from app.services.automations import target_device_ids

    params: dict[str, Any] = dict((task.parameters if task else {}) or {})
    job_params: dict[str, Any] = job.parameters or {}

    monitor_id = params.get("monitor_id") or job_params.get("monitor_id")
    if monitor_id is None:
        raise ValueError("monitoring.run: missing monitor_id in job parameters")

    monitor = db.session.get(Monitors, int(monitor_id))
    if monitor is None:
        raise ValueError(f"monitoring.run: monitor {monitor_id} not found")
    if not monitor.is_active:
        raise ValueError(f"monitoring.run: monitor {monitor_id} is disabled")

    # Resolve target devices.
    target = job_params.get("target") or monitor.target or {}
    device_ids = target_device_ids(target)
    if not device_ids:
        # No target devices configured -- record a single error result so the
        # monitor status reflects the misconfiguration.
        record_monitor_results(monitor, [])
        return {"summary": {"total": 0, "succeeded": 0, "failed": 0}, "results": []}

    hosts = ops_service.build_inventory_for_devices(device_ids)

    first_platform: str | None = None
    for host in hosts.values():
        if host.get("platform"):
            first_platform = host["platform"]
            break

    tmpl = ops_service.resolve_operation_template(
        op_type=None,
        template_id=monitor.action_id,
        platform=first_platform,
    )

    render_context = {
        "op_type": tmpl.op_type,
        "requested_by": str(job.owner_id or "monitor"),
        "host": "MULTI",
    }
    rendered = ops_service.render_template_text(tmpl.text, render_context)

    run_params = {
        "dry_run": False,
        "timeout_sec": 300,
        "stop_on_error": False,
        "requested_by": render_context["requested_by"],
        "op_type": tmpl.op_type,
        "template_id": tmpl.id,
        "outputs": tmpl.outputs_schema or {},
        "is_mutating": False,
        "variables": {},
    }

    summary, per_host = ops_service.run_with_nornir(
        hosts=hosts, operation_text=rendered, params=run_params
    )

    # Attach device_id to each per-host result so record_monitor_results can
    # store it.  hosts is keyed by device_id (int); each value has a "host"
    # key (the hostname string) that matches per-host result["host"].
    hostname_to_device_id: dict[str, int] = {
        hdata["host"]: int(device_id)
        for device_id, hdata in hosts.items()
        if hdata.get("host")
    }

    enriched: list[dict[str, Any]] = []
    for host_result in per_host:
        r = dict(host_result)
        hostname = r.get("host") or r.get("hostname") or ""
        r.setdefault("device_id", hostname_to_device_id.get(hostname))
        enriched.append(r)

    record_monitor_results(monitor, enriched)
    return {"summary": summary, "results": enriched}


register_handler("monitoring.run", _handle_monitoring_run)


__all__ = [
    "claim_next_job",
    "execute_job",
    "get_handler",
    "register_handler",
    "requeue_stale_jobs",
    "run_worker_loop",
    "run_worker_once",
]
