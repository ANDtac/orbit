# Network Monitoring Hub — Frontend Design

## Philosophy
Two pages total. No framework, no build step. Dark theme optimized for ops engineers staring at it for hours. All interactivity via vanilla JS fetch calls against the REST API. Dashboard is a single loaded page — sections toggle visibility via tab navigation, no route changes.

---

## Design System

### Color Palette (CSS Custom Properties)

```css
--bg-primary:    #0d1117   /* Page background — near-black */
--bg-surface:    #161b22   /* Cards, panels, modals */
--bg-elevated:   #1f2937   /* Table rows hover, input backgrounds */
--bg-border:     #30363d   /* Borders, dividers */

--text-primary:  #e6edf3   /* Main text */
--text-secondary:#8b949e   /* Labels, captions, metadata */
--text-muted:    #484f58   /* Placeholder, disabled */

--accent-blue:   #388bfd   /* Primary actions, active states, links */
--accent-green:  #3fb950   /* Success, connected, match */
--accent-yellow: #d29922   /* Warning, scheduled, pending */
--accent-red:    #f85149   /* Error, disconnected, critical */
--accent-purple: #a371f7   /* Info badge, rule active indicator */

--radius-sm:     4px
--radius-md:     8px
--radius-lg:     12px
```

### Typography
- Font stack: `'Inter', system-ui, -apple-system, sans-serif` (loaded from Google Fonts or local)
- Base size: `14px` (dense data-forward UI)
- Headings: `16px` semi-bold for section titles, `13px` uppercase tracked for column headers
- Monospace (command/output): `'JetBrains Mono', 'Fira Code', monospace`

### Component Patterns
- **Cards:** `bg-surface` background, `1px solid bg-border` border, `radius-md`, `16px` padding
- **Buttons:** Filled (primary actions) use `accent-blue`, ghost buttons use transparent bg + border
- **Inputs:** `bg-elevated` bg, `bg-border` border, focus ring in `accent-blue`
- **Status badges:** Pill shape, colored dot + text — green/yellow/red/purple
- **Tables:** Borderless rows, `bg-elevated` on hover, `text-secondary` column headers
- **Modals:** `<dialog>` element, `bg-surface` background, backdrop blur

---

## Page 1: Login

**Route:** `/login` (and `/` redirects here if unauthenticated)

### Layout
Full-screen centered column. No nav bar. Single card.

```
┌─────────────────────────────────────────┐
│                                         │
│         [Logo / Hub Icon]               │
│     Network Monitoring Hub              │  ← text-primary, 22px
│     ─────────────────────               │
│                                         │
│   Username  [_______________________]   │
│   Password  [_______________________]   │
│                                         │
│             [   Sign In   ]             │  ← accent-blue button, full width
│                                         │
│   [error message area — text-red]       │
│                                         │
└─────────────────────────────────────────┘
```

### Behavior
- Enter key submits form
- On failed login: inline error below button, input borders turn `accent-red`
- On success: redirect to `/dashboard`
- No "forgot password" — credentials are network device credentials

---

## Page 2: Dashboard (`/dashboard`)

### Top Navigation Bar
Fixed, full-width. Height ~52px.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ◈ Network Monitoring Hub        [Devices] [Rules] [Logs] [Settings]     │
│                                                       [●] username  [out] │
└──────────────────────────────────────────────────────────────────────────┘
```

- App name + icon on left (`text-primary`)
- Tab nav in center — active tab has `accent-blue` bottom border + `text-primary`, inactive is `text-secondary`
- Right: green dot (connected indicator), username from session, logout button
- All sections are in the DOM — tab clicks toggle `display: none/block` — no page load

---

### Section 1: Overview (default tab / home state)

Shown when no tab is selected or on first load. Four stat cards + recent activity.

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  3           │ │  4           │ │  28          │ │  1           │
│  Devices     │ │  Active Rules│ │  Runs Today  │ │  Errors Today│
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘

  Recent Activity                          Next Scheduled Runs
  ┌────────────────────────────────────┐   ┌────────────────────────────────┐
  │ ● BGP Check  NX-Core-01  match  2m │   │ Interface Check    in 4 min    │
  │ ● APIC Fault APIC-01     ok    5m  │   │ BGP Neighbor Check in 28 min   │
  │ ● Iface Check NX-Access  ok    8m  │   │ APIC Fault Check   in 1h 2m    │
  └────────────────────────────────────┘   └────────────────────────────────┘
```

