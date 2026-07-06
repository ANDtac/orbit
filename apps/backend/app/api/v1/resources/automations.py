"""No-code Automation API resources (Phase 3 + Phase 5).

Exposes CRUD for :class:`~app.models.automation.Automations` plus two run
paths:

* ``POST /automations/<id>/run``  - enqueue a real ``operation.execute`` job
  (async, via the worker).
* ``POST /automations/<id>/test`` - "test on one device": execute the Action
  against a SINGLE device with ``dry_run=True`` **synchronously** so the UI gets
  an immediate structured dry-run result/diff. Mutating Actions never commit.

Phase 5 extensions:

* POST / PATCH accept an optional ``steps`` array to define a multi-step
  sequence.  Each step element is ``{sequence, action_id, variable_bindings,
  on_failure}``.  When ``steps`` is supplied, bindings are validated via
  :func:`app.services.automations.validate_bindings` before commit.
* GET / serialisation includes a ``steps`` key.
* ``POST /automations/<id>/test`` tests the first step when the automation has
  steps, and notes ``step_tested`` / ``step_count`` in the response.

Operator-submitted ``variable_values`` are validated server-side against the
Action's ``variables`` schema before any row is written (create/update) -- the
core invariant that keeps no-code automations reliable.
"""

from __future__ import annotations

from datetime import datetime, timezone

from flask import request
from flask_restx import Namespace, Resource, fields
from flask_restx._http import HTTPStatus
from flask_jwt_extended import get_jwt_identity, jwt_required

from app.extensions import db
from app.models import Automations, Devices, PlatformOperationTemplates
from app.models.automation_step import AutomationSteps
from app.observability.activity import record_model_change, serialize_model_state
from app.services import automations as automations_service
from app.services import jobs as jobs_service
from app.services import operations as ops_service
from ..utils import (
    apply_sorting,
    cursor_paginate,
    get_cursor_pagination,
    get_filter_args,
    problem_response,
    require_roles,
)

ns = Namespace("automations", description="No-code automations (single-action and sequences)")


# ---------------------------------------------------------------------------
# Swagger models
# ---------------------------------------------------------------------------
StepIn = ns.model(
    "AutomationStepIn",
    {
        "sequence": fields.Integer(required=True, description="1-based step order"),
        "action_id": fields.Integer(required=True, description="FK to PlatformOperationTemplates.id"),
        "variable_bindings": fields.Raw(
            required=False,
            description=(
                "Per-field values: plain literals or typed refs "
                "{\"__ref__\": true, \"step\": N, \"output\": \"field\"}"
            ),
        ),
        "on_failure": fields.String(required=False, description="stop | continue"),
    },
)

StepOut = ns.model(
    "AutomationStepOut",
    {
        "id": fields.Integer,
        "uuid": fields.String,
        "sequence": fields.Integer,
        "action_id": fields.Integer,
        "variable_bindings": fields.Raw,
        "on_failure": fields.String,
        "created_at": fields.DateTime,
        "updated_at": fields.DateTime,
    },
)

AutomationBase = ns.model(
    "AutomationBase",
    {
        "name": fields.String(required=True, description="Automation name"),
        "description": fields.String(required=False),
        "action_id": fields.Integer(required=False, description="FK to PlatformOperationTemplates.id (single-action)"),
        "variable_values": fields.Raw(required=False, description="Operator-filled inputs for single-action automations"),
        "steps": fields.List(
            fields.Nested(StepIn),
            required=False,
            description="Ordered sequence steps (omit for single-action automations)",
        ),
        "target": fields.Raw(required=False, description="Target selector, e.g. {\"device_ids\": [1]}"),
        "visibility": fields.String(required=False, description="private | shared | role"),
        "on_failure": fields.String(required=False, description="stop | continue"),
        "approval_required": fields.Boolean(required=False, description="Maker/checker seam (unused)"),
    },
)

AutomationCreate = ns.clone("AutomationCreate", AutomationBase, {})
AutomationUpdate = ns.clone("AutomationUpdate", AutomationBase, {})

