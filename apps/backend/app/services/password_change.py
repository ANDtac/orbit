"""Password-change orchestration and async job execution."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import threading
import time
import traceback
from typing import Any

from flask import Flask
from sqlalchemy.orm import joinedload

from app.extensions import db
from app.models import AppEvents, CredentialProfiles, Devices, ErrorLogs, JobEvents, JobTasks, Jobs
from app.models.annotations import utcnow
from app.observability.activity import record_app_event
from app.services import jobs as jobs_service
from app.services.handlers import get_handler, normalize_platform_slug

_ASYNC_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="orbit-password-change")
_JOB_REQUESTS: dict[int, "PasswordChangeRequest"] = {}
_JOB_REQUESTS_LOCK = threading.Lock()


@dataclass
class PasswordChangeRequest:
    device_ids: list[int]
    new_password: str
    current_password: str
    enable_secret: str = ""
    requested_by: str = ""
    timeout_per_device: int = 30
    validate_after: bool = True


@dataclass
class PasswordChangeResult:
    device_id: int
    ok: bool
    changed: bool
    output: str | None = None
    error: str | None = None
    phase: str = "completed"
    platform: str | None = None
    host: str | None = None
    latency_ms: int | None = None
    traceback_text: str | None = None


def _device_query(device_ids: list[int]):
    return (
        Devices.query.options(joinedload(Devices.platform), joinedload(Devices.tags))
        .filter(Devices.id.in_(device_ids))
        .order_by(Devices.id.asc())
    )


def _build_target(device: Devices, request: PasswordChangeRequest) -> dict[str, Any]:
    platform = device.platform
    credential_profile = (
        db.session.get(CredentialProfiles, device.credential_profile_id)
        if device.credential_profile_id
        else None
    )
    platform_slug = normalize_platform_slug(platform.slug if platform else None)
    username = (credential_profile.username if credential_profile else None) or "admin"

    return {
        "device_id": device.id,
        "host": str(device.mgmt_ipv4 or device.fqdn or device.name or f"device-{device.id}"),
        "port": int(device.mgmt_port or 22),
        "platform_slug": platform_slug,
        "platform_name": platform.display_name if platform else None,
        "netmiko_type": getattr(platform, "netmiko_type", None) if platform else None,
        "username": username,
        "current_password": request.current_password,
        "new_password": request.new_password,
        "enable_secret": request.enable_secret or request.current_password,
        "timeout": request.timeout_per_device,
        "validate_after": request.validate_after,
    }


def _serialize_result(result: PasswordChangeResult) -> dict[str, Any]:
    return asdict(result)


def serialize_password_change_result(result: PasswordChangeResult) -> dict[str, Any]:
    """Return a stable dictionary representation of a password-change result."""

    return _serialize_result(result)


def _log_attempt(
    result: PasswordChangeResult,
    *,
    requested_by: str,
    job_id: int | None = None,
) -> None:
    event = AppEvents()
    event.event = "password_change.attempt"
    event.message = f"Password change {'succeeded' if result.ok else 'failed'} for device {result.device_id}"
    event.level = "INFO" if result.ok else "ERROR"
    event.extra = {
        "device_id": result.device_id,
        "platform": result.platform,
        "host": result.host,
        "ok": result.ok,
        "changed": result.changed,
        "phase": result.phase,
        "error": result.error,
        "requested_by": requested_by,
        "job_id": job_id,
    }
    db.session.add(event)


def _log_batch_started(
    request: PasswordChangeRequest,
    *,
    job_id: int | None = None,
) -> None:
    record_app_event(
        "password_change.started",
        message="Password change batch started",
        extra={
            "job_id": job_id,
            "requested_by": request.requested_by,
            "device_ids": request.device_ids,
            "total": len(request.device_ids),
            "validate_after": request.validate_after,
            "timeout_per_device": request.timeout_per_device,
        },
    )


def _log_device_result(
    result: PasswordChangeResult,
    *,
    requested_by: str,
    job_id: int | None = None,
) -> None:
    record_app_event(
        "password_change.device_result",
        level="INFO" if result.ok else "ERROR",
        message=f"Password change {'succeeded' if result.ok else 'failed'} for device {result.device_id}",
        extra={
            "device_id": result.device_id,
            "platform": result.platform,
            "host": result.host,
            "ok": result.ok,
            "changed": result.changed,
            "phase": result.phase,
            "error": result.error,
            "latency_ms": result.latency_ms,
            "requested_by": requested_by,
            "job_id": job_id,
        },
    )


def _log_batch_complete(
    results: list[PasswordChangeResult],
    *,
    requested_by: str,
    job_id: int | None = None,
    duration_seconds: float | None = None,
) -> None:
    succeeded = sum(1 for item in results if item.ok)
    failed = len(results) - succeeded
    event = AppEvents()
    event.event = "password_change.batch_complete"
    event.message = "Password change batch completed"
    event.level = "INFO" if failed == 0 else "WARNING"
    event.extra = {
        "requested_by": requested_by,
        "job_id": job_id,
        "total": len(results),
        "succeeded": succeeded,
        "failed": failed,
    }
    db.session.add(event)
    record_app_event(
        "password_change.completed",
        level="INFO" if failed == 0 else "WARNING",
        message="Password change batch completed",
        extra={
            "requested_by": requested_by,
            "job_id": job_id,
            "total": len(results),
            "succeeded": succeeded,
            "failed": failed,
            "duration_seconds": duration_seconds,
        },
    )


def _log_error(message: str, *, correlation_id: str, context: dict[str, Any]) -> None:
    row = ErrorLogs()
    row.correlation_id = correlation_id
    row.level = "ERROR"
    row.message = message
    row.traceback = context.get("traceback")
    row.context = context
    db.session.add(row)


def _run_one(target: dict[str, Any]) -> PasswordChangeResult:
    started = time.perf_counter()
    try:
        handler = get_handler(target["platform_slug"])
        response = handler(target)
        return PasswordChangeResult(
            device_id=target["device_id"],
            ok=bool(response.get("ok")),
            changed=bool(response.get("changed")),
            output=response.get("output"),
            error=response.get("error"),
            phase=response.get("phase", "completed"),
            platform=response.get("platform") or target["platform_slug"],
            host=response.get("host") or target["host"],
            latency_ms=int((time.perf_counter() - started) * 1000),
        )
    except Exception as exc:  # pragma: no cover
        return PasswordChangeResult(
            device_id=target["device_id"],
            ok=False,
            changed=False,
            error=str(exc),
            phase="execute",
            platform=target["platform_slug"],
            host=target["host"],
            latency_ms=int((time.perf_counter() - started) * 1000),
            traceback_text=traceback.format_exc(),
        )


def execute_password_change_request(
    request: PasswordChangeRequest,
) -> tuple[dict[str, Any], list[PasswordChangeResult]]:
    """Execute a password-change batch synchronously."""

    if not request.device_ids:
        raise ValueError("device_ids is required")
    if not request.new_password:
        raise ValueError("new_password is required")
    if not request.current_password:
        raise ValueError("current_password is required")

    devices = _device_query(request.device_ids).all()
    device_map = {device.id: device for device in devices}
    targets: list[dict[str, Any]] = []
    results: list[PasswordChangeResult] = []

    for device_id in request.device_ids:
        device = device_map.get(device_id)
        if not device:
            results.append(
                PasswordChangeResult(
                    device_id=device_id,
                    ok=False,
                    changed=False,
                    error="device not found",
                    phase="prepare",
                )
            )
            continue
        try:
            targets.append(_build_target(device, request))
        except Exception as exc:
            results.append(
                PasswordChangeResult(
                    device_id=device_id,
                    ok=False,
                    changed=False,
                    error=str(exc),
                    phase="prepare",
                )
            )

    workers = min(30, max(1, len(targets)))
    with ThreadPoolExecutor(
        max_workers=workers,
        thread_name_prefix="orbit-password-change-batch",
    ) as executor:
        futures = {
            executor.submit(_run_one, target): target["device_id"]
            for target in targets
        }
        for future in as_completed(futures):
            results.append(future.result())

    ordered = {result.device_id: result for result in results}
    ordered_results = [
        ordered[device_id] for device_id in request.device_ids if device_id in ordered
    ]
    summary = {
        "requested": len(request.device_ids),
        "ok": sum(1 for item in ordered_results if item.ok),
        "failed": sum(1 for item in ordered_results if not item.ok),
        "changed": sum(1 for item in ordered_results if item.changed),
        "validate_after": request.validate_after,
    }
    return summary, ordered_results


def remember_job_request(job_id: int, request: PasswordChangeRequest) -> None:
    """Store a password-change request in process memory for async execution."""

    with _JOB_REQUESTS_LOCK:
        _JOB_REQUESTS[job_id] = request


def _pop_job_request(job_id: int) -> PasswordChangeRequest | None:
    with _JOB_REQUESTS_LOCK:
        return _JOB_REQUESTS.pop(job_id, None)


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


def _update_job_task(task: JobTasks, result: PasswordChangeResult) -> None:
    task.mark_finished(success=result.ok, result=_serialize_result(result))
    if not result.ok:
        task.error = {"message": result.error, "phase": result.phase}
        task.last_error_at = utcnow()
    task.progress_total = 1
    task.progress_completed = 1


def execute_password_change_job(app: Flask, job_id: int) -> None:
    """Run a queued password-change job and persist results."""

    with app.app_context():
        job = db.session.get(Jobs, job_id)
        request = _pop_job_request(job_id)
        if not job or not request:
            return

        started_at = datetime.now(timezone.utc)
        previous_status = job.status
        job.mark_in_progress()
        job.progress_completed = 0
        _append_job_event(job, "started", "password change started", {"job_id": job_id})
        jobs_service.record_job_state_change(
            job,
            previous_status,
            message="password change started",
            extra={"job_id": job_id},
        )
        _log_batch_started(request, job_id=job.id)
        db.session.commit()

        try:
            summary, results = execute_password_change_request(request)
            task_by_device = {
                task.device_id: task for task in job.tasks if task.device_id is not None
            }
            for result in results:
                task = task_by_device.get(result.device_id)
                if task:
                    _update_job_task(task, result)
                _log_attempt(result, requested_by=request.requested_by, job_id=job.id)
                _log_device_result(result, requested_by=request.requested_by, job_id=job.id)
                if not result.ok:
                    _log_error(
                        result.error or "password change failed",
                        correlation_id=f"password-change-job-{job.id}-device-{result.device_id}",
                        context={
                            "job_id": job.id,
                            "device_id": result.device_id,
                            "platform": result.platform,
                            "host": result.host,
                            "phase": result.phase,
                            "traceback": result.traceback_text,
                        },
                    )
            duration_seconds = (datetime.now(timezone.utc) - started_at).total_seconds()
            _log_batch_complete(
                results,
                requested_by=request.requested_by,
                job_id=job.id,
                duration_seconds=duration_seconds,
            )
            job.progress_total = len(job.tasks)
            job.progress_completed = len(results)
            previous_status = job.status
            job.mark_finished(
                success=summary["failed"] == 0,
                result={
                    "summary": summary,
                    "results": [_serialize_result(item) for item in results],
                    "started_at": started_at.isoformat(),
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            _append_job_event(
                job,
                "completed",
                "password change completed",
                {"summary": summary},
            )
            jobs_service.record_job_state_change(
                job,
                previous_status,
                message="password change completed",
                extra={"job_id": job.id, "summary": summary},
            )
            db.session.commit()
        except Exception as exc:  # pragma: no cover
            correlation_id = f"password-change-job-{job_id}"
            previous_status = job.status
            job.status = "failed"
            job.finished_at = utcnow()
            job.error = {"message": str(exc)}
            _append_job_event(job, "failed", "password change failed", {"error": str(exc)})
            jobs_service.record_job_state_change(
                job,
                previous_status,
                message="password change failed",
                extra={"job_id": job.id, "error": str(exc)},
            )
            _log_error(
                str(exc),
                correlation_id=correlation_id,
                context={"job_id": job_id, "traceback": traceback.format_exc()},
            )
            db.session.commit()


def schedule_password_change_job(app: Flask, job_id: int) -> None:
    """Schedule async execution of a queued password-change job."""

    if app.config.get("PASSWORD_CHANGE_RUN_INLINE_JOBS"):
        execute_password_change_job(app, job_id)
        return

    _ASYNC_EXECUTOR.submit(execute_password_change_job, app, job_id)
