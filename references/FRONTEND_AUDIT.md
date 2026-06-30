# Frontend Audit

## Page Groupings

| Group | Pages |
|-------|-------|
| **Auth** | Login |
| **Overview** | Home |
| **Inventory** | Devices List, Device Create, Device Detail, Device Edit |
| **Monitoring** | Overview, Health, Jobs, Probes, Policies, Logs, Alerts |
| **Operations** | Password Changes, Templates, Jobs, Snapshots |
| **Compliance** | Policies, Results |
| **Lifecycle** | Hardware EoX, Software EoX |
| **Admin** | Platforms, Credentials, Audit Log |
| **Shared / Layout** | AppShell, Sidebar, TopBar, Page, ErrorBoundary, NotFound, PlaceholderPage, DataTable, DemoContext |

---

## Group: Auth

### Page: Login
**Route**: `/login`
**Component**: `LoginPage.tsx` + `LoginForm.tsx`
**Purpose**: Authenticates users via username/password credentials, with an alternative "Try Demo Mode" button for stakeholder showcases that bypasses the backend entirely.

#### Findings

1. **No field-level hints on credential inputs.** The form says "Sign in with your network credentials" but doesn't clarify what "network credentials" means — are these Active Directory credentials, local Orbit accounts, or SSH device credentials? A first-time user with domain knowledge but no onboarding context won't know which credentials to enter.
   - **Recommendation**: Add a small hint below the subtitle: "Use the username and password assigned by your Orbit administrator." If SSH validation is enabled (`AUTH_NETMIKO_HOST`), add: "These credentials are also verified against a network device."
   - [X] Add feature "Use your standard SSO credentials"
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

2. **Lockout feedback is functional but could be clearer.** The lockout message shows a timestamp ("Locked until 3:42:15 PM") but doesn't tell the user *why* they were locked out or how many attempts they have remaining before lockout.
   - **Recommendation**: Prepend the lockout message with context: "Too many failed sign-in attempts." Keep the existing timestamp.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

3. **Demo mode button has no explanation of what demo mode is.** A stakeholder seeing "Try Demo Mode" for the first time won't know what data they'll see or whether their actions persist.
   - **Recommendation**: Add a tooltip or small line of text: "Explore Orbit with sample data. Nothing you do in demo mode affects real devices."
   - [X] Add feature and expand demo mode to match newer state of implementation after this plan is executed.
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

4. **Accessibility: `role="alert"` and `role="status"` are correctly applied** on error and lockout messages respectively. Form inputs have `autoComplete` attributes. No issues here.

#### Enhancement Suggestions
- The animated logo is a nice touch. Consider adding a subtle loading state to the submit button (spinner icon alongside "Signing in...") for visual consistency with the rest of the app.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

---

## Group: Overview

### Page: Home
**Route**: `/`
**Component**: `Home.tsx`
**Purpose**: Landing page after login. Shows marketing-style hero copy with two CTA buttons ("View devices" and "Open monitoring") and two feature highlight cards describing compliance and operations capabilities.

#### Findings

1. **This page is entirely static with no live data.** For a dashboard labeled "Overview" in the sidebar, users will expect to see real-time summary metrics (device count, active jobs, recent alerts). Instead they get marketing copy. This is the single biggest UX gap in the app — the first thing a user sees after login tells them nothing about the current state of their network.
   - **Recommendation**: Replace or supplement the hero section with live summary cards (total devices, active jobs, recent alerts, compliance pass rate). The data queries already exist in MonitoringOverviewPage — they can be reused here. Keep the CTAs.
   - [X] Add feature it should be a true overview of nearly the whole app for now
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

2. **Feature cards use developer terminology.** "Golden templates" and "remediation steps" are meaningful to network engineers but opaque to a non-technical admin who manages the platform. The card text describes *capabilities* but not *how to access them*.
   - **Recommendation**: Rewrite card copy to use plain language. E.g., "Compare device configurations against approved baselines" instead of "golden templates." Add a "Go to Compliance" link on the compliance card and "Go to Operations" on the operations card.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

3. **Legacy redirect: `/devices` redirects to `/inventory/devices`** — this is correct and harmless but the Home page CTA button links to `/devices` (the old path) instead of `/inventory/devices`.
   - **Recommendation**: Update the link to `/inventory/devices` directly to avoid the redirect hop.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

#### Enhancement Suggestions
- Add a "Quick actions" row below the CTAs with shortcuts to common tasks: "Add a device," "Run a password change," "View compliance results."
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

---

## Group: Inventory

### Page: Devices List
**Route**: `/inventory/devices`
**Component**: `DevicesListPage.tsx`
**Purpose**: Primary inventory table showing all managed network devices with filtering, sorting, pagination, bulk selection, CSV import, and delete capabilities.

#### Findings

1. **Loading, error, and empty states are all properly implemented.** DataTable handles all three via props. Empty state includes a CTA to add the first device. No issues here.

2. **Bulk delete only deletes one device.** The "Delete selected" button is wired to delete a single device despite allowing multi-select checkboxes. If a user selects 5 devices and clicks "Delete selected," only one is removed. This is a functional bug or incomplete feature.
   - **Recommendation**: Either wire bulk delete to iterate over all selected IDs (with a single confirmation modal showing the count), or disable multi-select and only allow single-row delete via the row action.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

3. **CSV import modal lacks guidance on expected format.** The upload step mentions "Headers should include: name/hostname, ip, os_name..." as a hint, but there's no downloadable template CSV. Users will guess at column names.
   - **Recommendation**: Add a "Download template CSV" link that provides a file with the correct headers and one example row. This is standard practice for CSV import flows.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

4. **CSV import creates devices sequentially (one API call per row).** For large imports (100+ devices), this will be very slow and provides no way to cancel mid-import.
   - **Recommendation**: Add a note in the import modal: "Large imports may take a moment." Consider adding a cancel button during step 4 (importing). Batch API is a backend concern — flag as future enhancement.
   - [X] Add feature implement the backend nexessary changes to match more standard bulk import practices.  Ensure testing is not broken by these backend changes.
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

5. **CSV import progress bar lacks `aria-valuenow`, `aria-valuemin`, `aria-valuemax`.** Screen readers won't announce progress.
   - **Recommendation**: Add ARIA attributes to the progress bar element.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

6. **Delete confirmation requires typing "DELETE" — consistent with other destructive actions.** Good pattern, no issue.

#### Enhancement Suggestions
- The filter bar works well. Consider adding a "Columns" dropdown to let users hide/show columns, since not every user needs to see OS version or serial number on every visit.
   - [X] Add feature and include adding the many hidden columsnd evices have.  There's so much metadata for devices
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

---

### Page: Device Create
**Route**: `/inventory/devices/new`
**Component**: `DeviceCreatePage.tsx` + `DeviceForm.tsx`
**Purpose**: Form for adding a new device to the inventory. Collects device identity, network address, platform association, credential profile, and optional metadata.

#### Findings

1. **No visible required-field indicator.** The "Name" field is the only required field, but there's no asterisk or "(required)" label. Users won't know which fields they *must* fill in versus which are optional.
   - **Recommendation**: Add a red asterisk or "(required)" suffix to the Name label. Add "(optional)" to other fields, or add a form-level note: "Fields marked * are required."
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

