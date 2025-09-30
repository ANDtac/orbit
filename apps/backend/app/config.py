"""
app/config.py
-------------
Environment-specific configuration for the Orbit backend.

Responsibilities
----------------
- Provide a BaseConfig with sane defaults for the API.
- Derive Dev/Stage/Prod configs from environment variables.
- Select the appropriate config at runtime via `select_config()`.

Environment Variables
---------------------
APP_ENV : str
    "development" | "staging" | "production". Defaults to "development".
DATABASE_URL : str
    SQLAlchemy connection string. In dev, defaults to SQLite file.
JWT_SECRET_KEY : str
    Secret used to sign JWTs.
JWT_ACCESS_TOKEN_EXPIRES : int
    Access token lifetime in seconds. Default 1800 (30m).
JWT_REFRESH_TOKEN_EXPIRES : int
    Refresh token lifetime in seconds. Default 1209600 (14d).
RESTX_MASK_SWAGGER : bool
    Whether Flask-RESTX masks fields in Swagger (default False).
ERROR_404_HELP : bool
    Whether Flask-RESTX suggests alternatives for 404s (default False).

Notes
-----
- Dev uses SQLite by default: "sqlite:///dev.sqlite3".
- Stage/Prod expect DATABASE_URL to be provided (e.g. Postgres).
"""

from __future__ import annotations

import os
from datetime import timedelta
from typing import Type


def _bool_env(name: str, default: bool) -> bool:
    """
    Read a boolean environment variable.

    Parameters
    ----------
    name : str
        Environment variable name.
    default : bool
        Default value if variable is not present.

    Returns
    -------
    bool
        Parsed boolean value.
    """
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.lower() in {"1", "true", "yes", "on"}


def _int_env(name: str, default: int) -> int:
    """
    Read an integer environment variable.

    Parameters
    ----------
    name : str
        Environment variable name.
    default : int
        Default value if variable is not present or invalid.

    Returns
    -------
    int
        Parsed integer value.
    """
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


class BaseConfig:
    """
    BaseConfig
    ----------
    Common settings shared by all environments.

    Attributes
    ----------
    SQLALCHEMY_DATABASE_URI : str
        Database connection string (set by subclasses or env).
    SQLALCHEMY_TRACK_MODIFICATIONS : bool
        Disable the SQLAlchemy event system overhead.
    PROPAGATE_EXCEPTIONS : bool
        Bubble exceptions so our global error handler can format them.
    RESTX_MASK_SWAGGER : bool
        Disable field masking in Swagger for clarity.
    ERROR_404_HELP : bool
        Disable RESTX's 404 hinting noise.

    JWT_SECRET_KEY : str
        Key used to sign JWTs.
    JWT_ACCESS_TOKEN_EXPIRES : timedelta
        Access token lifetime.
    JWT_REFRESH_TOKEN_EXPIRES : timedelta
        Refresh token lifetime.
    """

    # SQLAlchemy
    SQLALCHEMY_DATABASE_URI: str = ""
    SQLALCHEMY_TRACK_MODIFICATIONS: bool = False

    # Flask / RESTX behavior
    PROPAGATE_EXCEPTIONS: bool = True
    RESTX_MASK_SWAGGER: bool = _bool_env("RESTX_MASK_SWAGGER", False)
    ERROR_404_HELP: bool = _bool_env("ERROR_404_HELP", False)

    # JWT
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "dev-secret-change-me")
    JWT_ACCESS_TOKEN_EXPIRES: timedelta = timedelta(
        seconds=_int_env("JWT_ACCESS_TOKEN_EXPIRES", 30 * 60)
    )
    JWT_REFRESH_TOKEN_EXPIRES: timedelta = timedelta(
        seconds=_int_env("JWT_REFRESH_TOKEN_EXPIRES", 14 * 24 * 60 * 60)
    )


class DevConfig(BaseConfig):
    """
    DevConfig
    ---------
    Development configuration.

    Defaults to SQLite for local development unless DATABASE_URL is supplied.

    Attributes
    ----------
    DEBUG : bool
        Enable Flask debug features.
    SQLALCHEMY_DATABASE_URI : str
        SQLite file by default (./dev.sqlite3).
    """

    DEBUG: bool = True
    SQLALCHEMY_DATABASE_URI: str = os.getenv("DATABASE_URL", "sqlite:///dev.sqlite3")


class StageConfig(BaseConfig):
    """
    StageConfig
    -----------
    Staging configuration.

    Expects a real DATABASE_URL (e.g., Postgres).
    """

    DEBUG: bool = False
    SQLALCHEMY_DATABASE_URI: str = os.getenv("DATABASE_URL", "")


class ProdConfig(BaseConfig):
    """
    ProdConfig
    ----------
    Production configuration.

    Expects a real DATABASE_URL (e.g., Postgres).
    """

    DEBUG: bool = False
    SQLALCHEMY_DATABASE_URI: str = os.getenv("DATABASE_URL", "")


def select_config() -> Type[BaseConfig]:
    """
    Select the appropriate configuration class based on APP_ENV.

    Returns
    -------
    Type[BaseConfig]
        A subclass of BaseConfig (DevConfig, StageConfig, or ProdConfig).
    """
    env = os.getenv("APP_ENV", "development").strip().lower()
    if env in ("prod", "production"):
        return ProdConfig
    if env in ("stage", "staging"):
        return StageConfig
    return DevConfig