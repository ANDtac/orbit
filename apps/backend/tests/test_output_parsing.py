"""Unit tests for structured output parsing (no device I/O)."""

from __future__ import annotations

import pytest

from app.services import output_parsing as op
from app.services.output_parsing import ParseError, coerce_value, parse_outputs


# ---------------------------------------------------------------------------
# Type coercion
# ---------------------------------------------------------------------------
def test_coerce_number_int_and_float():
    assert coerce_value("42", "number") == 42
    assert coerce_value("3.14", "number") == 3.14
    assert coerce_value(7, "number") == 7


def test_coerce_boolean_tokens():
    assert coerce_value("up", "boolean") is True
    assert coerce_value("down", "boolean") is False
    assert coerce_value(1, "boolean") is True


def test_coerce_enum_membership():
    assert coerce_value("active", "enum", enum=["active", "inactive"]) == "active"
    with pytest.raises(ParseError):
        coerce_value("bogus", "enum", enum=["active", "inactive"])


def test_coerce_number_rejects_non_numeric():
    with pytest.raises(ParseError):
        coerce_value("not-a-number", "number")


# ---------------------------------------------------------------------------
# Source: raw / regex
# ---------------------------------------------------------------------------
def test_raw_passthrough():
    fields, errors = parse_outputs(
        {"config": {"type": "string", "source": "raw"}},
        raw="hostname r1\n",
    )
    assert errors == {}
    assert fields["config"] == "hostname r1\n"


def test_regex_extracts_and_coerces_number():
    fields, errors = parse_outputs(
        {"version": {"type": "number", "source": "regex", "pattern": r"Version (\d+)"}},
        raw="Cisco IOS Software, Version 17 blah",
    )
    assert errors == {}
    assert fields["version"] == 17


def test_regex_parse_failure_is_isolated():
    fields, errors = parse_outputs(
        {
            "ok_field": {"type": "string", "source": "raw"},
            "bad_field": {"type": "string", "source": "regex", "pattern": r"NOPE (\d+)"},
        },
        raw="some text",
    )
    # Good field still parsed; bad field recorded as an error, no exception.
    assert fields["ok_field"] == "some text"
    assert "bad_field" not in fields
    assert "bad_field" in errors


# ---------------------------------------------------------------------------
# Source: napalm_getter
# ---------------------------------------------------------------------------
def test_napalm_getter_path_extraction():
    getters = {"get_facts": {"uptime": 12345, "vendor": "Cisco", "os_version": "17.3"}}
    schema = {
        "uptime": {"type": "number", "source": "napalm_getter", "getter": "get_facts", "path": "uptime"},
        "vendor": {"type": "string", "source": "napalm_getter", "getter": "get_facts", "path": "vendor"},
    }
    fields, errors = parse_outputs(schema, getters=getters)
    assert errors == {}
    assert fields == {"uptime": 12345, "vendor": "Cisco"}


def test_napalm_getter_missing_getter_errors():
    schema = {"x": {"type": "number", "source": "napalm_getter", "getter": "get_facts", "path": "uptime"}}
    fields, errors = parse_outputs(schema, getters={})
    assert "x" in errors


# ---------------------------------------------------------------------------
# Source: textfsm (ntc-templates parse patched for determinism)
# ---------------------------------------------------------------------------
def test_textfsm_row_and_column(monkeypatch):
    def fake_parse_output(platform, command, data):
        return [{"version": "17.3.1", "uptime": "5 days"}]

    monkeypatch.setattr("ntc_templates.parse.parse_output", fake_parse_output)

    schema = {
        "version": {
            "type": "string",
            "source": "textfsm",
            "command": "show version",
            "field": "version",
        }
    }
    fields, errors = parse_outputs(schema, raw="...canned...", platform="cisco_ios")
    assert errors == {}
    assert fields["version"] == "17.3.1"


def test_textfsm_all_rows(monkeypatch):
    def fake_parse_output(platform, command, data):
        return [{"intf": "Gi0/1"}, {"intf": "Gi0/2"}]

    monkeypatch.setattr("ntc_templates.parse.parse_output", fake_parse_output)

    schema = {
        "interfaces": {
            "type": "string",
            "source": "textfsm",
            "command": "show ip int brief",
            "field": "intf",
            "row": "all",
        }
    }
    fields, errors = parse_outputs(schema, raw="x", platform="cisco_ios")
    assert errors == {}
    assert fields["interfaces"] == ["Gi0/1", "Gi0/2"]


def test_raw_by_command_selects_per_command_output():
    schema = {
        "hostname": {"type": "string", "source": "regex", "pattern": r"hostname (\S+)", "command": "show run"},
    }
    fields, errors = parse_outputs(
        schema,
        raw="unrelated",
        raw_by_command={"show run": "hostname edge-1"},
    )
    assert fields["hostname"] == "edge-1"
