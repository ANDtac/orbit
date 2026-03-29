# Structural Review Findings

- Scope and modularity
  - `apps/backend/app/api/v1/resources/devices.py` is doing multiple domains in one resource module (device CRUD, tagging, config snapshots, health aggregation, and probe/job kickoff).
    - Best-practice delta: this is a broad endpoint surface in one file (>1k LOC), which increases review and regression risk.
    - Possible justification: keeping all device-adjacent API behavior in one namespace can reduce cross-file navigation and keep Swagger model definitions close to handlers.
    - If no stronger reason: split by subdomain (`devices_core`, `device_tags`, `device_snapshots`, `device_health`) while preserving one namespace registration.
  - `apps/backend/app/__init__.py` mixes app factory concerns with operational concerns (JWT hooks, request persistence logging, DB-backed error logging, startup events, email alerts, docs HTML templates).
    - Best-practice delta: app bootstrap files are usually thin composition roots; runtime policy often moves to dedicated modules.
    - Possible justification: a single operational chokepoint can simplify initial deployment and debugging.
    - If no stronger reason: move hooks/handlers to dedicated modules (e.g., `app/observability/*.py`, `app/http/*.py`) and keep `create_app()` orchestration-only.

- Build/config structure
  - Frontend keeps parallel config outputs (`vite.config.ts` + `vite.config.js`, `tailwind.config.ts` + `tailwind.config.js`) and checked-in TypeScript build info files.
    - Best-practice delta: duplicated config sources can drift and make behavior environment-dependent.
    - Possible justification: JS copies may be required by tools/containers that execute config without TS transpilation.
    - If no stronger reason: choose one canonical source and generate/ignore derivatives (including `*.tsbuildinfo`) in VCS.

- Cross-cutting behavior placement
  - Request logging and global exception handling write directly to the primary DB session in request lifecycle hooks.
    - Best-practice delta: heavy synchronous logging on request path can amplify failure modes during DB degradation.
    - Possible justification: strict audit/compliance requirements may require guaranteed durable request/error records.
    - If no stronger reason: isolate logging storage/session, add async queue/fallback sink, and degrade gracefully when logging persistence fails.

- API boundary conventions
  - The backend carries both newer filter style (`filter[...]`) and legacy query fallback support.
    - Best-practice delta: dual contract surfaces increase long-term API complexity.
    - Possible justification: intentional backward compatibility during client migration.
    - If no stronger reason: publish a deprecation horizon and remove legacy paths after telemetry confirms low usage.
