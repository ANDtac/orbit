"""REST-backed password-change handlers for API-driven platforms."""

from __future__ import annotations

import base64
from typing import Any

import requests
from requests.auth import HTTPBasicAuth

from .registry import normalize_platform_slug


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


def _session() -> requests.Session:
    session = requests.Session()
    session.verify = False
    return session


def _change_wti(target: dict[str, Any]) -> dict[str, Any]:
    session = _session()
    username = target["username"] or "sysadmin"
    url = f"https://{target['host']}/api/v2/config/users"
    payload = {"users": {username: {"password": target["new_password"], "confirm_password": target["new_password"]}}}

    try:
        response = session.put(
            url,
            json=payload,
            auth=HTTPBasicAuth(username, target["current_password"]),
            headers={"Content-Type": "application/json"},
            timeout=target.get("timeout", 30),
        )
        if response.status_code not in {200, 201, 204}:
            return _result(target, ok=False, error=f"{response.status_code} {response.reason}", phase="commands")
        if target.get("validate_after", True):
            validation = session.get(url, auth=HTTPBasicAuth(username, target["new_password"]), timeout=target.get("timeout", 30))
            if validation.status_code not in {200, 204}:
                return _result(target, ok=False, changed=True, error=f"{validation.status_code} {validation.reason}", phase="validate")
        return _result(target, ok=True, changed=True, output=response.text, phase="completed")
    except requests.RequestException as exc:
        return _result(target, ok=False, error=str(exc), phase="connect")


def _change_apic(target: dict[str, Any]) -> dict[str, Any]:
    session = _session()
    base = f"https://{target['host']}"
    username = target["username"] or r"apic:fallback\admin"
    timeout = target.get("timeout", 30)
    try:
        login = session.post(
            f"{base}/api/aaaLogin.json",
            json={"aaaUser": {"attributes": {"name": username, "pwd": target["current_password"]}}},
            timeout=timeout,
        )
        if login.status_code != 200:
            return _result(target, ok=False, error=f"{login.status_code} {login.reason}", phase="connect")

        auth_token = (((login.json() or {}).get("imdata") or [{}])[0].get("aaaLogin") or {}).get("attributes", {}).get("token")
        headers = {"Cookie": f"APIC-cookie={auth_token}"} if auth_token else {}
        change = session.post(
            f"{base}/api/changeSelfPassword.json",
            json={"aaaUser": {"attributes": {"name": username, "pwd": target["new_password"], "oldPwd": target["current_password"]}}},
            headers=headers,
            timeout=timeout,
        )
        if change.status_code != 200:
            return _result(target, ok=False, error=f"{change.status_code} {change.reason}", phase="commands")
        if target.get("validate_after", True):
            validation = session.post(
                f"{base}/api/aaaLogin.json",
                json={"aaaUser": {"attributes": {"name": username, "pwd": target["new_password"]}}},
                timeout=timeout,
            )
            if validation.status_code != 200:
                return _result(target, ok=False, changed=True, error=f"{validation.status_code} {validation.reason}", phase="validate")
        return _result(target, ok=True, changed=True, output=change.text, phase="completed")
    except requests.RequestException as exc:
        return _result(target, ok=False, error=str(exc), phase="connect")


def _change_ndo(target: dict[str, Any]) -> dict[str, Any]:
    session = _session()
    base = f"https://{target['host']}"
    username = target["username"] or "admin"
    timeout = target.get("timeout", 30)
    try:
        login = session.post(
            f"{base}/login",
            json={"userName": username, "userPasswd": target["current_password"], "domain": "local"},
            timeout=timeout,
        )
        if login.status_code != 200:
            return _result(target, ok=False, error=f"{login.status_code} {login.reason}", phase="connect")

        token = (login.json() or {}).get("token")
        encoded_password = base64.b64encode(target["new_password"].encode("ascii")).decode("ascii")
        change = session.put(
            f"{base}/nexus/infra/api/aaa/v4/localusers/{username}",
            json={"spec": {"password": encoded_password}},
            headers={"Cookie": f"AuthCookie={token}", "Content-Type": "application/json"},
            timeout=timeout,
        )
        if change.status_code != 200:
            return _result(target, ok=False, error=f"{change.status_code} {change.reason}", phase="commands")
        if target.get("validate_after", True):
            validation = session.post(
                f"{base}/login",
                json={"userName": username, "userPasswd": target["new_password"], "domain": "local"},
                timeout=timeout,
            )
            if validation.status_code != 200:
                return _result(target, ok=False, changed=True, error=f"{validation.status_code} {validation.reason}", phase="validate")
        return _result(target, ok=True, changed=True, output=change.text, phase="completed")
    except requests.RequestException as exc:
        return _result(target, ok=False, error=str(exc), phase="connect")


