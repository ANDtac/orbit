"""Composition root for the shared devices namespace."""

from __future__ import annotations

from . import device_health as _device_health  # noqa: F401
from . import device_jobs as _device_jobs  # noqa: F401
from . import device_snapshots as _device_snapshots  # noqa: F401
from . import device_tags as _device_tags  # noqa: F401
from . import devices_core as _devices_core  # noqa: F401
from .devices_shared import ns

__all__ = ["ns"]
