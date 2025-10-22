"""Utility helpers for API resources.

The v1 API standardises how cursor-based pagination, filtering, sorting, and
error payloads work. These helpers keep behaviour consistent across resources
and help the OpenAPI documentation stay uniform.

Highlights
~~~~~~~~~~
* ``page[cursor]``/``page[size]`` style cursor pagination helpers.
* ``filter[foo]=bar`` parsing with optional backwards-compatible fallbacks.
* Shared RFC 7807 response builders.
* Sorting helpers that respect allowed columns.
"""

from __future__ import annotations

import base64
import json
from functools import wraps
from http import HTTPStatus
from typing import Iterable, Set, Optional, TypeVar, Any, cast, Dict, Callable

from flask import jsonify, request
from flask_jwt_extended import get_jwt_identity
from sqlalchemy.orm import Query
from sqlalchemy import desc

from app.extensions import db
from app.models import Users
from sqlalchemy.sql import Select

T = TypeVar("T")

DEFAULT_PROBLEM_TYPE = "about:blank"


def get_pagination(
    default_page: int = 1,
    default_per_page: int = 50,
    max_per_page: int = 200,
) -> tuple[int, int]:
    """
    Parse pagination parameters from the request query string.

    Query Parameters
    ----------------
    page : int, optional
        1-based page number. Defaults to `default_page`.
    per_page : int, optional
        Items per page. Defaults to `default_per_page`, capped at `max_per_page`.

    Parameters
    ----------
    default_page : int
        Fallback page value if none provided or invalid.
    default_per_page : int
        Fallback per_page value if none provided or invalid.
    max_per_page : int
        Upper bound to protect the API from large page sizes.

    Returns
    -------
    tuple[int, int]
        `(page, per_page)` values suitable for SQLAlchemy's `paginate`.
    """
    try:
        page = int(request.args.get("page", default_page))
    except (TypeError, ValueError):
        page = default_page

    try:
        per_page = int(request.args.get("per_page", default_per_page))
    except (TypeError, ValueError):
        per_page = default_per_page

    if page < 1:
        page = 1
    if per_page < 1:
        per_page = 1
    if per_page > max_per_page:
        per_page = max_per_page

    return page, per_page


def interpret_bool(value: str | None, default: bool | None = False) -> bool | None:
    """Interpret a boolean string value using relaxed truthy/falsey forms."""

    if value is None:
        return default
    val = value.strip().lower()
    if val in {"1", "true", "yes", "on"}:
        return True
    if val in {"0", "false", "no", "off"}:
        return False
    return default


def parse_bool_arg(name: str, default: bool = False) -> bool:
    """Read a boolean query parameter from :data:`flask.request.args`."""

    parsed = interpret_bool(request.args.get(name), default)
    return bool(parsed) if parsed is not None else default


def apply_sorting(
    query: Query,
    model,
    param: str = "sort",
    default: Optional[str] = None,
    allowed: Optional[Set[str]] = None,
) -> Query:
    """
    Apply ORDER BY to a SQLAlchemy query using a comma-separated `sort` string.

    Sort Syntax
    -----------
    - `field`     -> ascending
    - `-field`    -> descending
    Multiple fields can be combined: `?sort=-created_at,name`

    Parameters
    ----------
    query : sqlalchemy.orm.Query
        The base query to order.
    model : Any
        ORM model class used to resolve column attributes by name.
    param : str
        Query parameter name to read (default: "sort").
    default : str | None
        Default sort directive when none provided (e.g., "-id").
    allowed : set[str] | None
        Optional whitelist of sortable field names. If provided, fields not in
        the set are ignored.

    Returns
    -------
    sqlalchemy.orm.Query
        The ordered query. If no valid sort fields are found, returns the original query.
    """
    raw = request.args.get(param, default)
    if not raw:
        return query

    order_clauses = []
    for token in (t.strip() for t in raw.split(",") if t.strip()):
        direction = desc if token.startswith("-") else None
        name = token[1:] if token.startswith("-") else token

        if allowed is not None and name not in allowed:
            continue

        col = getattr(model, name, None)
        if col is None:
            continue
        order_clauses.append(direction(col) if direction else col.asc())

    return query.order_by(*order_clauses) if order_clauses else query


def get_filter_args(
    allowed: Iterable[str] | None = None,
    *,
    legacy: dict[str, str] | None = None,
) -> dict[str, str]:
    """Return ``filter[...]`` query parameters as a mapping.

    Parameters
    ----------
    allowed:
        Optional whitelist of filter keys that should be returned.
    legacy:
        Mapping of filter key -> legacy plain query argument to check when the
        filter value is omitted from ``filter[...]``. This supports a graceful
        migration for existing clients.
    """

    allowed_set = set(allowed or [])
    filters: dict[str, str] = {}

    for key, value in request.args.items():
        if not key.startswith("filter[") or not key.endswith("]"):
            continue
        name = key[7:-1]
        if allowed_set and name not in allowed_set:
            continue
        if value is not None:
            filters[name] = value

    if legacy:
        for name, legacy_key in legacy.items():
            if allowed_set and name not in allowed_set:
                continue
            if name in filters:
                continue
            legacy_value = request.args.get(legacy_key)
            if legacy_value is not None:
                filters[name] = legacy_value

    return filters


