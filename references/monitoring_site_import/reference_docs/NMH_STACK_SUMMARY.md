# Network Monitoring Hub — Stack Summary

## What This App Does
A lightweight internal network monitoring tool that uses Netmiko to SSH into network devices (primarily Cisco NX-OS and Cisco APIC), execute sequences of CLI commands, parse output via regex, log results, and deliver scheduled email digests. Auth is credential-pass-through — the login screen captures a username/password which is used directly to authenticate SSH sessions via Netmiko.

## Users & Scale
- Internal network engineers / ops team only
- Single-tenant, low concurrency (one team, one server)
- Single language/region — English only

## Tech Stack (Quick Reference)

| Layer            | Choice                              | Why                                                        |
|------------------|-------------------------------------|------------------------------------------------------------|
| Frontend         | Vanilla JS + Jinja2 templates       | Zero build tooling, minimal files, fast iteration          |
| Styling          | CSS custom properties (dark theme)  | No framework dependency, full control, single stylesheet   |
| Backend          | Python 3.11 + Flask                 | Lightweight, matches Netmiko ecosystem, fast to run        |
| Database         | SQLite via SQLAlchemy ORM           | Zero-config, file-based, perfect for single-server deploy  |
| Auth             | Flask-Login + session-based         | Credential pass-through to Netmiko SSH                     |
| Scheduler        | APScheduler (in-process)            | No external broker needed, integrates cleanly with Flask   |
| Network I/O      | Netmiko                             | Industry standard for multi-vendor SSH automation          |
| Email            | smtplib (internal SMTP, no auth)    | Pluggable stub module, no external dependency              |
| Hosting (dev)    | Local machine, VSCode               | —                                                          |
| Hosting (prod)   | Local Linux server                  | Self-hosted, no cloud dependency                           |

## Key Constraints
- **Complexity:** Minimize file count — target ≤ 12 Python/template files total
- **Dependencies:** No Redis, no Celery, no Node.js, no build step
- **Auth model:** No separate user store — credentials are passed directly to Netmiko; Flask-Login only manages the UI session
- **Email:** Internal SMTP with no authentication; email module is a stub ready for configuration
- **Compliance:** None
- **Budget:** Free/open source only
- **Team:** Solo developer
- **Timeline:** Working MVP ASAP; production on local Linux server

## Architecture Style
Monolith · Flask + Jinja2 · SQLite via SQLAlchemy · APScheduler in-process · Netmiko SSH · REST JSON API for frontend interactions

## Primary Target Devices
- `cisco_nxos` — Cisco NX-OS switches/routers
- `cisco_apic` — Cisco APIC controllers

## Non-Goals (v1)
- Multi-user / role-based access control
- Cloud hosting or containerization
- Real-time WebSocket dashboard updates (polling is fine)
- SNMP, ICMP ping, or non-SSH monitoring
- Alert escalation chains or on-call routing
- Mobile responsiveness (desktop internal tool)
