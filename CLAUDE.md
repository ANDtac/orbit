# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Orbit is a network automation platform with a Flask backend and React frontend, organized as a monorepo under `apps/backend` and `apps/frontend`. It manages network devices, operations/jobs, compliance policies, and hardware/software lifecycle (EoX) tracking.

## Development Commands

### Docker (primary development workflow)

```bash
make dev              # Build and start all services
make dev-debug        # Start with debug overrides (debugpy:5678, Node inspector:9229)
make down             # Stop and remove containers
make logs             # Tail logs from all services
make backend-bash     # Shell into backend container
make test             # Run pytest in backend container (--maxfail=1)
make rebuild          # Rebuild images without cache
```

### Backend (inside container or venv)

```bash
pytest -q --disable-warnings                    # Run all tests
pytest tests/test_devices.py -q                 # Run single test file
pytest tests/test_devices.py::TestName -q       # Run single test class
python manage.py create-db                      # Create tables (idempotent)
python manage.py seed-dev                       # Insert dev fixtures (admin/admin)
python manage.py list-routes                    # Print all API routes
python manage.py shell                          # Interactive shell with app context
flask db migrate -m "description"               # Create Alembic migration
flask db upgrade                                # Apply migrations
```

### Frontend (from `apps/frontend/`)

```bash
npm run dev           # Vite dev server (port 5173 in dev script, port 3000 in vite.config)
npm run build         # TypeScript check + Vite production build
npm run lint          # ESLint
npm run format        # Prettier (semi, double quotes, 100 width, 4-space tabs)
npm run test          # Vitest (run mode)
npm run test:watch    # Vitest (watch mode)
```

## Architecture

### Backend (`apps/backend/`)

- **Flask app factory** in `app/__init__.py` with env-based config selection (`APP_ENV`: development/staging/production)
- **Config**: `app/config.py` — DevConfig uses SQLite by default; Stage/Prod expect `DATABASE_URL` (Postgres)
- **API**: Flask-RESTX with namespaced resources under `app/api/v1/resources/` (devices, operations, jobs, compliance, eox, etc.)
- **Auth**: JWT via Flask-JWT-Extended, routes in `app/auth/routes.py`, includes rate-limiting/lockout and optional Netmiko SSH credential validation
- **Models**: SQLAlchemy ORM in `app/models/` — uses mixins (`IdPkMixin`, `UuidPkMixin`, `TimestampMixin`, `DisableableMixin`) and custom type annotations (`CITEXT`, `INET`, `JSONB`) in `app/models/annotations.py`
- **Services**: Business logic in `app/services/` (jobs, operations)
- **Extensions**: Database, JWT, and other Flask extensions initialized in `app/extensions.py`

### Frontend (`apps/frontend/`)

- **React 18 + TypeScript + Vite** SPA with client-side routing (React Router v6)
- **Path alias**: `@/` maps to `src/`
- **State**: Zustand store (`app/store/`), React Query for server state (`@tanstack/react-query`)
- **Feature-based structure**: `src/features/` (auth, devices, monitoring) — each feature has its own components, API layer, and types
- **Shared components**: `src/components/` (UI primitives + layout)
- **Styling**: Tailwind CSS with dark/light theme toggle via CSS variables

### Testing

- **Backend**: pytest with in-memory SQLite fixtures in `tests/conftest.py`; factory helpers for Users, Platforms, Devices, InventoryGroups; auth fixtures provide JWT tokens
- **Frontend**: Vitest + Testing Library + jsdom; setup in `src/tests/setup.ts`

### Infrastructure

- Docker Compose orchestrates backend + frontend services
- Debug compose overlay at `compose.dev.debug.yml` adds debugpy and Node inspector
- Dockerfiles in `docker/` (Dockerfile.backend, Dockerfile.frontend)
- Nginx config placeholder in `infra/`

## Key Environment Variables

| Variable | Purpose | Default |
|---|---|---|
| `APP_ENV` | Config selection | `development` |
| `DATABASE_URL` | DB connection string | `sqlite:///dev.sqlite3` (dev) |
| `JWT_SECRET_KEY` | JWT signing key | `dev-secret-change-me` |
| `AUTH_NETMIKO_HOST` | SSH host for credential validation | (disabled if unset) |

## Reference Materials

- `references/orbit-backend-api.postman_collection.json` — Postman collection for all API endpoints
- `references/frontend_navigation_map.md` — Frontend IA plan and implementation status
- `references/structural_review_findings.md` — Code review findings
