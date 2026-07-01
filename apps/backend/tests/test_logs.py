"""
apps/backend/tests/test_logs.py
-------------------------------
Tests for server-side date-range filtering (`from`/`to`) on the System Logs
list endpoints: /logs/requests, /logs/errors, /logs/events.

Rows are seeded across several timestamps and the endpoints are queried with
`from`/`to` (date-only, matching the System Logs UI date pickers) to assert
that only in-range rows are returned. Missing/malformed dates apply no filter.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.extensions import db
from app.models import AppEvents, ErrorLogs, RequestLogs


def _dt(year: int, month: int, day: int, hour: int = 12) -> datetime:
    return datetime(year, month, day, hour, 0, 0, tzinfo=timezone.utc)


@pytest.fixture()
def seeded_request_logs(db):
    rows = [
        RequestLogs(
            correlation_id=f"corr-{i}",
            method="GET",
            path=f"/api/v1/thing/{i}",
            status_code=200,
            occurred_at=ts,
        )
        for i, ts in enumerate(
            [_dt(2026, 1, 10), _dt(2026, 2, 15), _dt(2026, 3, 20)]
        )
    ]
    db.session.add_all(rows)
    db.session.commit()
    return rows


@pytest.fixture()
def seeded_error_logs(db):
    rows = [
        ErrorLogs(
            correlation_id=f"err-{i}",
            level="ERROR",
            message=f"boom {i}",
            occurred_at=ts,
        )
        for i, ts in enumerate(
            [_dt(2026, 1, 10), _dt(2026, 2, 15), _dt(2026, 3, 20)]
        )
    ]
    db.session.add_all(rows)
    db.session.commit()
    return rows


@pytest.fixture()
def seeded_app_events(db):
    rows = [
        AppEvents(
            event=f"thing.happened.{i}",
            level="INFO",
            message=f"event {i}",
            occurred_at=ts,
        )
        for i, ts in enumerate(
            [_dt(2026, 1, 10), _dt(2026, 2, 15), _dt(2026, 3, 20)]
        )
    ]
    db.session.add_all(rows)
    db.session.commit()
    return rows


# ---------------------------------------------------------------------------
# /logs/requests
# ---------------------------------------------------------------------------
def test_request_logs_from_filters_lower_bound(client, auth_headers, seeded_request_logs):
    headers = auth_headers("logs-req-from", "pw")
    # `to` bounds out the login request auto-recorded by the logging middleware.
    resp = client.get("/api/v1/logs/requests?from=2026-02-01&to=2026-06-30", headers=headers)
    assert resp.status_code == 200
    ids = {row["id"] for row in resp.get_json()}
    assert ids == {seeded_request_logs[1].id, seeded_request_logs[2].id}


def test_request_logs_to_is_inclusive_whole_day(client, auth_headers, seeded_request_logs):
    headers = auth_headers("logs-req-to", "pw")
    # 2026-02-15 row is at 12:00; a date-only `to` must include the whole day.
    resp = client.get("/api/v1/logs/requests?to=2026-02-15", headers=headers)
    assert resp.status_code == 200
    ids = {row["id"] for row in resp.get_json()}
    assert ids == {seeded_request_logs[0].id, seeded_request_logs[1].id}


def test_request_logs_from_to_range(client, auth_headers, seeded_request_logs):
    headers = auth_headers("logs-req-range", "pw")
    resp = client.get(
        "/api/v1/logs/requests?from=2026-02-01&to=2026-02-28", headers=headers
    )
    assert resp.status_code == 200
    ids = [row["id"] for row in resp.get_json()]
    assert ids == [seeded_request_logs[1].id]


def test_request_logs_malformed_date_is_ignored(client, auth_headers, seeded_request_logs):
    headers = auth_headers("logs-req-bad", "pw")
    resp = client.get("/api/v1/logs/requests?from=not-a-date", headers=headers)
    assert resp.status_code == 200
    # Malformed date applies no filter: all seeded rows are returned (the login
    # request auto-recorded by the middleware may also appear).
    ids = {row["id"] for row in resp.get_json()}
    assert {row.id for row in seeded_request_logs}.issubset(ids)


# ---------------------------------------------------------------------------
# /logs/errors
# ---------------------------------------------------------------------------
def test_error_logs_from_to_range(client, auth_headers, seeded_error_logs):
    headers = auth_headers("logs-err-range", "pw")
    resp = client.get(
        "/api/v1/logs/errors?from=2026-02-01&to=2026-02-28", headers=headers
    )
    assert resp.status_code == 200
    ids = [row["id"] for row in resp.get_json()]
    assert ids == [seeded_error_logs[1].id]


def test_error_logs_to_inclusive_whole_day(client, auth_headers, seeded_error_logs):
    headers = auth_headers("logs-err-to", "pw")
    resp = client.get("/api/v1/logs/errors?to=2026-02-15", headers=headers)
    assert resp.status_code == 200
    ids = {row["id"] for row in resp.get_json()}
    assert ids == {seeded_error_logs[0].id, seeded_error_logs[1].id}


# ---------------------------------------------------------------------------
# /logs/events
# ---------------------------------------------------------------------------
def test_app_events_from_to_range(client, auth_headers, seeded_app_events):
    headers = auth_headers("logs-evt-range", "pw")
    resp = client.get(
        "/api/v1/logs/events?from=2026-02-01&to=2026-02-28", headers=headers
    )
    assert resp.status_code == 200
    ids = [row["id"] for row in resp.get_json()]
    assert ids == [seeded_app_events[1].id]


def test_app_events_no_date_params_returns_all(client, auth_headers, seeded_app_events):
    headers = auth_headers("logs-evt-all", "pw")
    resp = client.get("/api/v1/logs/events", headers=headers)
    assert resp.status_code == 200
    assert len(resp.get_json()) == 3