2. **No field-level hints for technical fields.** Several fields need clarification for non-technical admins:
   - **Management IP**: What IP should go here — the device's loopback, out-of-band management interface, or primary interface?
   - **Platform**: What does "platform" mean in Orbit's context? (It maps to vendor + device type + automation driver.)
   - **Credential Profile**: What is a credential profile and how does selecting one affect this device?
   - **FQDN**: Not everyone knows this abbreviation. The label should be "Fully Qualified Domain Name (FQDN)" or have a tooltip.
   - **OS Name / OS Version**: Should this match the vendor's naming convention exactly? (e.g., "ios-xe" vs "IOS XE" vs "17.3.4")
   - **Recommendation**: Add info-icon tooltips on: Management IP ("The IP address Orbit uses to connect to this device for automation tasks"), Platform ("The vendor and device type — determines which automation drivers Orbit uses"), Credential Profile ("The saved credentials Orbit uses to authenticate when connecting to this device"), FQDN ("Fully Qualified Domain Name, e.g. switch01.example.com").
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

3. **No client-side validation beyond empty name check.** Management IP accepts any string (no IP format validation). Management port accepts any number (no range check). These won't break anything but could lead to bad data.
   - **Recommendation**: Add lightweight validation — IP format regex and port range (1–65535). Show inline error messages per field rather than only on submit.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

4. **Form labels are properly associated with inputs via `id` attributes.** Accessible. No issue.

5. **The page is not wrapped in `<Page>` component** (unlike other routes in `routes.tsx`), so it lacks the standard page title and description header. This means no breadcrumb context.
   - **Recommendation**: Wrap in `<Page title="Add Device" description="...">` for consistency, or add a breadcrumb manually.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

MANUALLY ADDED:
6. Add export devices feature component with one of the options being csv and another being to manually export then import to the users local SecureCRT instance on their machine to a new folder of sessions sorted by device type.

#### Enhancement Suggestions
- After successful creation, show a toast/snackbar confirmation ("Device created successfully") before navigating to the detail page.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

---

### Page: Device Detail
**Route**: `/inventory/devices/:id`
**Component**: `DeviceDetailPage.tsx` + tab components
**Purpose**: Single-device view with tabbed sections showing device properties, monitoring data, operations history, compliance status, and lifecycle information.

#### Findings

1. **Four of five tabs are placeholders.** Only the "Summary" tab renders real content. The Monitoring, Operations, Compliance, and Lifecycle tabs all render `<DevicePlaceholderTab>` with "Coming Soon" badges. This means 80% of the detail page is non-functional.
   - **Recommendation**: Prioritize implementing at least the Compliance and Operations tabs, since those features exist elsewhere in the app and the data relationships are already modeled. For tabs that remain stubs, consider hiding them entirely rather than showing "Coming Soon" — it sets expectations the app can't meet.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

2. **Loading state uses skeleton placeholders (animate-pulse).** Good pattern — consistent with edit page. No issue.

3. **Error state shows "Device not found" with back button.** Appropriate for 404. No issue.

4. **Delete confirmation requires typing "DELETE."** Consistent with list page. No issue.

5. **The page is not wrapped in `<Page>` component**, so it lacks the standard header. The breadcrumb is manually rendered. This is fine since the detail page has its own header layout, but the lack of `<Page>` wrapper means no page description.
   - **Recommendation**: No action needed — the custom header with breadcrumb is appropriate for detail pages.
   - [X] Ignore / leave as-is

6. **Summary tab: Device "Facts" section renders raw JSON in a `<pre>` tag.** Non-technical users will see a wall of JSON with no explanation of what "facts" are or what the keys mean.
   - **Recommendation**: Either render facts as a key-value table (like the properties section), or add a collapsible "About this section" note: "Facts are raw data collected from the device during the last probe. They may include hardware details, interface counts, and software versions."
   - [X] Add feature facts is a device property allowing for state information beyond the database's core implementation.
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

#### Enhancement Suggestions
- Add a "Last probed" timestamp to the header so users know how fresh the displayed data is.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

---

### Page: Device Edit
**Route**: `/inventory/devices/:id/edit`
**Component**: `DeviceEditPage.tsx` + `DeviceForm.tsx`
**Purpose**: Pre-filled form for modifying an existing device's properties.

#### Findings

1. **Same form field issues as Device Create** (no required indicators, no field hints, no IP/port validation). Findings from Device Create apply here identically.
   - **Recommendation**: Same as Device Create — these share `DeviceForm.tsx`, so fixes apply to both pages.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

2. **Loading state uses skeleton placeholder.** Good. No issue.

3. **Error state shows "Device not found" with back button.** Good. No issue.

4. **The page is not wrapped in `<Page>` component.** Same pattern as Create/Detail — manually rendered breadcrumb.
   - **Recommendation**: Wrap in `<Page>` for consistency.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

5. **No unsaved-changes warning.** If a user modifies fields and navigates away (back button, sidebar click), changes are silently lost.
   - **Recommendation**: Add a `beforeunload` listener and/or React Router `useBlocker` to warn about unsaved changes.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

#### Enhancement Suggestions
- Show a "last modified" timestamp in the form header so the user knows when this device was last changed and by whom.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

---

## Group: Monitoring

### Page: Monitoring Overview
**Route**: `/monitoring`
**Component**: `MonitoringOverviewPage.tsx`
**Purpose**: Operator action center showing summary stats (managed devices, queued jobs, failed jobs), recent password change events, and recent error logs.

#### Findings

1. **Loading and error states are implemented** as single full-page messages. Acceptable for a dashboard. No issue.

2. **"Recent Password Changes" table uses a custom HTML table, not DataTable.** This means no pagination, no sorting, no empty-state component reuse. The table shows at most 5 rows (hardcoded query limit), which is fine, but there's no "View all" link to navigate to the full password change history.
   - **Recommendation**: Add a "View all" link below the table pointing to `/operations/password-change` or a dedicated history view.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

3. **"Recent Errors" section shows error cards with correlation IDs.** The correlation ID is useful for engineers but meaningless to non-technical admins. There's no explanation of what it is or what to do with it.
   - **Recommendation**: Add a tooltip on the correlation ID label: "A unique identifier for this error. Share it with your engineering team if you need to report this issue."
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

4. **No "View all" link for errors.** Users see 5 errors but can't navigate to the full log.
   - **Recommendation**: Add a "View all errors" link pointing to `/monitoring/logs` (Errors tab).
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

5. **The "Failed jobs" stat card shows count in red when > 0**, which is good visual emphasis. No issue.

6. **`PasswordRotationCard` component is imported but the naming is inconsistent.** The nav calls this section "Password Changes" but the component is named "PasswordRotation." Minor inconsistency.
   - **Recommendation**: Rename to `PasswordChangeCard` for consistency. Low priority.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

#### Enhancement Suggestions
- Add a "Quick actions" row at the top with buttons for common operator tasks: "Queue probes," "Run password change," "View alerts."
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

---

### Page: Health Dashboard
**Route**: `/monitoring/health`
**Component**: `MonitoringHealthPage.tsx`
**Purpose**: Fleet-wide health summary with stat cards (tracked, healthy, warning, critical counts) and two breakdown tables (by platform and by inventory group).

#### Findings

1. **Loading and error states implemented.** No issue.

2. **Empty states implemented** for both tables ("No platform/group health snapshots yet"). No issue.

