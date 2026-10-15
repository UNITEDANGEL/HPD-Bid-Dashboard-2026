"""Encrypt private files for the public site (server/private-data.mjs decrypts them for the signed-in owner).

Format: 12-byte random IV + AES-256-GCM ciphertext (with tag), key = base64 HPD_PRIVATE_DATA_KEY.
  encrypt_bytes(data, key_b64) -> bytes
  python scripts/private_data.py <in-file> <out-file>      (key from the HPD_PRIVATE_DATA_KEY env var)
"""
import base64
import os
import sys

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _key(key_b64):
    raw = base64.b64decode(key_b64.strip())
    if len(raw) != 32:
        raise ValueError("HPD_PRIVATE_DATA_KEY must be 32 bytes (base64)")
    return raw


def encrypt_bytes(data, key_b64):
    iv = os.urandom(12)
    return iv + AESGCM(_key(key_b64)).encrypt(iv, data, None)


def decrypt_bytes(blob, key_b64):
    return AESGCM(_key(key_b64)).decrypt(blob[:12], blob[12:], None)


if __name__ == "__main__":
    key = os.environ.get("HPD_PRIVATE_DATA_KEY", "")
    if not key:
        sys.exit("HPD_PRIVATE_DATA_KEY is not set")
    with open(sys.argv[1], "rb") as src:
        out = encrypt_bytes(src.read(), key)
    with open(sys.argv[2], "wb") as dst:
        dst.write(out)
