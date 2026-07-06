"""SQLAlchemy models package for the Orbit backend."""

from __future__ import annotations

from typing import Iterable

from . import automation as _automation
from . import automation_step as _automation_step
from . import schedule as _schedule
from . import compliance as _compliance
from . import monitor as _monitor
from . import dashboard as _dashboard
from . import devices as _devices
from . import inventory as _inventory
from . import lifecycle as _lifecycle
from . import logs as _logs
from . import operations as _operations
from . import tasks as _tasks
from . import users as _users
from .base import Base, BaseModel, SessionContext, get_session, session_scope
from .automation import *  # noqa: F401,F403
from .automation_step import *  # noqa: F401,F403
from .schedule import *  # noqa: F401,F403
from .compliance import *  # noqa: F401,F403
from .monitor import *  # noqa: F401,F403
from .dashboard import *  # noqa: F401,F403
from .devices import *  # noqa: F401,F403
from .inventory import *  # noqa: F401,F403
from .lifecycle import *  # noqa: F401,F403
from .logs import *  # noqa: F401,F403
from .operations import *  # noqa: F401,F403
from .tasks import *  # noqa: F401,F403
from .users import *  # noqa: F401,F403


def _collect_exports(modules: Iterable[object]) -> list[str]:
    exports: list[str] = []
    for module in modules:
        module_exports = getattr(module, "__all__", ())
        exports.extend(module_exports)
    return exports


_BASE_EXPORTS = [
    "Base",
    "BaseModel",
    "SessionContext",
    "get_session",
    "session_scope",
]

_BASE_EXPORTS.extend(
    _collect_exports(
        (
            _automation,
            _automation_step,
            _schedule,
            _compliance,
            _monitor,
            _dashboard,
            _devices,
            _inventory,
            _lifecycle,
            _logs,
            _operations,
            _tasks,
            _users,
        )
    )
)

__all__ = tuple(_BASE_EXPORTS)