3. **Status dots use color only (emerald/amber/red) without text labels in the table badges.** The stat cards have text labels, but the inline status badges in the table rely on color alone for meaning.
   - **Recommendation**: The status text is already shown next to the dot in the `StatusSummary` component. Verify that the text is always present alongside the dot — if so, no action needed. If any badge is dot-only, add the status word.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

4. **Tables are non-interactive (no row click).** Clicking a platform or group row doesn't drill down to the devices in that platform/group. Since the device list page supports platform and group filters, this is a missed navigation opportunity.
   - **Recommendation**: Make rows clickable — clicking a platform row navigates to `/inventory/devices?platform={id}`, clicking a group row navigates to `/inventory/devices?group={id}`.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

5. **Page description is clear and appropriate.** No issue.

#### Enhancement Suggestions
- Add a "Last updated" timestamp showing when health data was last refreshed, so operators know if they're looking at stale data.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

---

### Page: Monitoring Jobs
**Route**: `/monitoring/jobs`
**Component**: `MonitoringJobsPage.tsx`
**Purpose**: List of all monitoring-related jobs (probes, health checks, etc.) with cursor-based pagination.

#### Findings

1. **Loading and error states implemented.** No issue.

2. **No filters.** Unlike Operation Jobs (which has a status filter), this page shows all jobs with no way to filter by status, type, or date range. For an operational monitoring page, this limits usefulness.
   - **Recommendation**: Add at minimum a status filter dropdown (Queued / Running / Succeeded / Failed) matching the pattern on Operation Jobs.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

3. **No job detail expansion.** Unlike Operation Jobs (which has expandable rows with `JobDetailPanel`), monitoring jobs show only the table row with no way to inspect results or error details.
   - **Recommendation**: Add expandable rows with job detail (same pattern as Operation Jobs) or make rows clickable to a detail view.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

4. **`JobsTable` is a separate component** not reusing DataTable. This creates an inconsistency — monitoring jobs look different from operation jobs despite representing the same underlying data model.
   - **Recommendation**: Migrate to DataTable for consistency. This also gives you sorting, selection, and expandable rows for free.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

5. **Pagination buttons lack disabled styling clarity.** The Previous/Next buttons are disabled at boundaries but may not have sufficient visual distinction.
   - **Recommendation**: Verify disabled button styling matches DataTable pagination. If using DataTable (per finding 4), this is resolved automatically.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

#### Enhancement Suggestions
- None beyond the findings above.

---

### Page: Probes
**Route**: `/monitoring/probes`
**Component**: `MonitoringProbesPage.tsx`
**Purpose**: Queue device probe batches by selecting target devices, choosing a probe type, optionally providing variables, and reviewing recent probe execution jobs.

#### Findings

1. **Loading, error, and empty states all implemented** via DataTable props. No issue.

2. **Variables JSON textarea has no guidance on format.** Users are expected to type raw JSON but there's no schema hint, example, or link to documentation. The field is optional but if used incorrectly, it silently fails JSON.parse validation with a generic error.
   - **Recommendation**: Add a tooltip on the Variables field: "Optional JSON object passed to the probe. Example: `{\"interface\": \"GigabitEthernet0/1\"}`." Show the validation error inline next to the field, not at the form level.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

3. **"Probe type" dropdown has no explanation of what each probe type does.** A user selecting between probe types (e.g., "health_check" vs. "config_backup") won't know the difference unless they already understand the backend implementation.
   - **Recommendation**: Add a brief description next to each probe type option, or add a tooltip on the dropdown label: "Probes collect data from devices. Choose the type of data you want to gather."
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

4. **Recent probe jobs table is non-interactive.** Job rows don't expand or link to job detail. Users can see status but can't inspect results.
   - **Recommendation**: Make job rows clickable or expandable to show probe results, or link to `/monitoring/jobs` filtered to that job.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

5. **Success message ("Probe batch queued as job #X") is transient.** There's no link to the job so the user can track it.
   - **Recommendation**: Make the job ID in the success message a clickable link to the job detail or monitoring jobs page.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

6. **Form validation error is shown inline.** Good pattern. No issue.

#### Enhancement Suggestions
- Add a "Select all matching" button to the device filter results, so users don't have to checkbox every device individually when probing an entire platform.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

---

### Page: Monitoring Policies
**Route**: `/monitoring/policies`
**Component**: `MonitoringPoliciesPage.tsx`
**Purpose**: CRUD interface for monitoring/compliance policies — secondary to the Compliance Policies page, with an info banner linking to the primary policy workspace.

#### Findings

1. **Loading, error, and empty states all implemented.** No issue.

2. **Info banner linking to Compliance Policies page is helpful** — it sets the right expectation that this is a secondary view. No issue.

3. **Delete confirmation requires typing "DELETE."** Consistent with app-wide pattern. No issue.

4. **Policy form fields lack hints.**
   - "Policy Name": What naming convention should be used?
   - "Policy Description": What should this describe — the rule logic, the business purpose, or the scope?
   - **Recommendation**: Add placeholder text: Policy Name → "e.g., NTP Configuration Check"; Description → "e.g., Ensures all devices have NTP servers configured per company standard."
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

5. **Table uses custom HTML table, not DataTable.** No sorting, no pagination. Acceptable if policy count stays small, but inconsistent with other list views.
   - **Recommendation**: Migrate to DataTable for consistency. Low priority if policy counts are expected to remain under ~20.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

6. **Accessibility: Tab-like buttons for policy status lack `aria-selected` and `role="tab"`.** The status column uses inline badges which is fine, but if any tab-style UI exists, it needs ARIA attributes.
   - **Recommendation**: Review and add ARIA attributes if tab-style controls exist.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

#### Enhancement Suggestions
- None beyond findings above.

---

### Page: Monitoring Logs
**Route**: `/monitoring/logs`
**Component**: `MonitoringLogsPage.tsx`
**Purpose**: Tab-based log viewer showing three log types: HTTP request logs, error logs, and application events, each with independent pagination.

#### Findings

1. **Loading and error states implemented** per tab. No issue.

2. **Empty states implemented** ("No X logs yet..."). No issue.

3. **Tab buttons lack proper ARIA attributes.** The tab switcher uses styled buttons but doesn't use `role="tablist"`, `role="tab"`, `aria-selected`, or `role="tabpanel"`. Screen readers won't announce these as tabs.
   - **Recommendation**: Add `role="tablist"` on the container, `role="tab"` + `aria-selected` on each button, and `role="tabpanel"` on the content area.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

4. **Tables use custom HTML tables, not DataTable.** No sorting capability. For logs, this is acceptable since logs are chronological, but the lack of DataTable means no consistent loading/error/empty UI reuse.
   - **Recommendation**: Low priority — custom tables are fine for read-only log views. Consider DataTable migration only if sorting/filtering is added later.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

5. **Request logs show HTTP method + path but no response time or payload size.** Operators troubleshooting slow requests can't see latency data.
   - **Recommendation**: If the API returns response time data, add a "Duration" column. If not, flag as a backend enhancement.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

6. **Error logs show "correlation_id" without explanation.** Same issue as Monitoring Overview.
   - **Recommendation**: Add tooltip: "Share this ID with your engineering team when reporting issues."
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

7. **No date range filter.** Users can only paginate forward/backward through all logs. There's no way to jump to a specific date or time range.
   - **Recommendation**: Add a date range picker or "Jump to date" input. Medium priority for operational log views.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

#### Enhancement Suggestions
- Add a text search filter to search within log messages. This is the most common interaction with a log viewer.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

