"""
app/extensions.py
-----------------
Flask extension singletons used across the Orbit backend.

Responsibilities
----------------
- Provide a single import point for common extensions:
  - SQLAlchemy (ORM & session management)
  - Flask-Migrate (Alembic migrations)
  - Flask-JWT-Extended (JWT auth)
- Define an Alembic-friendly naming convention for SQLAlchemy constraints.

Usage
-----
Import these singletons where needed (do NOT instantiate new ones):

    from .extensions import db, migrate, jwt

They are initialized in the application factory (`app/__init__.py`) via:

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
"""

from __future__ import annotations

from typing import Final

from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from sqlalchemy import MetaData

# ---------------------------------------------------------------------------
# SQLAlchemy naming convention
# ---------------------------------------------------------------------------
# This ensures stable, predictable names for constraints and indexes, which
# makes Alembic autogeneration and cross-DB compatibility more robust.
NAMING_CONVENTION: Final[dict[str, str]] = {
    "ix": "ix_%(table_name)s_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

_metadata = MetaData(naming_convention=NAMING_CONVENTION)

#: Global SQLAlchemy instance (initialized in the app factory).
db: SQLAlchemy = SQLAlchemy(metadata=_metadata)

#: Global Flask-Migrate instance (initialized in the app factory).
migrate: Migrate = Migrate()

#: Global JWTManager instance (initialized in the app factory).
jwt: JWTManager = JWTManager()