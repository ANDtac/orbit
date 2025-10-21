"""API package exports for versioned blueprints."""

from __future__ import annotations

from .v1 import api_bp as api_bp, api as api_v1

__all__ = ["api_bp", "api_v1"]
