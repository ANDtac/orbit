"""
apps/backend/manage.py
----------------------
Lightweight command-line utilities for the Orbit Flask API.

Responsibilities
----------------
- Provide convenient CLI commands for common developer/ops tasks:
  * create-db      : Create all tables (idempotent; uses SQLAlchemy metadata).
  * drop-db        : Drop all tables (DANGER).
  * reset-db       : Drop then create all tables (DANGER).
  * list-routes    : Print registered routes for quick inspection.
  * seed-dev       : Insert minimal dev seed data (safe to run multiple times).
  * shell          : Start an interactive shell with app context and handy imports.

Usage
-----
These commands are wrappers around Flask's app factory and extensions.
Run them inside the backend container or a properly configured venv:

    python -m apps.backend.manage create-db
    python -m apps.backend.manage list-routes
    python -m apps.backend.manage seed-dev

Environment
-----------
- Configuration is selected by APP_ENV (see app/config.py).
- DATABASE_URL / JWT_SECRET_KEY and other env vars should be set accordingly.

Notes
-----
- For schema migrations, use Flask-Migrate via `flask db <cmd>` inside the
  container (Alembic). This file focuses on ergonomic shortcuts.
"""

from __future__ import annotations

import code
import os
import sys
from pathlib import Path
from typing import Any, Iterable

import click
from sqlalchemy.engine.url import make_url

# Ensure package-relative imports resolve when invoked as a module
# (python -m apps.backend.manage ...)
from app import create_app
from app.extensions import db
from app.models import (
    Users,
    JWTTokenBlocklist,
    Platforms,
    Devices,
    InventoryGroups,
    CredentialProfiles,
    PlatformOperationTemplates,
    IPAddresses,
    Interfaces,
    DeviceConfigSnapshots,
    CompliancePolicies,
    ComplianceRules,
    ComplianceResults,
    RequestLogs,
    ErrorLogs,
    AppEvents,
    HardwareLifecycle,
    SoftwareLifecycle,
)

# ---------------------------------------------------------------------------
# CLI Group
# ---------------------------------------------------------------------------
@click.group(help="Orbit backend management commands")
def cli():
    """Root CLI group."""


def _get_app():
    """
    Build the Flask app using the application factory.

    Returns
    -------
    flask.Flask
        Configured application instance.
    """
    # Allow overriding APP_ENV on a per-command basis, e.g.:
    # APP_ENV=development python -m apps.backend.manage create-db
    return create_app()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _echo(msg: str):
    click.echo(msg, color=True)


def _confirm_danger(action: str) -> bool:
    return click.confirm(f"About to {action}. Are you sure?", default=False)


def _ensure_dev_sqlite_db(app) -> tuple[Path | None, bool]:
    """Ensure the development SQLite database file exists."""

    env = os.getenv("APP_ENV", "development").strip().lower()
    if env not in {"dev", "development"}:
        return None, False

    uri = str(app.config.get("SQLALCHEMY_DATABASE_URI") or "").strip()
    if not uri:
        return None, False

    try:
        url = make_url(uri)
    except Exception:
        return None, False

    if url.drivername != "sqlite":
        return None, False

    database = (url.database or "").strip()
    if not database or database == ":memory:":
        return None, False

    path = Path(database).expanduser()
    if not path.is_absolute():
        path = Path.cwd() / path

    if path.parent and not path.parent.exists():
        path.parent.mkdir(parents=True, exist_ok=True)

    created = False
    if not path.exists():
        path.touch()
        created = True

    return path, created


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------
@cli.command("create-db", help="Create all tables (idempotent).")
def create_db():
    """
    Create database tables from SQLAlchemy metadata.

    Behavior
    --------
    - Executes `db.create_all()` inside an app context.
    - Safe to re-run; it will not drop existing tables.
    """
    app = _get_app()
    with app.app_context():
        db_path, created = _ensure_dev_sqlite_db(app)
        db.create_all()
        if db_path:
            status = "created" if created else "already exists"
            _echo(f"✅ Tables ready (SQLite file {status} at {db_path}).")
        else:
            _echo("✅ Tables created (or already exist).")


@cli.command("drop-db", help="Drop all tables (DANGER).")
def drop_db():
    """
    Drop all database tables.

    Behavior
    --------
    - Executes `db.drop_all()` inside an app context.
    - Use with caution; this is destructive.
    """
    if not _confirm_danger("DROP ALL TABLES"):
        _echo("❎ Aborted.")
        return
    app = _get_app()
    with app.app_context():
        db.drop_all()
        _echo("🗑️  All tables dropped.")


@cli.command("reset-db", help="Drop and create all tables (DANGER).")
def reset_db():
    """
    Reset the database by dropping and recreating all tables.

    Behavior
    --------
    - Equivalent to `drop-db` followed by `create-db`.
    """
    if not _confirm_danger("RESET the database (drop + create)"):
        _echo("❎ Aborted.")
        return
    app = _get_app()
    with app.app_context():
        db.drop_all()
        db.create_all()
        _echo("🔁 Database reset complete.")


