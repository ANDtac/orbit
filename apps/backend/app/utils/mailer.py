"""
app/utils/mailer.py
-------------------
Lightweight SMTP helper for sending operational/critical emails.

Responsibilities
----------------
- Provide a safe, minimal wrapper around Python's `smtplib` for sending mail.
- Support implicit TLS (SMTPS) and STARTTLS based on environment flags.
- Expose a single-call helper `send_critical_email()` for production alerts.
- Include structured logging and defensive error handling.

Environment Variables
---------------------
SMTP_HOST : str
    Mail server hostname. Example: "smtp.yourorg.local".
SMTP_PORT : int, optional
    Port number override. If unset, the standard library default is used
    (25 for SMTP, 465 for SMTP over SSL).
SMTP_USERNAME : str, optional
SMTP_PASSWORD : str, optional
SMTP_USE_TLS : bool
    If "true", connect using implicit TLS (SMTPS). Default: "false".
SMTP_STARTTLS : bool
    If "true", connect in plaintext then upgrade with STARTTLS. Default: "false".
MAIL_FROM : str
    Default sender address. Example: "orbit@yourorg.local".
MAIL_TO_CRITICAL : str
    Override critical-alert destination. Optional; see constant below.

Constants
---------
CRITICAL_ALERT_EMAIL : str
    Hard-coded fallback email for critical alerts, per project requirements.
    You may override this using the `MAIL_TO_CRITICAL` environment variable.

Public Functions
----------------
send_email(
    to: str | list[str],
    subject: str,
    body: str,
    *,
    html: str | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = 20.0,
    retries: int = 2,
) -> bool
    Send an email. Returns True on success, False on failure.

send_critical_email(subject: str, body: str) -> bool
    Convenience helper to send a critical alert to the configured destination.

Notes
-----
- This module avoids raising on failure; it logs and returns False.
- If both `SMTP_USE_TLS` and `SMTP_STARTTLS` are true, implicit TLS wins.
"""

from __future__ import annotations

import logging
import os
import smtplib
import socket
from email.message import EmailMessage
from typing import Iterable, Optional

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Hard-coded fallback for critical alerts (project requirement)
# You can change this to your team's on-call list. Env var MAIL_TO_CRITICAL overrides.
# ---------------------------------------------------------------------------
CRITICAL_ALERT_EMAIL: str = "orbit-critical-alerts@yourorg.local"


def _bool_env(name: str, default: bool) -> bool:
    """Parse a boolean environment variable."""
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _int_env(name: str) -> int | None:
    """Parse an optional integer environment variable."""
    raw = os.getenv(name)
    if raw is None:
        return None
    raw = raw.strip()
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        log.warning("Invalid integer for %s: %s", name, raw)
        return None


def _get_smtp_config() -> dict:
    """
    Build an SMTP configuration dictionary from environment variables.

    Returns
    -------
    dict
        {
          "host": str,
          "port": int | None,
          "username": str | None,
          "password": str | None,
          "use_tls": bool,       # implicit TLS (SMTPS)
          "starttls": bool,      # STARTTLS upgrade
          "mail_from": str,
          "critical_to": str,
        }
    """
    host = os.getenv("SMTP_HOST", "")
    port = _int_env("SMTP_PORT")
    username = os.getenv("SMTP_USERNAME")
    password = os.getenv("SMTP_PASSWORD")
    use_tls = _bool_env("SMTP_USE_TLS", False)        # implicit TLS (465)
    starttls = _bool_env("SMTP_STARTTLS", False)      # STARTTLS (587)
    mail_from = os.getenv("MAIL_FROM", "orbit@yourorg.local")
    critical_to = os.getenv("MAIL_TO_CRITICAL", CRITICAL_ALERT_EMAIL)

    # If implicit TLS requested, STARTTLS should be off to avoid confusion
    if use_tls:
        starttls = False

    return {
        "host": host,
        "port": port,
        "username": username,
        "password": password,
        "use_tls": use_tls,
        "starttls": starttls,
        "mail_from": mail_from,
        "critical_to": critical_to,
    }


