"""Registry helpers for password-change handlers and command templates."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Callable

SSH_PLATFORMS = {
    "cisco_ios",
    "cisco_xe",
    "cisco_xr",
    "cisco_nxos",
    "cisco_asa",
    "cisco_ftd",
    "juniper_junos",
    "wlc",
    "f5",
    "gigamon",
    "lantronix",
    "cimc",
}

API_PLATFORMS = {
    "wti",
    "apic",
    "ndo",
    "expressway",
    "ise",
    "f5_oshost",
}

SLUG_ALIASES = {
    "WLC": "wlc",
    "F5": "f5",
    "WTI": "wti",
    "APIC": "apic",
    "NDO": "ndo",
    "Expressway": "expressway",
    "ISE": "ise",
    "F5_oshost": "f5_oshost",
}

NETMIKO_TYPE_MAP = {
    "cisco_ios": "cisco_ios",
    "cisco_xe": "cisco_xe",
    "cisco_xr": "cisco_xr",
    "cisco_nxos": "cisco_nxos",
    "cisco_asa": "cisco_asa",
    "cisco_ftd": "cisco_ftd",
    "juniper_junos": "juniper_junos",
    "wlc": "cisco_wlc_ssh",
    "f5": "f5_linux_ssh",
    "gigamon": "generic_termserver",
    "lantronix": "generic_termserver",
    "cimc": "cisco_ios",
}


def normalize_platform_slug(slug: str | None) -> str:
    """Normalize platform slugs to the registry's canonical values."""

    raw = (slug or "").strip()
    if not raw:
        return ""
    aliased = SLUG_ALIASES.get(raw, raw)
    return aliased.lower()


@lru_cache(maxsize=1)
def _command_map() -> dict[str, list[str]]:
    path = Path(__file__).with_name("password_change_commands.json")
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return {normalize_platform_slug(key): list(value or []) for key, value in payload.items()}


def get_commands(platform_slug: str) -> list[str]:
    """Return the configured password-change commands for a platform slug."""

    return list(_command_map().get(normalize_platform_slug(platform_slug), []))


def get_handler(platform_slug: str) -> Callable[[dict], dict]:
    """Resolve the execution handler for a platform slug."""

    normalized = normalize_platform_slug(platform_slug)
    if normalized in SSH_PLATFORMS:
        from . import ssh_handler

        return ssh_handler.change_password
    if normalized in API_PLATFORMS:
        from . import api_handler

        return api_handler.change_password
    raise KeyError(f"Unsupported password-change platform: {platform_slug}")
