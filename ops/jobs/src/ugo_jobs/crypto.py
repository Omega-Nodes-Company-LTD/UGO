"""AES-256-GCM at-rest crypto — wire-compatible with packages/shared/src/crypto.ts.

Text format:   "v1:" + base64( iv[12] || ciphertext || tag[16] )
Binary format: b"UGO1" + iv[12] || ciphertext || tag[16]   (backups: no base64 overhead)
"""

from __future__ import annotations

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_TEXT_PREFIX = "v1:"
_BIN_MAGIC = b"UGO1"
_IV_LEN = 12
_KEY_LEN = 32


def parse_data_key(b64_key: str) -> bytes:
    key = base64.b64decode(b64_key)
    if len(key) != _KEY_LEN:
        raise ValueError(f"UGO_DATA_KEY must decode to {_KEY_LEN} bytes (AES-256)")
    return key


def encrypt_text(plaintext: str, key: bytes) -> str:
    iv = os.urandom(_IV_LEN)
    sealed = AESGCM(key).encrypt(iv, plaintext.encode("utf-8"), None)  # ct || tag
    return _TEXT_PREFIX + base64.b64encode(iv + sealed).decode("ascii")


def decrypt_text(payload: str, key: bytes) -> str:
    if not payload.startswith(_TEXT_PREFIX):
        raise ValueError("unknown ciphertext version")
    packed = base64.b64decode(payload[len(_TEXT_PREFIX) :])
    if len(packed) < _IV_LEN + 16:
        raise ValueError("ciphertext too short")
    opened = AESGCM(key).decrypt(packed[:_IV_LEN], packed[_IV_LEN:], None)
    return opened.decode("utf-8")


def encrypt_bytes(data: bytes, key: bytes) -> bytes:
    iv = os.urandom(_IV_LEN)
    return _BIN_MAGIC + iv + AESGCM(key).encrypt(iv, data, None)


def decrypt_bytes(payload: bytes, key: bytes) -> bytes:
    if not payload.startswith(_BIN_MAGIC):
        raise ValueError("unknown backup format")
    packed = payload[len(_BIN_MAGIC) :]
    return AESGCM(key).decrypt(packed[:_IV_LEN], packed[_IV_LEN:], None)
