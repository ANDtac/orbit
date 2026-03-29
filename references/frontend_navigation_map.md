# Orbit Front-End Navigation Reassessment and Cohesive Build-Out Plan

## 1) Reassessment goal

This document updates the original navigation report with a more implementation-ready plan focused on:

- absorbing monitoring features into Orbit (not building a second product surface),
- preventing duplicate workflows (especially duplicate device views),
- aligning UI build-out with backend resources/models,
- and tracking what appears to be implemented vs still missing.

---

## 2) Current implementation audit (as of this reassessment)

## Front-end routes and shell actually present

```text
Unauthenticated
└── /login

Authenticated
├── /
├── /devices
└── /* (404)
```

Header navigation currently includes only:
- Home
- Devices

### What appears implemented

- Login flow with token cookies and lockout handling.
- Protected routes for authenticated app areas.
- Basic overview landing page.
- Devices list page with loading/error/empty states.
- Theme toggle + responsive header/sidebar.

### What does NOT appear implemented yet (from code inspection)

- No explicit Monitoring route/section in nav.
- No jobs dashboard UI.
- No compliance policies/results UI.
- No lifecycle/EoX UI.
- No operations/template run flow UI.
- No audit/log views UI.
- No device detail page.
- No first-class bulk-action UX in the frontend.

> Note: If you implemented monitoring integration in another branch or local uncommitted state, this report reflects only what is currently visible in this repository snapshot.

---

## 3) Backend capability vs frontend exposure (gap summary)

Backend namespaces indicate broad capability (devices, jobs, operations, compliance, inventory groups, platforms, credential profiles, logs, audit, hardware/software EoX queries), but frontend exposure is still mostly Home + Devices.

### Highest-value cohesion gaps

1. **Monitoring capability is not represented in IA yet.**
2. **Operational objects (jobs/tasks/events) exist without a UI control plane.**
3. **Policy and lifecycle domains exist without visibility surfaces.**
4. **Bulk workflows are modeled in backend patterns but absent in UX.**

---

## 4) Cohesive target IA (Orbit-native, monitoring absorbed)

Monitoring should be a first-class Orbit domain, not a separate mini-site.

```text
Primary Navigation
├── Overview
├── Inventory
│   ├── Devices
│   ├── Groups
│   └── Tags
├── Monitoring
│   ├── Health Dashboard
│   ├── Probes
│   ├── Alerts / Events
│   └── Trends
├── Operations
│   ├── Runbooks / Templates
│   ├── Jobs
│   └── Config Snapshots
├── Compliance
│   ├── Policies
│   └── Results
├── Lifecycle
│   ├── Hardware EoX
│   ├── Software EoX
│   └── Risk View
└── Admin
    ├── Platforms
    ├── Credential Profiles
    └── Access
```

### Non-overlap rule set (critical)

- Keep **one canonical Devices experience** under Inventory.
- Monitoring pages may link to device details but must not create a second device index.
- Jobs execution belongs in Operations; Monitoring consumes job status context where relevant.
- Compliance and Lifecycle are separate governance domains, but can reuse monitoring widgets.

---

## 5) Object-centric UI ownership map (to avoid duplicate screens)

| Domain object | Primary UI home | Secondary references | Duplicate to avoid |
|---|---|---|---|
| Devices | Inventory > Devices | Monitoring, Operations, Compliance | Any second “device explorer” |
| Device health snapshots / probe executions | Monitoring | Device detail, Operations job detail | Separate health app shell |
| Jobs / tasks / events | Operations > Jobs | Monitoring action history | A parallel async-status panel framework |
| Compliance policies/results | Compliance | Device detail, Overview KPIs | Policy controls inside Monitoring |
| Lifecycle rows + EoX queries | Lifecycle | Device detail, Overview risk cards | A separate lifecycle dashboard outside Lifecycle |
| Platforms / credential profiles | Admin | Used by Inventory/Operations flows | Inline ad-hoc config pages in feature areas |

---

## 6) Build-out plan (frontend cohesive roadmap)

## Phase 0 — Foundation and convergence

1. **Navigation refactor**
   - Expand nav groups (Inventory, Monitoring, Operations, Compliance, Lifecycle, Admin).
   - Add route-level placeholders for all target domains.

2. **Shared design primitives**
   - Standardize table shell (filters, sorting, pagination, empty/error/loading states).
   - Standardize KPI cards, status chips, timeline panels, and split layouts.

3. **Entity detail framework**
   - Introduce reusable detail page pattern with tabs:
     - Summary
     - Monitoring
     - Operations
     - Compliance
     - Lifecycle

4. **Decision traceability**
   - Add a decisions artifact in `references/` that records final selected scope direction (including your single-option choice pattern if still applicable).

## Phase 1 — Monitoring absorbed into Orbit

1. **Monitoring section bootstrap**
   - Health dashboard route with top-level KPIs and recent anomalies.
   - Probe executions list with filtering by status, device, time.
   - Alerts/events view from available data sources.

2. **Device-centric monitoring integration**
   - Device detail “Monitoring” tab consuming health snapshots/probe history.
   - Deep links between Monitoring views and canonical device detail.

3. **No-verbatim mockup translation**
   - Apply Orbit spacing, tokens, typography, card/table components.
   - Rebuild layouts semantically from reference mockups, not copy-paste HTML/CSS.

## Phase 2 — Operations and async control plane

1. **Jobs dashboard**
   - Queue view, job status filters, task/event drill-down.

2. **Execution UX**
   - Launch operation template against selected devices/groups.
   - Preflight summary + blast radius panel.

3. **Snapshots integration**
   - Snapshot list and compare flow anchored from Devices + Operations.

## Phase 3 — Governance surfaces

1. **Compliance**
   - Policies list/editor + results explorer.

2. **Lifecycle**
   - Hardware/software lifecycle tables + risk scoring views.

3. **Auditability hooks**
   - Add user-intent notes for risky actions and expose audit-friendly history.

---

## 7) Implementation status tracker template

Use this section to mark what has already been completed in future updates.

| Capability | Planned phase | Status | Notes |
|---|---:|---|---|
| Expanded nav model | P0 | Not Started | |
| Monitoring section routes | P1 | Not Started | |
| Canonical device detail page | P0/P1 | Not Started | |
| Health dashboard | P1 | Not Started | |
| Probe executions UI | P1 | Not Started | |
| Jobs dashboard | P2 | Not Started | |
| Operation launch flow | P2 | Not Started | |
| Compliance views | P3 | Not Started | |
| Lifecycle views | P3 | Not Started | |
| Audit/log views | P3 | Not Started | |

---

## 8) Practical acceptance criteria (frontend cohesion)

1. A user can navigate every major domain from one coherent Orbit nav.
2. Device data has exactly one canonical list/detail experience.
3. Monitoring is visually and behaviorally Orbit-native.
4. No imported monitoring mockup HTML is used verbatim.
5. All long-running actions expose async status in one jobs model.
6. Compliance/lifecycle insights can be reached contextually from device detail.
7. Bulk actions follow one shared interaction model across domains.

---

## 9) Where to capture your scope answers and monitoring import context

To make future implementation deterministic, keep these artifacts current:

```text
references/monitoring_site_import/
├── html_mockups/
├── reference_docs/
└── decisions/
    ├── scope_answers.md
    ├── adopted_features.md
    └── rejected_features.md
```

Recommended minimum in `scope_answers.md`:
- whether one option was selected for all 20 questions,
- the chosen option letter,
- any overrides (if specific questions differ),
- date + rationale.
