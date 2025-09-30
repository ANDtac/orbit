"""
app/api/utils.py
----------------
Utility helpers for Flask-RESTX resources.

Responsibilities
----------------
- Provide safe, consistent pagination parsing from query parameters.
- Offer common helpers for parsing booleans and sorting directives.

Functions
---------
get_pagination(default_page: int = 1, default_per_page: int = 50, max_per_page: int = 200) -> tuple[int, int]
    Read `page` and `per_page` from the current request's query string with sane bounds.

parse_bool_arg(name: str, default: bool = False) -> bool
    Interpret a boolean query parameter by common truthy/falsey forms.

apply_sorting(query, model, param: str = "sort", default: str | None = None, allowed: set[str] | None = None)
    Apply ORDER BY to a SQLAlchemy query using a comma-separated `sort` string.
    Supports `field` (ASC) and `-field` (DESC). Optionally restrict to an allowed set.

Usage
-----
Within a Resource method, do:

    from .utils import get_pagination, parse_bool_arg, apply_sorting

    page, per_page = get_pagination()
    q = Model.query
    q = apply_sorting(q, Model, default="-id", allowed={"id","name","created_at"})
    rows = q.paginate(page=page, per_page=per_page, error_out=False).items
"""

from __future__ import annotations

from typing import Iterable, Tuple, Set, Optional

from flask import request
from sqlalchemy.orm import Query
from sqlalchemy import desc


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


def parse_bool_arg(name: str, default: bool = False) -> bool:
    """
    Parse a boolean query argument by common string conventions.

    Parameters
    ----------
    name : str
        The query param name to read from `request.args`.
    default : bool
        Value returned if the parameter is absent.

    Returns
    -------
    bool
        True for {"1","true","yes","on"}, False for {"0","false","no","off"}; otherwise `default`.
    """
    raw = request.args.get(name)
    if raw is None:
        return default
    val = raw.strip().lower()
    if val in {"1", "true", "yes", "on"}:
        return True
    if val in {"0", "false", "no", "off"}:
        return False
    return default


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