def paginate_query(
    query: Query[T],
    *,
    page: int,
    per_page: int,
    error_out: bool = False,
):
    """Paginate a SQLAlchemy ``Query`` using ``db.paginate``.

    Flask-SQLAlchemy 3 expects a ``Select`` statement when calling
    :func:`db.paginate`. The legacy ORM ``Query`` exposes the generated
    ``Select`` via the ``statement`` attribute, but SQLAlchemy's typing hints
    describe it as a broader ``Executable`` union (``Select`` | ``Update`` |
    ``Delete``). Runtime usage here is guaranteed to produce a ``Select``
    because ``Query`` represents a read operation, so we cast accordingly to
    satisfy the type checker.

    Parameters
    ----------
    query : sqlalchemy.orm.Query
        ORM query to paginate.
    page : int
        1-based page number.
    per_page : int
        Number of items per page.
    error_out : bool
        Propagated to :func:`db.paginate` to match previous behaviour.

    Returns
    -------
    flask_sqlalchemy.pagination.Pagination
        Pagination object from ``db.paginate``.
    """

    statement = cast(Select[Any], query.statement)
    return db.paginate(statement, page=page, per_page=per_page, error_out=error_out)


def decode_cursor(raw: str | None) -> int:
    """Decode a base64 cursor value into an integer offset."""

    if not raw:
        return 0
    try:
        padding = "=" * (-len(raw) % 4)
        decoded = base64.urlsafe_b64decode(raw + padding).decode("utf-8")
        data = json.loads(decoded)
        offset = int(data.get("offset", 0))
        if offset < 0:
            return 0
        return offset
    except Exception:
        return 0


def encode_cursor(offset: int) -> str:
    """Encode an integer offset into a base64 cursor token."""

    payload = json.dumps({"offset": max(offset, 0)}).encode("utf-8")
    return base64.urlsafe_b64encode(payload).rstrip(b"=").decode("ascii")


def get_cursor_pagination(default_size: int = 50, max_size: int = 200) -> tuple[int, int]:
    """Return ``(offset, size)`` using ``page[cursor]`` and ``page[size]`` parameters."""

    raw_cursor = request.args.get("page[cursor]")
    size_param = request.args.get("page[size]")

    try:
        size = int(size_param) if size_param is not None else default_size
    except (TypeError, ValueError):
        size = default_size

    if size < 1:
        size = 1
    if size > max_size:
        size = max_size

    offset = decode_cursor(raw_cursor)
    if offset < 0:
        offset = 0

    return offset, size


def cursor_paginate(query: Query[T], *, cursor: int, size: int) -> dict[str, Any]:
    """
    Paginate a query using cursor semantics backed by offset pagination.

    Returns a mapping with ``items`` and ``page`` metadata (cursor/size/next/prev).
    """

    page_number = (cursor // size) + 1
    pagination = paginate_query(query, page=page_number, per_page=size, error_out=False)
    next_cursor = None
    prev_cursor = None

    if pagination.has_next:
        next_cursor = encode_cursor(cursor + size)
    if cursor > 0:
        prev_cursor = encode_cursor(max(cursor - size, 0))

    return {
        "data": pagination.items,
        "page": {
            "cursor": encode_cursor(cursor),
            "size": size,
            "next": next_cursor,
            "prev": prev_cursor,
            "total": pagination.total,
        },
    }


def problem_details(
    status: int,
    *,
    title: str | None = None,
    detail: str | None = None,
    type_: str | None = None,
    instance: str | None = None,
    extra: Dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Construct an RFC 7807 problem details object."""

    resolved_title = title or HTTPStatus(status).phrase
    body: dict[str, Any] = {
        "type": type_ or DEFAULT_PROBLEM_TYPE,
        "title": resolved_title,
        "status": status,
    }
    if detail:
        body["detail"] = detail
    if instance:
        body["instance"] = instance
    if extra:
        body.update(extra)
    return body


def problem_response(
    status: int,
    *,
    title: str | None = None,
    detail: str | None = None,
    type_: str | None = None,
    instance: str | None = None,
    headers: Dict[str, str] | None = None,
    extra: Dict[str, Any] | None = None,
):
    """Return a Flask response carrying an RFC 7807 payload."""

    body = problem_details(
        status,
        title=title,
        detail=detail,
        type_=type_,
        instance=instance,
        extra=extra,
    )
    response = jsonify(body)
    response.status_code = status
    response.headers["Content-Type"] = "application/problem+json"
    if headers:
        for key, value in headers.items():
            response.headers[key] = value
    return response


def require_roles(*roles: str) -> Callable:
    """Decorator enforcing that the current user has at least one of the given roles."""

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            identity = get_jwt_identity()
            user = None
            if identity is not None and str(identity).isdigit():
                user = Users.query.get(int(identity))
            if not user or not user.is_active:
                return problem_response(HTTPStatus.FORBIDDEN, detail="User disabled")
            user_roles = set(user.roles or [])
            if roles and user_roles.isdisjoint(set(roles)):
                return problem_response(HTTPStatus.FORBIDDEN, detail="Insufficient permissions")
            return func(*args, **kwargs)

        return wrapper

    return decorator
