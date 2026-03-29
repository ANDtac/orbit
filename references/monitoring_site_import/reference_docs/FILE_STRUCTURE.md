# Network Monitoring Hub — File & Folder Structure

## Design Goal
≤ 12 meaningful Python/template files. No build tooling. No package.json. Run with `python app.py`.

---

## Directory Tree

```
nmh/
├── app.py                   # Flask app factory, route registration, APScheduler init
├── config.py                # Config class — DB path, secret key, log dir defaults
├── models.py                # All SQLAlchemy models (Device, MonitoringRule, RuleCommand, RuleDevice, RunLog, AppSettings)
├── scheduler.py             # APScheduler setup, job registration, rule-to-job sync
├── netmiko_runner.py        # Netmiko connection logic, command execution, regex filtering
├── email_service.py         # SMTP stub — send_alert(), send_daily_digest() — ready to configure
├── seed.py                  # Dev seed data — mock Cisco NX-OS + APIC devices, sample rules
│
├── routes/
│   ├── auth.py              # /login, /logout
│   ├── api_devices.py       # /api/v1/devices CRUD + /test
│   ├── api_rules.py         # /api/v1/rules CRUD + /run + /toggle
│   ├── api_logs.py          # /api/v1/logs read + delete
│   ├── api_settings.py      # /api/v1/settings read + update
│   └── api_dashboard.py     # /api/v1/dashboard stats + email triggers
│
├── templates/
│   ├── base.html            # Dark theme shell — nav, CSS vars, JS includes
│   ├── login.html           # Login page (extends base)
│   └── dashboard.html       # Full SPA-style dashboard (extends base) — all panels rendered here
│
├── static/
│   ├── style.css            # Single stylesheet — dark theme, CSS custom properties
│   └── app.js               # Vanilla JS — fetch wrappers, panel rendering, modals
│
├── logs/                    # Runtime log output (gitignored)
│   └── .gitkeep
│
├── nmh.db                   # SQLite database file (gitignored, auto-created)
├── requirements.txt         # Python dependencies
├── .env.example             # Environment variable template
└── README.md
```

---

## File Responsibilities

### `app.py`
- Creates Flask app
- Registers all route blueprints
- Calls `db.create_all()` on startup
- Initializes APScheduler and loads active rules from DB into jobs
- Entry point: `python app.py`

### `config.py`
- `SECRET_KEY` (from env or default for dev)
- `SQLALCHEMY_DATABASE_URI` → `sqlite:///nmh.db`
- `LOG_BASE_DIR` default
- `DEBUG` flag

### `models.py`
All six models in one file. SQLAlchemy relationships defined here. `__repr__` methods for debugging.

### `scheduler.py`
- Wraps APScheduler `BackgroundScheduler`
- `sync_jobs(app)` — reads all active rules from DB, adds/removes APScheduler jobs to match
- `run_rule(rule_id, username, password, app)` — the job function; calls `netmiko_runner`, writes `RunLog`, triggers email if needed
- Called once at startup, and re-called after any rule create/update/delete/toggle

### `netmiko_runner.py`
- `execute_rule(device, commands, username, password) → RunResult`
- Handles: connect → send commands in order → collect output → apply regex if configured → disconnect → return result
- Mock mode: if `device.ip_address` starts with `192.168.1.` and env `NMH_MOCK=true`, returns canned output for testing without real devices

### `email_service.py`
- `send_alert(rule_name, device_name, matched_lines, settings)` — immediate match alert
- `send_daily_digest(run_summaries, settings)` — daily summary email
- Both use `smtplib.SMTP(host, port)` with no auth — stub the body formatting here
- Settings passed in from `AppSettings` at call time

### `seed.py`
- Run with `python seed.py` 
- Creates 3 mock devices + 3 sample rules with commands
- Safe to re-run (checks for existing data first)

### `routes/`
Each file is a Flask Blueprint. Keep route files thin — validate input, call models/services, return JSON.

### `templates/dashboard.html`
Single-page feel — all sections (Devices, Rules, Logs, Settings, Email) exist in the DOM as panels, shown/hidden via JS tab switching. No page reloads after initial load.

### `static/app.js`
- `fetchAPI(method, path, body)` — authenticated fetch wrapper with error handling
- Tab/panel switching logic
- CRUD modals for Devices and Rules (inline HTML `<dialog>` elements)
- Dashboard stats auto-refresh every 60 seconds
- Rule command builder — dynamic add/remove rows per device_type

---

## Python Dependencies (`requirements.txt`)

```
flask>=3.0
flask-login>=0.6
flask-sqlalchemy>=3.1
apscheduler>=3.10
netmiko>=4.3
```

---

## Environment Variables (`.env.example`)

```env
# Flask
SECRET_KEY=change-me-in-production
FLASK_DEBUG=true

# Mock mode — returns fake Netmiko output, no real SSH
NMH_MOCK=false

# Logging
LOG_BASE_DIR=./logs
```

---

## File Count Summary

| Category        | Files |
|-----------------|-------|
| Python core     | 6     |
| Python routes   | 6     |
| HTML templates  | 3     |
| Static assets   | 2     |
| Config/tooling  | 3     |
| **Total**       | **20**|

> Routes are split for clarity but are thin wrappers — could be collapsed to 2-3 files if preferred.
