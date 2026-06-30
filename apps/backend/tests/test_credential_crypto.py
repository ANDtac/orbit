from __future__ import annotations

import pytest

from app.utils.credential_crypto import decrypt_password, encrypt_password, get_fernet_key


def test_encrypt_decrypt_roundtrip():
    key = get_fernet_key({"JWT_SECRET_KEY": "test-secret", "APP_ENV": "test", "TESTING": True})
    encrypted = encrypt_password("super-secret", key)

    assert encrypted != "super-secret"
    assert decrypt_password(encrypted, key) == "super-secret"


def test_get_fernet_key_uses_explicit_key():
    explicit = b"nRa5m6zlP5Y5f4WDPwZ6l0tY2nP9QGkWai0y1W7t8sE="
    key = get_fernet_key({"CREDENTIAL_ENCRYPTION_KEY": explicit.decode("utf-8"), "JWT_SECRET_KEY": "ignored"})

    assert key == explicit


def test_get_fernet_key_derives_in_test_mode():
    key = get_fernet_key({"CREDENTIAL_ENCRYPTION_KEY": "not-a-fernet-key", "JWT_SECRET_KEY": "test-secret", "APP_ENV": "test", "TESTING": True})

    assert isinstance(key, bytes)
    assert len(key) > 10


def test_decrypt_with_wrong_key_fails():
    key = get_fernet_key({"JWT_SECRET_KEY": "first", "APP_ENV": "test", "TESTING": True})
    other = get_fernet_key({"JWT_SECRET_KEY": "second", "APP_ENV": "test", "TESTING": True})
    encrypted = encrypt_password("super-secret", key)

    with pytest.raises(Exception):
        decrypt_password(encrypted, other)
