"""Structured-output parsing for device execution.

This module turns raw device output (CLI text and/or NAPALM getter results)
into **typed, structured fields** per an Action's declared ``outputs`` schema.
It performs *no* device I/O, so every parser is unit-testable in isolation with
canned input.

Outputs schema shape
--------------------
``outputs`` is a mapping ``{field_name: field_spec}`` where ``field_spec`` is::

    {
        "type": "string" | "number" | "boolean" | "enum",
        "source": "textfsm" | "napalm_getter" | "regex" | "raw",

        # source == "napalm_getter":
        "getter": "get_facts",        # NAPALM getter name
        "path": "uptime",             # dotted/indexed path into the getter result

        # source == "textfsm":
        "command": "show version",    # command used to select the ntc template
        "field": "version",           # TextFSM column name to read (defaults to path)
        "row": 0,                     # row index, or "all" for the full list

        # source == "regex":
        "pattern": "Version (\\S+)",   # regex applied to the raw text
        "group": 1,                   # capture group (int) or name (str); default 1

        # source == "raw": takes the whole raw text (optionally per-command)
        "command": "show version",    # optional: read a specific command's output

        # type == "enum":
        "enum": ["up", "down"],       # allowed values (validated after coercion)
    }

The public entry point is :func:`parse_outputs`, which returns
``(fields, field_errors)`` and never raises for a per-field parse failure.
"""

from __future__ import annotations

import re
from re import error
from typing import Any

_TRUE_TOKENS = {"true", "1", "yes", "y", "up", "on", "enabled", "active", "ok"}
_FALSE_TOKENS = {"false", "0", "no", "n", "down", "off", "disabled", "inactive"}


class ParseError(Exception):
    """Raised internally when a single field cannot be parsed/coerced."""


# ---------------------------------------------------------------------------
# Type coercion
# ---------------------------------------------------------------------------
def coerce_value(value: Any, type_: str, *, enum: list[Any] | None = None) -> Any:
    """Coerce ``value`` to the declared ``type_``.

    Raises :class:`ParseError` when the value cannot be represented as the
    requested type (or, for ``enum``, is not an allowed member).
    """

    type_ = (type_ or "string").lower()

    if value is None:
        raise ParseError("value is missing")

    if type_ == "string":
        return value if isinstance(value, str) else str(value)

    if type_ == "number":
        if isinstance(value, bool):  # bool is a subclass of int; reject explicitly
            raise ParseError("boolean is not a number")
        if isinstance(value, (int, float)):
            return value
        text = str(value).strip()
        try:
            if re.fullmatch(r"[+-]?\d+", text):
                return int(text)
            return float(text)
        except (TypeError, ValueError) as exc:
            raise ParseError(f"cannot coerce {value!r} to number") from exc

    if type_ == "boolean":
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        token = str(value).strip().lower()
        if token in _TRUE_TOKENS:
            return True
        if token in _FALSE_TOKENS:
            return False
        raise ParseError(f"cannot coerce {value!r} to boolean")

    if type_ == "enum":
        allowed = enum or []
        # Normalize to string comparison so "5" matches 5, etc.
        candidate = value if isinstance(value, str) else str(value)
        for option in allowed:
            if candidate == option or candidate == str(option):
                return option
        raise ParseError(f"{value!r} is not one of {allowed!r}")

    raise ParseError(f"unknown type {type_!r}")


# ---------------------------------------------------------------------------
# Extractors
# ---------------------------------------------------------------------------
def extract_path(obj: Any, path: str | None) -> Any:
    """Walk a dotted/indexed ``path`` into a nested dict/list structure.

    ``path`` segments split on ``.``; a purely numeric segment indexes a list.
    An empty/None path returns ``obj`` unchanged.
    """

    if not path:
        return obj
    current = obj
    for segment in str(path).split("."):
        if current is None:
            raise ParseError(f"path {path!r} traversed a null value")
        if isinstance(current, dict):
            if segment not in current:
                raise ParseError(f"key {segment!r} missing at path {path!r}")
            current = current[segment]
        elif isinstance(current, (list, tuple)):
            try:
                current = current[int(segment)]
            except (ValueError, IndexError) as exc:
                raise ParseError(f"bad list index {segment!r} at path {path!r}") from exc
        else:
            raise ParseError(f"cannot descend into {type(current).__name__} at {segment!r}")
    return current


def extract_regex(text: str, pattern: str, group: int | str = 1) -> str:
    """Return the first regex match's capture ``group`` from ``text``."""

    if text is None:
        raise ParseError("no text to apply regex to")
    try:
        match = re.search(pattern, text, flags=re.MULTILINE)
    except re.error as exc:
        raise ParseError(f"invalid regex {pattern!r}: {exc}") from exc
    if not match:
        raise ParseError(f"pattern {pattern!r} did not match")
    try:
        return match.group(group)
    except (IndexError, error) as exc:  # pragma: no cover - defensive
        raise ParseError(f"group {group!r} not found for pattern {pattern!r}") from exc


