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

import logging
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, Iterator, List, Optional, Tuple

from jinja2 import Environment, StrictUndefined

from ..extensions import db
from ..models import (
    Devices,
    Platforms,
    PlatformOperationTemplates,
    CredentialProfiles,
)
from ..observability.activity import record_app_event, record_audit_log
from .handlers.registry import NETMIKO_TYPE_MAP, normalize_platform_slug
from .output_parsing import parse_outputs

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
    outputs_schema: Dict[str, Any] = field(default_factory=dict)
    is_mutating: bool = False


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
        row = db.session.get(PlatformOperationTemplates, template_id)
        if not row:
            raise ValueError(f"template_id {template_id} not found")
        return OperationTemplate(
            id=row.id,
            platform_id=row.platform_id,
            name=row.name or f"template:{row.id}",
            op_type=row.op_type,
            text=row.template or "",
            variables_schema=row.variables or None,
            outputs_schema=row.outputs or {},
            is_mutating=bool(row.is_mutating),
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
                    outputs_schema=row.outputs or {},
                    is_mutating=bool(row.is_mutating),
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
        platform: Optional[Platforms] = db.session.get(Platforms, d.platform_id) if d.platform_id else None
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
# Connection seams (patched in tests — NEVER hit real devices in CI)
# ---------------------------------------------------------------------------
def _resolve_credentials(device: Devices, params: Dict[str, Any]) -> Dict[str, Any]:
    """Best-effort credential resolution for a device.

    Username comes from the attached CredentialProfile (mirroring
    ``password_change._build_target``); the password/secret are taken from the
    execution ``params`` (a secret-store integration is out of scope here).
    Secrets are never persisted or returned in results.
    """

    profile = (
        db.session.get(CredentialProfiles, device.credential_profile_id)
        if device.credential_profile_id
        else None
    )
    username = (profile.username if profile else None) or params.get("username") or "admin"
    password = params.get("password") or (params.get("variables") or {}).get("password") or ""
    secret = params.get("enable_secret") or password
    return {"username": username, "password": password, "secret": secret}


def _build_exec_target(host: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, Any]:
    """Build a flat per-device execution target from an inventory entry."""

    platform: Optional[Platforms] = host.get("platform")
    device: Optional[Devices] = host.get("device")
    slug = normalize_platform_slug(getattr(platform, "slug", None))
    creds = _resolve_credentials(device, params) if device is not None else {
        "username": params.get("username") or "admin",
        "password": params.get("password") or "",
        "secret": params.get("enable_secret") or "",
    }
    return {
        "host": host.get("host"),
        "address": host.get("address"),
        "port": host.get("port") or 22,
        "platform_slug": slug,
        "napalm_driver": getattr(platform, "napalm_driver", None),
        "netmiko_type": getattr(platform, "netmiko_type", None)
        or NETMIKO_TYPE_MAP.get(slug, "cisco_ios"),
        "napalm_optional_args": getattr(platform, "napalm_optional_args", None) or {},
        "username": creds["username"],
        "password": creds["password"],
        "secret": creds["secret"],
    }


def _get_network_driver(driver_name: str):
    """Return a NAPALM driver class (imported lazily to avoid hard import cost)."""

    from napalm import get_network_driver  # pragma: no cover - patched in tests

    return get_network_driver(driver_name)


@contextmanager
def _napalm_connection(target: Dict[str, Any], timeout: int) -> Iterator[Any]:
    """Open (and always close) a NAPALM connection to ``target``.

    Patched wholesale in tests so no real session is ever opened.
    """

    driver = _get_network_driver(target.get("napalm_driver") or "ios")  # pragma: no cover
    optional_args = dict(target.get("napalm_optional_args") or {})  # pragma: no cover
    optional_args.setdefault("port", target.get("port") or 22)  # pragma: no cover
    device = driver(  # pragma: no cover
        hostname=target.get("address") or target.get("host"),
        username=target.get("username"),
        password=target.get("password"),
        optional_args=optional_args,
        timeout=timeout,
    )
    device.open()  # pragma: no cover
    try:  # pragma: no cover
        yield device
    finally:  # pragma: no cover
        try:
            device.close()
        except Exception:  # noqa: BLE001
            pass


def _netmiko_connect(target: Dict[str, Any], timeout: int) -> Any:
    """Open a Netmiko connection (reuses the ssh_handler dispatch shape)."""

    from netmiko import ConnectHandler  # pragma: no cover - patched in tests

    kwargs = {  # pragma: no cover
        "device_type": target.get("netmiko_type") or "cisco_ios",
        "host": target.get("address") or target.get("host"),
        "port": target.get("port") or 22,
        "username": target.get("username"),
        "password": target.get("password"),
        "timeout": timeout,
        "fast_cli": False,
    }
    if target.get("secret"):  # pragma: no cover
        kwargs["secret"] = target["secret"]
    return ConnectHandler(**kwargs)  # pragma: no cover


def _run_cli(target: Dict[str, Any], command: str, timeout: int) -> str:
    """Run a single CLI ``command`` on ``target`` and return the raw output."""

    connection = _netmiko_connect(target, timeout)
    try:
        return str(connection.send_command(command))
    finally:
        try:
            connection.disconnect()
        except Exception:  # noqa: BLE001
            pass


# ---------------------------------------------------------------------------
# Real per-device executor
# ---------------------------------------------------------------------------
def _needed_sources(outputs_schema: Dict[str, Any]) -> set[str]:
    return {
        (spec.get("source") or "raw").lower()
        for spec in (outputs_schema or {}).values()
        if isinstance(spec, dict)
    }


def _execute_on_device(
    device_id: int,
    host: Dict[str, Any],
    operation_text: str,
    outputs_schema: Dict[str, Any],
    *,
    dry_run: bool,
    is_mutating: bool,
    timeout: int,
    params: Dict[str, Any],
) -> Dict[str, Any]:
    """Execute the rendered operation against a single device.

    Returns a structured, JSON-serializable per-device result. Any failure
    (connection/parse/timeout) is captured as a typed ``error`` on *this*
    device and never propagates to crash the job.
    """

    started = time.perf_counter()
    target = _build_exec_target(host, params)
    sources = _needed_sources(outputs_schema)
    result: Dict[str, Any] = {
        "device_id": device_id,
        "ok": False,
        "changed": False,
        "host": target.get("host"),
        "platform": target.get("platform_slug"),
        "latency_ms": None,
        "fields": {},
        "field_errors": {},
        "raw": None,
        "diff": None,
        "output": None,
        "error": None,
    }

    try:
        getters: Dict[str, Any] = {}
        raw: Optional[str] = None
        diff: Optional[str] = None
        committed = False

        needs_napalm = is_mutating or "napalm_getter" in sources
        # Device I/O is driven entirely by the declared outputs schema (and, for
        # mutating actions, the config push). A non-mutating action with no
        # declared CLI outputs performs no connection.
        needs_cli = bool(sources & {"textfsm", "regex", "raw"})

        if needs_napalm:
            with _napalm_connection(target, timeout) as device:
                for spec in outputs_schema.values():
                    if not isinstance(spec, dict) or spec.get("source") != "napalm_getter":
                        continue
                    getter = spec.get("getter")
                    if getter and getter not in getters:
                        getters[getter] = getattr(device, getter)()
                if is_mutating and operation_text:
                    device.load_merge_candidate(config=operation_text)
                    diff = device.compare_config()
                    if dry_run:
                        device.discard_config()
                    else:
                        device.commit_config()
                        committed = True

        if needs_cli:
            raw = _run_cli(target, operation_text, timeout)

        fields, field_errors = parse_outputs(
            outputs_schema,
            raw=raw,
            getters=getters,
            platform=target.get("platform_slug"),
            default_command=operation_text,
        )

        result.update(
            ok=True,
            changed=committed,
            fields=fields,
            field_errors=field_errors,
            raw=raw,
            diff=diff,
            output=raw,
            error=None,
        )
    except Exception as exc:  # noqa: BLE001 - isolate per-device failures
        result["error"] = f"{type(exc).__name__}: {exc}"
    finally:
        result["latency_ms"] = int((time.perf_counter() - started) * 1000)

    return result


def run_with_nornir(
    hosts: Dict[int, Dict[str, Any]],
    operation_text: str,
    params: Dict[str, Any],
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Execute `operation_text` against the provided hosts for real.

    Parameters
    ----------
    hosts : dict[int, dict]
        Output of `build_inventory_for_devices()`.
    operation_text : str
        Already-rendered command/config to run per-host.
    params : dict
        Execution parameters: ``dry_run``, ``timeout_sec``, ``stop_on_error``,
        ``outputs`` (typed output schema), ``is_mutating``, ``op_type``,
        ``template_id``, ``requested_by``.

    Returns
    -------
    tuple[dict, list[dict]]
        (summary, per_host_results). Each per-host result is
        ``{ ok, device_id, host, latency_ms, fields, field_errors, raw, diff,
        changed, error }``.

    Notes
    -----
    A lightweight direct NAPALM/Netmiko executor is used (mirroring
    ``ssh_handler``) rather than a full Nornir inventory: it maps cleanly onto
    the existing per-device connection pattern and is trivially mockable. The
    function name is retained as the stable integration seam.
    """

    dry_run = bool(params.get("dry_run", False))
    is_mutating = bool(params.get("is_mutating", False))
    outputs_schema = params.get("outputs") or {}
    timeout = int(params.get("timeout_sec", 300))
    stop_on_error = bool(params.get("stop_on_error", False))

    ok = 0
    failed = 0
    changed = 0
    results: List[Dict[str, Any]] = []

    for device_id, host in hosts.items():
        res = _execute_on_device(
            device_id,
            host,
            operation_text,
            outputs_schema,
            dry_run=dry_run,
            is_mutating=is_mutating,
            timeout=timeout,
            params=params,
        )
        results.append(res)
        if res["ok"]:
            ok += 1
        else:
            failed += 1
        if res.get("changed"):
            changed += 1
        if stop_on_error and not res["ok"]:
            break

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
# Pre-mutate snapshot
# ---------------------------------------------------------------------------
def snapshot_devices_pre_mutate(
    device_ids: Iterable[int],
    hosts: Dict[int, Dict[str, Any]],
    job_id: Optional[int] = None,
    timeout: int = 60,
) -> None:
    """Capture a pre-execution running-config snapshot for each device.

    Called automatically by the worker before any mutating (non-dry-run)
    operation so the config can be rolled back if needed.  Failures are
    logged and silently swallowed — a snapshot error must never abort the
    operation.

    Parameters
    ----------
    device_ids : Iterable[int]
        Device IDs to snapshot.
    hosts : dict[int, dict]
        Inventory mapping from ``build_inventory_for_devices``.
    job_id : int | None
        Parent job ID to link on the snapshot row.
    timeout : int
        Per-device NAPALM timeout in seconds.
    """
    import logging

    from app.extensions import db
    from app.models.devices import DeviceConfigSnapshots

    log = logging.getLogger(__name__)
    source = f"pre-mutate:job={job_id}" if job_id else "pre-mutate"

    for device_id in device_ids:
        host = hosts.get(device_id)  # type: ignore[arg-type]
        if host is None:
            continue
        try:
            target = _build_exec_target(host, {})
            with _napalm_connection(target, timeout) as conn:
                configs = conn.get_config()
                running = configs.get("running") or ""
            if not running.strip():
                continue
            snap = DeviceConfigSnapshots.create_if_changed(
                device_id=device_id,
                blob=running.encode("utf-8"),
                role="running",
                vendor_hint=target.get("platform_slug"),
            )
            if snap is not None:
                snap.source = source
                if job_id is not None:
                    snap.job_id = job_id
                db.session.add(snap)
            db.session.commit()
        except Exception as exc:  # noqa: BLE001 - best-effort
            log.warning(
                "pre_mutate_snapshot_failed device_id=%s job_id=%s error=%s",
                device_id,
                job_id,
                exc,
            )
            try:
                db.session.rollback()
            except Exception:  # noqa: BLE001
                pass


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
        "outputs": tmpl.outputs_schema or {},
        "is_mutating": bool(tmpl.is_mutating),
        "variables": variables or {},
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
    record_app_event(
        "operation.execute",
        message="operation execution started",
        extra={
            "device_count": len(hosts),
            "op_type": tmpl.op_type,
            "template_id": tmpl.id,
            "dry_run": bool(dry_run),
            "sync": True,
            "requested_by": requested_by,
        },
    )
    summary, per_host = run_with_nornir(hosts=hosts, operation_text=rendered, params=params)
    if not dry_run:
        for result in per_host:
            # Audit all non-dry-run device executions. Monitor runs bypass this
            # path entirely (worker calls run_with_nornir directly), so there is
            # no unbounded-audit-row concern here.
            if not result.get("device_id"):
                continue
            host = hosts.get(int(result["device_id"]))
            if host is None:
                continue
            record_audit_log(
                action="operation.execute",
                target_type="device",
                target=host.get("device"),
                payload={
                    "operation": {
                        "op_type": tmpl.op_type,
                        "template_id": tmpl.id,
                        "variables": variables or {},
                    },
                    "result": result,
                },
                message=f"Executed {tmpl.op_type or 'operation'} on device {result['device_id']}",
            )
    db.session.commit()
    return summary, per_host
