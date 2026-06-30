"""
apps/backend/tests/conftest.py
------------------------------
Pytest fixtures and utilities for the Orbit backend test suite.

Responsibilities
----------------
- Build an application instance configured for testing (in-memory SQLite).
- Create and tear down the database schema for each test function.
- Provide convenient fixtures for HTTP client, CLI runner, and auth tokens.
- Offer small factory helpers for common models (Users, Platforms, Devices).

Usage
-----
Import fixtures directly in your tests:

    def test_healthcheck(client):
        resp = client.get("/docs")
        assert resp.status_code == 200

    def test_auth_flow(client, create_user, auth_headers):
        user = create_user("alice", "p@ssw0rd")
        hdrs = auth_headers("alice", "p@ssw0rd")
        resp = client.get("/api/v1/devices", headers=hdrs)
        assert resp.status_code == 200
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from typing import Callable

import pytest
from flask.testing import FlaskClient
from flask import Flask
from flask_sqlalchemy import SQLAlchemy

from app import create_app
from app.extensions import db as _db
from app.models import (
    Users,
    Platforms,
    Devices,
    CredentialProfiles,
    CompliancePolicies,
    InventoryGroups,
    Jobs,
    PlatformOperationTemplates,
)

# -----------------------------------------------------------------------------
# Test application configuration
# -----------------------------------------------------------------------------
class TestConfig:
    """
    TestConfig
    ----------
    Minimal configuration for tests using an in-memory SQLite database.

    Attributes
    ----------
    TESTING : bool
        Enable Flask testing mode.
    SQLALCHEMY_DATABASE_URI : str
        In-memory SQLite database for isolation and speed.
    SQLALCHEMY_TRACK_MODIFICATIONS : bool
        Disable event system overhead.
    JWT_SECRET_KEY : str
        Static secret for reproducible JWTs in tests.
    PROPAGATE_EXCEPTIONS : bool
        Allow exceptions to surface to pytest for clear failures.
    RESTX_MASK_SWAGGER : bool
        Simplify Swagger output during tests.
    """

    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_SECRET_KEY = "test-secret"
    PROPAGATE_EXCEPTIONS = True
    RESTX_MASK_SWAGGER = False
    CORS_ORIGINS = ["http://localhost:5173"]
    CORS_ALLOW_CREDENTIALS = True
    CORS_ALLOW_HEADERS = ["Authorization", "Content-Type", "X-Request-ID"]
    CORS_ALLOW_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    CORS_EXPOSE_HEADERS = ["X-Request-ID"]


# -----------------------------------------------------------------------------
# App / DB fixtures
# -----------------------------------------------------------------------------
@pytest.fixture(scope="function")
def app() -> Iterator[Flask]:
    """
    Create a Flask app instance for a single test function.

    Returns
    -------
    flask.Flask
        An application configured with `TestConfig`.
    """
    # Ensure any env toggles do not leak into tests
    os.environ["APP_ENV"] = "test"

    app = create_app(TestConfig)  # type: ignore[arg-type]
    ctx = app.app_context()
    ctx.push()
    try:
        yield app
    finally:
        ctx.pop()


@pytest.fixture(scope="function")
def db(app: Flask) -> Iterator[SQLAlchemy]:
    """
    Provide a fresh database schema for each test function.

    Parameters
    ----------
    app : flask.Flask
        Test app fixture.

    Yields
    ------
    SQLAlchemy
        The initialized SQLAlchemy instance bound to the app.
    """
    _db.create_all()
    try:
        yield _db
    finally:
        _db.session.remove()
        _db.drop_all()


@pytest.fixture(scope="function")
def client(app: Flask, db: SQLAlchemy) -> FlaskClient:
    """
    HTTP test client bound to the application.

    Parameters
    ----------
    app : flask.Flask
        Test app fixture.
    db : SQLAlchemy
        Ensures DB is created before using the client.

    Returns
    -------
    flask.testing.FlaskClient
    """
    _ = db
    return app.test_client()


@pytest.fixture(scope="function")
def runner(app: Flask):
    """
    Click CLI runner for invoking manage.py-like commands.

    Parameters
    ----------
    app : flask.Flask

    Returns
    -------
    flask.testing.FlaskCliRunner
    """
    return app.test_cli_runner()


# -----------------------------------------------------------------------------
# Model factories
# -----------------------------------------------------------------------------
@pytest.fixture(scope="function")
def auth_passwords(app: Flask):
    """Configure in-memory accepted passwords for Netmiko-backed auth during tests."""

    allowed: set[str] = set()

    def tester(_: str, password: str) -> tuple[bool, str | None]:
        return (True, None) if password in allowed else (False, "invalid credentials")

    app.config["AUTH_CREDENTIAL_TESTER"] = tester
    yield allowed
    app.config.pop("AUTH_CREDENTIAL_TESTER", None)


@pytest.fixture(scope="function")
def create_user(db) -> Callable[[str, str | None, bool, list[str] | None], Users]:
    """
    Factory: create and persist a `Users` row.

    Parameters
    ----------
    db : SQLAlchemy

    Returns
    -------
    Callable[[str, str | None, bool], Users]
        Function that accepts (username, optional password placeholder, is_active=True).
    """

    def _factory(
        username: str,
        _password: str | None = None,
        is_active: bool = True,
        roles: list[str] | None = None,
    ) -> Users:
        u = Users(
            username=username,
            email=f"{username}@local",
            roles=roles or ["network_admin"],
        )
        if not is_active:
            u.is_active = False
        _db.session.add(u)
        _db.session.commit()
        return u

    return _factory


@pytest.fixture(scope="function")
def create_platform(db) -> Callable[[str, str], Platforms]:
    """
    Factory: create and persist a `Platforms` row.

    Returns
    -------
    Callable[[str, str], Platforms]
        Function that accepts (slug, napalm_driver) and returns the saved row.
    """

    def _factory(slug: str, napalm_driver: str = "ios") -> Platforms:
        existing = Platforms.query.filter_by(slug=slug).first()
        if existing:
            return existing
        p = Platforms(
            slug=slug,
            display_name=slug.replace("_", " ").title(),
            napalm_driver=napalm_driver,
        )
        _db.session.add(p)
        _db.session.commit()
        return p

    return _factory


@pytest.fixture(scope="function")
def create_credential_profile(db: SQLAlchemy) -> Callable[[str, str, str], CredentialProfiles]:
    """Factory: create and persist a credential profile."""

    def _factory(
        name: str = "default-credentials",
        username: str = "admin",
        auth_type: str = "username_password",
    ) -> CredentialProfiles:
        existing = CredentialProfiles.query.filter_by(name=name).first()
        if existing:
            return existing
        _ = db
        profile = CredentialProfiles(name=name, username=username, auth_type=auth_type)
        _db.session.add(profile)
        _db.session.commit()
        return profile

    return _factory


@pytest.fixture(scope="function")
def create_operation_template(
    db: SQLAlchemy,
    create_platform,
) -> Callable[..., PlatformOperationTemplates]:
    """Factory: create and persist a platform operation template."""

    def _factory(
        platform_id: int | None = None,
        name: str = "Backup Config",
        op_type: str = "backup",
        template_text: str = "show running-config",
    ) -> PlatformOperationTemplates:
        platform = create_platform("cisco_xe", "ios")
        template = PlatformOperationTemplates(
            platform_id=platform_id or platform.id,
            name=name,
            op_type=op_type,
            template=template_text,
        )
        _ = db
        _db.session.add(template)
        _db.session.commit()
        return template

    return _factory


@pytest.fixture(scope="function")
def create_compliance_policy(db: SQLAlchemy) -> Callable[[str, dict | None], CompliancePolicies]:
    """Factory: create and persist a compliance policy."""

    def _factory(name: str = "Baseline Policy", rules: dict | None = None) -> CompliancePolicies:
        existing = CompliancePolicies.query.filter_by(name=name).first()
        if existing:
            return existing
        policy = CompliancePolicies(name=name, rules=rules or {}, scope={})
        _ = db
        _db.session.add(policy)
        _db.session.commit()
        return policy

    return _factory


@pytest.fixture(scope="function")
def create_job(db: SQLAlchemy) -> Callable[[str, str, int | None], Jobs]:
    """Factory: create and persist a job."""

    def _factory(
        job_type: str = "test.job",
        status: str = "queued",
        owner_id: int | None = None,
    ) -> Jobs:
        job = Jobs(job_type=job_type, status=status, owner_id=owner_id, parameters={})
        _ = db
        _db.session.add(job)
        _db.session.commit()
        return job

    return _factory


@pytest.fixture(scope="function")
def create_inventory_group(db: SQLAlchemy) -> Callable[[str], InventoryGroups]:
    """
    Factory: create and persist an `InventoryGroups` row.

    Returns
    -------
    Callable[[str], InventoryGroups]
        Function that accepts (name) and returns the saved row.
    """

    def _factory(name: str = "Default") -> InventoryGroups:
        existing = InventoryGroups.query.filter_by(name=name).first()
        if existing:
            return existing
        _ = db
        g = InventoryGroups(name=name)
        _db.session.add(g)
        _db.session.commit()
        return g

    return _factory


@pytest.fixture(scope="function")
def create_device(
    db: SQLAlchemy,
    create_platform,
    create_inventory_group,
    create_credential_profile,
) -> Callable[..., Devices]:
    """
    Factory: create and persist a `Devices` row.

    Returns
    -------
    Callable[..., Devices]
        Accepts keyword args to override defaults.
    """

    def _factory(**overrides) -> Devices:
        platform = overrides.pop("platform", None) or create_platform("cisco_xe", "ios")
        group = overrides.pop("group", None) or create_inventory_group("Default")
        credential_profile = overrides.pop("credential_profile", None) or create_credential_profile()
        inventory_group_id = overrides.pop("inventory_group_id", group.id)
        is_active = overrides.pop("is_active", True)
        d = Devices(
            name=overrides.pop("name", "dev-1"),
            fqdn=overrides.pop("fqdn", "dev-1.local"),
            mgmt_ipv4=overrides.pop("mgmt_ipv4", "10.0.0.10"),
            mgmt_port=overrides.pop("mgmt_port", 22),
            platform_id=overrides.pop("platform_id", platform.id),
            credential_profile_id=overrides.pop("credential_profile_id", credential_profile.id),
            os_name=overrides.pop("os_name", "iosxe"),
            os_version=overrides.pop("os_version", "17.3.1"),
            **overrides,
        )
        if not is_active:
            d.is_active = False
        _ = db
        _db.session.add(d)
        _db.session.commit()
        if inventory_group_id:
            try:
                d.inventory_group_id = inventory_group_id
                _db.session.commit()
            except ValueError:
                _db.session.rollback()
        return d

    return _factory


# -----------------------------------------------------------------------------
# Auth helpers
# -----------------------------------------------------------------------------
@pytest.fixture(scope="function")
def auth_tokens(
    client: FlaskClient, create_user, auth_passwords
) -> Callable[[str, str], tuple[str, str]]:
    """
    Helper: obtain (access_token, refresh_token) for a username/password.

    Parameters
    ----------
    client : FlaskClient
    create_user : factory

    Returns
    -------
    Callable[[str, str], tuple[str, str]]
        Function that logs in the given user and returns tokens.
    """

    def _login(username: str = "admin", password: str = "admin") -> tuple[str, str]:
        # Ensure user exists
        auth_passwords.add(password)
        create_user(username, password)
        resp = client.post("/api/v1/auth/login", json={"username": username, "password": password})
        assert resp.status_code == 200, f"login failed: {resp.status_code} {resp.data}"
        data = resp.get_json() or {}
        return data["access_token"], data["refresh_token"]

    return _login


@pytest.fixture(scope="function")
def auth_headers(auth_tokens) -> Callable[[str, str], dict[str, str]]:
    """
    Helper: return Authorization header dictionary for test requests.

    Parameters
    ----------
    auth_tokens : fixture

    Returns
    -------
    Callable[[str, str], dict[str, str]]
        Function that yields {"Authorization": "Bearer <access>"} for the user.
    """

    def _hdrs(username: str = "admin", password: str = "admin") -> dict[str, str]:
        access, _ = auth_tokens(username, password)
        return {"Authorization": f"Bearer {access}"}

    return _hdrs