AutomationOut = ns.model(
    "AutomationOut",
    {
        "id": fields.Integer(required=True),
        "uuid": fields.String(required=True),
        "name": fields.String(required=True),
        "description": fields.String,
        "action_id": fields.Integer,
        "variable_values": fields.Raw,
        "steps": fields.List(fields.Nested(StepOut)),
        "target": fields.Raw,
        "visibility": fields.String,
        "on_failure": fields.String,
        "approval_required": fields.Boolean,
        "owner_id": fields.Integer,
        "is_active": fields.Boolean,
        "created_at": fields.DateTime,
        "updated_at": fields.DateTime,
    },
)

AutomationCollection = ns.model(
    "AutomationCollection",
    {
        "data": fields.List(fields.Nested(AutomationOut), required=True),
        "page": fields.Raw(required=True),
    },
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
_ALLOWED_VISIBILITY = {"private", "shared", "role"}
_ALLOWED_ON_FAILURE = {"stop", "continue"}
_AUDIT_EXCLUDE = {"uuid"}


def _current_user_id() -> int | None:
    identity = get_jwt_identity()
    if identity is None:
        return None
    try:
        return int(identity)
    except (TypeError, ValueError):  # pragma: no cover - defensive
        return None


def _serialize_step(step: AutomationSteps) -> dict:
    def _dt(value):
        return value.isoformat() if value is not None else None

    return {
        "id": step.id,
        "uuid": str(step.uuid),
        "sequence": step.sequence,
        "action_id": step.action_id,
        "variable_bindings": step.variable_bindings or {},
        "on_failure": step.on_failure,
        "created_at": _dt(step.created_at),
        "updated_at": _dt(step.updated_at),
    }


def _serialize(automation: Automations) -> dict:
    def _dt(value):
        return value.isoformat() if value is not None else None

    return {
        "id": automation.id,
        "uuid": str(automation.uuid),
        "name": automation.name,
        "description": automation.description,
        "action_id": automation.action_id,
        "variable_values": automation.variable_values or {},
        "steps": [_serialize_step(s) for s in (automation.steps or [])],
        "target": automation.target or {},
        "visibility": automation.visibility,
        "on_failure": automation.on_failure,
        "approval_required": bool(automation.approval_required),
        "owner_id": automation.owner_id,
        "is_active": automation.is_active,
        "created_at": _dt(automation.created_at),
        "updated_at": _dt(automation.updated_at),
    }


def _validate_and_build_steps(
    steps_payload: list[dict],
    automation_row: Automations | None = None,
) -> tuple[list[AutomationSteps], str | None]:
    """Validate a ``steps`` array and return (step_objects, error_message).

    Checks that every step has a valid, active ``action_id``, that sequences
    are positive integers, and validates the binding graph via
    :func:`~app.services.automations.validate_bindings`.

    Returns ``(step_objects, None)`` on success, ``([], error_message)`` on
    failure.  Step objects are *not* yet attached to the session.
    """

    if not steps_payload:
        return [], None

    step_objects: list[AutomationSteps] = []
    action_map: dict[int, PlatformOperationTemplates] = {}
    seen_sequences: set[int] = set()

    for i, item in enumerate(steps_payload):
        seq = item.get("sequence")
        action_id = item.get("action_id")
        on_failure = item.get("on_failure") or "stop"
        variable_bindings = item.get("variable_bindings") or {}

        if seq is None or not isinstance(seq, int) or seq < 1:
            return [], f"steps[{i}]: 'sequence' must be a positive integer"
        if seq in seen_sequences:
            return [], f"steps[{i}]: duplicate sequence value {seq}"
        seen_sequences.add(seq)

        if not action_id:
            return [], f"steps[{i}] (sequence={seq}): 'action_id' is required"
        action = db.session.get(PlatformOperationTemplates, int(action_id))
        if action is None:
            return [], f"steps[{i}] (sequence={seq}): action_id {action_id} not found"
        if not action.is_active:
            return [], f"steps[{i}] (sequence={seq}): action '{action.name}' is not active"

        if on_failure not in _ALLOWED_ON_FAILURE:
            return [], f"steps[{i}] (sequence={seq}): on_failure must be one of {sorted(_ALLOWED_ON_FAILURE)}"

        action_map[action.id] = action
        step_obj = AutomationSteps(
            automation_id=automation_row.id if automation_row else 0,
            sequence=seq,
            action_id=action.id,
            variable_bindings=variable_bindings,
            on_failure=on_failure,
        )
        step_objects.append(step_obj)

    # Validate the binding graph.
    try:
        automations_service.validate_bindings(step_objects, action_map)
    except ValueError as exc:
        return [], str(exc)

    return step_objects, None


def _replace_steps(automation: Automations, step_objects: list[AutomationSteps]) -> None:
    """Delete existing steps and persist *step_objects* for *automation*."""

    # Delete existing steps (cascade handles DB, but relationship does not
    # auto-remove detached objects without explicit deletion).
    for existing in list(automation.steps):
        db.session.delete(existing)
    db.session.flush()

    for step in step_objects:
        step.automation_id = automation.id
        db.session.add(step)
    db.session.flush()


@ns.route("")
class AutomationList(Resource):
    """List or create automations."""

    @jwt_required()
    @require_roles("network_admin")
    @ns.marshal_with(AutomationCollection, code=HTTPStatus.OK)
    def get(self):
        filters = get_filter_args(
            {"visibility", "action_id", "owner_id", "name"},
            legacy={
                "visibility": "visibility",
                "action_id": "action_id",
                "owner_id": "owner_id",
                "name": "name",
            },
        )
        query = Automations.query

        if visibility := filters.get("visibility"):
            query = query.filter(Automations.visibility == visibility)
        if action_id := filters.get("action_id"):
            if str(action_id).isdigit():
                query = query.filter(Automations.action_id == int(action_id))
        if owner_id := filters.get("owner_id"):
            if str(owner_id).isdigit():
                query = query.filter(Automations.owner_id == int(owner_id))
        if name := filters.get("name"):
            query = query.filter(Automations.name.ilike(f"%{name}%"))

        query = apply_sorting(
            query,
            Automations,
            default="-id",
            allowed={"id", "name", "action_id", "visibility", "created_at", "updated_at"},
        )

        cursor, size = get_cursor_pagination()
        payload = cursor_paginate(query, cursor=cursor, size=size)
        return {"data": [_serialize(row) for row in payload["data"]], "page": payload["page"]}

    @jwt_required()
    @require_roles("network_admin")
    @ns.expect(AutomationCreate, validate=False)
    @ns.doc(responses={201: "Created", 400: "Validation error"})
    def post(self):
        payload = request.get_json(silent=True) or {}

        name = (payload.get("name") or "").strip()
        if not name:
            return problem_response(HTTPStatus.BAD_REQUEST, detail="name is required")

        steps_payload: list[dict] | None = payload.get("steps")
        action_id = payload.get("action_id")
        is_sequence = bool(steps_payload)

        if is_sequence:
            # Sequence automation: action_id on the parent is optional/informational.
            action = None
            if action_id:
                action = db.session.get(PlatformOperationTemplates, int(action_id))
                if action is None:
                    return problem_response(
                        HTTPStatus.BAD_REQUEST,
                        detail="action_id does not reference a known Action",
                    )
            cleaned_values = {}
        else:
            # Single-action automation.
            if not action_id:
                return problem_response(HTTPStatus.BAD_REQUEST, detail="action_id is required")
            action = db.session.get(PlatformOperationTemplates, int(action_id))
            if action is None:
                return problem_response(
                    HTTPStatus.BAD_REQUEST,
                    detail="action_id does not reference a known Action",
                )
            try:
                cleaned_values = automations_service.validate_variable_values(
                    action, payload.get("variable_values")
                )
            except ValueError as exc:
                return problem_response(HTTPStatus.BAD_REQUEST, detail=str(exc))

        visibility = payload.get("visibility") or "private"
        if visibility not in _ALLOWED_VISIBILITY:
            return problem_response(
                HTTPStatus.BAD_REQUEST,
                detail=f"visibility must be one of {sorted(_ALLOWED_VISIBILITY)}",
            )
        on_failure = payload.get("on_failure") or "stop"
        if on_failure not in _ALLOWED_ON_FAILURE:
            return problem_response(
                HTTPStatus.BAD_REQUEST,
                detail=f"on_failure must be one of {sorted(_ALLOWED_ON_FAILURE)}",
            )

        row = Automations(
            name=name,
            description=payload.get("description"),
            action_id=action.id if action else action_id,
            variable_values=cleaned_values,
            target=payload.get("target") or {},
            visibility=visibility,
            on_failure=on_failure,
            approval_required=bool(payload.get("approval_required", False)),
            owner_id=_current_user_id(),
        )
        db.session.add(row)
        db.session.flush()  # get row.id before steps reference it

        if is_sequence:
            step_objects, err = _validate_and_build_steps(steps_payload, automation_row=row)
            if err:
                db.session.rollback()
                return problem_response(HTTPStatus.BAD_REQUEST, detail=err)
            for step in step_objects:
                step.automation_id = row.id
                db.session.add(step)
            db.session.flush()

        record_model_change(
            action="automation.create",
            target_type="automation",
            target=row,
            before=None,
            after=serialize_model_state(row, exclude=_AUDIT_EXCLUDE),
            message=f"Created automation {row.name}",
        )
        db.session.commit()
        db.session.refresh(row)
        return _serialize(row), HTTPStatus.CREATED


@ns.route("/<int:id>")
class AutomationItem(Resource):
    """Retrieve, update, or delete an automation."""

    @jwt_required()
    @require_roles("network_admin")
    @ns.doc(responses={200: "OK", 404: "Not found"})
    def get(self, id: int):
        row = db.session.get(Automations, id)
        if row is None:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Automation not found")
        return _serialize(row)

    @jwt_required()
    @require_roles("network_admin")
    @ns.expect(AutomationUpdate, validate=False)
    @ns.doc(responses={200: "Updated", 400: "Validation error", 404: "Not found"})
    def patch(self, id: int):
        row = db.session.get(Automations, id)
        if row is None:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Automation not found")

        payload = request.get_json(silent=True) or {}
        before = serialize_model_state(row, exclude=_AUDIT_EXCLUDE)

        # Resolve the effective Action (possibly being re-pointed this PATCH).
        action = row.action
        if "action_id" in payload and payload.get("action_id"):
            action = db.session.get(PlatformOperationTemplates, int(payload["action_id"]))
            if action is None:
                return problem_response(
                    HTTPStatus.BAD_REQUEST,
                    detail="action_id does not reference a known Action",
                )

        if "visibility" in payload:
            if payload["visibility"] not in _ALLOWED_VISIBILITY:
                return problem_response(
                    HTTPStatus.BAD_REQUEST,
                    detail=f"visibility must be one of {sorted(_ALLOWED_VISIBILITY)}",
                )
        if "on_failure" in payload:
            if payload["on_failure"] not in _ALLOWED_ON_FAILURE:
                return problem_response(
                    HTTPStatus.BAD_REQUEST,
                    detail=f"on_failure must be one of {sorted(_ALLOWED_ON_FAILURE)}",
                )

        # Re-validate variable_values for single-action automations.
        if "variable_values" in payload or ("action_id" in payload and payload.get("action_id")):
            if action and not payload.get("steps"):
                candidate = payload.get("variable_values", row.variable_values)
                try:
                    payload["variable_values"] = automations_service.validate_variable_values(
                        action, candidate
                    )
                except ValueError as exc:
                    return problem_response(HTTPStatus.BAD_REQUEST, detail=str(exc))

        for key in (
            "name",
            "description",
            "action_id",
            "variable_values",
            "target",
            "visibility",
            "on_failure",
            "approval_required",
        ):
            if key in payload:
                setattr(row, key, payload[key])

        # Replace steps when provided.
        if "steps" in payload:
            steps_payload = payload["steps"] or []
            if steps_payload:
                step_objects, err = _validate_and_build_steps(steps_payload, automation_row=row)
                if err:
                    return problem_response(HTTPStatus.BAD_REQUEST, detail=err)
                _replace_steps(row, step_objects)
            else:
                # Empty steps list: clear all existing steps.
                _replace_steps(row, [])

        db.session.flush()
        record_model_change(
            action="automation.update",
            target_type="automation",
            target=row,
            before=before,
            after=serialize_model_state(row, exclude=_AUDIT_EXCLUDE),
            message=f"Updated automation {row.name}",
        )
        db.session.commit()
        db.session.refresh(row)
        return _serialize(row)

    @jwt_required()
    @require_roles("network_admin")
    def delete(self, id: int):
        row = db.session.get(Automations, id)
        if row is None:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Automation not found")

        before = serialize_model_state(row, exclude=_AUDIT_EXCLUDE)
        record_model_change(
            action="automation.delete",
            target_type="automation",
            target=row,
            before=before,
            after=None,
            message=f"Deleted automation {row.name}",
        )
        db.session.delete(row)
        db.session.commit()
        return {"message": "deleted"}, HTTPStatus.OK


@ns.route("/<int:id>/run")
class AutomationRun(Resource):
    """Enqueue a real (async) run of the automation."""

    @jwt_required()
    @require_roles("network_admin")
    def post(self, id: int):
        row = db.session.get(Automations, id)
        if row is None:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Automation not found")

        device_ids = automations_service.target_device_ids(row.target)
        if not device_ids:
            return problem_response(
                HTTPStatus.BAD_REQUEST,
                detail="Automation has no target devices",
            )

        try:
            job = automations_service.run_automation(
                row,
                dry_run=False,
                owner_id=_current_user_id(),
                idempotency_key=request.headers.get("Idempotency-Key"),
            )
        except ValueError as exc:
            return problem_response(HTTPStatus.BAD_REQUEST, detail=str(exc))

        headers = {"Location": jobs_service.job_location(job)}
        return (
            {"status": "queued", "job": jobs_service.serialize_job(job)},
            HTTPStatus.ACCEPTED,
            headers,
        )


@ns.route("/<int:id>/test")
class AutomationTest(Resource):
    """Test the automation's Action on a single device (synchronous dry-run).

    For sequence automations (those with ``steps``), tests **step 1 only** and
    includes ``step_tested`` / ``step_count`` in the response so the UI can note
    that only the first step was exercised.
    """

    @jwt_required()
    @require_roles("network_admin")
    def post(self, id: int):
        row = db.session.get(Automations, id)
        if row is None:
            return problem_response(HTTPStatus.NOT_FOUND, detail="Automation not found")

        payload = request.get_json(silent=True) or {}
        device_id = payload.get("device_id")
        if device_id is None:
            candidates = automations_service.target_device_ids(row.target)
            device_id = candidates[0] if candidates else None
        if device_id is None:
            return problem_response(
                HTTPStatus.BAD_REQUEST,
                detail="No device to test against (provide device_id or set a target)",
            )

        device_id = int(device_id)
        if db.session.get(Devices, device_id) is None:
            return problem_response(HTTPStatus.NOT_FOUND, detail=f"Device {device_id} not found")

        # Determine which action / variables to test.
        steps = sorted(row.steps or [], key=lambda s: s.sequence)
        if steps:
            # Sequence: test step 1 only.
            first_step = steps[0]
            test_action_id = first_step.action_id
            # Use only literal values from step bindings (no refs in step 1).
            test_variables = {
                k: v
                for k, v in (first_step.variable_bindings or {}).items()
                if not isinstance(v, dict) or not v.get("__ref__")
            }
            step_tested = first_step.sequence
            step_count = len(steps)
        else:
            test_action_id = row.action_id
            test_variables = row.variable_values or {}
            step_tested = None
            step_count = None

        started = datetime.now(timezone.utc)
        summary, per_host = ops_service.execute_operation_sync(
            device_ids=[device_id],
            op_type=None,
            template_id=test_action_id,
            variables=test_variables,
            dry_run=True,
            timeout_sec=automations_service.DEFAULT_TIMEOUT_SEC,
            stop_on_error=True,
            requested_by=str(_current_user_id() or ""),
        )
        completed = datetime.now(timezone.utc)

        response: dict = {
            "status": "completed",
            "dry_run": True,
            "started_at": started.isoformat(),
            "completed_at": completed.isoformat(),
            "summary": summary,
            "result": per_host[0] if per_host else None,
            "results": per_host,
        }
        if step_tested is not None:
            response["step_tested"] = step_tested
            response["step_count"] = step_count

        return response, HTTPStatus.OK
