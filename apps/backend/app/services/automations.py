"""Automation validation + execution service (Phase 3 + Phase 5).

An :class:`~app.models.automation.Automations` row pins a vetted Action
(``PlatformOperationTemplates``) plus operator-filled ``variable_values`` and a
device ``target``. This module is the server-side gate that keeps no-code
automations reliable:

* :func:`validate_variable_values` - validate/coerce operator inputs against the
  Action's declared ``variables`` schema *before* a job is ever created.
* :func:`validate_bindings` - validate the full binding graph for a sequence
  (referenced step precedes; output field declared; types match).
* :func:`resolve_bindings` - at runtime, replace ``{"__ref__": ...}`` values in
  a step's ``variable_bindings`` with actual values from prior-step results.
* :func:`build_job_params` - turn a single-action automation + Action into the
  ``operation.execute`` job parameters and per-device :class:`JobTaskSpec` list.
* :func:`build_sequence_job_params` - build job params + per-(step × device)
  task specs for a multi-step sequence automation.
* :func:`run_automation` - enqueue a real (or dry-run) run via
  :func:`app.services.jobs.enqueue_job`.  Falls back to single-action path when
  the automation has no ``steps``; uses the sequence path otherwise.
"""

from __future__ import annotations

import re
from typing import Any

from ..extensions import db
from ..models import Automations, PlatformOperationTemplates
from ..models.automation_step import AutomationSteps
from .jobs import JobTaskSpec, enqueue_job
from .output_parsing import ParseError, coerce_value

DEFAULT_TIMEOUT_SEC = 300
_VALID_TYPES = {"string", "number", "boolean", "enum"}


# ---------------------------------------------------------------------------
# Schema extraction helpers
# ---------------------------------------------------------------------------
def _variables_schema(action: PlatformOperationTemplates) -> dict[str, dict[str, Any]]:
    """Return the Action's typed-input schema as ``{field: spec}``.

    Tolerates the two shapes seen in the catalog: a direct ``{field: spec}``
    mapping, or a JSON-schema-ish ``{"properties": {...}, "required": [...]}``
    wrapper. Anything else yields an empty schema (no constraints).
    """

    raw = getattr(action, "variables", None) or {}
    if not isinstance(raw, dict):
        return {}

    properties = raw.get("properties")
    if isinstance(properties, dict):
        schema = {k: dict(v) for k, v in properties.items() if isinstance(v, dict)}
        for name in raw.get("required", []) or []:
            if name in schema:
                schema[name]["required"] = True
        return schema

    # Direct {field: spec} mapping. Skip the JSON-schema control keys so a mixed
    # shape does not treat "required" (a list) as a field spec.
    schema: dict[str, dict[str, Any]] = {}
    for name, spec in raw.items():
        if name in {"required", "properties"}:
            continue
        if isinstance(spec, dict):
            schema[name] = dict(spec)
    for name in (raw.get("required") or []) if isinstance(raw.get("required"), list) else []:
        if name in schema:
            schema[name]["required"] = True
    return schema


def _outputs_schema(action: PlatformOperationTemplates) -> dict[str, dict[str, Any]]:
    """Return the Action's declared output-field schema as ``{field: spec}``."""

    raw = getattr(action, "outputs", None) or {}
    if not isinstance(raw, dict):
        return {}
    return {name: dict(spec) for name, spec in raw.items() if isinstance(spec, dict)}


def _is_ref(value: Any) -> bool:
    """Return ``True`` when *value* is a typed step-output reference."""

    return isinstance(value, dict) and value.get("__ref__") is True


