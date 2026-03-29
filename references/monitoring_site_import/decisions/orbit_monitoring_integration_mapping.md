# Orbit Monitoring Integration Mapping (Final)

Decision source: `scope_answers.md` (all 20 answers applied).

## Reuse existing Orbit feature

| Monitoring Import Idea | Orbit Mapping | Reason |
|---|---|---|
| Device inventory list | Reuse `Devices` route/api | Avoid duplicate viewer/workflow |
| Async run tracking | Reuse `/api/v1/jobs` + task/event graph | Native Orbit async model already present |
| Policy/rule governance | Reuse `/api/v1/compliance/*` | Native policy + rule + result resources |
| Operational telemetry logs | Reuse `/api/v1/logs/*` and `/api/v1/audit` | Existing read models and filters |

## Extend Orbit feature

| Monitoring Import Idea | Orbit Extension |
|---|---|
| Monitoring dashboard | Add `/monitoring` action center in Orbit nav |
| Jobs visibility | Add `/monitoring/jobs` with task/event drill-down |
| Risk guardrail actions | Add typed-confirm queue flow for password rotation |
| Policy UX | Add `/monitoring/policies` CRUD surface over compliance APIs |
| Logs UX | Add `/monitoring/logs` request/error views |

## New feature to add

| Feature | Scope | Status |
|---|---|---|
| Monitoring section IA | Nav + 4 routes | Implemented (P0+P1) |
| Policy modal workflows | Create/edit/delete with confirmation | Implemented (P1) |

## Rejected from monitoring import

| Rejected Item | Reason |
|---|---|
| Standalone Monitoring Hub shell | Orbit requires an integrated native section |
| Session-stored device credentials model | Conflicts with Orbit credential profile architecture |
| Duplicate device CRUD workflow | Violates overlap constraint |
| Verbatim imported HTML/CSS | Explicitly disallowed by requirements |
| SQLite + `db.create_all()` bootstrap assumptions | Conflicts with migration-safe Orbit backend conventions |

## Phase plan

- **P0**: Monitoring nav/routes, jobs drilldown, risky action typed confirm.
- **P1**: Policies CRUD + logs visibility in Orbit design language.
- **P2**: Global search, lifecycle manual entry UX, richer onboarding and saved views.

## Overlap avoidance decisions

1. Devices remain a single Orbit workflow (`/devices`) and are not duplicated under Monitoring.
2. Monitoring execution reuses Jobs model instead of introducing a separate run-log engine.
3. Policy authoring reuses Compliance models/resources instead of standalone MonitoringRule tables.

## Follow-ups

1. Add jobs cancel/retry API mutations and UI once backend contract is finalized.
2. Add policy simulation and advanced rule editor mode.
3. Add logs detail drawer and export actions.
