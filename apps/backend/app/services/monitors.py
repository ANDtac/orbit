"""Monitor validation, execution, and result recording service (Phase 6).

Key seams
---------
* :func:`validate_monitor` -- raises ``ValueError`` when the action is mutating.
* :func:`run_monitor` -- enqueues a ``monitoring.run`` job and returns it.
* :func:`record_monitor_results` -- writes :class:`~app.models.monitor.MonitorResults`
  rows from device execution output and updates the monitor's roll-up ``status``.
* :func:`get_monitor_results` -- range/device-filtered query with a ``limit``.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.extensions import db
from app.models.monitor import MonitorResults, Monitors
from app.services.jobs import JobTaskSpec, enqueue_job

# ---------------------------------------------------------------------------
# Comparator helpers
# ---------------------------------------------------------------------------
_VALID_COMPARATORS = frozenset({"gt", "lt", "gte", "lte", "eq", "ne"})

# Worst-case ordering used to roll up per-device statuses.
_STATUS_RANK: dict[str, int] = {
    "passing": 0,
    "unknown": 1,
    "error": 2,
    "failing": 3,
}


def _apply_comparator(value: float, comparator: str, threshold: float) -> bool:
    """Return ``True`` when *value* satisfies *comparator*(*threshold*)."""

    if comparator == "gt":
        return value > threshold
    if comparator == "lt":
        return value < threshold
    if comparator == "gte":
        return value >= threshold
    if comparator == "lte":
        return value <= threshold
    if comparator == "eq":
        return value == threshold
    if comparator == "ne":
        return value != threshold
    return True  # unknown comparator -- pass through


def _worst_status(statuses: list[str]) -> str:
    """Return the highest-severity status from *statuses*."""

    if not statuses:
        return "unknown"
    return max(statuses, key=lambda s: _STATUS_RANK.get(s, 1))


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
def validate_monitor(action) -> None:
    """Raise :class:`ValueError` when *action* is a mutating operation.

    Monitors may ONLY target read-only actions.  This is enforced here so
    neither the API resource nor the worker need to repeat the check.

    Parameters
    ----------
    action:
        A :class:`~app.models.operations.PlatformOperationTemplates` instance.

    Raises
    ------
    ValueError
        When ``action.is_mutating`` is truthy.
    """

    if getattr(action, "is_mutating", False):
        raise ValueError(
            f"Action '{getattr(action, 'name', action)}' is mutating; "
            "monitors may only use read-only actions"
        )


# ---------------------------------------------------------------------------
# Enqueue
# ---------------------------------------------------------------------------
def run_monitor(monitor: Monitors, *, owner_id: int | None = None):
    """Enqueue a ``monitoring.run`` job and return the :class:`~app.models.tasks.Jobs` row.

    Parameters
    ----------
    monitor:
        The :class:`~app.models.monitor.Monitors` row to run.
    owner_id:
        User id to record as job owner.  ``None`` uses the internal jobs user.

    Returns
    -------
    Jobs
        The newly-created (or idempotent existing) job.
    """

    job, _ = enqueue_job(
        job_type="monitoring.run",
        owner_id=owner_id,
        run_as_internal=(owner_id is None),
        parameters={
            "monitor_id": monitor.id,
            "target": monitor.target or {},
            "metric": monitor.metric,
            "comparator": monitor.comparator,
            "threshold": monitor.threshold,
        },
        tasks=[
            JobTaskSpec(
                task_type="monitoring.run",
                sequence=0,
                parameters={
                    "monitor_id": monitor.id,
                },
            )
        ],
        event_message=f"monitor {monitor.id} enqueued",
    )
    return job


# ---------------------------------------------------------------------------
# Result recording
# ---------------------------------------------------------------------------
def record_monitor_results(
    monitor: Monitors,
    device_results: list[dict[str, Any]],
) -> None:
    """Write one :class:`~app.models.monitor.MonitorResults` row per device.

    For each item in *device_results* (the ``results`` list from the operation
    handler):

    1. Extract ``value = float(result["fields"].get(monitor.metric))``.
       Missing or non-numeric metric → ``value=None``, ``status="error"``.
    2. Apply ``comparator`` + ``threshold`` → ``"passing"`` or ``"failing"``.
       When ``threshold`` is ``None`` the result is ``"passing"`` if value is
       present (not None), ``"error"`` otherwise.
    3. Store the full result dict as ``payload``.

    After all rows are written, ``monitor.status`` is updated to the
    worst-case across all per-device statuses
    (``failing > error > unknown > passing``) and the session is committed.

    Parameters
    ----------
    monitor:
        The parent :class:`~app.models.monitor.Monitors` row.
    device_results:
        List of per-device result dicts produced by the worker operation
        handler.  Each dict may contain ``"fields"`` (dict), ``"device_id"``
        (int or None), ``"ok"`` (bool), and any other keys.
    """

    now = datetime.now(timezone.utc)
    row_statuses: list[str] = []

    for dr in device_results:
        device_id: int | None = dr.get("device_id") or None

        # Extract metric value.
        fields: dict[str, Any] = dr.get("fields") or {}
        raw_value = fields.get(monitor.metric)
        value: float | None = None
        if raw_value is not None:
            try:
                value = float(raw_value)
            except (TypeError, ValueError):
                value = None

        # Determine status.
        if value is None:
            row_status = "error"
        elif monitor.threshold is None:
            # No threshold configured: passing when metric is present.
            row_status = "passing"
        else:
            passing = _apply_comparator(value, monitor.comparator, monitor.threshold)
            row_status = "passing" if passing else "failing"

        row_statuses.append(row_status)

        result_row = MonitorResults(
            monitor_id=monitor.id,
            device_id=device_id,
            observed_at=now,
            value=value,
            status=row_status,
            payload=dr,
        )
        db.session.add(result_row)

    # Roll up monitor-level status.
    monitor.status = _worst_status(row_statuses) if row_statuses else "unknown"
    db.session.commit()


# ---------------------------------------------------------------------------
# Result querying
# ---------------------------------------------------------------------------
def get_monitor_results(
    monitor_id: int,
    *,
    device_id: int | None = None,
    from_dt: datetime | None = None,
    to_dt: datetime | None = None,
    limit: int = 200,
) -> list[MonitorResults]:
    """Return paginated :class:`~app.models.monitor.MonitorResults` rows.

    Results are ordered newest-first.  All filter parameters are optional.

    Parameters
    ----------
    monitor_id:
        Filter to this monitor (required).
    device_id:
        Optionally narrow to a specific device.
    from_dt:
        Inclusive lower bound on ``observed_at``.
    to_dt:
        Inclusive upper bound on ``observed_at``.
    limit:
        Maximum number of rows to return (default 200, caller may lower it).
    """

    query = MonitorResults.query.filter(MonitorResults.monitor_id == monitor_id)

    if device_id is not None:
        query = query.filter(MonitorResults.device_id == device_id)
    if from_dt is not None:
        query = query.filter(MonitorResults.observed_at >= from_dt)
    if to_dt is not None:
        query = query.filter(MonitorResults.observed_at <= to_dt)

    query = query.order_by(MonitorResults.observed_at.desc())
    if limit is not None:
        query = query.limit(limit)

    return query.all()


__all__ = [
    "get_monitor_results",
    "record_monitor_results",
    "run_monitor",
    "validate_monitor",
]
