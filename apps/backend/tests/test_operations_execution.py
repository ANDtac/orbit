"""Execution tests for run_with_nornir with mocked device connections.

CRITICAL: every NAPALM/Netmiko connection is patched. No real device session is
ever opened.
"""

from __future__ import annotations

from contextlib import contextmanager

import pytest

from app.services import operations as ops


class _FakeNapalmDevice:
    """Minimal NAPALM-like device for tests."""

    def __init__(self, facts=None, diff="+ new line", raise_on_open=False):
        self._facts = facts or {"uptime": 999, "vendor": "Cisco"}
        self._diff = diff
        self._raise_on_open = raise_on_open
        self.committed = False
        self.discarded = False

    def get_facts(self):
        return self._facts

    def load_merge_candidate(self, config=None):
        self._candidate = config

    def compare_config(self):
        return self._diff

    def commit_config(self):
        self.committed = True

    def discard_config(self):
        self.discarded = True


def _patch_napalm(monkeypatch, device):
    @contextmanager
    def _fake_conn(target, timeout):
        yield device

    monkeypatch.setattr(ops, "_napalm_connection", _fake_conn)
    return device


def test_run_with_nornir_napalm_getter_structured_fields(app, db, create_device, monkeypatch):
    device = create_device()
    fake = _FakeNapalmDevice(facts={"uptime": 12345, "vendor": "Cisco"})
    _patch_napalm(monkeypatch, fake)

    hosts = ops.build_inventory_for_devices([device.id])
    params = {
        "dry_run": False,
        "timeout_sec": 30,
        "is_mutating": False,
        "outputs": {
            "uptime": {
                "type": "number",
                "source": "napalm_getter",
                "getter": "get_facts",
                "path": "uptime",
            },
            "vendor": {
                "type": "string",
                "source": "napalm_getter",
                "getter": "get_facts",
                "path": "vendor",
            },
        },
    }

    summary, results = ops.run_with_nornir(hosts, "", params)

    assert summary["requested"] == 1
    assert summary["ok"] == 1 and summary["failed"] == 0
    res = results[0]
    assert res["ok"] is True
    assert res["device_id"] == device.id
    assert res["fields"] == {"uptime": 12345, "vendor": "Cisco"}
    assert res["field_errors"] == {}
    assert res["latency_ms"] is not None


def test_run_with_nornir_cli_regex_structured_fields(app, db, create_device, monkeypatch):
    device = create_device()
    monkeypatch.setattr(
        ops, "_run_cli", lambda target, command, timeout: "Cisco IOS XE, Version 17.6.4"
    )

    hosts = ops.build_inventory_for_devices([device.id])
    params = {
        "dry_run": True,
        "timeout_sec": 30,
        "outputs": {
            "version": {"type": "string", "source": "regex", "pattern": r"Version (\S+)"},
        },
    }

    summary, results = ops.run_with_nornir(hosts, "show version", params)
    assert results[0]["fields"]["version"] == "17.6.4"
    assert results[0]["raw"].startswith("Cisco IOS XE")


def test_run_with_nornir_connection_error_is_typed_per_device(app, db, create_device, monkeypatch):
    device = create_device()

    def _boom(target, command, timeout):
        raise TimeoutError("connection timed out")

    monkeypatch.setattr(ops, "_run_cli", _boom)

    hosts = ops.build_inventory_for_devices([device.id])
    params = {"outputs": {"cfg": {"type": "string", "source": "raw"}}, "timeout_sec": 5}

    # Must NOT raise: the failure is isolated to the device result.
    summary, results = ops.run_with_nornir(hosts, "show run", params)

    assert summary["failed"] == 1 and summary["ok"] == 0
    res = results[0]
    assert res["ok"] is False
    assert "TimeoutError" in res["error"]
    assert "timed out" in res["error"]


def test_run_with_nornir_dry_run_mutating_computes_diff_without_commit(
    app, db, create_device, monkeypatch
):
    device = create_device()
    fake = _FakeNapalmDevice(diff="+ ntp server 1.2.3.4")
    _patch_napalm(monkeypatch, fake)

    hosts = ops.build_inventory_for_devices([device.id])
    params = {"dry_run": True, "is_mutating": True, "outputs": {}, "timeout_sec": 30}

    summary, results = ops.run_with_nornir(hosts, "ntp server 1.2.3.4", params)

    res = results[0]
    assert res["ok"] is True
    assert res["diff"] == "+ ntp server 1.2.3.4"
    assert res["changed"] is False  # dry-run never commits
    assert fake.discarded is True and fake.committed is False
    assert summary["changed"] == 0


def test_run_with_nornir_mutating_commit_marks_changed(app, db, create_device, monkeypatch):
    device = create_device()
    fake = _FakeNapalmDevice(diff="+ ntp server 1.2.3.4")
    _patch_napalm(monkeypatch, fake)

    hosts = ops.build_inventory_for_devices([device.id])
    params = {"dry_run": False, "is_mutating": True, "outputs": {}, "timeout_sec": 30}

    summary, results = ops.run_with_nornir(hosts, "ntp server 1.2.3.4", params)

    assert results[0]["changed"] is True
    assert fake.committed is True and fake.discarded is False
    assert summary["changed"] == 1


def test_run_with_nornir_partial_failure_across_devices(app, db, create_device, monkeypatch):
    d1 = create_device(name="dev-a", fqdn="dev-a.local", mgmt_ipv4="10.0.0.11")
    d2 = create_device(name="dev-b", fqdn="dev-b.local", mgmt_ipv4="10.0.0.12")

    def _cli(target, command, timeout):
        if target["host"] == "dev-b.local" or target["address"] == "10.0.0.12":
            raise ConnectionError("unreachable")
        return "hostname dev-a"

    monkeypatch.setattr(ops, "_run_cli", _cli)

    hosts = ops.build_inventory_for_devices([d1.id, d2.id])
    params = {"outputs": {"cfg": {"type": "string", "source": "raw"}}, "timeout_sec": 5}
    summary, results = ops.run_with_nornir(hosts, "show run", params)

    assert summary["ok"] == 1 and summary["failed"] == 1
    by_id = {r["device_id"]: r for r in results}
    assert by_id[d1.id]["ok"] is True
    assert by_id[d2.id]["ok"] is False
    assert "ConnectionError" in by_id[d2.id]["error"]
