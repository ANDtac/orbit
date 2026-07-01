# Orbit Cleanup Tasks

## Progress Log
- [ ] Dataclass field order fixes
- [x] Replace deprecated `datetime.utcnow`
- [x] Remove unused imports/variables *(backend auth/utils/tests scopes)*
- [x] Fix incorrect call parameters *(auth routes, device fixture)*
- [x] Repair `__all__` assignment
- [x] Resolve callable/None issue in annotations
- [x] Guard optional attribute access in tests
- [x] Update generator fixture typing
- [x] Frontend TypeScript/Vite configuration

## Notes
- Begin with backend dataclass and datetime adjustments; tackle related constructor kwargs simultaneously to reduce churn.
- Completed first pass for logging/compliance/lifecycle/task models; remaining models still need ordering review.
- Updated device model timestamps to use `utcnow()` helper and aligned frontend Vite config with ESM patterns.
- Ensure TODO is updated after each work session.

## Future Navigation and Terminology Cleanup Plan

> Planning only — this section implies no code, route, component, or test changes.
> It is the execution plan to carry out later. Keep legacy redirects and remove no
> backend endpoints.

### Status (2026-07-01)

Phases 1–7 of the migration order below are implemented and green: legacy route
redirects + retitling, duplicate-page removal, feature re-homing, the Runs vs
System Jobs unification (derived from the existing `run_as_internal` signal), the
hiding of non-functional surfaces, the shared-modal/UI-standards pass, and the
deferred feature-folder rename. Backend `pytest` and the frontend `build` and
`test` scripts pass; frontend `lint` is held at or under the pre-existing
109-error baseline (no new regressions). **Phase 8 (Automation vision —
executor/worker, recurrence, output targets) remains deferred.**

Backward-compatible API additions delivered by this work (reflected in
`references/orbit-backend-api.postman_collection.json`): `GET /api/v1/jobs` gained
an optional `run_as_internal` filter (true = system jobs, false = operator runs),
and `GET /api/v1/logs/requests|errors|events` each gained optional `from`/`to`
date-range params (filter on `occurred_at`; `to` is inclusive to end-of-day).

### Proposed page changes

| Current | Action | Target |
|---|---|---|
| Monitoring ▸ Overview (`/monitoring`) | Merge | Global Overview (`/`) |
| Monitoring ▸ Alerts (`/monitoring/alerts`) | Merge | Global Overview (alerts panel) |
| Monitoring ▸ Policies (`/monitoring/policies`) | Remove + redirect | Compliance ▸ Policies |
| Monitoring ▸ Jobs (`/monitoring/jobs`) | Merge | Automation ▸ Runs |
| Operations ▸ Jobs (`/operations/jobs`) | Merge | Automation ▸ Runs |
| Monitoring ▸ Logs (`/monitoring/logs`) | Rename + move | Admin ▸ System Logs (Diagnostics) |
| Monitoring ▸ Probes (`/monitoring/probes`) | Hide from nav | Re-home under Automation when executable |
| Operations (section label) | Re-label | Automation |
| Operations ▸ Snapshots (`/operations/snapshots`) | Move | Inventory ▸ Configurations |
| Operations ▸ Templates (`/operations/templates`) | Move | Admin ▸ Platforms (authoring) |
| Lifecycle (top-level) | Move | Inventory ▸ Lifecycle (EoX) |

### Backend / frontend areas likely affected

- **Frontend nav/routing:** `apps/frontend/src/components/layout/navConfig.ts`,
  `apps/frontend/src/app/routes.tsx` (add legacy redirects, mirroring the existing
  `/devices` → `/inventory/devices`).
- **Frontend features:** `features/monitoring/*` shrinks toward Health; the
  Operations pages re-home (Snapshots → Inventory, Templates → Admin). Feature
  *folder* renames (e.g. `features/operations` → `features/automation`) are
  deferred — see migration order.
- **Shared UI:** one modal shell (`components/ui/Modal.tsx`) with size variants +
  scroll + header actions; adopt row-click → context-modal for quick views in
  `DataTable` consumers; make summary/stat cards clickable.
- **Jobs (classification):** before adding any field, inspect the existing Jobs
  model (`app/models/tasks.py`) — it already has `run_as_internal` (today only
  `device.discovery`), an unused `queue` column, and `job_type`. Determine whether
  operator Runs vs System Jobs can be derived from these (or a `job_type`
  convention). Only introduce a dedicated classification field if those prove
  insufficient. Reflect the choice in `GET /jobs` filters
  (`app/api/v1/resources/jobs.py`) and `services/jobs.py` serialization.
- **Automation vision (phased, later):** scheduling/recurrence (a `scheduled_for`
  field exists; recurrence does not), a run `output_target` (report / dashboard /
  compliance), and a worker/executor so probe/operation runs execute (today only
  password changes run via a ThreadPoolExecutor).

### Suggested migration order

1. **Docs + redirects + retitling (no behavior change):** add legacy route
   redirects; update nav labels, route paths, and page titles to the new terms.
   Do not rename feature folders yet.
2. **Remove duplicates:** redirect Monitoring ▸ Policies → Compliance; fold
   Monitoring ▸ Overview/Alerts into the global Overview.
3. **Re-home features by route/nav (folders unchanged):** Snapshots → Inventory ▸
   Configurations; EoX → Inventory ▸ Lifecycle; Templates authoring → Admin ▸
   Platforms; Logs → Admin ▸ System Logs.
4. **Jobs:** decide the Runs vs System Jobs signal (per inspection above); unify
   the two Jobs pages into Automation ▸ Runs.
