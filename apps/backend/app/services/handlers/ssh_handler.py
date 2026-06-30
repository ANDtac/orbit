"""Netmiko-backed password-change handler."""

from __future__ import annotations

import re
from typing import Any

from .registry import NETMIKO_TYPE_MAP, get_commands, normalize_platform_slug

INTERACTIVE_PLATFORMS = {"cisco_ftd", "juniper_junos", "wlc", "f5", "cimc", "lantronix", "gigamon"}
CONFIG_SAVE_PLATFORMS = {"cisco_ios", "cisco_xe", "cisco_nxos", "cisco_asa", "wlc", "f5"}


def _result(
    target: dict[str, Any],
    *,
    ok: bool,
    changed: bool = False,
    output: str | None = None,
    error: str | None = None,
    phase: str = "completed",
) -> dict[str, Any]:
    return {
        "device_id": target["device_id"],
        "ok": ok,
        "changed": changed,
        "output": output,
        "error": error,
        "phase": phase,
        "platform": target["platform_slug"],
        "host": target["host"],
    }


def _detect_vty_range(connection: Any) -> tuple[int, int]:
    output = connection.send_command("show line | include vty")
    matches = re.findall(r"vty\s+(\d+).*?(\d+)?", output, flags=re.IGNORECASE)
    if not matches:
        return 0, 15
    numbers: list[int] = []
    for start, end in matches:
        numbers.append(int(start))
        if end:
            numbers.append(int(end))
    return min(numbers), max(numbers)


def _render_commands(target: dict[str, Any], connection: Any) -> list[str]:
    min_vty, max_vty = (0, 15)
    if target["platform_slug"] in {"cisco_ios", "cisco_xe"}:
        min_vty, max_vty = _detect_vty_range(connection)

    rendered: list[str] = []
    for command in get_commands(target["platform_slug"]):
        rendered.append(
            command
            .replace("new_password", target["new_password"])
            .replace("current_enable", target["enable_secret"])
            .replace("min_vty", str(min_vty))
            .replace("max_vty", str(max_vty))
        )
    return rendered


def _connect(target: dict[str, Any], *, password: str, secret: str | None = None) -> Any:
    from netmiko import ConnectHandler

    kwargs = {
        "device_type": target.get("netmiko_type") or NETMIKO_TYPE_MAP.get(target["platform_slug"], "cisco_ios"),
        "host": target["host"],
        "port": target.get("port") or 22,
        "username": target["username"],
        "password": password,
        "timeout": target.get("timeout", 30),
        "fast_cli": False,
    }
    if secret:
        kwargs["secret"] = secret
    return ConnectHandler(**kwargs)


def change_password(target: dict[str, Any]) -> dict[str, Any]:
    """Execute a password change against an SSH-driven platform."""

    platform_slug = normalize_platform_slug(target["platform_slug"])
    target = {**target, "platform_slug": platform_slug}

    try:
        from netmiko.exceptions import NetmikoAuthenticationException, NetmikoTimeoutException
    except Exception as exc:  # pragma: no cover
        return _result(target, ok=False, error=str(exc), phase="connect")

    try:
        connection = _connect(target, password=target["current_password"], secret=target["enable_secret"])
    except NetmikoAuthenticationException as exc:
        return _result(target, ok=False, error=f"auth failed: {exc}", phase="connect")
    except NetmikoTimeoutException as exc:
        return _result(target, ok=False, error=f"timeout: {exc}", phase="connect")
    except Exception as exc:
        return _result(target, ok=False, error=str(exc), phase="connect")

    output_parts: list[str] = []
    try:
        commands = _render_commands(target, connection)

        if target["enable_secret"] and platform_slug not in {"juniper_junos", "cimc", "lantronix", "gigamon", "f5"}:
            try:
                connection.enable()
            except Exception:
                pass

        if platform_slug in INTERACTIVE_PLATFORMS:
            for command in commands:
                output_parts.append(str(connection.send_command_timing(command, cmd_verify=False)))
        else:
            output_parts.append(str(connection.send_config_set(commands)))

        if platform_slug in CONFIG_SAVE_PLATFORMS:
            try:
                output_parts.append(str(connection.save_config()))
            except Exception:
                pass
    except Exception as exc:
        try:
            connection.disconnect()
        except Exception:
            pass
        return _result(target, ok=False, error=str(exc), output="\n".join(output_parts), phase="commands")

    try:
        connection.disconnect()
    except Exception:
        pass

    if target.get("validate_after", True):
        try:
            validation = _connect(target, password=target["new_password"], secret=target["new_password"])
            validation.disconnect()
        except Exception as exc:
            return _result(target, ok=False, changed=True, error=str(exc), output="\n".join(output_parts), phase="validate")

    return _result(target, ok=True, changed=True, output="\n".join(output_parts), phase="completed")