- Stat cards: `bg-surface`, large number in `text-primary`, label in `text-secondary`
- Error count card: number turns `accent-red` if > 0
- Recent activity auto-refreshes every 60 seconds (JS interval)
- Status dot colors: green = success/no_match, orange = match, red = error

---

### Section 2: Devices Tab

**Left panel: Device list table**

| Name | IP Address | Type | Status | Actions |
|------|-----------|------|--------|---------|
| NX-Core-01 | 192.168.1.10 | cisco_nxos | ● Live | [Edit] [Delete] |
| APIC-01 | 192.168.1.20 | cisco_apic | ● Live | [Edit] [Delete] |

- "Status" column shows last test-connection result (lazy — only updates when [Test] is clicked)
- `[+ Add Device]` button top-right opens Add Device modal
- Row click does nothing (no detail panel needed)

**Add/Edit Device Modal**
```
┌────────────────────────────────────────┐
│  Add Device                        [×] │
│                                        │
│  Name         [____________________]  │
│  IP Address   [____________________]  │
│  Device Type  [cisco_nxos        ▼]   │
│  Port         [22               ]     │
│  Notes        [____________________]  │
│               [____________________]  │
│                                        │
│  [Test Connection]  [Cancel] [Save]   │
└────────────────────────────────────────┘
```
- "Test Connection" fires `POST /api/v1/devices/<id>/test` and shows inline result
- Device type is a `<select>` populated with supported Netmiko types (cisco_nxos, cisco_apic, etc.)

---

### Section 3: Rules Tab

**Rule list table**

| Name | Schedule | Devices | Output Mode | Active | Actions |
|------|----------|---------|-------------|--------|---------|
| BGP Check | Every 30m | 1 device | regex | ● ON | [Edit] [Run Now] [Toggle] |
| APIC Faults | 0 6 * * * | 1 device | full | ● ON | [Edit] [Run Now] [Toggle] |

- `[+ New Rule]` button opens the Rule Builder modal
- `[Run Now]` fires `POST /api/v1/rules/<id>/run` and shows toast notification
- Toggle switch inline — PATCH call on change

**Rule Builder Modal (wide — 720px)**
```
┌──────────────────────────────────────────────────────────────┐
│  New Monitoring Rule                                     [×]  │
├──────────────────────────────────────────────────────────────┤
│  Name        [_________________________________________]      │
│  Description [_________________________________________]      │
│                                                              │
│  Schedule                                                    │
│  ○ Interval   [30] minutes                                   │
│  ○ Cron       [0 6 * * *]  (standard cron expression)       │
│                                                              │
│  Target Devices  (multi-select checkboxes)                   │
│  ☑ NX-Core-01   ☑ NX-Access-02   ☐ APIC-01                 │
│                                                              │
│  Commands  (per device type)                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Device Type [cisco_nxos ▼]  Command [show bgp sum ]  │   │
│  │ Order [1]                              [+ Add Row]   │   │
│  │ Device Type [*          ▼]  Command [show version ]  │   │
│  │ Order [2]                              [× Remove]    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Output Mode                                                 │
│  ○ Full output   ● Regex filter  [Established      ]        │
│                                                              │
│  Alerting                                                    │
│  ☑ Email immediately on regex match                         │
│  ☑ Include in daily digest                                   │
│                                                              │
│                          [Cancel]  [Save Rule]               │
└──────────────────────────────────────────────────────────────┘
```
- Commands section: dynamic rows, JS-managed. `[+ Add Row]` appends a new command row.
- Device type dropdown includes `*` (all) as an option
- Regex field only visible when "Regex filter" output mode selected

