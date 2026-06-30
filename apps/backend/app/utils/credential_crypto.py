"""Helpers for encrypting and decrypting short-lived session passwords."""

from __future__ import annotations

from base64 import urlsafe_b64encode
from typing import Mapping, Any

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

_DERIVATION_SALT = b"orbit.credential-encryption.v1"
_DERIVATION_INFO = b"orbit/session-password"


def _derive_fernet_key(secret: str) -> bytes:
    material = secret.encode("utf-8")
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=_DERIVATION_SALT,
        info=_DERIVATION_INFO,
    )
    return urlsafe_b64encode(hkdf.derive(material))


def get_fernet_key(app_config: Mapping[str, Any]) -> bytes:
    """Resolve the Fernet key for session-password encryption."""

    configured = str(app_config.get("CREDENTIAL_ENCRYPTION_KEY") or "").strip()
    if configured:
        key = configured.encode("utf-8")
        try:
            Fernet(key)
            return key
        except Exception:
            env = str(app_config.get("APP_ENV") or "").strip().lower()
            if env in {"development", "dev", "test", "testing"} or bool(app_config.get("TESTING")):
                return _derive_fernet_key(configured)
            raise ValueError("CREDENTIAL_ENCRYPTION_KEY must be a valid Fernet key")

    jwt_secret = str(app_config.get("JWT_SECRET_KEY") or "").strip()
    if not jwt_secret:
        raise ValueError("JWT_SECRET_KEY is required to derive a credential encryption key")

    return _derive_fernet_key(jwt_secret)


def encrypt_password(plaintext: str, key: bytes) -> str:
    """Encrypt a plaintext password into a URL-safe token."""

    if not isinstance(plaintext, str):
        raise TypeError("plaintext password must be a string")
    return Fernet(key).encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_password(token: str, key: bytes) -> str:
    """Decrypt an encrypted session-password token."""

    if not isinstance(token, str):
        raise TypeError("encrypted password token must be a string")
    return Fernet(key).decrypt(token.encode("utf-8")).decode("utf-8")
