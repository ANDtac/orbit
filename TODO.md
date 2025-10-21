# Backend API Refactor To-Do

- [ ] Restructure API routing under `/api/v1` while keeping `/healthz`, `/metrics`, and `/docs` unversioned.
  - [x] Create versioned blueprint/router module (`app/api/v1/`) that mounts existing business routes.
  - [x] Update application factory/imports to register versioned routes and ensure URL prefixes follow resource-first, plural naming.
  - [x] Standardize request/response patterns: RFC 7807 problem details for errors, cursor pagination (`page[cursor]`, `page[size]`), `filter[...]`, and `sort` parameters.
  - [x] Add helper utilities/tests for pagination, filtering, and error formatting consistent with OpenAPI 3.1.

- [x] Split `app/models.py` into a `models/` package organized by domain.
- [x] Add `models/__init__.py` to re-export public models and metadata.
- [x] Implement `models/base.py` for `DeclarativeBase`, metadata, and session helpers using SQLAlchemy 2.0 style.
  - [x] Introduce `models/annotations.py` with reusable typed column aliases (e.g., `IdPk`, `UuidPk`, `Str50`, `JSONB`).
  - [x] Implement mixins in `models/mixins.py` (`TimestampMixin`, `SoftDeleteMixin`, `TenantMixin`, `UuidPkMixin`, `IdPkMixin`, `OwnedByUserMixin`).
  - [x] Migrate domain models into grouped modules (`users.py`, `devices.py`, `tasks.py`, `inventory.py`, etc.) without losing functionality or comments.
  - [x] Ensure all models adopt SQLAlchemy 2.0 typed ORM syntax and update imports throughout code/tests/services.
  - [x] Enforce `nullable=False` on columns with defaults (except when default is `None`).

- [ ] Implement or enhance network-admin-focused functionality.
- [x] Add/extend models to support jobs, device tagging, groups, audit logs, config snapshots, and probes aligned with async job execution.
  - [x] Build async job tracking tied to initiating users (including internal jobs user) with idempotency key support and 202 Accepted workflows.
  - [x] Implement new API routes under `/api/v1` for devices (inventory, bulk update, discovery, config backup, health summaries), groups, jobs, probes, and audit logs with real logic.
  - [x] Ensure RBAC enforcement for sensitive routes and integrate with existing auth mechanisms.
  - [ ] Provide OpenAPI 3.1 documentation updates covering new endpoints, schemas, and problem responses; expose via Swagger UI and Redoc.
  - [x] Update/extend tests covering new routes, job flows, and model changes.

- [ ] Add deprecation-header utilities and update documentation/changelog template for future versioning.

- [ ] Run formatting, linters, and full backend test suite; ensure CI spec validation passes.
