"""Optional local debugging hooks."""

from __future__ import annotations

import logging
import os

log = logging.getLogger(__name__)


def maybe_enable_debugpy() -> None:
    """Enable debugpy when requested in the local runtime environment."""

    flag = os.getenv("ENABLE_DEBUGPY", "").strip().lower()
    if flag not in {"1", "true", "yes", "on"}:
        return

    port = int(os.getenv("DEBUGPY_PORT", "5678") or "5678")
    wait_flag = os.getenv("DEBUGPY_WAIT_FOR_CLIENT", "").strip().lower()
    should_wait = wait_flag in {"1", "true", "yes", "on"}

    try:
        import debugpy

        debugpy.listen(("0.0.0.0", port))
        log.info("debugpy_listening", extra={"extra": {"port": port}})
        if should_wait:
            log.info("debugpy_waiting_for_client")
            debugpy.wait_for_client()
    except RuntimeError:
        log.debug("debugpy_already_active", extra={"extra": {"port": port}})
    except Exception:  # pragma: no cover - defensive logging only
        log.exception("debugpy_enable_failed")
