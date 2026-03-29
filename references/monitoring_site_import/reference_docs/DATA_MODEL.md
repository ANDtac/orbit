# Network Monitoring Hub — Data Model

## ORM
SQLAlchemy with SQLite. All migrations handled via `db.create_all()` on startup for simplicity. A `seed.py` script provides mock Cisco NX-OS and APIC devices plus sample rules for initial testing.

---

## Core Entities

### `Device`
Represents a single network device that can be targeted by monitoring rules.

| Column        | Type         | Notes                                          |
|---------------|--------------|------------------------------------------------|
| `id`          | Integer (PK) | Internal use only                              |
| `name`        | String       | Human-readable label (e.g. "Core-Switch-01")  |
| `ip_address`  | String       | SSH target IP                                  |
| `device_type` | String       | Netmiko device_type string (e.g. `cisco_nxos`) |
| `port`        | Integer      | SSH port, default 22                           |
| `notes`       | Text         | Optional free-text notes                       |
| `created_at`  | DateTime     | Auto-set on creation                           |

**Supported `device_type` values (initial):** `cisco_nxos`, `cisco_apic`

---

### `MonitoringRule`
A named rule that defines what to run, on which devices, and when.

| Column            | Type         | Notes                                                        |
|-------------------|--------------|--------------------------------------------------------------|
| `id`              | Integer (PK) | —                                                            |
| `name`            | String       | Rule display name                                            |
| `description`     | Text         | Optional                                                     |
| `is_active`       | Boolean      | Enable/disable without deleting                              |
| `schedule_type`   | String       | `interval` or `cron`                                         |
| `schedule_value`  | String       | Cron expression OR interval in minutes (e.g. `"30"`, `"0 6 * * *"`) |
| `output_mode`     | String       | `full` (store all output) or `regex` (store matched lines only) |
| `regex_pattern`   | Text         | Optional; applied to output when `output_mode = regex`       |
| `email_on_match`  | Boolean      | Trigger immediate email if regex matches                     |
| `include_in_daily`| Boolean      | Include results in daily digest email                        |
| `created_at`      | DateTime     | —                                                            |

---

### `RuleCommand`
Ordered SSH commands for a rule, scoped per device type to handle vendor differences.

| Column        | Type         | Notes                                                          |
|---------------|--------------|----------------------------------------------------------------|
| `id`          | Integer (PK) | —                                                              |
| `rule_id`     | Integer (FK) | → `MonitoringRule.id`                                          |
| `device_type` | String       | Netmiko device_type this command applies to (`*` = all types)  |
| `command`     | String       | CLI command string (e.g. `show interface status`)              |
| `order`       | Integer       | Execution sequence (ascending)                                |

Commands are fetched for a device by matching `device_type == device.device_type OR device_type == '*'`, ordered by `order` ascending.

---

### `RuleDevice` (Association)
Many-to-many join between rules and their target devices.

| Column      | Type         | Notes                  |
|-------------|--------------|------------------------|
| `id`        | Integer (PK) | —                      |
| `rule_id`   | Integer (FK) | → `MonitoringRule.id`  |
| `device_id` | Integer (FK) | → `Device.id`          |

---

### `RunLog`
Stores results of each rule execution per device.

| Column           | Type         | Notes                                                    |
|------------------|--------------|----------------------------------------------------------|
| `id`             | Integer (PK) | —                                                        |
| `rule_id`        | Integer (FK) | → `MonitoringRule.id`                                    |
| `device_id`      | Integer (FK) | → `Device.id`                                            |
| `ran_at`         | DateTime     | Timestamp of execution                                   |
| `status`         | String       | `success`, `error`, `no_match`, `match`                  |
| `output`         | Text         | Full or regex-filtered output (depending on rule config) |
| `matched_lines`  | Text         | Newline-separated regex hits (if applicable)             |
| `error_message`  | Text         | SSH or execution error if status = `error`               |
| `emailed`        | Boolean      | Whether an immediate alert was already sent              |

---

### `AppSettings`
Single-row key-value config table for global settings.

| Column   | Type         | Notes                              |
|----------|--------------|------------------------------------|
| `id`     | Integer (PK) | Always row ID = 1                  |
| `key`    | String       | Setting identifier                 |
| `value`  | Text         | Setting value                      |

**Predefined keys:**

| Key                    | Default                  | Description                          |
|------------------------|--------------------------|--------------------------------------|
| `log_base_dir`         | `./logs`                 | Base directory for file-based logs   |
| `log_subdir_format`    | `%Y/%m/%d`               | Subdirectory date format             |
| `email_smtp_host`      | `localhost`              | Internal SMTP server hostname        |
| `email_smtp_port`      | `25`                     | SMTP port                            |
| `email_sender_name`    | `Network Monitoring Hub` | From name in outbound email          |
| `email_sender_address` | `nmh@localhost`          | From address                         |
| `email_recipients`     | `` (empty)               | Comma-separated recipient list       |
| `daily_digest_time`    | `07:00`                  | HH:MM for daily digest send time     |

---

## Relationships Diagram (Plain Text)

```
Device ──< RuleDevice >── MonitoringRule ──< RuleCommand
                                │
                                └──< RunLog >── Device
```

---

## Seed Data (Mock — for local dev/testing)

**Devices:**
- `NX-Core-01` · `192.168.1.10` · `cisco_nxos`
- `NX-Access-02` · `192.168.1.11` · `cisco_nxos`
- `APIC-01` · `192.168.1.20` · `cisco_apic`

**Rules:**
- `Interface Status Check` — runs `show interface status` on all NX-OS devices every 30 min, full output logging
- `BGP Neighbor Check` — runs `show bgp summary` on NX-Core-01, regex `Established`, email on match
- `APIC Fault Check` — runs `acidiag fnvread` on APIC-01, regex `(CRITICAL|MAJOR)`, email on match, include in daily digest
