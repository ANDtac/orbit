# Network Monitoring Hub — API Design

## Style & Conventions
- **Style:** REST, JSON responses
- **Base path:** `/api/v1/`
- **Auth:** All endpoints require an active Flask session (cookie-based). Unauthenticated requests return `401`.
- **Error shape:** `{ "error": "message string" }`
- **Success shape:** `{ "data": <payload> }` or `{ "message": "ok" }` for mutations
- **Dates:** ISO 8601 strings (`2025-01-15T07:00:00`)

---

## Auth

### `POST /login`
Accepts credentials, attempts Netmiko test connection to a probe device (or validates format), sets Flask session on success.

**Request:**
```json
{ "username": "admin", "password": "secret" }
```
**Response 200:**
```json
{ "message": "ok" }
```
**Response 401:**
```json
{ "error": "Invalid credentials" }
```

> Note: Credentials are stored in the Flask session (server-side) for the duration of the UI session. They are passed to every Netmiko connection; they are never persisted to the database.

### `POST /logout`
Clears the session. Returns `200`.

---

## Devices

### `GET /api/v1/devices`
Returns all devices.
```json
{
  "data": [
    {
      "id": 1,
      "name": "NX-Core-01",
      "ip_address": "192.168.1.10",
      "device_type": "cisco_nxos",
      "port": 22,
      "notes": ""
    }
  ]
}
```

### `POST /api/v1/devices`
Create a new device.
**Body:** `{ name, ip_address, device_type, port?, notes? }`

### `PUT /api/v1/devices/<id>`
Update an existing device.
**Body:** any subset of device fields.

### `DELETE /api/v1/devices/<id>`
Delete a device. Returns `{ "message": "deleted" }`.

### `POST /api/v1/devices/<id>/test`
Attempts a live Netmiko SSH connection using the session credentials.
```json
{ "status": "success", "latency_ms": 312 }
```
or
```json
{ "status": "error", "error": "Authentication failed" }
```

---

## Monitoring Rules

### `GET /api/v1/rules`
Returns all rules with their associated device IDs and command count.

### `GET /api/v1/rules/<id>`
Returns full rule detail including commands (grouped by device_type) and assigned device IDs.

```json
{
  "data": {
    "id": 2,
    "name": "BGP Neighbor Check",
    "is_active": true,
    "schedule_type": "interval",
    "schedule_value": "30",
    "output_mode": "regex",
    "regex_pattern": "Established",
    "email_on_match": true,
    "include_in_daily": true,
    "device_ids": [1],
    "commands": [
      { "id": 3, "device_type": "cisco_nxos", "command": "show bgp summary", "order": 1 }
    ]
  }
}
```

### `POST /api/v1/rules`
Create a new rule. Body includes the full rule object including `commands[]` and `device_ids[]`.

**Body:**
```json
{
  "name": "BGP Neighbor Check",
  "schedule_type": "interval",
  "schedule_value": "30",
  "output_mode": "regex",
  "regex_pattern": "Established",
  "email_on_match": true,
  "include_in_daily": true,
  "device_ids": [1, 2],
  "commands": [
    { "device_type": "cisco_nxos", "command": "show bgp summary", "order": 1 },
    { "device_type": "*", "command": "show version", "order": 2 }
  ]
}
```

### `PUT /api/v1/rules/<id>`
Full update of a rule. Replaces commands and device assignments.

### `DELETE /api/v1/rules/<id>`
Soft-disable by setting `is_active = false`. Hard delete: `?hard=true`.

### `POST /api/v1/rules/<id>/run`
Manually trigger a rule execution immediately (async via APScheduler one-shot job).
```json
{ "message": "Rule queued", "job_id": "manual_run_2" }
```

### `PATCH /api/v1/rules/<id>/toggle`
Toggle `is_active` on/off. Returns updated `is_active` value.

---

## Run Logs

### `GET /api/v1/logs`
Query parameters:
- `rule_id` (optional)
- `device_id` (optional)
- `status` (optional: `success`, `error`, `match`, `no_match`)
- `limit` (default 50, max 200)
- `offset` (default 0)

```json
{
  "data": [
    {
      "id": 101,
      "rule_id": 2,
      "rule_name": "BGP Neighbor Check",
      "device_id": 1,
      "device_name": "NX-Core-01",
      "ran_at": "2025-01-15T07:30:00",
      "status": "match",
      "matched_lines": "Established",
      "emailed": true
    }
  ],
  "total": 320,
  "limit": 50,
  "offset": 0
}
```

### `GET /api/v1/logs/<id>`
Full log entry including `output` text field.

### `DELETE /api/v1/logs`
Bulk delete logs older than N days: `?older_than_days=30`

---

## Dashboard Stats

### `GET /api/v1/dashboard`
Returns summary data for the dashboard widgets.

```json
{
  "data": {
    "total_devices": 3,
    "active_rules": 4,
    "runs_today": 28,
    "errors_today": 1,
    "matches_today": 5,
    "recent_logs": [ ... ],
    "next_scheduled_runs": [
      { "rule_name": "Interface Status Check", "next_run": "2025-01-15T08:00:00" }
    ]
  }
}
```

---

## Settings

### `GET /api/v1/settings`
Returns all key-value settings as a flat object.
```json
{
  "data": {
    "log_base_dir": "./logs",
    "email_smtp_host": "localhost",
    "email_sender_name": "Network Monitoring Hub",
    "email_recipients": "ops@company.com,noc@company.com",
    "daily_digest_time": "07:00"
  }
}
```

### `PUT /api/v1/settings`
Bulk update settings. Body is a flat object of key-value pairs to update.

---

## Email

### `POST /api/v1/email/test`
Sends a test email to the configured recipients using current SMTP settings.
```json
{ "message": "Test email sent to ops@company.com" }
```

### `POST /api/v1/email/digest/send`
Manually trigger the daily digest email immediately.
```json
{ "message": "Digest sent" }
```