def parse_textfsm(raw: str, platform: str | None, command: str | None) -> list[dict[str, Any]]:
    """Parse ``raw`` CLI output into a list of row dicts via ntc-templates.

    Uses the vendor TextFSM templates keyed by ``platform`` + ``command``.
    Raises :class:`ParseError` if the template is unavailable or parsing fails.
    """

    if not command:
        raise ParseError("textfsm source requires a 'command'")
    try:
        from ntc_templates.parse import parse_output
    except Exception as exc:  # pragma: no cover - dependency guard
        raise ParseError(f"ntc-templates unavailable: {exc}") from exc

    try:
        rows = parse_output(platform=platform or "", command=command, data=raw or "")
    except Exception as exc:
        raise ParseError(f"textfsm parse failed: {exc}") from exc
    # ntc-templates returns list[dict]; keys are lowercased column names.
    return list(rows or [])


# ---------------------------------------------------------------------------
# Per-field + schema parsing
# ---------------------------------------------------------------------------
def parse_field(
    spec: dict[str, Any],
    *,
    raw: str | None = None,
    raw_by_command: dict[str, str] | None = None,
    getters: dict[str, Any] | None = None,
    platform: str | None = None,
    default_command: str | None = None,
) -> Any:
    """Resolve and type-coerce a single output field. Raises :class:`ParseError`."""

    source = (spec.get("source") or "raw").lower()
    type_ = spec.get("type") or "string"
    enum = spec.get("enum")
    getters = getters or {}
    raw_by_command = raw_by_command or {}

    def _text_for(command: str | None) -> str | None:
        if command and command in raw_by_command:
            return raw_by_command[command]
        return raw

    if source == "raw":
        value = _text_for(spec.get("command"))
        return coerce_value(value, type_, enum=enum)

    if source == "regex":
        pattern = spec.get("pattern")
        if not pattern:
            raise ParseError("regex source requires a 'pattern'")
        text = _text_for(spec.get("command"))
        value = extract_regex(text or "", pattern, spec.get("group", 1))
        return coerce_value(value, type_, enum=enum)

    if source == "napalm_getter":
        getter = spec.get("getter")
        if not getter:
            raise ParseError("napalm_getter source requires a 'getter'")
        if getter not in getters:
            raise ParseError(f"getter {getter!r} was not collected")
        value = extract_path(getters[getter], spec.get("path"))
        return coerce_value(value, type_, enum=enum)

    if source == "textfsm":
        command = spec.get("command") or default_command
        text = _text_for(command)
        rows = parse_textfsm(text or "", platform, command)
        row_selector = spec.get("row", 0)
        column = spec.get("field") or spec.get("path")
        if row_selector == "all":
            if not column:
                return rows
            return [r.get(column) for r in rows]
        if not rows:
            raise ParseError("textfsm produced no rows")
        try:
            row = rows[int(row_selector)]
        except (ValueError, IndexError) as exc:
            raise ParseError(f"textfsm row {row_selector!r} out of range") from exc
        if not column:
            raise ParseError("textfsm source requires a 'field'/'path'")
        # ntc-templates lowercases column names.
        key = column if column in row else column.lower()
        if key not in row:
            raise ParseError(f"textfsm column {column!r} not found")
        return coerce_value(row[key], type_, enum=enum)

    raise ParseError(f"unknown source {source!r}")


def parse_outputs(
    outputs_schema: dict[str, Any] | None,
    *,
    raw: str | None = None,
    raw_by_command: dict[str, str] | None = None,
    getters: dict[str, Any] | None = None,
    platform: str | None = None,
    default_command: str | None = None,
) -> tuple[dict[str, Any], dict[str, str]]:
    """Parse every field in ``outputs_schema`` into typed values.

    Returns ``(fields, field_errors)``. ``fields`` maps field name -> typed
    value for every field that parsed; ``field_errors`` maps field name -> a
    human-readable message for every field that failed. This never raises, so a
    single bad field cannot crash a device's execution.
    """

    fields: dict[str, Any] = {}
    field_errors: dict[str, str] = {}

    for name, spec in (outputs_schema or {}).items():
        if not isinstance(spec, dict):
            field_errors[name] = "field spec must be an object"
            continue
        try:
            fields[name] = parse_field(
                spec,
                raw=raw,
                raw_by_command=raw_by_command,
                getters=getters,
                platform=platform,
                default_command=default_command,
            )
        except ParseError as exc:
            field_errors[name] = str(exc)
        except Exception as exc:  # noqa: BLE001 - never let parsing crash execution
            field_errors[name] = f"unexpected parse error: {exc}"

    return fields, field_errors


__all__ = [
    "ParseError",
    "coerce_value",
    "extract_path",
    "extract_regex",
    "parse_field",
    "parse_outputs",
    "parse_textfsm",
]