---

### Page: Alerts
**Route**: `/monitoring/alerts`
**Component**: `MonitoringAlertsPage.tsx`
**Purpose**: Unified alert dashboard showing recent backend errors, failed jobs, and failing compliance results in one place, with summary stat cards.

#### Findings

1. **Loading, error, and empty states implemented** via DataTable props for all three tables. No issue.

2. **Stat cards provide good at-a-glance severity overview.** Color coding (red for errors/compliance, amber for failed jobs) is appropriate. No issue.

3. **Tables are non-interactive (no row click).** Failed jobs don't link to job detail. Compliance failures don't link to the compliance results page filtered to that device/policy. Error stream entries don't expand to show stack traces or full error context.
   - **Recommendation**: Make failed job rows clickable → navigate to `/operations/jobs` or expand with `JobDetailPanel`. Make compliance failure rows clickable → navigate to `/compliance/results?device={id}`. Make error rows expandable to show full error message.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

4. **No "View all" links.** Each section shows 10 items but there's no way to see more or navigate to the full list.
   - **Recommendation**: Add "View all" links: errors → `/monitoring/logs` (Errors tab), failed jobs → `/operations/jobs?status=failed`, compliance failures → `/compliance/results?status=fail`.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

5. **Compliance failures table shows "Device" and "Policy" columns but resolves names from IDs.** If the name lookup query fails or a device/policy was deleted, the fallback is "Device #X" or "Policy #X" — acceptable but could be confusing.
   - **Recommendation**: No action needed — the fallback is reasonable.
   - [X] Ignore / leave as-is

#### Enhancement Suggestions
- Add an auto-refresh toggle (e.g., "Refresh every 30s") so operators monitoring active incidents see live updates without manual page refresh.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

---

## Group: Operations

### Page: Password Changes
**Route**: `/operations/password-change`
**Component**: `PasswordChangePage.tsx`
**Purpose**: Multi-step wizard for bulk password changes across selected devices. Users select target devices, enter credentials, confirm the action, monitor execution progress, and review results.

#### Findings

1. **This is the most complex page in the app and is well-implemented.** The 4-step wizard flow is logical, the confirmation modal with "CHANGE" phrase is appropriate for a destructive operation, and the live polling during execution provides good feedback. No structural issues.

2. **"Session password" concept is unexplained.** Step 2 mentions that a "session password" can be used if available, but there's no explanation of what a session password is, where it comes from, or how it differs from the "current password" field.
   - **Recommendation**: Add a tooltip or inline note: "A session password is the credential you used to log in. If your login credentials match the device credentials, you can skip the current password field."
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

3. **No password strength indicator on the new password field.** Users can set any password. While password policy enforcement may be a backend concern, a visual strength meter helps users choose better passwords.
   - **Recommendation**: Add a basic password strength indicator (length + complexity) below the new password field. This is guidance, not enforcement.
   - [ ] Add feature
   - [X] Add as TODO comment in file
   - [ ] Ignore / leave as-is

4. **Confirmation modal shows device count and platform summary.** Good — users can verify scope before proceeding. No issue.

5. **Results table shows per-device outcomes (ok/changed/failed).** Good feedback. No issue.

6. **"Retry Failed" button repopulates failed devices for a new batch.** Excellent UX for partial failures. No issue.

7. **No way to cancel a running password change job.** Once execution starts, there's no abort button. If a user realizes they made a mistake (wrong devices, wrong password), they have to wait for all attempts to complete.
   - **Recommendation**: Add a "Cancel" button during step 3 (executing) that sends a cancellation request to the backend. If the backend doesn't support cancellation, show a note: "This operation cannot be cancelled once started. Please verify your selections carefully."
   - [X] Add feature and make sure cancelation requests work on backend
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

8. **Password fields show/hide toggle is missing.** Users can't verify what they typed in the new password field.
   - **Recommendation**: Add an eye icon toggle to show/hide password field values.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

#### Enhancement Suggestions
- Add a "dry run" option that validates connectivity to selected devices without actually changing passwords. This would give operators confidence before committing.
   - [X] Add feature and have this be the validation system.  Have there be a test login page that shows the password change form with the password fields hidden.
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

---

### Page: Operation Templates (HIGH PRIORITY — Template Scrutiny)
**Route**: `/operations/templates`
**Component**: `OperationTemplatesPage.tsx` + `TemplateForm.tsx`
**Purpose**: Manage reusable per-platform command templates (runbooks) that define what commands to execute on devices during operations. This is the most template-heavy page and is used by employees who may not have a coding background.

#### Findings

1. **Loading, error, and empty states all implemented.** DataTable handles these properly. No issue.

2. **HIGH PRIORITY: Template Body textarea has no guidance on syntax.** The placeholder shows `show running-config\n! hostname: {{ hostname }}` which implies Jinja2 templating, but there's no explanation of:
   - What templating language is supported (Jinja2? Mustache? Plain text?)
   - What variables are available and how to reference them
   - Whether commands are executed line-by-line or as a batch
   - Whether output is captured and stored
   - What happens if a command fails mid-template
   - **Recommendation**: Add an info icon at the top of the Template Body section with a collapsible help panel explaining: "Templates use Jinja2 syntax. Variables are referenced with `{{ variable_name }}`. Each line is sent to the device as a separate command. Define expected variables in the Variables JSON field below." Include 2-3 short examples for common use cases (backup, interface config, show commands).
   - [X] Add feature check the schema on backend to assess the supported field inputs and control around the supported inputs.  And validation of inputs would be best.  Have a prompted test page where you can choose a device which matcjhes the platform for the user to run on a test device whihch should be searchable and filterable.  Ensure compatability with different methods allowed for creating operational templates.
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

3. **HIGH PRIORITY: Variables JSON field expects raw JSON with no schema guidance.** The placeholder shows `{"hostname": {"type": "string", "required": true}}` but doesn't explain:
   - What "type" values are valid (string, number, boolean?)
   - What other keys are supported beyond "type" and "required"
   - What happens if a required variable isn't provided at execution time
   - Whether there's a way to set default values
   - **Recommendation**: Add a structured help section or tooltip: "Define the variables your template expects. Each key is a variable name. Supported properties: `type` (string, number, boolean), `required` (true/false), `default` (fallback value)." Consider replacing the raw JSON textarea with a structured variable builder UI (add row → name, type, required toggle, default value) for users who aren't comfortable writing JSON.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

4. **HIGH PRIORITY: "Operation Type" field has no explanation or constrained values.** It's a free-text input with placeholder "backup." Users don't know what operation types exist, whether they should use existing types or create new ones, or what the operation type controls.
   - **Recommendation**: Either convert this to a select dropdown with predefined operation types (backup, configure, show, health_check, etc.) or add a tooltip: "A label that categorizes this template. Common types: backup, configure, show, audit. You can create your own types." Show existing types as suggestions.
   - [X] Add feature tooltip option
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

5. **No required-field indicators on the form.** Platform, Template Name, Operation Type, and Template Body are all required but nothing in the UI indicates this until submission fails.
   - **Recommendation**: Add asterisks or "(required)" labels on all four required fields.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

6. **Template detail modal is read-only and well-structured.** Shows platform, type, description, template body, variables, and notes with clear formatting. Edit button is accessible. No issue.