# ---------------------------------------------------------------------------
# Variables schema helpers
# ---------------------------------------------------------------------------
def validate_variable_values(
    action: PlatformOperationTemplates,
    values: dict[str, Any] | None,
) -> dict[str, Any]:
    """Validate + coerce ``values`` against ``action``'s ``variables`` schema.

    Rules per declared field:

    * ``required`` fields must be present (a default is used when declared).
    * present values are coerced to the declared ``type`` (string/number/
      boolean/enum) via :func:`app.services.output_parsing.coerce_value`.
    * a ``regex``/``pattern`` constraint (string-ish fields) must match.

    Returns the cleaned/coerced mapping (unknown extra keys are passed through
    untouched). Raises :class:`ValueError` with a clear, aggregated message on
    any failure.
    """

    schema = _variables_schema(action)
    values = dict(values or {})
    cleaned: dict[str, Any] = {}
    errors: list[str] = []

    for name, spec in schema.items():
        type_ = (spec.get("type") or "string").lower()
        if type_ not in _VALID_TYPES:
            errors.append(f"'{name}' has unsupported type {type_!r}")
            continue
        required = bool(spec.get("required", False))
        provided = name in values and values[name] not in (None, "")

        if not provided:
            if "default" in spec:
                cleaned[name] = spec["default"]
            elif required:
                errors.append(f"'{name}' is required")
            continue

        try:
            coerced = coerce_value(values[name], type_, enum=spec.get("enum"))
        except ParseError as exc:
            errors.append(f"'{name}': {exc}")
            continue

        pattern = spec.get("regex") or spec.get("pattern")
        if pattern:
            try:
                if re.search(pattern, str(coerced)) is None:
                    errors.append(f"'{name}' does not match pattern {pattern!r}")
                    continue
            except re.error as exc:
                errors.append(f"'{name}' has an invalid pattern {pattern!r}: {exc}")
                continue

        cleaned[name] = coerced

    # Preserve any operator-supplied keys the schema does not declare.
    for key, value in values.items():
        cleaned.setdefault(key, value)

    if errors:
        raise ValueError("; ".join(errors))
    return cleaned


# ---------------------------------------------------------------------------
# Binding graph validation (save-time)
# ---------------------------------------------------------------------------
def validate_bindings(
    steps: list[AutomationSteps],
    action_map: dict[int, PlatformOperationTemplates],
) -> None:
    """Validate the full binding graph for a sequence automation.

    For each ``{"__ref__": true, "step": S, "output": F}`` reference in any
    step's ``variable_bindings``:

    1. Referenced step ``S`` exists in *steps* and ``S < current.sequence``
       (must precede the current step).
    2. Output field ``F`` is declared in ``action_map[step_S.action_id].outputs``.
    3. The type of ``F`` in the referenced action's outputs matches the type of
       the target input field in the current step's action's ``variables``.

    Literal values (not references) pass through unchecked.

    Raises :class:`ValueError` with a clear message on the first violation.
    Does nothing if *steps* is empty.
    """

    if not steps:
        return

    seq_map: dict[int, AutomationSteps] = {s.sequence: s for s in steps}

    for step in steps:
        if not step.variable_bindings:
            continue

        current_action = action_map.get(step.action_id) if step.action_id else None
        current_vars_schema = _variables_schema(current_action) if current_action else {}

        for field_name, binding_value in step.variable_bindings.items():
            if not _is_ref(binding_value):
                continue  # literal — no graph check needed

            ref_seq = binding_value.get("step")
            ref_output = binding_value.get("output")

            if ref_seq is None or ref_output is None:
                raise ValueError(
                    f"Step {step.sequence}: binding for '{field_name}' is malformed "
                    f"(reference dict must contain 'step' and 'output' keys)"
                )

            # Referenced step must exist and precede the current step.
            if ref_seq >= step.sequence:
                raise ValueError(
                    f"Step {step.sequence}: binding for '{field_name}' references "
                    f"step {ref_seq}, which does not precede this step "
                    f"(referenced step must have sequence < {step.sequence})"
                )

            ref_step = seq_map.get(ref_seq)
            if ref_step is None:
                raise ValueError(
                    f"Step {step.sequence}: binding for '{field_name}' references "
                    f"step {ref_seq}, which does not exist in this automation"
                )

            ref_action = action_map.get(ref_step.action_id) if ref_step.action_id else None
            if ref_action is None:
                raise ValueError(
                    f"Step {step.sequence}: binding for '{field_name}' references "
                    f"step {ref_seq} whose action is missing from the action map"
                )

            # Output field must be declared in the referenced action's outputs.
            outputs = _outputs_schema(ref_action)
            if ref_output not in outputs:
                raise ValueError(
                    f"Step {step.sequence}: binding for '{field_name}' references "
                    f"output field '{ref_output}' which is not declared in the "
                    f"outputs of step {ref_seq}'s action ('{ref_action.name}')"
                )

            # Type of the referenced output must match the current input field.
            ref_type = (outputs[ref_output].get("type") or "string").lower()
            current_spec = current_vars_schema.get(field_name, {})
            current_type = (current_spec.get("type") or "string").lower()

            if ref_type != current_type:
                raise ValueError(
                    f"Step {step.sequence}: type mismatch for binding '{field_name}': "
                    f"output '{ref_output}' has type '{ref_type}' but input "
                    f"'{field_name}' expects type '{current_type}'"
                )


