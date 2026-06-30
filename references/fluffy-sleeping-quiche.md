# Orbit Frontend Buildout Plan

## Context

The Orbit frontend currently has a working auth flow, a devices list page, and a monitoring section (overview, jobs, policies, logs). However, the backend exposes far more capability than the frontend consumes — inventory groups, tags, platforms, credential profiles, compliance rules/results, lifecycle/EoX, operation templates, config snapshots, device health/probes, and audit logs all have API endpoints with no UI.

The `references/frontend_navigation_map.md` plan and `scope_answers.md` decisions call for a comprehensive frontend that surfaces all these capabilities. This plan reconciles the nav map, the integration mapping, the scope answers, and the actual codebase state into an actionable buildout.

**Key user decisions driving this plan:**
- Inventory first, then Operations, then Compliance (progressive rollout)
- Full nav with all sections shown (placeholders for unbuilt sections)
- Demo mode via "Demo Login" button for showcasing with fake data
- Shared DataTable component built before new pages
- Groups/Tags integrated into the devices experience (no separate pages)
- Device detail page with all tabs (real content for Summary, placeholders for rest)
- Policies primary home in Compliance, with contextual links from Monitoring
- Role-based restrictions: owner = full edit, admin = conservative/safe UI
- UI aesthetic references monitoring mockups (dense, ops-focused layout, status dots, monospace for IPs/commands, tight padding) but keeps Orbit's own color palette

---

## Phase 0 — Foundation

### 0A. Navigation Refactor: Header → Sidebar

Replace the header-based nav with a collapsible sidebar. The header dropdown pattern doesn't scale to 7+ sections.

**Target navigation structure:**
```
Overview              /
Inventory
  Devices             /inventory/devices
Monitoring
  Overview            /monitoring
  Jobs                /monitoring/jobs
  Policies            /monitoring/policies
  Logs                /monitoring/logs
  Health              /monitoring/health         [placeholder]
  Probes              /monitoring/probes         [placeholder]
  Alerts              /monitoring/alerts         [placeholder]
Operations
  Templates           /operations/templates      [placeholder]
  Jobs                /operations/jobs           [placeholder]
  Snapshots           /operations/snapshots      [placeholder]
Compliance
  Policies            /compliance/policies       [placeholder]
  Results             /compliance/results        [placeholder]
Lifecycle
  Hardware EoX        /lifecycle/hardware        [placeholder]
  Software EoX        /lifecycle/software        [placeholder]
Admin
  Platforms           /admin/platforms           [placeholder]
  Credentials         /admin/credentials         [placeholder]
  Audit               /admin/audit               [placeholder]
```

**Files to create:**
- `src/components/layout/Sidebar.tsx` — collapsible left rail (240px desktop, 64px icon-only, slide-over on mobile)
- `src/components/layout/AppShell.tsx` — new layout wrapper: sidebar + slim top bar + content area
- `src/components/layout/navConfig.ts` — typed nav tree array with `{ label, to, icon, children?, placeholder?, roles? }`
- `src/pages/PlaceholderPage.tsx` — "Coming Soon" page with section-appropriate messaging

**Files to modify:**
- `src/app/routes.tsx` — restructure with layout route rendering AppShell; add all placeholder routes; redirect `/devices` → `/inventory/devices`
- `src/components/layout/Header.tsx` — slim down to top bar only (logo, theme toggle, user menu, demo badge)
- `src/components/layout/Page.tsx` — remove Header rendering, keep title/description wrapper
- `src/app/store/index.ts` — add persisted `isSidebarCollapsed` preference

**Design notes:**
- Sidebar uses Orbit color tokens, not mockup colors
- Dense padding and smaller text inspired by mockup aesthetic
- Active section auto-expands; sections collapsible via click
- `roles` array on nav items enables RBAC gating (Phase 0C)

### 0B. Shared DataTable Component

Every table currently duplicates structure. Build a reusable `DataTable` before new pages.

**Location:** `src/components/ui/DataTable/`

**Component API (key props):**
- `columns: ColumnDef<T>[]` — header, accessor function, sortable flag, width
- `data: T[]` + `keyExtractor`
- `pagination` — supports both cursor mode (next/prev cursors) and offset mode (page number)
- `sorting` — field, direction, onSort callback (server-side)
- `selection` — enabled flag, selected set, onChange (for bulk actions)
- `expandable` — render function for expanded row content
- `bulkActions` — ReactNode rendered in sticky bar when rows selected
- `emptyState` — CTA-oriented empty state per scope answer #19
- `dense` — tighter padding for ops-focused aesthetic
- States: `isLoading` (skeleton rows), `isError` (inline retry), empty

**File structure:**
```
src/components/ui/DataTable/
  index.ts
  DataTable.tsx
  DataTableHeader.tsx        — thead with sort indicators
  DataTableBody.tsx          — tbody with rows
  DataTableRow.tsx           — row with selection checkbox + expand toggle
  DataTablePagination.tsx    — cursor + offset pagination
  DataTableBulkBar.tsx       — sticky bar when rows selected: "{N} selected" + action buttons
  DataTableEmpty.tsx         — empty/error/loading states
  types.ts
```

**After building:** Migrate existing tables incrementally:
1. `DeviceTable.tsx` → DataTable with basic columns
2. `JobsTable.tsx` → DataTable with expandable rows
3. Monitoring policies/logs inline tables → DataTable

### 0C. RBAC Foundation

**Role definitions:**
- `owner` — dev/owner role, full edit access to everything
- `admin` — conservative restrictions, dangerous actions disabled/hidden

**Files to create:**
- `src/lib/roles.ts` — role constants, `hasRole()`, `isOwner()` helpers
- `src/hooks/useAuthorization.ts` — hook exposing `{ roles, hasRole, isOwner, canEdit, canDelete }`