7. **Delete confirmation modal does not require phrase typing** (unlike device delete). Inconsistent — deleting a template that may be used by scheduled operations could be disruptive.
   - **Recommendation**: Add "DELETE" phrase confirmation for template deletion, consistent with device deletion pattern.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

8. **No indication of whether a template is currently in use.** Users can't see if any scheduled operations or recent jobs reference this template before deleting it.
   - **Recommendation**: Add a "Used by X jobs" count or "Last used" timestamp to the template detail modal or table row.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

#### Enhancement Suggestions
- Add a "Duplicate template" action so users can clone an existing template as a starting point for a new one (common workflow for multi-platform runbooks).
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is
- Add a "Test template" button that renders the template with sample variables and shows the output preview without executing it on a device.
   - [X] Add feature and clarify it is not running on a device
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

---

### Page: Operation Jobs
**Route**: `/operations/jobs`
**Component**: `OperationJobsPage.tsx`
**Purpose**: List of operation execution jobs with status filter, expandable row detail, and cursor-based pagination.

#### Findings

1. **Loading, error, and empty states all implemented.** No issue.

2. **Status filter is implemented** (All / Queued / Running / Succeeded / Failed). Good. No issue.

3. **Expandable rows show `JobDetailPanel`.** Good drill-down capability. No issue.

4. **Status indicators use color + text + animation (pulse for running).** Accessible and informative. No issue.

5. **Duration column shows "—" for incomplete jobs, seconds or minutes for completed ones.** Clear. No issue.

6. **Device count column shows a number but doesn't link to the affected devices.** Users can't quickly see which devices were part of a job.
   - **Recommendation**: Make the device count clickable to expand or navigate to a filtered device list. Alternatively, include device names in the `JobDetailPanel`.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

7. **No date range filter.** Users can only paginate through jobs chronologically. For incident investigation ("what jobs ran yesterday?"), this is limiting.
   - **Recommendation**: Add a date range filter or "Jump to date" input.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

#### Enhancement Suggestions
- Add a "Re-run" button on succeeded/failed jobs to quickly re-execute the same operation with the same parameters.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

---

### Page: Configuration Snapshots
**Route**: `/operations/snapshots`
**Component**: `SnapshotsPage.tsx`
**Purpose**: Browse captured device configurations, preview the latest snapshot content, and compare two snapshots side-by-side to detect configuration drift.

#### Findings

1. **Loading, error, and empty states all implemented.** No issue.

2. **Snapshot comparison (diff) feature is well-implemented.** Select 2 snapshots → Compare button → side-by-side modal. Good workflow. No issue.

3. **Active snapshot preview shows raw config text in a scrollable `<pre>` block.** This is appropriate for network engineers viewing device configs. No issue.

4. **"Source" filter placeholder shows "napalm:get_config"** which is a technical identifier. Non-technical admins won't know what NAPALM is or what source values to type.
   - **Recommendation**: Add a tooltip on the Source filter: "The method used to capture this configuration. Common sources: napalm:get_config, netmiko:send_command." Consider converting to a dropdown populated from existing source values in the data.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

5. **Hash column shows a hash value with no explanation.** Users won't know what the hash represents or why it's useful.
   - **Recommendation**: Add a tooltip on the "Hash" column header: "A fingerprint of the configuration content. If two snapshots have the same hash, their content is identical."
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

6. **Size column shows bytes ("B").** For small configs this is fine; for large configs (100KB+), the number is hard to read. No unit conversion (KB/MB).
   - **Recommendation**: Format size with appropriate units: < 1024 → "X B", < 1048576 → "X.X KB", else "X.X MB".
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

7. **Diff modal shows side-by-side text but doesn't highlight changed lines.** Users have to visually scan for differences.
   - **Recommendation**: Add line-level diff highlighting (green for additions, red for deletions). Consider using a library like `diff` or `react-diff-viewer`.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

#### Enhancement Suggestions
- Add a "Download" button on the snapshot preview to export the configuration as a `.txt` or `.cfg` file.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

---

## Group: Compliance

### Page: Compliance Policies
**Route**: `/compliance/policies`
**Component**: `CompliancePoliciesPage.tsx` + `RulesPanel.tsx` + `PolicyForm.tsx`
**Purpose**: Primary compliance workspace for authoring policies, managing rules within each policy, and triggering compliance evaluations across the device fleet.

#### Findings

1. **Loading and error states implemented.** No issue.

2. **Empty state uses a dashed-border placeholder card with CTA.** Good first-use guidance. No issue.

3. **Policy list uses clickable cards (not a table).** This is a good pattern for a master-detail layout. Selected card is highlighted. No issue.

4. **HIGH PRIORITY: Rule form fields lack explanations for non-technical users.**
   - **"Rule Type"**: What rule types exist? Is this free text or should it match a specific set of types? The input has no placeholder, no hint, no constrained values.
   - **"Expression"**: What language or syntax should be used? Is this a regex, a Python expression, a Jinja2 template, or something else? The textarea has no placeholder, no example, no documentation link.
   - **"Severity"**: The options (Low/Medium/High/Critical) are clear, but there's no guidance on what severity level to choose — what constitutes a "Critical" vs "High" compliance violation in this system?
   - **"Params JSON"**: Same issue as Variables JSON in templates — raw JSON with no schema.
   - **Recommendation**: Add contextual help for each field:
     - Rule Type: tooltip "The evaluation method for this rule. Examples: config_contains, regex_match, json_path_check."
     - Expression: info panel "The pattern or expression evaluated against each device's configuration. Syntax depends on the rule type selected above." Include examples per rule type.
     - Severity: tooltip "How important is compliance with this rule? Critical = must be fixed immediately. Low = informational."
     - Params JSON: same structured help as template variables.
   - [X] Add feature use backend to determine acceptable formats and inputs
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

5. **HIGH PRIORITY: "Scope JSON" field in the policy form is raw JSON.** The placeholder `{"platform_ids":[1,2],"inventory_group_ids":[3]}` tells users the format but not what it means. Users need to know their platform IDs and group IDs to construct this JSON manually.
   - **Recommendation**: Replace the raw JSON textarea with a multi-select UI: "Platforms" multi-select dropdown + "Inventory Groups" multi-select dropdown. Build the JSON payload behind the scenes. This is the highest-impact UX improvement for the compliance workflow.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

6. **"Evaluate compliance" button triggers evaluation but the success message uses technical language.** "Queued X policies in job #Y" — users don't know what "queued" means operationally or where to find job #Y.
   - **Recommendation**: Change to: "Compliance evaluation started. Track progress in [Monitoring Jobs](/monitoring/jobs)." Make the link clickable.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

7. **Delete confirmation modal does NOT require phrase typing**, unlike device and template deletion. Deleting a policy also deletes all its rules — this is a cascading destructive action.
   - **Recommendation**: Add "DELETE" phrase confirmation for policy deletion, consistent with other destructive actions.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

8. **Rule delete confirmation shows rule name and policy name.** Good context. No issue.

9. **No required-field indicators on policy or rule forms.** Users discover required fields only when submission fails.
   - **Recommendation**: Add asterisks on required fields (Policy: name; Rule: name, rule_type, expression).
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

#### Enhancement Suggestions
- Add a "Preview evaluation" feature that dry-runs a policy against a single device and shows what the result would be before running it fleet-wide.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

---