# ---------------------------------------------------------------------------
# Binding resolution (runtime)
# ---------------------------------------------------------------------------
def resolve_bindings(
    step: AutomationSteps,
    prior_results: dict[int, dict],
) -> dict[str, Any]:
    """Resolve ``__ref__`` bindings in *step* using prior-step results.

    Replaces every ``{"__ref__": true, "step": S, "output": F}`` reference in
    ``step.variable_bindings`` with the actual value from
    ``prior_results[S]["fields"][F]``.  Literal values are returned unchanged.

    Parameters
    ----------
    step:
        The :class:`AutomationSteps` row whose ``variable_bindings`` to resolve.
    prior_results:
        ``{step_sequence: {"fields": {field_name: value, ...}, ...}}`` built by
        the worker from successful prior-step task results.

    Returns
    -------
    dict
        Fully resolved ``variable_values`` dict ready to pass to the executor.

    Raises
    ------
    ValueError
        If a bound output field is absent or ``None`` in *prior_results*.
    """

    return _resolve_bindings_from_dict(step.variable_bindings or {}, prior_results)


def _resolve_bindings_from_dict(
    bindings: dict[str, Any],
    prior_results: dict[int, dict],
) -> dict[str, Any]:
    """Internal helper: resolve bindings from a raw dict (no AutomationSteps obj)."""

    resolved: dict[str, Any] = {}

    for field_name, binding_value in bindings.items():
        if not _is_ref(binding_value):
            resolved[field_name] = binding_value
            continue

        ref_seq: int = binding_value["step"]
        ref_output: str = binding_value["output"]

        step_result = prior_results.get(ref_seq)
        if step_result is None:
            raise ValueError(
                f"resolve_bindings: step {ref_seq} has no prior result available "
                f"(needed by binding for field '{field_name}')"
            )

        fields: dict[str, Any] = step_result.get("fields") or {}
        if ref_output not in fields:
            raise ValueError(
                f"resolve_bindings: output field '{ref_output}' from step {ref_seq} "
                f"is not present in prior results (needed by binding for '{field_name}')"
            )

        value = fields[ref_output]
        if value is None:
            raise ValueError(
                f"resolve_bindings: output field '{ref_output}' from step {ref_seq} "
                f"is null (needed by binding for '{field_name}')"
            )

        resolved[field_name] = value

    return resolved


# ---------------------------------------------------------------------------
# Target resolution
# ---------------------------------------------------------------------------
def target_device_ids(target: dict[str, Any] | None) -> list[int]:
    """Extract device ids from an automation ``target`` selector.

    Supports ``{"device_ids": [...]}`` and a single ``{"device_id": n}``.
    Group selectors are a later-phase concern and yield no ids here.
    """

    target = target or {}
    ids: list[int] = []
    for raw in target.get("device_ids") or []:
        try:
            ids.append(int(raw))
        except (TypeError, ValueError):
            continue
    single = target.get("device_id")
    if single is not None:
        try:
            ids.append(int(single))
        except (TypeError, ValueError):
            pass
    # De-dupe while preserving order.
    seen: set[int] = set()
    return [d for d in ids if not (d in seen or seen.add(d))]