@cli.command("list-routes", help="Print all registered routes.")
def list_routes():
    """
    Print all registered HTTP routes.

    Output Columns
    --------------
    METHOD(S) | PATH | ENDPOINT
    """
    app = _get_app()
    with app.app_context():
        rows: list[tuple[str, str, str]] = []
        for rule in sorted(app.url_map.iter_rules(), key=lambda r: r.rule):
            methods = ",".join(sorted(m for m in rule.methods or [] if m not in {"HEAD", "OPTIONS"}))
            rows.append((methods, rule.rule, rule.endpoint))
        width_m = max((len(r[0]) for r in rows), default=6)
        width_p = max((len(r[1]) for r in rows), default=4)
        _echo(f"{'METHODS'.ljust(width_m)}  {'PATH'.ljust(width_p)}  ENDPOINT")
        _echo("-" * (width_m + width_p + 11))
        for methods, path, endpoint in rows:
            click.echo(f"{methods.ljust(width_m)}  {path.ljust(width_p)}  {endpoint}")


@cli.command("seed-dev", help="Insert minimal development seed data.")
def seed_dev():
    """
    Insert a small set of development fixtures.

    Behavior
    --------
    - Creates a default user (admin/admin) if not present.
    - Adds common platforms aligned with NAPALM where sensible.
    - Creates a demo inventory group and a sample device (inactive).
    - Safe to re-run (upserts).
    """
    app = _get_app()
    with app.app_context():
        # Users (admin)
        user = Users.query.filter_by(username="admin").first()
        if not user:
            user = Users(username="admin", email="admin@local", is_active=True)
            # Ensure your Users model implements set_password
            if hasattr(user, "set_password"):
                user.set_password("admin")
            db.session.add(user)

        # Platforms (partial list)
        platform_rows = {
            "cisco_ios": {"display_name": "Cisco IOS", "napalm_driver": "ios"},
            "cisco_xe": {"display_name": "Cisco IOS-XE", "napalm_driver": "ios"},
            "cisco_nxos": {"display_name": "Cisco NX-OS", "napalm_driver": "nxos"},
            "cisco_xr": {"display_name": "Cisco IOS-XR", "napalm_driver": "iosxr"},
            "juniper_junos": {"display_name": "Juniper Junos", "napalm_driver": "junos"},
            "f5": {"display_name": "F5 TMOS", "napalm_driver": "f5"},
        }
        for slug, meta in platform_rows.items():
            row = Platforms.query.filter_by(slug=slug).first()
            if not row:
                db.session.add(Platforms(slug=slug, **meta))

        # Inventory group
        group = InventoryGroups.query.filter_by(name="Default").first()
        if not group:
            group = InventoryGroups(name="Default", description="Default group", is_active=True)
            db.session.add(group)

        db.session.commit()

        # Sample device (inactive)
        p_iosxe = Platforms.query.filter_by(slug="cisco_xe").first()
        dev = Devices.query.filter_by(name="sample-switch").first()
        if not dev:
            dev = Devices(
                name="sample-switch",
                fqdn="sample-switch.local",
                mgmt_ipv4="10.0.0.10",
                mgmt_port=22,
                platform_id=p_iosxe.id if p_iosxe else None,
                is_active=False,
                notes="Seed device for local development",
            )
            db.session.add(dev)
            db.session.commit()
            if group:
                try:
                    dev.inventory_group_id = group.id
                    db.session.commit()
                except ValueError:
                    db.session.rollback()
        else:
            db.session.commit()
        _echo("🌱 Seed data ensured (admin/admin, platforms, Default group, sample device).")


@cli.command("shell", help="Interactive shell with app context.")
def shell_cmd():
    """
    Start an interactive Python shell preloaded with app, db, and models.

    You can explore/query quickly:

        >>> Users.query.all()
        >>> Devices.query.count()
    """
    app = _get_app()
    banner = "Orbit Shell (app, db, models preloaded). Use Ctrl-D to exit."
    ctx: dict[str, Any] = {
        "app": app,
        "db": db,
        "Users": Users,
        "JWTTokenBlocklist": JWTTokenBlocklist,
        "Platforms": Platforms,
        "Devices": Devices,
        "InventoryGroups": InventoryGroups,
        "CredentialProfiles": CredentialProfiles,
        "PlatformOperationTemplates": PlatformOperationTemplates,
        "IPAddresses": IPAddresses,
        "Interfaces": Interfaces,
        "DeviceConfigSnapshots": DeviceConfigSnapshots,
        "CompliancePolicies": CompliancePolicies,
        "ComplianceRules": ComplianceRules,
        "ComplianceResults": ComplianceResults,
        "RequestLogs": RequestLogs,
        "ErrorLogs": ErrorLogs,
        "AppEvents": AppEvents,
        "HardwareLifecycle": HardwareLifecycle,
        "SoftwareLifecycle": SoftwareLifecycle,
    }
    with app.app_context():
        code.interact(banner=banner, local=ctx)


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    # Delegate to Click
    cli()