### Page: Compliance Results
**Route**: `/compliance/results`
**Component**: `ComplianceResultsPage.tsx`
**Purpose**: Review compliance evaluation outcomes filtered by device, policy, rule, and status, with expandable detail rows and summary statistics.

#### Findings

1. **Loading, error, and empty states all implemented.** No issue.

2. **Summary stat cards (Pass/Fail/Skip/Error) with color coding are clear and useful.** No issue.

3. **Filter bar with four dropdowns (Device, Policy, Rule, Status) is comprehensive.** No issue.

4. **Expandable rows show raw JSON details.** For non-technical users, raw JSON in a `<pre>` tag is not helpful. They won't know what to look for in the JSON.
   - **Recommendation**: Parse the JSON and render key fields as a structured detail panel (e.g., "Rule expression," "Matched value," "Expected value," "Device config snippet"). Fall back to raw JSON for unrecognized structures.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

5. **Status dots use color + text.** Accessible. No issue.

6. **No export capability.** Compliance results are often needed for reporting (audits, management reviews). There's no way to export results as CSV or PDF.
   - **Recommendation**: Add an "Export CSV" button that exports the current filtered result set.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

7. **No trend/history view.** Users can see current results but not how compliance has changed over time. Did pass rate improve or degrade?
   - **Recommendation**: Add a simple trend chart (pass rate over time) above the table. This can be a future enhancement.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

#### Enhancement Suggestions
- Add a "Group by" toggle to aggregate results by device or by policy, so users can answer "which devices are least compliant?" or "which policies have the most failures?"
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

---

## Group: Lifecycle

### Page: Hardware EoX
**Route**: `/lifecycle/hardware`
**Component**: `HardwareEoxPage.tsx`
**Purpose**: Track hardware end-of-life milestones (End of Sale, Software Maintenance, Security Fixes, Last Day of Support) to identify devices approaching or past lifecycle risk windows.

#### Findings

1. **Loading, error, and empty states all implemented.** No issue.

2. **Summary cards (Past EoS, Due in 90 Days) with danger/warning colors are clear.** No issue.

3. **Date columns use conditional coloring (red for past, amber for due soon).** Good visual treatment. No issue.

4. **Column headers use abbreviations without expansion.** "EoS," "Software Maint," "LDoS" — a user unfamiliar with Cisco lifecycle terminology won't know what these mean.
   - **Recommendation**: Use full labels in the column headers: "End of Sale," "Software Maintenance," "Security Fixes," "Last Day of Support." If column width is a concern, add tooltips on the abbreviated headers.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

5. **"Product Model" column shows "PM-{id}" which is the database ID, not the actual product model string.** This appears to be a data mapping issue — the column should show the `product_model_id` field value, which is presumably a human-readable model identifier (e.g., "WS-C3850-24T").
   - **Recommendation**: Verify the data model. If `product_model_id` is a foreign key, resolve it to the model name. If it's a string identifier, display it directly without the "PM-" prefix.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

6. **Form fields have no hints for date fields.** Users entering lifecycle dates need to know: Where do I find these dates? (Vendor lifecycle bulletins.) What format? (Date picker handles this.) What if I don't know a date? (Leave blank — all dates are optional except product model.)
   - **Recommendation**: Add a form-level note: "Lifecycle dates can be found in vendor End-of-Life bulletins. Leave blank if a specific milestone hasn't been announced." Add a tooltip on Source URL: "Link to the vendor's official lifecycle announcement for this product."
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

7. **No link between lifecycle records and devices.** Users can see that a product model is approaching EoS, but can't see which devices in their inventory use that model.
   - **Recommendation**: Add a "Affected devices" count or link that filters the device list by model number. This is the key action a user wants to take after seeing an EoS warning.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

8. **Delete confirmation does not require phrase typing.** Lower risk than device/template deletion, but still inconsistent.
   - **Recommendation**: Add "DELETE" phrase confirmation for consistency, or explicitly decide this is low-risk enough to skip. Document the decision.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

MANUALLY ADDED:
9. For hardware and software EoX, all devices should be required to be checked every 90 days and grouped device selecting should be by specific model number and software os WITH version. Add cokmpliance rule to check for this which is only editable by owner role and also add rules to check if devices have os with version AND model number.  This EoX poage should have a way to lost the number of devices missing these key fields to this and also which ones are out of range.  Use Q1, Q2, Q3, and Q4 standard date ranges for handling the 90 days.  ANd have Q1 be the current deadline to check by for 2026 even though it just passed so that every device is already due to be checked.

#### Enhancement Suggestions
- Add a timeline or Gantt-style visualization showing lifecycle milestones for all tracked products, so users can see the overall risk landscape at a glance.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

---

### Page: Software EoX
**Route**: `/lifecycle/software`
**Component**: `SoftwareEoxPage.tsx`
**Purpose**: Track software end-of-life windows by OS and version, using pattern matching to associate lifecycle records with devices running specific software versions.

#### Findings

1. **Loading, error, and empty states all implemented.** No issue.

2. **Summary cards match Hardware EoX pattern.** Consistent. No issue.

3. **Date coloring matches Hardware EoX.** Consistent. No issue.

4. **Same column header abbreviation issues as Hardware EoX.** "EoS," "Software Maint," "LDoS" not expanded.
   - **Recommendation**: Same as Hardware EoX — expand abbreviations.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

5. **"Match Operator" field (eq / prefix / regex) is unexplained.** A non-technical user won't know the difference between these operators or when to use each one. This field determines how Orbit matches a lifecycle record to devices, so choosing wrong means devices won't be flagged.
   - **Recommendation**: Add a tooltip on each option:
     - **Equals (eq)**: "Matches devices whose OS version exactly matches the value you enter."
     - **Prefix**: "Matches devices whose OS version starts with the value you enter. E.g., '17.3' matches '17.3.1', '17.3.4a', etc."
     - **Regex**: "Matches devices using a regular expression pattern. For advanced users."
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

6. **"Match Value" field has no placeholder or hint.** Users don't know what format to enter — full version string? Partial? Regex syntax?
   - **Recommendation**: Add a dynamic placeholder that changes based on the selected match operator: eq → "17.3.4", prefix → "17.3", regex → "^17\\.3\\..*"
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

7. **Same lifecycle-to-device linking gap as Hardware EoX.** No way to see which devices match a software lifecycle record.
   - **Recommendation**: Same as Hardware EoX — add "Affected devices" count or link.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

8. **Form validation requires OS Name and Match Value** but no visible required indicators.
   - **Recommendation**: Add asterisks on required fields.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

#### Enhancement Suggestions
- Add a "Test match" button that shows which devices in the current inventory would match the entered OS name + operator + value combination before saving the lifecycle record.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

---

## Group: Admin

### Page: Platforms
**Route**: `/admin/platforms`
**Component**: `PlatformsPage.tsx` + `PlatformForm.tsx`
**Purpose**: Manage platform metadata — the device type definitions that map vendor hardware to automation drivers (NAPALM, Netmiko, Ansible). Owner-only editing with read-only access for admin users.

#### Findings

1. **Loading, error, and empty states all implemented.** No issue.

2. **RBAC is well-implemented.** Non-owner admins see an info banner and "Owner only" text instead of action buttons. No issue.

3. **Sorting and pagination work correctly.** No issue.