def _ensure_list(value: str | Iterable[str]) -> list[str]:
    """Normalize a string or iterable of strings into a list of recipients."""
    if isinstance(value, str):
        return [value]
    return list(value or [])


def _connect_smtp(cfg: dict, timeout: float) -> smtplib.SMTP:
    """
    Establish an SMTP connection based on configuration.

    Parameters
    ----------
    cfg : dict
        SMTP configuration from `_get_smtp_config()`.
    timeout : float
        Socket timeout in seconds.

    Returns
    -------
    smtplib.SMTP
        An initialized SMTP client (already TLS-wrapped if configured).

    Raises
    ------
    Exception
        If the connection or login fails.
    """
    if not cfg["host"]:
        raise RuntimeError("SMTP_HOST not configured")

    port = cfg.get("port")

    if cfg["use_tls"]:
        # Implicit TLS (SMTPS), typically port 465
        if port is None:
            client = smtplib.SMTP_SSL(cfg["host"], timeout=timeout)
        else:
            client = smtplib.SMTP_SSL(cfg["host"], port, timeout=timeout)
    else:
        if port is None:
            client = smtplib.SMTP(cfg["host"], timeout=timeout)
        else:
            client = smtplib.SMTP(cfg["host"], port, timeout=timeout)
        if cfg["starttls"]:
            client.ehlo()
            client.starttls()
            client.ehlo()

    if cfg["username"] and cfg["password"]:
        client.login(cfg["username"], cfg["password"])

    return client


def send_email(
    to: str | Iterable[str],
    subject: str,
    body: str,
    *,
    html: Optional[str] = None,
    headers: Optional[dict[str, str]] = None,
    timeout: float = 20.0,
    retries: int = 2,
) -> bool:
    """
    Send an email using SMTP with optional HTML body.

    Parameters
    ----------
    to : str | Iterable[str]
        Recipient or iterable of recipients.
    subject : str
        Email subject line.
    body : str
        Plaintext body content.
    html : str | None, optional
        Optional HTML alternative body.
    headers : dict[str, str] | None, optional
        Additional headers to include.
    timeout : float
        Socket timeout (seconds). Default 20.0.
    retries : int
        Number of retry attempts on transient failures. Default 2.

    Returns
    -------
    bool
        True if the message was accepted by the SMTP server; False otherwise.
    """
    cfg = _get_smtp_config()
    recipients = _ensure_list(to)
    if not recipients:
        log.warning("mailer_no_recipients", extra={"extra": {"subject": subject}})
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = cfg["mail_from"]
    msg["To"] = ", ".join(recipients)

    # Optional user headers
    for k, v in (headers or {}).items():
        if k.lower() not in {"from", "to", "subject"}:
            msg[k] = v

    msg.set_content(body or "")
    if html:
        msg.add_alternative(html, subtype="html")

    attempt = 0
    while True:
        attempt += 1
        try:
            with _connect_smtp(cfg, timeout=timeout) as smtp:
                smtp.send_message(msg)
            log.info(
                "mailer_sent",
                extra={"extra": {"to": recipients, "subject": subject, "attempt": attempt}},
            )
            return True
        except (smtplib.SMTPException, OSError, socket.timeout) as exc:
            log.warning(
                "mailer_send_failed",
                extra={
                    "extra": {
                        "error": str(exc),
                        "to": recipients,
                        "subject": subject,
                        "attempt": attempt,
                        "retries": retries,
                    }
                },
                exc_info=True,
            )
            if attempt > max(0, int(retries)):
                return False


def send_critical_email(subject: str, body: str) -> bool:
    """
    Send a critical alert email to the configured destination.

    Parameters
    ----------
    subject : str
        Subject line (a good pattern is to prefix with `[API CRITICAL]`).
    body : str
        Body text (stack traces, correlation ids, request info, etc).

    Returns
    -------
    bool
        True if the email was sent; False otherwise.
    """
    cfg = _get_smtp_config()
    to_addr = cfg["critical_to"] or CRITICAL_ALERT_EMAIL
    # Add a simple header to make filtering easier downstream
    headers = {"X-Orbit-Alert": "critical"}
    return send_email(to=to_addr, subject=subject, body=body, headers=headers)