**Backend changes (minimal, parallel):**
- `app/auth/roles.py` — define `ROLE_OWNER`, `ROLE_ADMIN` constants
- `app/auth/routes.py` — include `roles` in JWT claims (currently only in user serialization)
- Extend `require_roles` to understand owner-has-all-access

**Frontend enforcement:**
- `useAuth` hook extended to extract `roles` from JWT payload
- Nav items with `roles` array checked by sidebar
- Dangerous actions (delete, bulk ops, template execution) disabled for admin role
- Edit forms show reduced fields for admin role where applicable

### 0D. Demo Mode

**Architecture:** Intercepting at React Query level with a separate QueryClient when demo mode is active.

**Files to create:**
```
src/contexts/DemoContext.tsx        — DemoProvider + useDemo hook
src/lib/demo/
  index.ts
  generators.ts                     — mock data factories per entity type
  queryOverrides.ts                 — custom queryFn routing by query key
```

**Flow:**
1. "Demo Login" button on `LoginPage.tsx` calls `enterDemo()`
2. Sets `isDemo = true` in sessionStorage
3. Creates fake JWT token with `{ sub: "demo-user", username: "demo", roles: ["owner"] }`
4. Navigates to `/`
5. `AppProviders` detects demo mode → provides separate QueryClient with mock queryFn
6. All `useQuery` calls automatically get generated mock data, zero feature code changes
7. Mutations update in-memory mock store + show success toasts

**Visual indicators:**
- "DEMO MODE" pill badge in top bar (amber/gold color)
- "Exit Demo" link in sidebar footer
- `exitDemo()` clears sessionStorage, deletes fake token, redirects to `/login`

**Mock generators:** `generateDevices(30)`, `generateJobs(15)`, `generatePolicies(5)`, `generateLogs(25)`, `generateGroups(4)` — generated once per session (memoized for consistency).

---

## Phase 1 — Inventory (Detailed)

### 1A. Enhanced Devices List Page

**Reconcile type mismatch first:** Frontend `Device` type uses `{ id: string, hostname, platform, status, site, lastSeen }` but backend returns `{ id: number, name, mgmt_ipv4, os_name, ... }`. Update `src/lib/types/index.ts` to match the real API shape.

**Update `src/features/devices/api/devices.api.ts`:**
- Full CRUD: `fetchDevices(options)`, `fetchDevice(id)`, `createDevice()`, `updateDevice()`, `deleteDevice()`
- Bulk: `bulkUpdateDevices()`
- Use cursor pagination with filter/sort params

**Refactor `DevicesListPage`** to use DataTable with:
- Server-side sorting (column clicks → `sort` query param)
- Filter sidebar/bar: text search (debounced), platform dropdown, group dropdown, active/inactive toggle, tag multi-select
- Cursor pagination via DataTable
- Row selection + bulk action bar
- Row click → navigate to `/inventory/devices/:id`
- "Add Device" and "Import CSV" buttons in page header

**Files to create:**
- `src/features/devices/components/DeviceFilters.tsx`
- `src/features/devices/components/DeviceBulkActions.tsx`
- `src/features/devices/components/CreateDeviceModal.tsx`

### 1B. Device Detail Page

**Route:** `/inventory/devices/:id`

**Layout:** Header with device name, status badge, key metadata, tags as pills, action buttons (Edit, Delete with typed-phrase confirm). Tabbed content below.

**Tabs (all present, real content for Summary only):**
- **Summary** — two-column: properties card (all fields as definition list) + quick stats cards (last seen, interfaces, snapshots) + recent jobs timeline + tags section (add/remove) + group membership + editable notes
- **Monitoring** — placeholder: "Health data will appear here when probes are configured"
- **Operations** — placeholder: "Operation history will appear here"
- **Compliance** — placeholder: "Compliance results will appear here"
- **Lifecycle** — placeholder: "Lifecycle/EoX status will appear here"

Tab selection via URL query param `?tab=summary`.

**Files to create:**
```
src/features/devices/pages/DeviceDetailPage.tsx
src/features/devices/components/DeviceDetailHeader.tsx
src/features/devices/components/tabs/DeviceSummaryTab.tsx
src/features/devices/components/tabs/DeviceMonitoringTab.tsx    [placeholder]
src/features/devices/components/tabs/DeviceOperationsTab.tsx    [placeholder]
src/features/devices/components/tabs/DeviceComplianceTab.tsx    [placeholder]
src/features/devices/components/tabs/DeviceLifecycleTab.tsx     [placeholder]
```

### 1C. Device Create/Edit Forms

**Shared `DeviceForm.tsx`** used by both create modal and edit mode:
- Fields: name (required), fqdn, mgmt_ipv4, mgmt_port, platform (dropdown), credential profile (dropdown), inventory group (dropdown), os_name, os_version, serial_number, notes
- Platform and credential profile dropdowns require new API calls
- RBAC: admin role sees reduced/disabled dangerous fields

**Files to create:**
- `src/features/devices/components/DeviceForm.tsx`
- `src/features/devices/api/platforms.api.ts`
- `src/features/devices/api/credentialProfiles.api.ts`

### 1D. Groups & Tags Integration (into Devices)

No separate pages — integrated into the devices experience:

- **Filter sidebar:** Group dropdown and tag multi-select filter the device list
- **Bulk actions:** "Assign to group" and "Assign tags" in the bulk bar
- **Device detail:** Tags as pills with add/remove; group membership with reassign
- **Note:** Backend may need a `filter[tag]` param on `/devices` endpoint — scope as backend enhancement if needed