# ---------------------------------------------------------------------------
# Job param construction — single-action path
# ---------------------------------------------------------------------------
def build_job_params(
    automation: Automations,
    action: PlatformOperationTemplates,
    *,
    dry_run: bool = False,
    device_ids: list[int] | None = None,
) -> tuple[dict[str, Any], list[JobTaskSpec]]:
    """Build the ``operation.execute`` job parameters + per-device task specs.

    Mirrors the shape produced by :mod:`app.api.v1.resources.operations` (and
    consumed by :mod:`app.services.worker`): one ``operation.device`` task per
    target device, each carrying ``template_id``/``variables``/options.
    """

    if device_ids is None:
        device_ids = target_device_ids(automation.target)
    variables = automation.variable_values or {}
    options = {
        "dry_run": bool(dry_run),
        "timeout_sec": DEFAULT_TIMEOUT_SEC,
        "stop_on_error": (automation.on_failure or "stop") == "stop",
    }

    job_parameters = {
        "scope": {"device_ids": device_ids},
        "operation": {"op_type": None, "template_id": action.id},
        "options": options,
        "variables": variables,
        "automation_id": automation.id,
    }

    task_specs = [
        JobTaskSpec(
            task_type="operation.device",
            sequence=index,
            device_id=device_id,
            parameters={
                "op_type": None,
                "template_id": action.id,
                "variables": variables,
                "dry_run": options["dry_run"],
                "timeout_sec": options["timeout_sec"],
                "stop_on_error": options["stop_on_error"],
            },
        )
        for index, device_id in enumerate(device_ids)
    ]
    return job_parameters, task_specs


# ---------------------------------------------------------------------------
# Job param construction — sequence path (Phase 5)
# ---------------------------------------------------------------------------
def build_sequence_job_params(
    automation: Automations,
    steps: list[AutomationSteps],
    action_map: dict[int, PlatformOperationTemplates],
    *,
    dry_run: bool = False,
    device_ids: list[int] | None = None,
) -> tuple[dict[str, Any], list[JobTaskSpec]]:
    """Build job params + per-(step × device) task specs for a sequence automation.

    Each task's ``parameters`` dict includes:

    * ``__sequence_step__`` – the automation step's ``sequence`` number, used
      by the worker to group tasks into step groups and execute them in order.
    * ``__on_failure__`` – the step's ``on_failure`` value (``stop`` or
      ``continue``), consumed by the worker after each step group.
    * ``__variable_bindings__`` – the step's raw ``variable_bindings`` dict,
      used by the worker to resolve ``__ref__`` references at runtime.

    Parameters
    ----------
    automation:
        The parent :class:`Automations` row.
    steps:
        Ordered list of :class:`AutomationSteps` (must already be in sequence
        order, or will be sorted here).
    action_map:
        ``{action_id: PlatformOperationTemplates}`` pre-fetched by the caller.
    dry_run:
        When ``True``, every task is executed in dry-run mode.
    device_ids:
        Explicit device list; resolved from ``automation.target`` when omitted.
    """

    if device_ids is None:
        device_ids = target_device_ids(automation.target)

    options = {
        "dry_run": bool(dry_run),
        "timeout_sec": DEFAULT_TIMEOUT_SEC,
        "stop_on_error": (automation.on_failure or "stop") == "stop",
    }

    ordered_steps = sorted(steps, key=lambda s: s.sequence)

    job_parameters = {
        "scope": {"device_ids": device_ids},
        "operation": {"op_type": None, "sequence_count": len(ordered_steps)},
        "options": options,
        "automation_id": automation.id,
        "is_sequence": True,
    }

    task_specs: list[JobTaskSpec] = []
    overall_sequence = 0  # flat unique sequence number for JobTasks.sequence

    for step in ordered_steps:
        action = action_map.get(step.action_id) if step.action_id else None

        # Collect literal values from variable_bindings (refs resolved at runtime).
        literal_vars: dict[str, Any] = {
            k: v
            for k, v in (step.variable_bindings or {}).items()
            if not _is_ref(v)
        }

        for device_id in device_ids:
            task_specs.append(
                JobTaskSpec(
                    task_type="operation.device",
                    sequence=overall_sequence,
                    device_id=device_id,
                    parameters={
                        "op_type": None,
                        "template_id": action.id if action else None,
                        "variables": dict(literal_vars),
                        "dry_run": options["dry_run"],
                        "timeout_sec": options["timeout_sec"],
                        "stop_on_error": options["stop_on_error"],
                        # Sequence metadata consumed by the worker.
                        "__sequence_step__": step.sequence,
                        "__on_failure__": step.on_failure or "stop",
                        "__variable_bindings__": step.variable_bindings or {},
                    },
                )
            )
            overall_sequence += 1

    return job_parameters, task_specs


