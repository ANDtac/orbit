"""SQLAlchemy models package for the Orbit backend."""

from __future__ import annotations

from .base import Base, BaseModel, SessionContext, get_session, session_scope
from .compliance import *  # noqa: F401,F403
from .devices import *  # noqa: F401,F403
from .inventory import *  # noqa: F401,F403
from .lifecycle import *  # noqa: F401,F403
from .logs import *  # noqa: F401,F403
from .operations import *  # noqa: F401,F403
from .tasks import *  # noqa: F401,F403
from .users import *  # noqa: F401,F403

__all__ = [
    "Base",
    "BaseModel",
    "SessionContext",
    "get_session",
    "session_scope",
]

for _name in list(globals()):
    if _name.startswith("_"):
        continue
    if _name not in __all__:
        __all__.append(_name)
