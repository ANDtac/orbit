# AGENTS.md

This file provides guidance to coding agents working in this repository.

## Project Overview

Orbit is a network automation platform with a Flask backend and React frontend, organized as a monorepo under `apps/backend` and `apps/frontend`.

It manages:

- network devices
- operations and jobs
- compliance policies
- hardware and software lifecycle tracking (EoX)

## Development Commands

### Docker

Primary development workflow:

```bash
make dev              # Build and start all services
make dev-debug        # Start with debug overrides (debugpy:5678, Node inspector:9229)
make down             # Stop and remove containers
make logs             # Tail logs from all services
make backend-bash     # Shell into backend container
make test             # Run pytest in backend container (--maxfail=1)
make rebuild          # Rebuild images without cache
````

### Backend

Run inside the backend container or a local virtual environment:

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

### Frontend

Run from `apps/frontend/`:

```bash
npm run dev           # Vite dev server (port 5173 in dev script, port 3000 in vite.config)
npm run build         # TypeScript check + Vite production build
npm run lint          # ESLint
npm run format        # Prettier (semi, double quotes, 100 width, 4-space tabs)
npm run test          # Vitest (run mode)
npm run test:watch    # Vitest (watch mode)
```

## Architecture

### Backend

Location: `apps/backend/`

* Flask app factory in `app/__init__.py`
* Environment-based config selection via `APP_ENV` (`development`, `staging`, `production`)
* Config lives in `app/config.py`

  * development uses SQLite by default
  * staging and production expect `DATABASE_URL` for Postgres
* API uses Flask-RESTX
* Namespaced resources live under `app/api/v1/resources/`

  * examples: devices, operations, jobs, compliance, eox
* Auth uses Flask-JWT-Extended
* Auth routes live in `app/auth/routes.py`
* Auth includes rate-limiting, lockout, and optional Netmiko SSH credential validation
* SQLAlchemy ORM models live in `app/models/`
* Common mixins include:

  * `IdPkMixin`
  * `UuidPkMixin`
  * `TimestampMixin`
  * `DisableableMixin`
* Custom type annotations live in `app/models/annotations.py`

  * `CITEXT`
  * `INET`
  * `JSONB`
* Business logic lives in `app/services/`
* Flask extensions are initialized in `app/extensions.py`

### Frontend

Location: `apps/frontend/`

* React 18 + TypeScript + Vite SPA
* Client-side routing uses React Router v6
* Path alias `@/` maps to `src/`
* Zustand handles app state
* React Query (`@tanstack/react-query`) handles server state
* Feature-based structure under `src/features/`

  * examples: auth, devices, monitoring
* Shared components live in `src/components/`
* Styling uses Tailwind CSS
* Dark and light theme toggle uses CSS variables

## Testing

### Backend

* Test framework: `pytest`
* In-memory SQLite fixtures live in `tests/conftest.py`
* Factory helpers exist for:

  * Users
  * Platforms
  * Devices
  * InventoryGroups
* Auth fixtures provide JWT tokens

### Frontend

* Vitest
* Testing Library
* jsdom
* Test setup file: `src/tests/setup.ts`

## Infrastructure

* Docker Compose orchestrates backend and frontend services
* Debug overlay: `compose.dev.debug.yml`

  * adds debugpy
  * adds Node inspector
* Dockerfiles live in `docker/`

  * `Dockerfile.backend`
  * `Dockerfile.frontend`
* Nginx config placeholder exists in `infra/`

## Key Environment Variables

* `APP_ENV`

  * selects config
  * default: `development`

* `DATABASE_URL`

  * database connection string
  * development default: `sqlite:///dev.sqlite3`

* `JWT_SECRET_KEY`

  * JWT signing key
  * default: `dev-secret-change-me`

* `AUTH_NETMIKO_HOST`

  * SSH host for credential validation
  * feature is disabled if unset

## Reference Materials

* `references/orbit-backend-api.postman_collection.json`

  * Postman collection for API endpoints

* `references/frontend_navigation_map.md`

  * frontend IA plan and implementation status

* `references/structural_review_findings.md`

  * code review findings