# ---------------------------------------------------------------------------
# Run entry point
# ---------------------------------------------------------------------------
def run_automation(
    automation: Automations,
    *,
    dry_run: bool = False,
    owner_id: int | None = None,
    idempotency_key: str | None = None,
):
    """Enqueue an ``operation.execute`` job for *automation* and return it.

    If the automation has one or more :class:`AutomationSteps` rows (i.e.
    ``automation.steps`` is non-empty), the sequence path is used and each step
    becomes a group of per-device :class:`JobTasks`.  Otherwise, the
    single-action path is used unchanged.

    ``dry_run`` is threaded through to every task so mutating Actions compute a
    diff without committing. Returns the persisted :class:`Jobs` row.
    """

    steps: list[AutomationSteps] = sorted(
        automation.steps or [], key=lambda s: s.sequence
    )

    if steps:
        # --- Sequence path ---------------------------------------------------
        action_map: dict[int, PlatformOperationTemplates] = {}
        for step in steps:
            if step.action_id and step.action_id not in action_map:
                action = db.session.get(PlatformOperationTemplates, step.action_id)
                if action is None:
                    raise ValueError(f"step {step.sequence}: action {step.action_id} not found")
                action_map[step.action_id] = action

        job_parameters, task_specs = build_sequence_job_params(
            automation, steps, action_map, dry_run=dry_run
        )
        event_context: dict[str, Any] = {
            "automation_id": automation.id,
            "dry_run": bool(dry_run),
            "device_count": len(task_specs),
            "step_count": len(steps),
            "is_sequence": True,
        }
    else:
        # --- Single-action path (Phase 3, unchanged) -------------------------
        action = db.session.get(PlatformOperationTemplates, automation.action_id)
        if action is None:
            raise ValueError(f"action {automation.action_id} not found")

        job_parameters, task_specs = build_job_params(automation, action, dry_run=dry_run)
        event_context = {
            "automation_id": automation.id,
            "action_id": action.id,
            "dry_run": bool(dry_run),
            "device_count": len(task_specs),
        }

    resolved_owner = owner_id if owner_id is not None else automation.owner_id
    job, _created = enqueue_job(
        job_type="operation.execute",
        owner_id=resolved_owner,
        run_as_internal=resolved_owner is None,
        parameters=job_parameters,
        tasks=task_specs,
        idempotency_key=idempotency_key,
        event_message="automation run queued",
        event_context=event_context,
    )
    return job


__all__ = [
    "build_job_params",
    "build_sequence_job_params",
    "resolve_bindings",
    "run_automation",
    "target_device_ids",
    "validate_bindings",
    "validate_variable_values",
]