4. **Form fields are highly technical and lack hints for non-owner admins reviewing them.** Even read-only users will see these fields in the table:
   - **"Slug"**: What is a slug? (A machine-readable identifier used in API calls and automation scripts.)
   - **"NAPALM"**: Column shows the NAPALM driver name. Non-technical admins won't know what NAPALM is.
   - **"Netmiko"**: Same issue.
   - **"Handler Entrypoint"**: This is a Python module path. Only developers should see this.
   - **"Ansible Network OS"**: Ansible-specific identifier.
   - **Recommendation**: Add tooltips on column headers:
     - Slug: "Machine-readable identifier for this platform, used internally by Orbit."
     - NAPALM: "The NAPALM automation driver used to communicate with devices of this type."
     - Netmiko: "The Netmiko SSH driver type for CLI-based automation."
     - Add a page-level "About this page" collapsible: "Platforms define how Orbit connects to and automates different types of network devices. Each platform maps a vendor's hardware to the correct automation drivers."
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

5. **"Devices" column shows a count but doesn't link to the filtered device list.** Clicking the count should navigate to `/inventory/devices?platform={slug}`.
   - **Recommendation**: Make the device count a clickable link.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

6. **No required-field indicators on the form.** Only "slug" is required but not marked.
   - **Recommendation**: Add asterisk on slug field.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

7. **Delete confirmation does not require phrase typing.** Deleting a platform could orphan devices that reference it.
   - **Recommendation**: Add "DELETE" phrase confirmation and show a warning if devices are currently using this platform: "X devices use this platform. Deleting it will leave them without a platform assignment."
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

#### Enhancement Suggestions
- Add a "Vendor" filter dropdown alongside the slug search, since platforms are grouped by vendor in practice.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

---

### Page: Credential Profiles
**Route**: `/admin/credentials`
**Component**: `CredentialsPage.tsx` + `CredentialForm.tsx`
**Purpose**: Manage credential profiles — reusable authentication configurations that define how Orbit logs into devices. Includes username, auth type, and a masked reference to externally stored secrets.

#### Findings

1. **Loading, error, and empty states all implemented.** No issue.

2. **RBAC matches Platforms page pattern.** Consistent. No issue.

3. **Secret reference masking is well-implemented** (first 6 + last 4 chars visible). Security-conscious. No issue.

4. **"Secret Ref" field needs explanation.** Users creating a credential profile need to know: What is a secret ref? Where do I get this value? What external secret store is it referencing?
   - **Recommendation**: Add a tooltip on the Secret Ref field: "A reference to the credential stored in your organization's secret manager (e.g., Vault path or AWS Secrets Manager ARN). Orbit never stores passwords directly — it uses this reference to retrieve credentials at connection time." If no secret manager is configured, this field may need different guidance.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

5. **"Auth Type" is a dropdown but currently only has one option (`username_password`).** The single-option dropdown is unnecessary — it looks like a placeholder for future auth types.
   - **Recommendation**: If only one auth type is supported, set it as a default and hide the dropdown. If multiple types are planned, keep the dropdown but add a note: "Additional authentication types (certificate, API key) will be available in a future release."
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

6. **"Devices" column shows count but doesn't link.** Same issue as Platforms page.
   - **Recommendation**: Make the device count a clickable link to the filtered device list.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

7. **No required-field indicators.** Name and auth_type are required but not marked.
   - **Recommendation**: Add asterisks on required fields.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

8. **Delete confirmation does not require phrase typing.** Deleting a credential profile could leave devices unable to authenticate.
   - **Recommendation**: Add "DELETE" phrase confirmation and show a warning: "X devices use this credential profile. Deleting it will prevent Orbit from connecting to those devices."
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

MANUALLY ADDED:
9. Credential profiles should not actuially store any actual passwords.

#### Enhancement Suggestions
- Add a "Test connection" button that attempts to authenticate against a selected device using this credential profile, confirming the secret ref resolves correctly.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

---

### Page: Audit Log
**Route**: `/admin/audit`
**Component**: `AuditPage.tsx`
**Purpose**: Searchable audit trail of all user actions and configuration changes, with expandable JSON payload detail and cursor-based pagination.

#### Findings

1. **Loading, error, and empty states all implemented.** No issue.

2. **Action badges are color-coded by verb (create=green, update=amber, delete=red).** Clear visual hierarchy. No issue.

3. **Expandable rows show raw JSON payload.** For audit purposes, the raw payload is appropriate — auditors need to see exactly what changed. No issue for this audience.

4. **Filter inputs are free text (action, target_type) with no autocomplete or dropdown suggestions.** Users need to know valid values to filter effectively (e.g., "platform.create," "device.update"). Without guidance, they'll type incorrect filters and see no results.
   - **Recommendation**: Convert at least the "Target Type" filter to a dropdown populated from existing target types in the data (platform, device, credential_profile, policy, etc.). For "Action," consider a dropdown or autocomplete with observed action values.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

5. **No date range filter.** Audit log queries are almost always date-bounded ("show me everything from last Tuesday"). Cursor pagination alone is insufficient for temporal queries.
   - **Recommendation**: Add a date range picker. This is high priority for an audit log.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

6. **No export capability.** Audit logs are frequently exported for compliance reporting or security incident investigation.
   - **Recommendation**: Add an "Export CSV" button for the current filtered result set.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

7. **"Actor" column shows `actor_display_name` or falls back to "Actor #X."** The fallback is acceptable but could be confusing if users were deleted.
   - **Recommendation**: No action needed — fallback is reasonable.
   - [X] Ignore / leave as-is

8. **IP column shows source IP in monospace.** Good for security review. No issue.

#### Enhancement Suggestions
- Add a "Filter by actor" dropdown to quickly see all actions by a specific user.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

---

## Group: Shared / Layout

### Component: AppShell
**Component**: `AppShell.tsx`
**Purpose**: Main application shell wrapping sidebar, top bar, and content outlet.

#### Findings

1. **Responsive layout with mobile sidebar overlay.** Good. No issue.

2. **Sidebar state (collapsed/expanded) persists via Zustand store.** Good UX — sidebar preference survives navigation. No issue.

3. **No skip-to-content link.** Screen reader and keyboard users have to tab through the entire sidebar before reaching page content.
   - **Recommendation**: Add a visually-hidden "Skip to main content" link as the first focusable element that jumps to the `<main>` tag.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

#### Enhancement Suggestions
- None beyond the finding above.

---

### Component: Sidebar
**Component**: `Sidebar.tsx`
**Purpose**: Navigation sidebar with collapsible sections, role-based filtering, and "Soon" badges for placeholder items.

#### Findings

1. **Role-based nav filtering via `useAuthorization` hook.** Admin section only visible to authorized roles. Good. No issue.

2. **"Soon" badges on placeholder nav items set expectations.** Good. No issue.

3. **Active route detection and auto-expansion of parent sections.** Good navigation UX. No issue.

4. **Collapse button has accessibility label.** No issue.

5. **On mobile, sidebar overlay closes when clicking outside or pressing Escape?** Verify that Escape key dismissal is implemented. If not, this is an accessibility gap.
   - **Recommendation**: Verify Escape key closes mobile sidebar. If not, add `onKeyDown` handler for Escape.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

#### Enhancement Suggestions
- None — sidebar is well-implemented.

---

### Component: TopBar
**Component**: `TopBar.tsx`
**Purpose**: Application header with logo, mobile menu toggle, theme toggle, and logout/demo exit buttons.

#### Findings

1. **Theme toggle (light/dark) is functional.** No issue.