**Files to create:**
- `src/features/devices/api/groups.api.ts`
- `src/features/devices/api/tags.api.ts`

### 1E. CSV Import

Multi-step modal accessible from devices list "Import CSV" button:
1. File upload dropzone (accepts `.csv`)
2. Column mapping with 5-row preview and auto-detect
3. Validation preview (success/error per row)
4. Import execution with progress bar (batch `POST /devices` calls)
5. Results summary

**Files to create:**
```
src/features/devices/components/CSVImport/
  CSVImportModal.tsx
  CSVUploadStep.tsx
  CSVMappingStep.tsx
  CSVValidationStep.tsx
  CSVImportStep.tsx
  csvParser.ts
```

**Dependency:** Add `papaparse` for CSV parsing.

### 1F. Supporting API Modules

```
src/features/devices/api/groups.api.ts          — inventory groups CRUD + assign
src/features/devices/api/tags.api.ts            — device tags CRUD
src/features/devices/api/platforms.api.ts       — platforms list for dropdowns
src/features/devices/api/credentialProfiles.api.ts  — credential profiles list
```

Add query keys to `src/lib/constants.ts`: `inventoryGroups`, `platforms`, `credentialProfiles`, `deviceTags`, `deviceDetail`.

---

## Phase 2 — Auth, Password Change & Login Cleanup

### 2A. Auth & Encrypted Session Password

**Goal:** Encrypt the user's login password into the JWT so backend services can decrypt it for Netmiko/API operations. Add dev-mode auth bypass. Clean up login page.

**Backend files to modify:**

`app/config.py` — Add to `BaseConfig`:
- `CREDENTIAL_ENCRYPTION_KEY: str` — Fernet key from env `CREDENTIAL_ENCRYPTION_KEY`
- Auto-derive from `JWT_SECRET_KEY` via HKDF in dev when env var empty

Add to `DevConfig`:
- `AUTH_DEV_BYPASS = True` — skip Netmiko, approve any login if username exists in DB

**New file: `app/utils/credential_crypto.py`**
- `encrypt_password(plaintext, key) -> str` — Fernet encrypt, returns URL-safe base64
- `decrypt_password(token, key) -> str` — Fernet decrypt, returns plaintext
- `get_fernet_key(app_config) -> bytes` — resolve key from config (auto-generate in dev via HKDF from JWT_SECRET_KEY)

`app/auth/routes.py` — Modifications:
- `_verify_device_credentials()`: if `AUTH_DEV_BYPASS` is true, check username exists in DB and return `(True, None)` immediately
- `login()`: after successful auth, encrypt password → add `ep` claim to JWT
- `refresh()`: carry forward `ep` claim from old token
- New helper `get_session_password() -> str | None`: decrypt `ep` from current JWT claims (used by services)

**Frontend files to modify:**

`src/features/auth/pages/LoginPage.tsx`:
- Remove disclaimer paragraph about storing passwords
- Remove "Remember password" toggle (unnecessary with JWT approach)
- Simplify subtitle to "Sign in with your network credentials"

