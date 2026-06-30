# Structural Review Findings

## Phase Plan

### [x] Phase 1 — Split the devices resource module

Problem:
`apps/backend/app/api/v1/resources/devices.py` had accumulated device CRUD, tagging, config snapshot, health, and job kickoff routes in one module, which raised review and regression risk.

Result:
The `/api/v1/devices` namespace now stays intact while the implementation is split across:
`devices_shared.py`, `devices_core.py`, `device_tags.py`, `device_snapshots.py`, `device_health.py`, and `device_jobs.py`.
`devices.py` is now a thin composition root that imports the subdomain modules and exports the shared namespace.

Verification:
`cd apps/backend && ..\\..\\.venv\\Scripts\\python.exe -m pytest tests\\test_devices.py tests\\test_network_admin.py -q`
`11 passed`

After-action items:
- Update structural docs such as `references/FILE_TREE.md` when documentation cleanup is scheduled.
- If more device-adjacent route groups are added, consider converting the device namespace into a package directory instead of growing the composition module again.

### [x] Phase 2 — Thin `apps/backend/app/__init__.py`

Problem:
The app factory still mixes composition with JWT hooks, request persistence logging, DB-backed error logging, startup events, email alerts, and docs HTML rendering.

Target:
Move runtime policy into focused modules such as `app/observability/*` and `app/http/*`, leaving `create_app()` as orchestration only.

Result:
`apps/backend/app/__init__.py` now acts as an assembly layer only. Runtime behavior was extracted into:
`app/auth/jwt_handlers.py`, `app/http/cors.py`, `app/http/request_context.py`, `app/http/errors.py`,
`app/http/routes.py`, `app/observability/request_logging.py`, `app/observability/error_logging.py`,
`app/observability/events.py`, and `app/runtime/debug.py`.
The existing auth, request logging, error handling, health, docs, and startup behavior stayed intact while app-factory responsibilities are now separated by concern.

Verification:
`cd apps/backend && ..\\..\\.venv\\Scripts\\python.exe -m pytest tests\\test_app.py tests\\test_auth.py tests\\test_devices.py tests\\test_network_admin.py -q`
`25 passed`

After-action items:
- Replace remaining deprecated patterns surfaced by validation, especially `Query.get()`, `datetime.utcnow()`, and Flask-RESTX's legacy `ERROR_404_HELP` setting.
- Fix the dead `app/config.py::_json_env()` parsing path during the planned config cleanup phase so JSON-backed env config does not silently stay disabled.

### [ ] Phase 3 — Consolidate frontend config sources

Problem:
The frontend keeps parallel config artifacts (`vite.config.ts` + `vite.config.js`, `tailwind.config.ts` + `tailwind.config.js`) and checked-in `*.tsbuildinfo`, which can drift.

Target:
Pick one canonical config source, generate or ignore derivatives, and stop tracking transient TypeScript build output.

### [ ] Phase 4 — Isolate DB-backed request and error logging

Problem:
Request logging and global exception handling currently write to the primary DB session on the request path, which increases blast radius during DB degradation.

Target:
Move logging persistence behind an isolated session and graceful fallback path, with async or buffered handling where practical.

### [ ] Phase 5 — Retire legacy query fallback support

Problem:
The API still supports both `filter[...]` and legacy query parameters, which keeps two boundary contracts alive.

Target:
Document a deprecation window, add telemetry if needed, and remove the legacy fallback once client usage is low enough.