def _change_expressway(target: dict[str, Any]) -> dict[str, Any]:
    session = _session()
    username = target["username"] or "admin"
    timeout = target.get("timeout", 30)
    try:
        response = session.put(
            f"https://{target['host']}/api/provisioning/common/adminaccount/changepassword",
            json={
                "Name": username,
                "Password": target["new_password"],
                "ConfirmPassword": target["new_password"],
                "YourCurrentPassword": target["current_password"],
            },
            headers={"Content-Type": "application/json"},
            auth=HTTPBasicAuth(username, target["current_password"]),
            timeout=timeout,
        )
        if response.status_code not in {200, 204}:
            return _result(target, ok=False, error=f"{response.status_code} {response.reason}", phase="commands")
        if target.get("validate_after", True):
            validation = session.get(
                f"https://{target['host']}/api/status",
                headers={"Accept": "application/json"},
                auth=HTTPBasicAuth(username, target["new_password"]),
                timeout=timeout,
            )
            if validation.status_code not in {200, 204}:
                return _result(target, ok=False, changed=True, error=f"{validation.status_code} {validation.reason}", phase="validate")
        return _result(target, ok=True, changed=True, output=response.text, phase="completed")
    except requests.RequestException as exc:
        return _result(target, ok=False, error=str(exc), phase="connect")


def _change_ise(target: dict[str, Any]) -> dict[str, Any]:
    session = _session()
    username = target["username"] or "admin"
    timeout = target.get("timeout", 30)
    try:
        response = session.put(
            f"https://{target['host']}/ers/config/adminuser/{username}",
            json={"AdminUser": {"name": username, "password": target["new_password"]}},
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            auth=HTTPBasicAuth(username, target["current_password"]),
            timeout=timeout,
        )
        if response.status_code not in {200, 204}:
            return _result(target, ok=False, error=f"{response.status_code} {response.reason}", phase="commands")
        if target.get("validate_after", True):
            validation = session.get(
                f"https://{target['host']}/ers/config/adminuser",
                headers={"Accept": "application/json"},
                auth=HTTPBasicAuth(username, target["new_password"]),
                timeout=timeout,
            )
            if validation.status_code not in {200, 204}:
                return _result(target, ok=False, changed=True, error=f"{validation.status_code} {validation.reason}", phase="validate")
        return _result(target, ok=True, changed=True, output=response.text, phase="completed")
    except requests.RequestException as exc:
        return _result(target, ok=False, error=str(exc), phase="connect")


def _change_f5_oshost(target: dict[str, Any]) -> dict[str, Any]:
    session = _session()
    username = target["username"] or "admin"
    timeout = target.get("timeout", 30)
    try:
        login = session.get(
            f"https://{target['host']}:8888/restconf/data/openconfig-system:system/aaa",
            auth=HTTPBasicAuth(username, target["current_password"]),
            headers={"Content-Type": "application/json"},
            timeout=timeout,
        )
        if login.status_code != 200:
            return _result(target, ok=False, error=f"{login.status_code} {login.reason}", phase="connect")

        token = login.headers.get("x-auth-token", "")
        change = session.post(
            f"https://{target['host']}:8888/restconf/operations/openconfig-system:system/aaa/authentication/users/user={username}/config/change-password",
            json={"input": [{"old-password": target["current_password"], "new-password": target["new_password"], "confirm-password": target["new_password"]}]},
            headers={"Content-Type": "application/yang-data+json", "X-Auth-Token": token},
            timeout=timeout,
        )
        if change.status_code not in {200, 201, 204}:
            return _result(target, ok=False, error=f"{change.status_code} {change.reason}", phase="commands")
        if target.get("validate_after", True):
            validation = session.get(
                f"https://{target['host']}:8888/restconf/data/openconfig-system:system/aaa",
                auth=HTTPBasicAuth(username, target["new_password"]),
                headers={"Content-Type": "application/json"},
                timeout=timeout,
            )
            if validation.status_code != 200:
                return _result(target, ok=False, changed=True, error=f"{validation.status_code} {validation.reason}", phase="validate")
        return _result(target, ok=True, changed=True, output=change.text, phase="completed")
    except requests.RequestException as exc:
        return _result(target, ok=False, error=str(exc), phase="connect")


def change_password(target: dict[str, Any]) -> dict[str, Any]:
    """Execute a password change against an API-driven platform."""

    target = {**target, "platform_slug": normalize_platform_slug(target["platform_slug"])}
    handlers = {
        "wti": _change_wti,
        "apic": _change_apic,
        "ndo": _change_ndo,
        "expressway": _change_expressway,
        "ise": _change_ise,
        "f5_oshost": _change_f5_oshost,
    }
    handler = handlers.get(target["platform_slug"])
    if not handler:
        return _result(target, ok=False, error="unsupported api password-change platform", phase="prepare")
    return handler(target)
