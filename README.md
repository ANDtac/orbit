# Orbit

Orbit is a network automation platform for managing network devices, their
configurations and lifecycle, monitoring fleet health, running operations, and
tracking compliance. It is a monorepo with a Flask backend (`apps/backend`) and a
React + TypeScript frontend (`apps/frontend`). For development commands and
architecture, see `CLAUDE.md`.

## Orbit Navigation and Terminology

Navigation is organized around **what an operator is trying to do**, not how the
backend is structured. There are six top-level sections.

```
Overview      At-a-glance program health and alerts
Inventory     What you manage: Devices, Configurations, Lifecycle (EoX)
Monitoring    Observe state and health (currently: Health)
Automation    Act on devices and track it: Password Changes, Runs
Compliance    Define rules and review conformance: Policies, Results
Admin         Setup and security: Platforms, Credentials, System Logs, Audit
```

### Section purpose — what belongs, what does not

- **Overview** — The landing page: key counts (devices, runs, compliance) and
  active alerts (recent errors, failed runs, failing compliance). Figures are
  drill-ins, not dead numbers. It does not contain configuration or editing.
- **Inventory** — The source of truth for what Orbit manages.
  - *Devices* — managed network devices.
  - *Configurations* — captured device configuration snapshots and their diffs.
  - *Lifecycle (EoX)* — end-of-life milestones for hardware models and software
    versions. Credentials and platform setup are not here; they are in Admin.
- **Monitoring** — Read-only observation of current state; never a place to run
  actions (those live in Automation). Today this is just *Health* (fleet health
  rollups by platform and inventory group). It is intentionally lean and may
  later host dashboards or merge into Overview.
- **Automation** — Anything that acts on devices, plus the record of those
  actions. It does not author compliance rules (Compliance) or manage
  platform/credential setup (Admin).
- **Compliance** — Define policies and rules, and review how devices measure up.
- **Admin** — Setup and security, kept separate from daily operations.
  - *Platforms* — how Orbit connects to a device type (NAPALM / Netmiko / Ansible
    metadata), plus authoring of the per-platform operation templates Automation
    uses.
  - *Credentials* — references to device authentication secrets.
  - *System Logs (Diagnostics)* — HTTP request logs, error logs, and application
    events used to troubleshoot Orbit itself. This is app/system telemetry, not a
    record of who changed what (that is Audit).
  - *Audit* — trail of user actions and configuration changes.

### Core terms (what these mean today)

- **Device** — a managed network device (the unit of Inventory).
- **Configuration / Snapshot** — an immutable captured copy of a device's
  configuration. A *backup* is the action that creates a snapshot.
- **Lifecycle / EoX** — vendor end-of-life dates (end-of-sale, end-of-support,
  etc.) for hardware models and software versions.
- **Automation Run (Run)** — one execution of an action against one or more
  devices, tracked as a job. Today's working action is the password change;
  other action types exist in the backend (config backup, bulk update, operation
  template execution) and a probe action is scaffolded but not yet executable.
- **System Job** — an internal/background job not triggered directly by an
  operator (for example, device discovery). Shown under Automation ▸ Runs,
  separated from operator Runs.
- **Operation Template** — a reusable, per-platform command runbook (Jinja) that
  Automation renders and executes. Authoring/managing templates is a setup task
  under Admin ▸ Platforms; selecting and running a template is an operator action
  surfaced in Automation. Template selection operators use daily is not buried in
  Admin.
- **Policy** — a named set of compliance **rules**. **Result** — the outcome of
  evaluating a rule against a device.
- **Platform** — connection/metadata profile for a device type.
- **Credential Profile** — a reference to stored authentication secrets.

### Terms that are easy to confuse

| These look similar | They actually mean |
|---|---|
| System Logs / Diagnostics vs Audit | App/HTTP telemetry for debugging Orbit vs a trail of user actions |
| Run vs System Job | Operator-triggered device action vs internal/background task (both are "jobs") |
| Policy | One concept only — Compliance. The former "Monitoring Policies" used the same data and is removed |
| Snapshot / Configuration vs Backup | The stored config vs the action that captures it |
| Probe / Operation / Password change | All are Automation action types, not separate sections |

### Future direction (not yet built)

These are intended directions, kept out of the definitions above because they do
not exist yet:

- **Scheduled and recurring automations** — a run targets one or many devices and
  may run on a recurring schedule (today only one-time scheduling exists via the
  job model's `scheduled_for`).
- **Run outputs** — an automation may produce a report, feed a dashboard, or
  record a compliance result.
- **An execution engine** — a worker so probe/operation runs actually execute
  (today only password changes run end-to-end).

### Navigation goals

- Prefer task-based names over implementation names.
- One concept, one home — no duplicate pages backed by the same data.
- Keep daily operations (Automation, Monitoring) separate from setup/security
  (Admin).
- Do not surface features that do not work end-to-end yet.

### Navigation decision record

A summary of the decisions behind the structure above and why.

| Decision | Choice | Why |
|---|---|---|
| Meaning of "Monitoring" | Observability only | Stop mixing observe / run / configure in one section |
| "Operations" naming | Re-label to "Automation" | Describes the task (acting on devices) |
| Jobs surfaces | Merge into one "Runs" view, Runs vs System Jobs | Same `/jobs` data was shown in two pages |
| "Monitoring Policies" | Remove, redirect to Compliance | Identical endpoint/data to Compliance Policies |
| App logs | Rename to System Logs/Diagnostics, move to Admin | They are Orbit's own telemetry, not network observability |
| Overview vs Health vs Alerts | Keep Overview + Health; fold Alerts into Overview | Three overlapping views collapsed to two |
| Probes | Hide until it executes | Backend is scaffold-only; no executor wired |
| Snapshots | Move to Inventory ▸ Configurations | It is per-device configuration data |
| EoX / Lifecycle | Move under Inventory | Reference data keyed to inventory (models/OS) |
| Operation Templates | Author in Admin ▸ Platforms; use in Automation | Setup is admin; selection is operator |
| Sidebar priority | Operator-first; Admin separated | End users are non-technical admins |

## UI and Interaction Standards

These conventions keep Orbit usable for non-technical admins. Apply them to every
page.

- **Quick drill-down uses a context modal.** Clicking a row, item, or summary
  figure opens a context modal with read-only detail, key links, and the obvious
  actions.
- **Complex work stays on a full page.** Use dedicated pages (not modals) for
  large configuration diffs, audit investigations, run/job detail, multi-step
  edits or wizards, and any view that should be bookmarkable or shareable. A modal
  is for a quick look and can deep-link to the full page.
- **Summary/stat cards are clickable** and open a modal listing the underlying
  items (e.g. clicking "Failed runs: 3" lists those three runs).
- **View before edit.** A row click opens a read-only view first; editing is an
  explicit action from there, not the default.
- **No dead surfaces.** Do not ship non-functional pages, tabs, or buttons. If a
  feature is not wired end-to-end, hide it from navigation until it is, rather
  than badging it "coming soon".
- **Labels are literal.** Titles, headers, filters, and buttons say exactly what
  they do. If a page needs a paragraph of explanation or many tooltips to be
  understood, redesign the UI instead of adding text.
- **One modal shell.** Modals use a single shared component with size variants, a
  scrollable body, header actions, and nesting support.
- **Dense, on-brand.** Use a dense admin layout with the existing Orbit palette
  tokens (primary / surface / muted / success / warning / danger).