5. **Hide non-functional:** remove Probes from nav and the unimplemented
   DeviceDetail tabs; keep the code.
6. **UI standards pass:** ship the shared modal shell, then convert pages to
   quick-view modals, clickable cards, and view-before-edit.
7. **Deferred cleanup:** rename feature folders (e.g. `features/operations` →
   `features/automation`) as a single mechanical commit once routes/redirects are
   stable.
8. **Automation vision (later):** executor/worker, recurrence, output targets.

### Per-page UI remediation checklist

- [x] **Overview/Home** — wire stat cards to context modals; condense feature-card
  text; fold in the Alerts panel (errors / failed runs / compliance failures).
- [x] **Devices list** — row click opens a quick-view modal; full edit/detail
  stays a page; fix the search placeholder (says "name or IP" but only name);
  group the device form into sections.
- [x] **Device detail** — hide the 4 unimplemented tabs; remove duplicated "Quick
  Stats"; make property values drill-in.
- [x] **Configurations (Snapshots)** — quick-view modal per snapshot; keep the
  large diff on a full page; clearer "select two to compare" workflow.
- [x] **Lifecycle (EoX) x2** — clickable summary cards (filter/list); per-row
  status badges; view-before-edit; clickable device counts.
- [x] **Monitoring Health** — make summary cards drill-in.
- [x] **System Logs (Diagnostics)** — add backend date-range params so filtering is
  not silently client-side/page-only; row → log detail. *(backend `from`/`to`
  params live on `GET /logs/requests|errors|events`.)*
- [x] **Automation Runs** — single unified view (Runs vs System Jobs); run detail
  on a full page; keep re-run, add cancel when the backend supports it. *(cancel
  stays gated on the deferred Phase 8 executor.)*
- [x] **Password Changes** — failed-device drill-in with single-device retry;
  rename the "Status" filter to "Device Status".
- [ ] **Operation Templates** — fix "Last used" (it is last *modified*); add real
  usage count; keep the existing detail/preview modals. *(left unchecked: "real
  usage count" needs execution tracking not confirmed delivered in Phases 1–7.)*
- [x] **Compliance Policies** — trim the intro paragraph; highlight the selected
  policy; policy/rule views.
- [x] **Compliance Results** — clickable summary cards; result detail with links to
  device/policy; add Device/Policy columns.
- [ ] **Platforms / Credentials / Audit** — add row-click views (none today);
  Audit gets a human-readable change view (full page) instead of raw JSON; enable
  the credential "Test" action. *(left unchecked: the live credential "Test"
  action depends on the deferred Phase 8 executor.)*

### Risks

- Re-homing routes can break bookmarks and the Postman collection — add redirects
  and update `references/orbit-backend-api.postman_collection.json`.
- Deferred folder renames touch many imports; do them in one mechanical commit
  after routes/redirects are stable.
- Any change to how Runs vs System Jobs are classified must keep historical jobs
  bucketed correctly (backfill or derive, don't mis-sort existing rows).
- Hiding Probes and placeholder tabs must keep the code/endpoints so future work
  is not lost.

### Testing checklist

- [x] All legacy routes redirect (e.g. `/operations/*`, `/monitoring/jobs`,
  `/monitoring/policies`, `/monitoring/logs`).
- [x] No nav item links to a removed/empty route; role-gated Admin still hidden for
  non-admins.
- [x] Runs view buckets operator Runs vs System Jobs correctly, including existing
  historical jobs.
- [ ] Frontend checks defined in `apps/frontend/package.json` pass (currently
  `build`, `lint`, `test`). *(build + test pass; lint held at/under the
  pre-existing 109-error baseline, so not fully green — see Status above.)*
- [x] Backend tests pass (`pytest`); add coverage for any Runs/System Jobs
  classification change.
- [x] Manual: each page's primary row/card opens a quick-view; complex views
  (diffs, audit, run detail) open full pages; no dead tabs/buttons remain.

### Future implementation prompt (paste into Claude Code later)

> Implement the Orbit navigation and terminology cleanup described in `README.md`
> ("Orbit Navigation and Terminology" + "UI and Interaction Standards") and the
> plan in `TODO.md` ("Future Navigation and Terminology Cleanup Plan"). Work in
> phases and keep each phase green using the scripts defined in
> `apps/frontend/package.json` plus backend `pytest`. Keep legacy redirects and
> remove no backend endpoints. Phases: (1) add route redirects and retitle nav
> labels, routes, and page titles to the new terms — do not rename feature folders
> yet; (2) remove duplicate pages — redirect Monitoring ▸ Policies to Compliance
> and fold Monitoring Overview/Alerts into the global Overview; (3) re-home by
> route/nav: Snapshots → Inventory ▸ Configurations, EoX → Inventory ▸ Lifecycle,
> Operation Template authoring → Admin ▸ Platforms, Logs → Admin ▸ System Logs;
> (4) inspect the Jobs model for an existing operator-vs-system signal
> (`run_as_internal`, `queue`, `job_type`) and only add a field if needed, then
> unify the two Jobs pages into Automation ▸ Runs; (5) hide Probes and the
> unimplemented DeviceDetail tabs (keep the code); (6) build one shared modal shell
> and apply the UI standards (quick-view modals, full pages for complex work,
> clickable summary cards, view-before-edit, literal labels, no dead surfaces);
> (7) once stable, rename feature folders (e.g. `features/operations` →
> `features/automation`) in one mechanical commit. Update the Postman collection
> and tests. Pause after each phase for review.