---

### Section 4: Logs Tab

**Filter bar** (top of section)
```
Rule [All ▼]  Device [All ▼]  Status [All ▼]  [Search output...]  [Clear]
```

**Log table**
| Time | Rule | Device | Status | Output Preview | |
|------|------|--------|--------|----------------|---|
| 07:30:04 | BGP Check | NX-Core-01 | ● match | "Established..." | [View] |
| 07:00:01 | APIC Fault | APIC-01 | ✓ ok | "fnvread complet..." | [View] |

- Status icons: ✓ green = success, ● orange = match, ✗ red = error, – gray = no_match
- `[View]` opens a read-only modal with full `output` text in a monospace scrollable box
- Pagination: load more button (appends rows) or simple prev/next

**Log Detail Modal**
```
┌─────────────────────────────────────────────────────────────┐
│  BGP Neighbor Check — NX-Core-01              07:30:04  [×] │
├─────────────────────────────────────────────────────────────┤
│  Status: ● match   Emailed: Yes                             │
│                                                             │
│  Matched Lines:                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  10.0.0.1  4  65002  Established  200  100          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Full Output:                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  BGP summary information for VRF default            │   │
│  │  ...                                                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```
- Output boxes: `bg-primary` background, monospace font, `max-height: 300px`, scrollable

---

### Section 5: Settings Tab

Two-column layout. Left: grouped settings forms. Right: Email controls.

**Left — System Settings**
```
Logging
  Base Directory   [./logs                    ]
  Subdir Format    [%Y/%m/%d                  ]  (date format string)

Email / SMTP
  SMTP Host        [localhost                 ]
  SMTP Port        [25                        ]
  Sender Name      [Network Monitoring Hub    ]
  Sender Address   [nmh@localhost             ]
  Recipients       [ops@co.com, noc@co.com    ]  (comma-separated)

Daily Digest
  Send Time        [07:00                     ]  (HH:MM)

                              [Save Settings]
```

**Right — Email Actions**
```
┌──────────────────────────────────────────┐
│  Email Actions                           │
│                                          │
│  [Send Test Email]                       │
│   Sends to configured recipients         │
│                                          │
│  [Send Digest Now]                       │
│   Triggers the daily digest immediately  │
│                                          │
│  Last digest sent: Jan 15, 2025 07:00    │
└──────────────────────────────────────────┘
```

---

## Toast Notifications

Global toast container fixed bottom-right. Auto-dismiss after 4 seconds.

```
              ┌───────────────────────────────┐
              │  ✓  Rule queued successfully  │   ← green
              └───────────────────────────────┘
              ┌───────────────────────────────┐
              │  ✗  SSH connection failed     │   ← red
              └───────────────────────────────┘
```

---

## Interaction Summary (JS responsibilities)

| Action | JS Call | UI Response |
|--------|---------|-------------|
| Tab switch | DOM toggle | Instant, no fetch |
| Add/edit device | `POST/PUT /api/v1/devices` | Close modal, refresh table |
| Test device | `POST /api/v1/devices/<id>/test` | Inline status in modal |
| Add/edit rule | `POST/PUT /api/v1/rules` | Close modal, refresh table, sync scheduler |
| Run rule now | `POST /api/v1/rules/<id>/run` | Toast notification |
| Toggle rule | `PATCH /api/v1/rules/<id>/toggle` | Toggle switch updates inline |
| View log | `GET /api/v1/logs/<id>` | Open log detail modal |
| Save settings | `PUT /api/v1/settings` | Toast confirmation |
| Send test email | `POST /api/v1/email/test` | Toast with result |
| Dashboard refresh | `GET /api/v1/dashboard` | Stats + activity re-rendered every 60s |
