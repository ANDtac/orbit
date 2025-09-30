"""
app/services/operations.py
--------------------------
Execution layer for runtime operations against devices using Nornir/NAPALM.

Responsibilities
----------------
- Provide a synchronous execution entry point consumed by the API layer.
- Resolve the concrete operation template from either:
    * a high-level `op_type` (e.g., "password_change", "backup"), or
    * a `template_id` that references PlatformOperationTemplates.
- Render operation templates (Jinja2) with user-provided variables.
- Build a Nornir inventory for the requested devices (stub-friendly hook).
- Execute the rendered operation against each device and collect results.

Design Notes
------------
This module is written to let you ship the API now while wiring real network
execution later. By default, it returns structured **mock** results unless
you implement the `run_with_nornir()` hook. The surface area is stable so your
API/clients don't change when you turn on Nornir.

Key Functions
-------------
execute_operation_sync(device_ids, op_type, template_id, variables, dry_run, timeout_sec, stop_on_error, requested_by)
    Main, synchronous execution path used by the API.

render_template_text(template_text, variables)
    Render a Jinja2 template string with provided variables.

resolve_operation_template(op_type, template_id, platform)
    Decide which template to use. If template_id is provided, it wins.
    Otherwise choose a default template by op_type and platform.

run_with_nornir(hosts, operation_text, params)
    **Integration hook.** Replace the default stub with a Nornir-backed executor.

Result Shape
------------
The API expects a tuple (summary, per_host_list) where:

summary : dict
    {
      "requested": int, "ok": int, "failed": int, "changed": int,
      "dry_run": bool, "op": {"op_type": str|None, "template_id": int|None}
    }

per_host_list : list[dict]
    Each item has: { "device_id": int, "ok": bool, "changed": bool,
                     "output": str|None, "error": str|None, "facts": dict|None }

Security
--------
- Do not fetch or return secrets here. Use CredentialProfiles.secret_ref to
  resolve credentials in a separate integration when you wire in Nornir.

Extensibility
-------------
- To enable real execution:
  1) Implement `build_inventory_for_devices()` to produce a Nornir inventory.
  2) Implement `run_with_nornir()` to connect and run rendered commands.
  3) Optionally create per-platform handlers and dispatch in `resolve_operation_template()`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple

import logging
from jinja2 import Environment, StrictUndefined

from ..extensions import db
from ..models import (
    Devices,
    Platforms,
    PlatformOperationTemplates,
    CredentialProfiles,
)

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------
@dataclass
class OperationTemplate:
    """
    OperationTemplate
    -----------------
    A resolved, ready-to-render template for a particular platform/operation.

    Attributes
    ----------
    id : int | None
        The PlatformOperationTemplates.id (if selected by id), else None.
    platform_id : int | None
        Platform id the template targets (may be None for generic).
    name : str
        Display name (for logging).
    op_type : str | None
        High-level category (e.g., 'password_change','backup').
    text : str
        Jinja2 template text to render.
    variables_schema : dict | None
        Optional schema/metadata for expected variables.
    """
    id: Optional[int]
    platform_id: Optional[int]
    name: str
    op_type: Optional[str]
    text: str
    variables_schema: Optional[dict]


# ---------------------------------------------------------------------------
# Jinja environment
# ---------------------------------------------------------------------------
def _jinja_env() -> Environment:
    """
    Create a locked-down Jinja2 environment.

    Returns
    -------
    jinja2.Environment
        Environment configured with StrictUndefined to surface missing vars.
    """
    env = Environment(undefined=StrictUndefined, autoescape=False, trim_blocks=True, lstrip_blocks=True)
    # Add any filters you commonly need here:
    env.filters["join_lines"] = lambda seq, sep="\\n": sep.join(seq or [])
    return env


def render_template_text(template_text: str, variables: Dict[str, Any]) -> str:
    """
    Render a Jinja2 template string with variables.

    Parameters
    ----------
    template_text : str
        The Jinja2 template content.
    variables : dict
        Variables to pass into the template context.

    Returns
    -------
    str
        Rendered string.

    Raises
    ------
    jinja2.exceptions.UndefinedError
        If a required variable is missing (StrictUndefined).
    """
    tmpl = _jinja_env().from_string(template_text or "")
    return tmpl.render(**(variables or {}))


# ---------------------------------------------------------------------------
# Template resolution
# ---------------------------------------------------------------------------
def resolve_operation_template(
    op_type: Optional[str],
    template_id: Optional[int],
    platform: Optional[Platforms],
) -> OperationTemplate:
    """
    Resolve the operation template to use for execution.

    Parameters
    ----------
    op_type : str | None
        High-level operation key (e.g., 'password_change','backup').
    template_id : int | None
        Concrete template row id. If provided, it takes precedence.
    platform : Platforms | None
        Platform metadata; used to pick a default template when `template_id` is None.

    Returns
    -------
    OperationTemplate
        The selected template, ready to render.

    Behavior
    --------
    - When `template_id` is provided, load that row and return it.
    - Otherwise, choose a default template by `op_type` and `platform_id`.
      If none exists, fall back to a generic built-in stub to keep development moving.
    """
    if template_id:
        row = PlatformOperationTemplates.query.get(template_id)
        if not row:
            raise ValueError(f"template_id {template_id} not found")
        return OperationTemplate(
            id=row.id,
            platform_id=row.platform_id,
            name=row.name or f"template:{row.id}",
            op_type=row.op_type,
            text=row.template or "",
            variables_schema=row.variables or None,
        )

    # No explicit template id; attempt to find a platform-specific default
    if op_type:
        if platform and platform.id:
            row = (
                PlatformOperationTemplates.query
                .filter_by(platform_id=platform.id, op_type=op_type)
                .order_by(PlatformOperationTemplates.id.asc())
                .first()
            )
            if row:
                return OperationTemplate(
                    id=row.id,
                    platform_id=row.platform_id,
                    name=row.name or f"default:{op_type}",
                    op_type=row.op_type,
                    text=row.template or "",
                    variables_schema=row.variables or None,
                )

        # Fallback generic built-in stubs so early development can proceed
        if op_type == "backup":
            return OperationTemplate(
                id=None,
                platform_id=platform.id if platform else None,
                name="builtin:backup",
                op_type=op_type,
                text="{{ op_type }} on {{ host }}: fetch running config",
                variables_schema={"required": [], "optional": []},
            )
        if op_type == "password_change":
            return OperationTemplate(
                id=None,
                platform_id=platform.id if platform else None,
                name="builtin:password_change",
                op_type=op_type,
                text="change password for {{ username }} on {{ host }}",
                variables_schema={"required": ["username"], "optional": ["rotate_key"]},
            )

        # Generic last resort
        return OperationTemplate(
            id=None,
            platform_id=platform.id if platform else None,
            name=f"builtin:{op_type}",
            op_type=op_type,
            text="{{ op_type }} on {{ host }}",
            variables_schema={"required": [], "optional": []},
        )

    # Truly nothing to go on
    raise ValueError("Unable to resolve an operation template (missing op_type and template_id)")


# ---------------------------------------------------------------------------
# Inventory helpers (stubs you can replace later)
# ---------------------------------------------------------------------------
def build_inventory_for_devices(device_ids: Iterable[int]) -> Dict[int, Dict[str, Any]]:
    """
    Construct a minimal per-host inventory mapping for the given devices.

    Parameters
    ----------
    device_ids : Iterable[int]
        Device primary keys.

    Returns
    -------
    dict[int, dict]
        Mapping: device_id -> host facts used by the executor.
        Keys include: host (str), address (str), port (int), platform (Platforms), device (Devices)

    Notes
    -----
    - Secrets are intentionally omitted. When you wire Nornir, use
      CredentialProfiles.secret_ref to fetch credentials inside the executor.
    """
    rows: List[Devices] = Devices.query.filter(Devices.id.in_(list(device_ids))).all()
    out: Dict[int, Dict[str, Any]] = {}
    for d in rows:
        platform: Optional[Platforms] = Platforms.query.get(d.platform_id) if d.platform_id else None
        out[d.id] = {
            "host": d.fqdn or d.name or (d.mgmt_ipv4 and str(d.mgmt_ipv4)) or f"device-{d.id}",
            "address": (d.mgmt_ipv4 and str(d.mgmt_ipv4)) or None,
            "port": d.mgmt_port or 22,
            "platform": platform,
            "device": d,
            "nornir_data": d.nornir_data or {},
        }
    return out


# ---------------------------------------------------------------------------
# Nornir runner hook (replace with real implementation)
# ---------------------------------------------------------------------------
def run_with_nornir(
    hosts: Dict[int, Dict[str, Any]],
    operation_text: str,
    params: Dict[str, Any],
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Execute `operation_text` against the provided hosts (stub implementation).

    Parameters
    ----------
    hosts : dict[int, dict]
        Output of `build_inventory_for_devices()`.
    operation_text : str
        Already-rendered command/script/description to run per-host.
    params : dict
        Execution parameters: dry_run, timeout_sec, stop_on_error, requested_by, etc.

    Returns
    -------
    tuple[dict, list[dict]]
        (summary, per_host_results) as described at the top of this module.

    Replace With
    ------------
    - Create a Nornir instance with your inventory.
    - Use `napalm_get`, `napalm_configure`, or custom tasks as appropriate.
    - Collect outcome per host in the return format below.
    """
    dry_run = bool(params.get("dry_run", False))

    ok = 0
    failed = 0
    changed = 0
    results: List[Dict[str, Any]] = []

    # Stub: pretend we executed something per host
    for device_id, h in hosts.items():
        try:
            # Here you'd dispatch based on op_type/template_id and platform.napalm_driver
            # For now, simulate behavior:
            if "password" in (operation_text or "").lower():
                did_change = not dry_run
                out = f"[stub] would change password on {h['host']} (dry_run={dry_run})"
            elif "fetch running config" in (operation_text or "") or "backup" in (operation_text or ""):
                did_change = False
                out = f"[stub] would fetch config from {h['host']} (dry_run={dry_run})"
            else:
                did_change = not dry_run
                out = f"[stub] would run: {operation_text} on {h['host']} (dry_run={dry_run})"

            ok += 1
            changed += 1 if did_change else 0
            results.append(
                {
                    "device_id": device_id,
                    "ok": True,
                    "changed": did_change,
                    "output": out,
                    "error": None,
                    "facts": {
                        "address": h.get("address"),
                        "port": h.get("port"),
                        "platform": (h.get("platform") and h["platform"].slug) or None,
                    },
                }
            )
        except Exception as exc:  # pragma: no cover - stub robustness
            failed += 1
            results.append(
                {
                    "device_id": device_id,
                    "ok": False,
                    "changed": False,
                    "output": None,
                    "error": str(exc),
                    "facts": {
                        "address": h.get("address"),
                        "port": h.get("port"),
                        "platform": (h.get("platform") and h["platform"].slug) or None,
                    },
                }
            )

    summary = {
        "requested": len(hosts),
        "ok": ok,
        "failed": failed,
        "changed": changed,
        "dry_run": dry_run,
        "op": {"op_type": params.get("op_type"), "template_id": params.get("template_id")},
    }
    return summary, results


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def execute_operation_sync(
    device_ids: Iterable[int],
    op_type: Optional[str],
    template_id: Optional[int],
    variables: Dict[str, Any],
    dry_run: bool,
    timeout_sec: int,
    stop_on_error: bool,
    requested_by: str,
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Execute an operation synchronously for the given devices.

    Parameters
    ----------
    device_ids : Iterable[int]
        Target device primary keys.
    op_type : str | None
        High-level operation (e.g., "password_change","backup"). Optional if template_id is provided.
    template_id : int | None
        Concrete PlatformOperationTemplates.id to use. If provided, it takes precedence.
    variables : dict
        Variables to render into the template.
    dry_run : bool
        When True, attempt to avoid changing remote state.
    timeout_sec : int
        Per-host timeout budget (used by the executor).
    stop_on_error : bool
        If True, the executor may bail out early on first failure.
    requested_by : str
        User id/username requesting the operation (for audit).

    Returns
    -------
    tuple[dict, list[dict]]
        (summary, per_host_results). See module header for details.

    Steps
    -----
    1) Build a minimal host inventory for the device ids.
    2) Resolve the operation template (by id or by op_type/platform).
    3) Render the template text with `{ **variables, host, platform, device }`.
    4) Execute the rendered operation across hosts (stub or Nornir).
    """
    device_ids = list({int(i) for i in device_ids})
    hosts = build_inventory_for_devices(device_ids)

    # Pick a representative platform for template resolution when using op_type
    # (If you need per-host platform specialization, you can move resolution into the loop.)
    first_platform: Optional[Platforms] = None
    for h in hosts.values():
        if h.get("platform"):
            first_platform = h["platform"]
            break

    tmpl = resolve_operation_template(op_type=op_type, template_id=template_id, platform=first_platform)

    # We render once using a synthetic context that's still meaningful.
    # If you need per-host rendering, lift render into the executor and render per host.
    render_context = {
        "op_type": tmpl.op_type,
        "requested_by": requested_by,
        # generic fallbacks—real execution should render per-host:
        "host": "MULTI",
        **(variables or {}),
    }
    try:
        rendered = render_template_text(tmpl.text, render_context)
    except Exception as exc:
        raise ValueError(f"template_render_error: {exc}") from exc

    params = {
        "dry_run": bool(dry_run),
        "timeout_sec": int(timeout_sec),
        "stop_on_error": bool(stop_on_error),
        "requested_by": requested_by,
        "op_type": tmpl.op_type,
        "template_id": tmpl.id,
    }

    log.info(
        "operation_execute",
        extra={
            "extra": {
                "requested": len(hosts),
                "op_type": tmpl.op_type,
                "template_id": tmpl.id,
                "dry_run": dry_run,
                "requested_by": requested_by,
            }
        },
    )

    # Delegate to executor (currently stubbed)
    summary, per_host = run_with_nornir(hosts=hosts, operation_text=rendered, params=params)
    return summary, per_host