2. **Demo badge is visible when in demo mode.** Good. No issue.

3. **Logout button is present.** No issue.

4. **No user identity display.** The top bar doesn't show who is currently logged in. Users managing multiple accounts or sharing a screen won't know which user is authenticated.
   - **Recommendation**: Add the current username or display name to the top bar, to the left of the logout button.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

#### Enhancement Suggestions
- None beyond the finding above.

---

### Component: Page
**Component**: `Page.tsx`
**Purpose**: Reusable page wrapper providing consistent title and description header.

#### Findings

1. **Clean, consistent wrapper.** Provides max-width container and spacing. No issue.

2. **Title is set as both visible heading and `document.title`.** Good for SEO/accessibility. No issue (verify `document.title` is set via `useEffect` or Helmet).

#### Enhancement Suggestions
- None — component is clean.

---

### Component: ErrorBoundary
**Component**: `ErrorBoundary.tsx`
**Purpose**: Catches React render errors and displays a recovery UI instead of a white screen.

#### Findings

1. **Error message with retry and full reload buttons.** Good recovery UX. No issue.

2. **Errors logged to console with "orbit_ui_render_error" prefix.** Good for debugging. No issue.

3. **No error reporting to an external service.** Render errors are only logged to the browser console, which means they're invisible to the engineering team unless a user reports them.
   - **Recommendation**: Add error reporting to a monitoring service (Sentry, LogRocket, or a custom endpoint). Flag as a future infrastructure enhancement.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

#### Enhancement Suggestions
- None beyond the finding above.

---

### Component: DataTable
**Component**: `DataTable.tsx`
**Purpose**: Shared table component with sorting, pagination (cursor + offset), selection, expandable rows, and loading/error/empty states.

#### Findings

1. **Comprehensive accessibility attributes:** `aria-sort` on sortable headers, `aria-label` on checkboxes, `role="button"` on clickable rows, `aria-expanded` on expandable rows, keyboard Enter/Space handlers. Well-implemented.

2. **Loading state shows 5 skeleton rows.** Good placeholder pattern. No issue.

3. **Error state with retry button.** Good. No issue.

4. **Empty state accepts custom ReactNode.** Flexible. No issue.

5. **Sort indicator arrows lack ARIA labels.** The SVG arrows in sortable headers don't have `aria-label` attributes, so screen readers won't announce sort direction beyond the `aria-sort` attribute on the `<th>`.
   - **Recommendation**: Low priority — `aria-sort` on the `<th>` is the correct ARIA pattern and is already implemented. The SVG arrows are decorative. No action needed.
   - [X] Ignore / leave as-is

#### Enhancement Suggestions
- None — this is the strongest shared component in the app.

---

### Component: NotFound
**Component**: `NotFound.tsx`
**Purpose**: 404 error page with link back to home.

#### Findings

1. **Clean, simple 404 page.** No issue.

#### Enhancement Suggestions
- Add a search input or list of common pages so users can find what they were looking for.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

---

### Context: DemoContext
**Component**: `DemoContext.tsx`
**Purpose**: Provides demo mode toggle that creates a mock JWT and bypasses authentication for stakeholder showcases.

#### Findings

1. **Session-scoped demo mode (sessionStorage).** Appropriate — demo mode ends when the browser tab is closed. No issue.

2. **Full page reload on enter/exit.** This works but creates a jarring UX compared to SPA transitions. Acceptable for a demo feature.
   - **Recommendation**: Low priority. Consider using React Router navigation instead of `window.location` for smoother transitions.
   - [X] Add feature
   - [ ] Add as TODO comment in file
   - [ ] Ignore / leave as-is

3. **Demo token has 365-day expiry.** Since it's session-scoped, this is harmless — the token is cleared when the tab closes. No security concern.

#### Enhancement Suggestions
- None — demo mode is fit for purpose.

---

## Cross-Cutting Findings

These issues appear across multiple pages and should be addressed systematically rather than per-page.

### CC-1: No required-field indicators anywhere in the app
Every form in the app (DeviceForm, TemplateForm, PolicyForm, RuleForm, HardwareForm, SoftwareForm, PlatformForm, CredentialForm) lacks visual indicators for required fields. Users discover requirements only when submission fails.
- **Recommendation**: Adopt a consistent pattern app-wide. Options: red asterisk + "(required)" on labels, or a form-level note "Fields marked * are required" + asterisks. Apply to all forms.
- [X] Add feature
- [ ] Add as TODO comment in file
- [ ] Ignore / leave as-is

### CC-2: No toast/snackbar notifications for successful actions
Successful create/update/delete actions rely on the modal closing and the table refreshing as the only feedback. There's no explicit "Success" notification. Users performing rapid actions may not notice the table updated.
- **Recommendation**: Add a toast notification system (e.g., react-hot-toast or Sonner) and show success messages after mutations: "Device created," "Template updated," "Policy deleted."
- [X] Add feature
- [ ] Add as TODO comment in file
- [ ] Ignore / leave as-is

### CC-3: Inconsistent delete confirmation patterns
Some delete actions require typing "DELETE" (devices, templates in some flows), others just have a confirm button (policies, lifecycle records, platforms, credentials). The risk level varies, but the inconsistency is confusing.
- **Recommendation**: Standardize: require phrase confirmation for any delete that affects other records (cascading) or is hard to recreate. Simple records with no dependencies can use a simple confirm.
- [X] Add feature
- [ ] Add as TODO comment in file
- [ ] Ignore / leave as-is

### CC-4: No unsaved-changes warnings on any form
Navigating away from a form with unsaved changes silently discards them. This affects: Device Create/Edit, all modal forms (templates, policies, rules, lifecycle records, platforms, credentials).
- **Recommendation**: Add `beforeunload` listener for page-level forms (Device Create/Edit). For modal forms, add a "Discard changes?" confirmation when closing a dirty modal.
- [X] Add feature
- [ ] Add as TODO comment in file
- [ ] Ignore / leave as-is

### CC-5: DeviceFilters component has unassociated labels
The `DeviceFilters` component uses `<label>` elements without `htmlFor` attributes and inputs without `id` attributes. Labels are not programmatically associated with their inputs. This is an accessibility violation (WCAG 1.3.1).
- **Recommendation**: Add matching `id` and `htmlFor` attributes to all filter inputs.
- [X] Add feature
- [ ] Add as TODO comment in file
- [ ] Ignore / leave as-is

### CC-6: No page-level "About this page" explanations
The `<Page>` component renders a description below the title, which is good. But many pages deal with concepts that need more context than a one-line description provides (compliance policies, operation templates, lifecycle tracking, credential profiles). Non-technical admins managing the platform need a way to understand what they're looking at without asking a developer.
- **Recommendation**: Add a collapsible "Learn more" or info-icon popover on pages where the domain concepts are non-obvious. Priority pages: Compliance Policies, Operation Templates, Lifecycle (both), Admin Platforms, Admin Credentials.
- [X] Add feature
- [ ] Add as TODO comment in file
- [ ] Ignore / leave as-is

### CC-7: Tables with count columns don't link to filtered views
Platform "Devices" count, Credential Profile "Devices" count, and similar numeric columns show a count but don't let users click through to see those specific records.
- **Recommendation**: Make all count columns clickable links to the relevant list page with appropriate filters applied.
- [X] Add feature
- [ ] Add as TODO comment in file
- [ ] Ignore / leave as-is
