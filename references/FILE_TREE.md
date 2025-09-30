orbit/
├─ apps/
│  ├─ backend/                         # Flask API (complete)
│  │  ├─ app/
│  │  │  ├─ __init__.py                # app factory + logging, hooks, error handling
│  │  │  ├─ config.py                  # Dev/Stage/Prod config selection
│  │  │  ├─ extensions.py              # db, migrate, jwt singletons
│  │  │  ├─ logging.py                 # JSON logging setup
│  │  │  ├─ models.py                  # ALL models (devices, platforms, eox, logs, ...)
│  │  │  ├─ auth/
│  │  │  │  └─ routes.py               # /auth login/refresh/logout
│  │  │  ├─ api/
│  │  │  │  ├─ __init__.py             # RESTX Api + namespace registration
│  │  │  │  ├─ utils.py                # pagination, helpers
│  │  │  │  └─ resources/
│  │  │  │     ├─ devices.py
│  │  │  │     ├─ platforms.py
│  │  │  │     ├─ credential_profiles.py
│  │  │  │     ├─ inventory_groups.py
│  │  │  │     ├─ interfaces.py
│  │  │  │     ├─ ip_addresses.py
│  │  │  │     ├─ snapshots.py
│  │  │  │     ├─ platform_operation_templates.py
│  │  │  │     ├─ compliance.py
│  │  │  │     ├─ operations.py
│  │  │  │     ├─ logs.py              # search requests/errors (optional, included)
│  │  │  │     ├─ eox_hardware.py
│  │  │  │     ├─ eox_software.py
│  │  │  │     └─ eox_queries.py
│  │  │  ├─ services/
│  │  │  │  └─ operations.py           # Nornir/NAPALM glue (stubs ready)
│  │  │  └─ utils/
│  │  │     └─ mailer.py               # critical-alert SMTP helper
│  │  ├─ docker/
│  │  │  └─ gunicorn.conf.py
│  │  ├─ tests/
│  │  │  ├─ conftest.py                # app/DB fixtures, JWT helper
│  │  │  ├─ test_auth.py               # login/refresh/logout
│  │  │  ├─ test_devices.py            # CRUD smoke tests
│  │  │  └─ test_eox.py                # lifecycle query tests
│  │  ├─ requirements.txt
│  │  ├─ wsgi.py
│  │  ├─ manage.py
│  │  ├─ .env.dev.example
│  │  ├─ .env.stage.example
│  │  └─ .env.prod.example
│  └─ frontend/                        # React + TS (Vite) scaffold
│     ├─ src/
│     │  ├─ App.tsx
│     │  └─ main.tsx
│     ├─ public/
│     │  └─ favicon.svg
│     ├─ index.html
│     ├─ tsconfig.json
│     ├─ tsconfig.node.json
│     ├─ vite.config.ts
│     └─ package.json
├─ packages/
│  └─ shared/
│     ├─ python/                       # optional: shared constants for backend
│     └─ ts/                           # optional: shared DTOs/types for frontend
├─ docker/
│  ├─ Dockerfile.backend               # Python 3.11 slim, gunicorn
│  └─ Dockerfile.frontend              # Node 20 alpine, vite dev
├─ infra/
│  └─ nginx/                           # (future) prod reverse proxy
├─ references/
│  ├─ FILE_TREE.md                     # snapshot of the structure
│  └─ .gitkeep
├─ .vscode/
│  ├─ launch.json                      # attach configs; compound dev (both)
│  ├─ tasks.json                       # compose up/down debug stacks
│  ├─ settings.json                    # points to backend .venv for editor tools
│  └─ extensions.json                  # recommended extensions
├─ compose.yml                         # runs backend + frontend
├─ compose.dev.debug.yml               # debug overrides (debugpy & node inspector)
├─ .gitignore
├─ README.md
└─ Makefile                            # handy targets (dev, stage, prod, test)