"""
app/api/resources/operations.py
--------------------------------
Runtime operation endpoints for executing actions on devices (via Nornir/NAPALM).

Responsibilities
----------------
- Provide a generic execution API that can:
  * run an operation against a single device:   POST /devices/<id>/operations
  * run an operation against many devices:      POST /operations/execute
- Support either a high-level `op_type` (e.g., "password_change") or a
  concrete `template_id` referencing PlatformOperationTemplates.
- Pass user-supplied variables to the renderer/executor layer.
- Offer synchronous (blocking) execution for small batches, or asynchronous (queued)
  mode for larger runs (stubbed here for later queue integration).
- Return consistent, structured results suitable for UI display and auditing.

Security
--------
All endpoints require a valid JWT.

Notes
-----
- The heavy lifting is delegated to `app/services/operations.py` which should
  implement the actual Nornir/NAPALM calls and template rendering.
- This resource focuses on request validation, shape, and HTTP semantics.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from flask import request
from flask_restx import Namespace, Resource, fields
from flask_restx._http import HTTPStatus
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.models import Devices
from ..utils import get_pagination  # reserved for future GETs
from app.services import jobs as jobs_service
from app.services import operations as ops_service

# ---------------------------------------------------------------------------
# Namespace
# ---------------------------------------------------------------------------
ns = Namespace("operations", description="Execute runtime operations against devices")


# ---------------------------------------------------------------------------
# Swagger Models (I/O)
# ---------------------------------------------------------------------------
DeviceResult = ns.model(
    "OperationDeviceResult",
    {
      "device_id": fields.Integer(required=True, description="Target device ID"),
      "ok": fields.Boolean(required=True, description="True if operation completed without error"),
      "changed": fields.Boolean(required=True, description="True if operation changed remote state"),
      "output": fields.String(required=False, description="Raw command/log output (may be truncated)"),
      "error": fields.String(required=False, description="Error message if any"),
      "facts": fields.Raw(required=False, description="Optional structured data gathered during execution"),
    }
)

SyncResultOut = ns.model(
    "OperationSyncResultOut",
    {
      "status": fields.String(example="completed"),
      "started_at": fields.DateTime,
      "completed_at": fields.DateTime,
      "summary": fields.Raw(description="High-level rollup (counts, durations, etc.)"),
      "results": fields.List(fields.Nested(DeviceResult)),
    }
)

QueuedOut = ns.model(
    "OperationQueuedOut",
    {
      "status": fields.String(example="queued"),
      "enqueued_at": fields.DateTime,
      "job": fields.Raw(description="Opaque job descriptor (id, scope, type)"),
    }
)

ExecIn = ns.model(
    "OperationExecIn",
    {
      "device_ids": fields.List(fields.Integer, required=False, description="Explicit device IDs (omit when using single-device endpoint)"),
      "op_type": fields.String(required=False, description="High-level operation type key (e.g., 'password_change','backup')"),
      "template_id": fields.Integer(required=False, description="Concrete PlatformOperationTemplates.id"),
      "variables": fields.Raw(required=False, description="User-provided variables for the template/operation"),
      "dry_run": fields.Boolean(required=False, default=False, description="Attempt to simulate without changing state"),
      "timeout_sec": fields.Integer(required=False, default=300, description="Per-host execution timeout in seconds"),
      "stop_on_error": fields.Boolean(required=False, default=False, description="Abort remaining hosts on first failure"),
      "async": fields.Boolean(required=False, default=True, description="Queue job instead of running synchronously"),
    }
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _normalize_scope_for_single(device_id: int, payload: dict) -> dict:
    """
    Ensure the payload contains exactly one target device for the single-device endpoint.

    Parameters
    ----------
    device_id : int
        The path parameter device id.
    payload : dict
        The request JSON payload.

    Returns
    -------
    dict
        A copy of payload with `device_ids` set to `[device_id]` (overrides any input).
    """
    payload = dict(payload or {})
    payload["device_ids"] = [int(device_id)]
    return payload


def _validate_exec_payload(payload: dict) -> tuple[list[int], dict]:
    """
    Validate/normalize execution payload.

    Parameters
    ----------
    payload : dict
        Raw request payload.

    Returns
    -------
    tuple[list[int], dict]
        A tuple of (device_ids, params) ready for the service layer.

    Raises
    ------
    ValueError
        If neither `op_type` nor `template_id` is provided, or scope is empty.
    """
    device_ids = [int(x) for x in (payload.get("device_ids") or []) if isinstance(x, (int, str))]
    op_type = payload.get("op_type")
    template_id = payload.get("template_id")

    if not op_type and not template_id:
        raise ValueError("Provide either 'op_type' or 'template_id'")

    if not device_ids:
        raise ValueError("No target devices specified")

    params = {
        "op_type": op_type,
        "template_id": template_id,
        "variables": payload.get("variables") or {},
        "dry_run": bool(payload.get("dry_run", False)),
        "timeout_sec": int(payload.get("timeout_sec", 300)),
        "stop_on_error": bool(payload.get("stop_on_error", False)),
        "run_async": bool(payload.get("async", True)),
        "requested_by": str(get_jwt_identity() or ""),
    }
    return device_ids, params


# ---------------------------------------------------------------------------
# Collection execution (multi-device)
# ---------------------------------------------------------------------------
@ns.route("/execute")
class OperationExecute(Resource):
    """
    Resource: /operations/execute
    -----------------------------
    Execute an operation across multiple devices.
    """

    @jwt_required()
    @ns.expect(ExecIn, validate=False)
    @ns.response(HTTPStatus.ACCEPTED, "Queued", QueuedOut)
    @ns.response(HTTPStatus.OK, "Completed", SyncResultOut)
    def post(self):
        """
        Execute or queue an operation for multiple devices.

        Body
        ----
        OperationExecIn

        Returns
        -------
        202 Queued (OperationQueuedOut) when async=true
        200 Completed (OperationSyncResultOut) when async=false
        """
        payload = request.get_json(silent=True) or {}
        device_ids, params = _validate_exec_payload(payload)

        # Optional: ensure devices exist (light guard; heavy validation can live in service)
        existing = Devices.query.with_entities(Devices.id).filter(Devices.id.in_(device_ids)).all()
        existing_ids = {row.id for row in existing}
        missing = [d for d in device_ids if d not in existing_ids]
        if missing:
            # Fail early to avoid silent drops
            return {"error": "not_found", "missing_device_ids": missing}, HTTPStatus.NOT_FOUND

        if params["run_async"]:
            idempotency_key = request.headers.get("Idempotency-Key")
            owner_id = None
            if params["requested_by"] and str(params["requested_by"]).isdigit():
                owner_id = int(params["requested_by"])

            job_payload = {
                "scope": {"device_ids": device_ids},
                "operation": {
                    "op_type": params["op_type"],
                    "template_id": params["template_id"],
                },
                "options": {
                    "dry_run": params["dry_run"],
                    "timeout_sec": params["timeout_sec"],
                    "stop_on_error": params["stop_on_error"],
                },
                "variables": params["variables"],
            }

            task_specs = [
                jobs_service.JobTaskSpec(
                    task_type="operation.device",
                    sequence=index,
                    device_id=device_id,
                    parameters={
                        "op_type": params["op_type"],
                        "template_id": params["template_id"],
                        "variables": params["variables"],
                        "dry_run": params["dry_run"],
                        "timeout_sec": params["timeout_sec"],
                        "stop_on_error": params["stop_on_error"],
                    },
                )
                for index, device_id in enumerate(device_ids)
            ]

            job, created = jobs_service.enqueue_job(
                job_type="operation.execute",
                owner_id=owner_id,
                parameters=job_payload,
                idempotency_key=idempotency_key,
                tasks=task_specs,
                event_message="operation execution queued",
                event_context={
                    "device_count": len(device_ids),
                    "op_type": params["op_type"],
                    "template_id": params["template_id"],
                    "requested_by": params["requested_by"],
                },
            )

            status = HTTPStatus.ACCEPTED if created else HTTPStatus.OK
            return (
                {
                    "status": "queued",
                    "enqueued_at": job.created_at.isoformat(),
                    "job": jobs_service.serialize_job(job),
                },
                status,
                {"Location": jobs_service.job_location(job)},
            )

        # Synchronous execution path
        started = datetime.utcnow()
        summary, per_host = ops_service.execute_operation_sync(
            device_ids=device_ids,
            op_type=params["op_type"],
            template_id=params["template_id"],
            variables=params["variables"],
            dry_run=params["dry_run"],
            timeout_sec=params["timeout_sec"],
            stop_on_error=params["stop_on_error"],
            requested_by=params["requested_by"],
        )
        completed = datetime.utcnow()

        return {
            "status": "completed",
            "started_at": started.isoformat() + "Z",
            "completed_at": completed.isoformat() + "Z",
            "summary": summary,
            "results": per_host,
        }, HTTPStatus.OK


# ---------------------------------------------------------------------------
# Single-device execution
# ---------------------------------------------------------------------------
@ns.route("/devices/<int:device_id>/operations")
class OperationDevice(Resource):
    """
    Resource: /operations/devices/<device_id>/operations
    ----------------------------------------------------
    Execute an operation against a single device (convenience endpoint).
    """

    @jwt_required()
    @ns.expect(ExecIn, validate=False)
    @ns.response(HTTPStatus.ACCEPTED, "Queued", QueuedOut)
    @ns.response(HTTPStatus.OK, "Completed", SyncResultOut)
    def post(self, device_id: int):
        """
        Execute or queue an operation for a single device.

        Parameters
        ----------
        device_id : int
            Target device id.

        Body
        ----
        OperationExecIn
            Same schema as the multi-device endpoint, but the path param
            overrides any 'device_ids' in the body.

        Returns
        -------
        202 Queued (OperationQueuedOut) when async=true
        200 Completed (OperationSyncResultOut) when async=false
        """
        payload = _normalize_scope_for_single(device_id, request.get_json(silent=True) or {})
        device_ids, params = _validate_exec_payload(payload)

        if Devices.query.get(device_id) is None:
            return {"error": "not_found", "missing_device_ids": [device_id]}, HTTPStatus.NOT_FOUND

        if params["run_async"]:
            idempotency_key = request.headers.get("Idempotency-Key")
            owner_id = None
            if params["requested_by"] and str(params["requested_by"]).isdigit():
                owner_id = int(params["requested_by"])

            job_payload = {
                "scope": {"device_ids": device_ids},
                "operation": {
                    "op_type": params["op_type"],
                    "template_id": params["template_id"],
                },
                "options": {
                    "dry_run": params["dry_run"],
                    "timeout_sec": params["timeout_sec"],
                    "stop_on_error": params["stop_on_error"],
                },
                "variables": params["variables"],
            }

            job, created = jobs_service.enqueue_job(
                job_type="operation.execute",
                owner_id=owner_id,
                parameters=job_payload,
                idempotency_key=idempotency_key,
                tasks=[
                    jobs_service.JobTaskSpec(
                        task_type="operation.device",
                        sequence=0,
                        device_id=device_ids[0],
                        parameters={
                            "op_type": params["op_type"],
                            "template_id": params["template_id"],
                            "variables": params["variables"],
                            "dry_run": params["dry_run"],
                            "timeout_sec": params["timeout_sec"],
                            "stop_on_error": params["stop_on_error"],
                        },
                    )
                ],
                event_message="operation execution queued",
                event_context={
                    "device_count": 1,
                    "op_type": params["op_type"],
                    "template_id": params["template_id"],
                    "requested_by": params["requested_by"],
                },
            )

            status = HTTPStatus.ACCEPTED if created else HTTPStatus.OK
            return (
                {
                    "status": "queued",
                    "enqueued_at": job.created_at.isoformat(),
                    "job": jobs_service.serialize_job(job),
                },
                status,
                {"Location": jobs_service.job_location(job)},
            )

        started = datetime.utcnow()
        summary, per_host = ops_service.execute_operation_sync(
            device_ids=device_ids,
            op_type=params["op_type"],
            template_id=params["template_id"],
            variables=params["variables"],
            dry_run=params["dry_run"],
            timeout_sec=params["timeout_sec"],
            stop_on_error=params["stop_on_error"],
            requested_by=params["requested_by"],
        )
        completed = datetime.utcnow()

        return {
            "status": "completed",
            "started_at": started.isoformat() + "Z",
            "completed_at": completed.isoformat() + "Z",
            "summary": summary,
            "results": per_host,
        }, HTTPStatus.OK