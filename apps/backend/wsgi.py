"""
apps/backend/wsgi.py
--------------------
WSGI entrypoint for the Orbit Flask API.

Responsibilities
----------------
- Expose a module-level `application` object for WSGI servers (e.g., Gunicorn).
- Create the Flask app via the application factory in `app/__init__.py`.

Usage
-----
Gunicorn loads this module by default in our Docker image:

    gunicorn -c apps/backend/docker/gunicorn.conf.py apps.backend.wsgi:application

Notes
-----
- Configuration is selected by `APP_ENV` in the environment (see app/config.py).
- Avoid side effects at import time; only build the app.
"""

from __future__ import annotations

from app import create_app

# The WSGI server (e.g., Gunicorn) looks for this variable by convention.
application = create_app()