`src/hooks/useAuth.ts`:
- Add `ep?: string` to `OrbitJwtPayload`
- Add `hasSessionPassword: boolean` to hook return (frontend never decrypts, just knows if it's present)

### 2B. Password Change Backend Service

**Goal:** Dedicated service with handlers for all 17 device types from the reference code, replacing the stub `run_with_nornir()`.

**New files:**
```
app/services/password_change.py                     — Orchestrator + batch executor
app/services/handlers/__init__.py
app/services/handlers/registry.py                   — Platform-slug → handler mapping + command loading
app/services/handlers/ssh_handler.py                — Netmiko-based handler (11 SSH platforms)
app/services/handlers/api_handler.py                — REST-based handler (6 API platforms)
app/services/handlers/password_change_commands.json  — Copied from references/
```

**`registry.py`** — Platform dispatch:
- SSH_PLATFORMS: `cisco_ios`, `cisco_xe`, `cisco_xr`, `cisco_nxos`, `cisco_asa`, `cisco_ftd`, `juniper_junos`, `WLC`, `F5`, `gigamon`, `lantronix`, `cimc`
- API_PLATFORMS: `WTI`, `APIC`, `NDO`, `Expressway`, `ISE`, `F5_oshost`
- `get_handler(platform_slug)` → callable
- `get_commands(platform_slug)` → command template list from JSON
- NETMIKO_TYPE_MAP: slug → netmiko device_type string

**`ssh_handler.py`** — Per-device SSH flow:
1. Connect via `ConnectHandler` with current creds
2. Enter enable mode (platform-dependent)
3. Substitute placeholders: `new_password`, `current_enable`, `min_vty`/`max_vty`
4. IOS/XE: discover VTY range via `show line` first
5. Dispatch commands: `send_config_set()` for standard, `send_command_timing()` for interactive prompts (FTD, Junos, WLC, F5, CIMC, Lantronix, Gigamon)
6. Save config, disconnect
7. Validation: reconnect with new credentials
- Returns `PasswordChangeResult` dataclass (device_id, ok, changed, output, error, phase)
- Never raises — catches all exceptions

**`api_handler.py`** — Per-device REST flow:
- `_change_wti()`: PUT `/api/v2/config/users` with BasicAuth
- `_change_apic()`: POST login → POST changeSelfPassword → validate
- `_change_ndo()`: POST login → PUT user password
- `_change_expressway()`: PUT with BasicAuth to changepassword endpoint
- `_change_ise()`: ERS API call
- `_change_f5_oshost()`: PATCH `/mgmt/shared/authz/users/admin`
- All use `requests.Session(verify=False)`, returns `PasswordChangeResult`

**`password_change.py`** — Orchestrator:
```python
@dataclass
class PasswordChangeRequest:
    device_ids: list[int]
    new_password: str
    current_password: str       # from JWT ep claim if not provided
    enable_secret: str = ""     # defaults to current_password
    requested_by: str = ""
    timeout_per_device: int = 30
    validate_after: bool = True
```
- Loads devices with platforms + credential profiles
- Each device uses its CredentialProfile's `username`
- Batch execution via `ThreadPoolExecutor(max_workers=30)` per batch
- Progress callback updates JobTask status for async tracking
- Logs each device result to `AppEvents` table for monitoring

**`app/api/v1/resources/operations.py`** — New endpoint:
- `POST /operations/password-change` — accepts device_ids, new_password, current_password (optional, defaults to session JWT), enable_secret, validate_after, async flag
- Async (default): creates Job + per-device JobTasks, returns 202
- Sync: runs immediately, returns 200 with results

**Logging integration:** Every password change attempt creates:
- `AppEvents` entry with event=`password_change.attempt` per device (includes device_id, platform, success/fail)
- `AppEvents` entry with event=`password_change.batch_complete` on batch finish (total/succeeded/failed counts)
- On failure: `ErrorLogs` entry with traceback + device context
- All entries tagged with Job ID for correlation

### 2C. Password Change Frontend Page

**Nav update** — `src/components/layout/navConfig.ts`:
- Remove `placeholder: true` from Operations section
- Change default `to:` to `/operations/password-change`
- Add `{ label: "Password Changes", to: "/operations/password-change" }` as first child

**New feature directory:**
```
src/features/operations/
  api/operations.api.ts
  components/DeviceSelectionTable.tsx
  components/PasswordChangeForm.tsx
  components/PasswordChangeProgress.tsx
  pages/PasswordChangePage.tsx
```

**`PasswordChangePage.tsx`** — State machine with 4 steps:

1. **"select"**: `DeviceSelectionTable` wrapping `DataTable<Device>` with checkbox selection. Filters by platform, group, active status. Device name, mgmt_ipv4 (monospace), platform badge, credential profile. "Next" enabled when selection > 0.

2. **"credentials"**: `PasswordChangeForm` with Current Password, New Password, Confirm New Password. Client-side match validation. Shows selected device count + platform breakdown (colored badges). Confirmation modal requiring "CHANGE" (same pattern as existing `PasswordRotationCard`).

3. **"executing"**: `PasswordChangeProgress` component. Progress bar (`X / Y complete`). DataTable rows with:
   - Status: 8px dot (green=success+glow, red=failed+glow, yellow=in-progress+CSS pulse, gray=pending)
   - Device name, IP (mono), Platform badge, Phase text, Output/error
   - Failed sort to top, succeeded to bottom (per user requirement)
   - Polls job status every 2s via `useQuery({ refetchInterval: 2000 })`

4. **"complete"**: Summary card (X succeeded, Y failed of Z). Full results table. "Retry Failed" pre-loads failed IDs → returns to "credentials". "Done" resets.

**Route** — `src/app/routes.tsx`:
```tsx
<Route path="/operations/password-change" element={
    <Page title="Password Changes"><PasswordChangePage /></Page>
} />
```

**Demo mode** — `src/lib/demo/generators.ts`: Add mock password change results (mixed success/failure with realistic output). `queryOverrides.ts`: Handle `passwordChangeJob` query key.

**Constants** — `src/lib/constants.ts`: Add query keys `passwordChangeJob`, `operationTemplates`, `snapshots`.

---

## Phase 3 — Operations Pages (Templates, Jobs, Snapshots)

### 3A. Operation Templates Page
**Files:** `src/features/operations/pages/OperationTemplatesPage.tsx`, `components/TemplateForm.tsx`, `components/TemplateDetailModal.tsx`
**API:** `/platform_operation_templates` (existing CRUD). Add functions to `operations.api.ts`.
**Layout:** DataTable with name, op_type badge, platform name, description (truncated), updated_at. Create/edit via modal with monospace textarea for template text. Row click → detail modal.

### 3B. Operation Jobs Page
**Files:** `src/features/operations/pages/OperationJobsPage.tsx`, `components/JobDetailPanel.tsx`
**API:** Reuse `fetchJobs()` from monitoring API with `job_type=operation.*` filter.
**Layout:** DataTable with cursor pagination. ID, job_type badge, status dot, device count, timestamps, duration. Expandable rows with per-task breakdown.

### 3C. Config Snapshots Page
**Files:** `src/features/operations/pages/SnapshotsPage.tsx`, `components/SnapshotDiffModal.tsx`
**API:** `/snapshots` (existing CRUD). Add to `operations.api.ts`.
**Layout:** DataTable with device name, snapshot type badge, content_hash (mono, truncated), size, created_at. Row click → monospace code block. "Compare" for side-by-side diff.

**Route/nav updates:** Replace PlaceholderPage entries in `routes.tsx`. Remove `placeholder: true` from Templates, Jobs, Snapshots in `navConfig.ts`.

---

## Phase 4 — Compliance & Lifecycle Pages

### 4A. Compliance Policies
**Files:** `src/features/compliance/api/compliance.api.ts`, `pages/CompliancePoliciesPage.tsx`, `components/PolicyForm.tsx`, `components/RulesPanel.tsx`
**API:** `/compliance/policies`, `/compliance/rules`, `/compliance/evaluate`.
**Layout:** Two-column: policy card list (left) + rules panel (right). Active toggle with status dot. "Evaluate" button per policy creates a job. Rule severity as colored badges.

### 4B. Compliance Results
**Files:** `src/features/compliance/pages/ComplianceResultsPage.tsx`, `components/ResultsFilterBar.tsx`
**API:** `/compliance/results` with filters.
**Layout:** Aggregate stats cards at top. DataTable: device, policy, rule, status dot (green=pass, red=fail), evaluated_at. Expandable rows for details JSON.

### 4C. Hardware EoX
**Files:** `src/features/lifecycle/api/lifecycle.api.ts`, `pages/HardwareEoxPage.tsx`
**API:** `/eox_hardware`. Summary cards: past-EoS count (red), due-in-90-days (yellow). DataTable with date columns color-coded by urgency. CRUD via modal.

### 4D. Software EoX
**Files:** `src/features/lifecycle/pages/SoftwareEoxPage.tsx`
**API:** `/eox_software`. Same pattern as hardware.

**Route/nav updates:** Replace all Compliance/Lifecycle PlaceholderPage entries. Remove `placeholder: true` flags.

---

## Phase 5 — Admin Pages & Polish

**Status:** Complete on 2026-03-31. Targeted backend and frontend verification passed for the admin pages and monitoring polish work.

### 5A. Platforms Admin
**Files:** `src/features/admin/api/admin.api.ts`, `pages/PlatformsPage.tsx`, `components/PlatformForm.tsx`
**API:** `/platforms`. DataTable: slug (mono pill), display_name, vendor_hint, napalm_driver, netmiko_type, device count. CRUD modal. RBAC: owner-only edit.

### 5B. Credentials Admin
**Files:** `src/features/admin/pages/CredentialsPage.tsx`, `components/CredentialForm.tsx`
**API:** `/credential_profiles`. DataTable: name, auth_type badge, username, secret_ref (masked mono), device count. Never display actual secrets.

### 5C. Audit Log
**Files:** `src/features/admin/pages/AuditPage.tsx`
**API:** `/audit` with cursor pagination. Read-only DataTable: occurred_at, actor, action badge, target_type, IP (mono). Expandable rows for payload JSON. Role-restricted via `roles: ["owner", "admin"]`.

### 5D. Monitoring Integration Polish
- `PasswordRotationCard.tsx`: Add "Go to Password Changes" link → `/operations/password-change`
- `MonitoringOverviewPage.tsx`: Add "Recent Password Changes" mini-table (last 5 jobs with status dots)

### 5E. Login Page Final Polish
- Confirm disclaimer removal from 2A is complete
- Clean subtitle text

**Route/nav updates:** Replace all Admin `PlaceholderPage` entries. Remove all remaining nav `placeholder: true` flags. Some non-admin placeholder routes/content still remain outside Phase 5 scope (for example Monitoring health/probes/alerts and device-detail secondary tabs).

---

## Phase 6 — Test Suite

**Status:** Complete on 2026-03-31. Added reusable frontend test utilities plus targeted backend/frontend coverage for auth, demo mode, routing, sidebar RBAC, compliance, audit, platform-operation templates, and startup/docs CLI behavior.

### 6A. Backend Tests

**Existing infrastructure** (reuse these patterns):
- `tests/conftest.py`: TestConfig with in-memory SQLite, function-scoped fixtures (`app`, `db`, `client`, `runner`)
- Factory fixtures: `create_user`, `create_platform`, `create_device`, `create_inventory_group`
- Auth fixtures: `auth_passwords`, `auth_tokens`, `auth_headers`
- 9 existing test files covering auth, devices, EoX, jobs, operations, API utils

**New/updated conftest fixtures** — `tests/conftest.py`:
- `create_credential_profile(name, username, auth_type)` — factory for CredentialProfiles
- `create_operation_template(platform_id, op_type, template_text)` — factory for PlatformOperationTemplates
- `create_compliance_policy(name, rules)` — factory for CompliancePolicies
- `create_job(job_type, status, owner_id)` — factory for Jobs
- `dev_bypass_app` — app fixture with `AUTH_DEV_BYPASS=True` for testing dev auth path

**New test files:**

`tests/test_auth_extended.py` (~150 lines):
- Dev bypass: login succeeds without Netmiko when `AUTH_DEV_BYPASS=True`
- Dev bypass: login fails for non-existent username
- Encrypted password: JWT contains `ep` claim after login
- Encrypted password: `get_session_password()` returns original plaintext
- Refresh token: `ep` claim carries forward after refresh
- Disabled user: login rejected even with valid creds
- Rate limiting: lockout after N failed attempts, unlock after window

`tests/test_credential_crypto.py` (~80 lines):
- `encrypt_password` → `decrypt_password` roundtrip
- Different plaintexts produce different ciphertexts
- Wrong key fails to decrypt (raises)
- `get_fernet_key()` auto-derives in dev mode
- `get_fernet_key()` uses explicit key when set
- Empty/None plaintext handling

`tests/test_password_change_service.py` (~200 lines):
- Command loading: `get_commands("cisco_nxos")` returns expected list
- Command loading: unknown platform returns empty/raises
- Handler dispatch: SSH platforms → ssh_handler, API platforms → api_handler
- Placeholder substitution: `new_password`, `current_enable`, VTY range
- Batch execution: mock Netmiko, verify ThreadPoolExecutor batch size ≤ 30
- Result shape: PasswordChangeResult has all required fields
- Partial failure: 3 devices, 1 fails → summary shows 2 ok / 1 failed
- Validation step: called when `validate_after=True`, skipped when False
- AppEvents logging: verify events created for each device attempt
- ErrorLogs: verify error logged on device failure with traceback

`tests/test_password_change_handlers.py` (~250 lines):
- SSH handler: mock ConnectHandler, verify command sequence per platform type
- SSH handler: cisco_ios VTY range discovery
- SSH handler: cisco_ftd uses `send_command_timing` not `send_config_set`
- SSH handler: connection timeout → result.ok=False, result.phase="connect"
- SSH handler: auth failure → result.ok=False, result.error contains "auth"
- SSH handler: command failure → result.ok=False, result.phase="commands"
- API handler: WTI PUT request shape + BasicAuth
- API handler: APIC 3-phase (login → change → validate)
- API handler: Expressway PUT request shape
- API handler: HTTP 4xx → result.ok=False with status in error
- API handler: Connection timeout → result.ok=False
- API handler: SSL error handling (verify=False)

`tests/test_password_change_endpoint.py` (~150 lines):
- POST `/operations/password-change`: async=true creates Job + JobTasks
- POST `/operations/password-change`: validates device_ids exist
- POST `/operations/password-change`: requires JWT auth
- POST `/operations/password-change`: missing new_password → 400
- POST `/operations/password-change`: current_password defaults to JWT `ep` claim
- Job tasks: one per device_id
- Sync mode: returns results immediately

`tests/test_operations_templates.py` (~100 lines):
- CRUD: create, read, update, delete operation templates
- List: filter by platform_id, op_type
- Validation: required fields (name, op_type)

`tests/test_snapshots.py` (~100 lines):
- CRUD: create, read, update, delete config snapshots
- List: filter by device_id, date range, source
- Deduplication: `create_if_changed()` returns existing for same hash

`tests/test_compliance.py` (~120 lines):
- Policies CRUD
- Rules CRUD + association with policies
- Results listing with filters
- Evaluate endpoint creates job

`tests/test_lifecycle.py` (~80 lines):
- Hardware EoX CRUD
- Software EoX CRUD
- `is_past()` date checks
- `matches_version()` with eq/prefix/regex operators

`tests/test_platforms_credentials.py` (~100 lines):
- Platforms CRUD, slug uniqueness
- Credential profiles CRUD, secret_ref never in response
- Deletion blocked if devices reference the profile

`tests/test_audit.py` (~60 lines):
- Audit entries list with cursor pagination
- Filter by actor, action, target_type
- Role restriction: non-admin gets 403

`tests/test_logging_integration.py` (~100 lines):
- Request logging: every request creates RequestLogs entry
- Error logging: unhandled exception creates ErrorLogs entry
- AppEvents: password change creates batch_complete event
- Correlation ID: request → error → response all share same correlation_id
- Latency tracking: latency_ms is positive and reasonable

`tests/test_app_startup.py` (~50 lines):
- App factory creates successfully with each config (Dev, Stage, Prod)
- All SQLAlchemy models register without errors (no `init` dataclass issue)
- Swagger docs render at `/docs` without 500
- Health endpoint returns 200
- CLI commands exist: create-db, seed-dev, drop-db, list-routes

### 6B. Frontend Tests

**Existing infrastructure** (reuse these patterns):
- Vitest + jsdom + @testing-library/react + @testing-library/user-event
- Setup: `src/tests/setup.ts` imports jest-dom matchers
- Pattern: `vi.mock()` modules, `render()` with providers, `screen.getBy*`, `userEvent.setup()`
- 4 existing test files for monitoring routes, policies, header nav, password rotation card

**New test utilities** — `src/tests/`:
- `renderWithProviders.tsx` — wraps component with QueryClientProvider + MemoryRouter + DemoProvider (reusable across all test files)
- `mockApi.ts` — centralized mock functions for all API modules (vi.mock patterns)
- `factories.ts` — mock data generators: `mockDevice()`, `mockJob()`, `mockPlatform()`, `mockCredentialProfile()`, `mockPolicy()`, etc.

**New test files:**

`src/features/auth/__tests__/LoginPage.test.tsx` (~80 lines):
- Renders login form with username + password fields
- No disclaimer text present
- No "remember password" toggle present
- Demo mode button present and functional
- Successful login redirects to `/`
- Failed login shows error message
- Redirects authenticated users away from login

`src/features/operations/__tests__/PasswordChangePage.test.tsx` (~200 lines):
- **Select step**: renders device table with checkboxes
- **Select step**: "Next" disabled when no devices selected
- **Select step**: platform/group filter dropdowns work
- **Select step**: "Next" navigates to credentials step
- **Credentials step**: current/new/confirm password fields
- **Credentials step**: mismatched passwords shows validation error
- **Credentials step**: "Back" returns to select step preserving selection
- **Credentials step**: submit opens confirmation modal
- **Credentials step**: typing "CHANGE" enables confirm button
- **Executing step**: progress bar renders
- **Executing step**: device rows show status dots (pending → in-progress → success/fail)
- **Executing step**: failed devices sort to top
- **Complete step**: summary shows counts
- **Complete step**: "Retry Failed" loads only failed device IDs

`src/features/operations/__tests__/DeviceSelectionTable.test.tsx` (~60 lines):
- Renders device list from API
- Checkbox selection updates selectedIds
- "Select All" toggles all visible devices
- Filter by platform filters the table

`src/features/operations/__tests__/OperationTemplatesPage.test.tsx` (~80 lines):
- Lists templates from API
- Create modal opens and submits
- Edit modal pre-fills data
- Delete with confirmation
- Filter by op_type works

`src/features/operations/__tests__/OperationJobsPage.test.tsx` (~60 lines):
- Lists jobs with cursor pagination
- Expandable rows show task details
- Status dots render correct colors

`src/features/operations/__tests__/SnapshotsPage.test.tsx` (~60 lines):
- Lists snapshots from API
- Row click shows config content
- Compare mode selects two snapshots

`src/features/compliance/__tests__/CompliancePoliciesPage.test.tsx` (~80 lines):
- Lists policies
- Create/edit/delete flow
- Rules panel shows associated rules
- "Evaluate" button triggers mutation

`src/features/compliance/__tests__/ComplianceResultsPage.test.tsx` (~60 lines):
- Lists results with filters
- Status dot colors (pass/fail)
- Stats cards show correct counts

`src/features/lifecycle/__tests__/HardwareEoxPage.test.tsx` (~60 lines):
- Lists hardware EoX records
- Date columns color-coded correctly
- CRUD modal flow

`src/features/admin/__tests__/PlatformsPage.test.tsx` (~60 lines):
- Lists platforms
- CRUD flow
- Slug shown in monospace

`src/features/admin/__tests__/CredentialsPage.test.tsx` (~60 lines):
- Lists credential profiles
- Secret_ref shown masked
- CRUD flow

`src/features/admin/__tests__/AuditPage.test.tsx` (~40 lines):
- Lists audit entries
- Cursor pagination works
- Expandable rows show payload JSON

`src/components/layout/__tests__/Sidebar.test.tsx` (~60 lines):
- All nav sections render
- Active route highlights correct item
- Collapsed mode shows icons only
- RBAC: admin section hidden for non-admin users
- Placeholder badge renders for placeholder items

`src/hooks/__tests__/useAuth.test.tsx` (~40 lines):
- Returns isAuthenticated=true with valid token
- Returns isAuthenticated=false with expired token
- hasSessionPassword reflects ep claim presence
- logout clears cookies

`src/app/__tests__/routes.test.tsx` (~60 lines):
- All defined routes render without crash
- Protected routes redirect unauthenticated to /login
- Unknown routes show 404 page
- Each route renders correct page component

`src/lib/demo/__tests__/demoMode.test.tsx` (~40 lines):
- Demo mode activates on demo login
- Mock data returns for all query keys
- "Exit Demo" clears state and redirects
- Demo badge visible in demo mode

---

## Phase 7 — Logging & Monitoring Integration

### 7A. Backend Operational Logging

**Leverage existing models** in `app/models/logs.py`:
- `RequestLogs` — already records every HTTP request/response via middleware in `app/__init__.py`
- `ErrorLogs` — already captures unhandled exceptions with traceback + correlation_id
- `AppEvents` — for domain events (startup, password_change, job lifecycle)
- `AuditLogEntries` — append-only trail for data mutations

**New logging touchpoints** (add to services, not endpoints):

`app/services/password_change.py`:
- `AppEvents(event="password_change.started")` — when batch begins (total devices, requested_by, job_id)
- `AppEvents(event="password_change.device_result")` — per device (device_id, platform, ok/fail, phase, latency_ms)
- `AppEvents(event="password_change.completed")` — when batch finishes (total/succeeded/failed, duration_seconds)
- `ErrorLogs` on device failure — traceback, device context, correlation to job

`app/services/operations.py`:
- `AppEvents(event="operation.execute")` — on any operation execution (op_type, device_count, sync/async, requested_by)
- `AuditLogEntries` — when operation modifies device state (action="operation.execute", target_type="device")

`app/services/jobs.py`:
- `AppEvents(event="job.state_change")` — on status transitions (pending→running→succeeded/failed)

`app/api/v1/resources/` — All mutation endpoints:
- `AuditLogEntries` on create/update/delete for: devices, platforms, credential_profiles, compliance_policies, eox_hardware, eox_software
- Actor from JWT identity, IP from request, payload with before/after diff

### 7B. Frontend Error Boundaries & Logging

**Monitoring overview integration:**
- `MonitoringOverviewPage.tsx`: Add cards for "Recent Errors" (from `/logs/errors?limit=5`) and "Recent Password Changes" (from `/logs/events?event=password_change.completed&limit=5`)
- `MonitoringLogsPage.tsx`: Add "Events" tab alongside Request Logs and Error Logs, querying `/logs/events`

**Error boundary** — `src/components/ErrorBoundary.tsx`:
- Catches React render errors
- Shows user-friendly error card with "Retry" button
- Logs error context for debugging

---

## Updated Implementation Status Tracker

| Capability | Phase | Status | Notes |
|---|---|---|---|
| Monitoring section routes | P0/P1 (old) | **Done** | Overview, Jobs, Policies, Logs |
| Password rotation card | P0 (old) | **Done** | Two-step typed confirm |
| Policies CRUD | P1 (old) | **Done** | Create/edit/delete with modal |
| Jobs table with drill-down | P0 (old) | **Done** | Expandable rows, cursor pagination |
| Logs view (request + error) | P1 (old) | **Done** | Two-column with offset pagination |
| Sidebar navigation | P0 | **Done** | Collapsible sidebar |
| Shared DataTable | P0 | **Done** | Reusable table component |
| RBAC foundation | P0 | **Done** | Roles in JWT + frontend hooks |
| Demo mode | P0 | **Done** | Demo Login + mock QueryClient |
| Enhanced devices list | P1 | **Done** | Filters, sorting, bulk, DataTable |
| Device detail page | P1 | **Done** | Tabs with Summary content |
| Device create/edit forms | P1 | **Done** | Shared form + dropdowns |
| Groups/tags integration | P1 | **Done** | Filter sidebar + bulk assign |
| CSV import | P1 | **Done** | Multi-step modal |
| Auth encrypted session pwd | P2A | **Done** | Encrypted `ep` claim + dev auth bypass |
| Password change backend | P2B | **Done** | Dedicated endpoint + handler registry + async job execution |
| Password change frontend | P2C | **Done** | Multi-step Operations page with job polling |
| Login page cleanup | P2A | **Done** | Simplified copy + removed toggle |
| Operation templates page | P3 | **Done** | CRUD page backed by `/platform_operation_templates` with detail modal |
| Operation jobs page | P3 | **Done** | Filtered `operation.*` jobs with task/event drill-down |
| Config snapshots page | P3 | **Done** | Snapshot list, inline preview, and side-by-side compare |
| Compliance policies (primary) | P4 | **Done** | Two-column policies + rules panel with queued evaluation jobs |
| Compliance results | P4 | **Done** | Filtered DataTable with status cards and expandable detail |
| Hardware EoX | P4 | **Done** | Summary cards, urgency-coded table, CRUD modal |
| Software EoX | P4 | **Done** | Platform-aware lifecycle records with CRUD modal |
| Platforms admin | P5 | **Done** | Owner-only CRUD with vendor/netmiko/device count columns |
| Credentials admin | P5 | **Done** | Metadata-only CRUD; secrets stay masked |
| Audit log | P5 | **Done** | Cursor-paginated DataTable with expandable payload |
| Monitoring polish | P5 | **Done** | Recent password changes + link into Operations |
| Backend test suite | P6 | **Done** | Added fixture expansion plus compliance, audit, template, and startup/docs coverage |
| Frontend test suite | P6 | **Done** | Added shared render/factory utilities plus login, demo, routes, auth-hook, and sidebar coverage |
| Operational logging | P7 | **Done** | Password-change/job events, mutation audit trails, `/logs/events` UI, and frontend error boundary |
| Monitoring health dashboard | FF | **Done** | Fleet health summary with platform and group rollups |
| Monitoring probes | FF | **Done** | Queue probe jobs from the UI and review recent probe batches |
| Monitoring alerts | FF | **Done** | Consolidated error logs, failed jobs, and compliance failures |

---

## Fast Follows

- Manual verification is deferred until a network-connected workstation is available:
  admin/owner login checks, demo-mode browsing, password-change end-to-end, CRUD smoke tests on the new Operations and Admin pages, monitoring overview validation, and `/docs` render validation.
- Keep the saved verification list from earlier phases as the backlog of manual checks rather than blocking current implementation.
- Live-environment follow-up should specifically confirm:
  `platforms`, `inventory_groups`, `credential_profiles`, and `audit` load cleanly from the real backend, and `/jobs` polling no longer returns 403 for the dev admin path.
- `POST /compliance/evaluate` now creates a real queued `compliance.evaluate` job record, but there is still no backend worker performing actual rule evaluation yet.
- Replace the temporary raw `product_model_id` input on Hardware EoX with a proper product-model picker once that API/admin surface exists.
- Phase 6 expanded the automated suite materially, but deeper optional coverage from the draft list can still be added incrementally for snapshots, platform/credential edge cases, and broader logging integration.
- Backend test runs still surface pre-existing deprecation warnings around `datetime.utcnow()`, `ERROR_404_HELP`, and `Query.get()`; those cleanup items remain deferred.
- A leftover test artifact still exists at `.tmp-tests/routes.sqlite3` from an earlier iteration. The current tests no longer create it, but cleanup is deferred until explicit removal is approved.
- Monitoring Alerts currently aggregates existing error logs, failed jobs, and failing compliance results; there is still no dedicated alert acknowledgement/silencing workflow.
- Monitoring Probes currently queues probe batches and shows recent probe jobs, but dedicated probe-template CRUD and execution-history endpoints are still minimal.

## UI Aesthetic Guidelines

Reference the monitoring HTML mockups for:
- Dense layout with tight padding (`px-3 py-2` for table cells)
- Status dots (8px colored circles with optional glow shadow) for quick visual feedback
- Monospace font for IPs, commands, hashes, and technical output
- Card pattern: surface background + 1px border + 8px radius
- Uppercase tracking-wider labels for table headers and card section titles
- Hover rows with bg-elevated transition
- Device type badges: monospace text in border-radius pill
- Modal pattern: backdrop blur + centered card with header/body/footer
- Button styles: primary (blue bg), ghost (transparent + border)

**Do NOT adopt** from mockups:
- Color palette (keep Orbit's CSS variable system with light/dark theme support)
- The dark-only design (Orbit supports both themes)

---

## Key Architectural Decisions

1. **Fernet encryption for session passwords** — Symmetric, fast, URL-safe tokens for JWT claims. Key is server-side only. HKDF derivation from JWT_SECRET_KEY in dev mode avoids extra env var setup.
2. **Handler registry pattern** — `registry.py` centralizes platform→handler mapping. Adding a device type = JSON entry + registry line, not modifying the orchestrator.
3. **ThreadPoolExecutor with batch size 30** — Matches reference code threading model. Prevents overwhelming the network stack.
4. **Frontend step machine** — select/credentials/executing/complete in a single page, not separate routes. Enables "Retry Failed" without losing context.
5. **DataTable reuse** — All new pages use shared `DataTable`, maintaining visual consistency.
6. **Logging via existing models** — No new tables. `AppEvents` for domain events, `AuditLogEntries` for mutations, `ErrorLogs` for failures, `RequestLogs` for HTTP (already automatic).

---

## Verification Plan

After each phase, verify:
1. `npm run build` — no TypeScript errors
2. `npm run lint` — no ESLint violations
3. `npm run test` — all frontend tests pass
4. `pytest -q --disable-warnings` — all backend tests pass
5. Manual: navigate all routes, check sidebar active states
6. Manual: demo mode login → browse all pages → exit demo
7. Manual: login as admin vs owner, verify RBAC restrictions
8. Manual: password change flow end-to-end (select → credentials → execute → results)
9. Manual: CRUD on each page (create, edit, delete)
10. Manual: CSV import with sample file
11. Manual: check `/docs` Swagger renders without errors
12. Manual: check AppEvents table has entries after password change
