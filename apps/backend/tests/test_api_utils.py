"""Unit tests for shared API utilities."""

from __future__ import annotations

import pytest

from app.api.v1 import utils


@pytest.mark.parametrize(
    "value,expected",
    [
        ("true", True),
        ("FALSE", False),
        ("   yes   ", True),
        ("0", False),
        (None, None),
        ("maybe", None),
    ],
)
def test_interpret_bool_variants(value, expected):
    assert utils.interpret_bool(value, None) is expected


def test_get_filter_args_prefers_filter_prefix(app):
    with app.test_request_context(
        "/api/v1/devices?filter[name]=core&filter[platform_id]=10&mgmt_ipv4=1.1.1.1"
    ):
        result = utils.get_filter_args(
            {"name", "platform_id", "mgmt_ipv4"},
            legacy={"mgmt_ipv4": "mgmt_ipv4"},
        )
        assert result == {
            "name": "core",
            "platform_id": "10",
            "mgmt_ipv4": "1.1.1.1",
        }


def test_problem_response_shape(app):
    with app.test_request_context("/api/v1/devices/1"):
        resp = utils.problem_response(404, title="Not Found", detail="missing")
    assert resp.status_code == 404
    assert resp.headers["Content-Type"] == "application/problem+json"
    payload = resp.get_json()
    assert payload["status"] == 404
    assert payload["title"] == "Not Found"
    assert payload["detail"] == "missing"
