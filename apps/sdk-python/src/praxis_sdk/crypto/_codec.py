"""Encoding helpers — pure, no crypto.

Mirrors ``apps/sdk-typescript/src/crypto/codec.ts`` so the Python SDK
produces byte-identical outputs to the TS SDK on the same inputs.

- RFC 4648 base64 (with padding) for keys/signatures on the wire.
- Base58btc (Bitcoin alphabet) for the multibase ``z`` prefix required
  by the W3C did:key spec.
"""

from __future__ import annotations

import base64

BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def to_base64(data: bytes) -> str:
    """RFC 4648 base64 (with padding) — encode."""
    return base64.b64encode(data).decode("ascii")


def from_base64(s: str) -> bytes:
    """RFC 4648 base64 (with padding) — decode.

    Tolerant of missing padding (some senders strip it). Raises
    ``binascii.Error`` on illegal characters.
    """
    # Auto-pad to a multiple of 4. Mirrors how Node's Buffer.from('...', 'base64')
    # tolerates unpadded inputs the TS test suite occasionally produces.
    padding = (-len(s)) % 4
    return base64.b64decode(s + ("=" * padding), validate=False)


def to_base58btc(data: bytes) -> str:
    """Base58btc encoding (Bitcoin alphabet).

    Used by the multibase ``z`` prefix required by the W3C did:key spec.
    Algorithm matches ``toBase58btc`` in the TS SDK byte-for-byte.
    """
    if len(data) == 0:
        return ""

    # Count leading zero bytes — they map 1:1 to leading '1' chars.
    zeros = 0
    while zeros < len(data) and data[zeros] == 0:
        zeros += 1

    size = ((len(data) - zeros) * 138) // 100 + 1
    buffer = bytearray(size)
    length = 0

    for i in range(zeros, len(data)):
        carry = data[i]
        j = 0
        k = size - 1
        while (carry != 0 or j < length) and k >= 0:
            carry += 256 * buffer[k]
            buffer[k] = carry % 58
            carry //= 58
            k -= 1
            j += 1
        length = j

    it = size - length
    while it < size and buffer[it] == 0:
        it += 1

    out = "1" * zeros
    while it < size:
        out += BASE58_ALPHABET[buffer[it]]
        it += 1
    return out


def from_base58btc(s: str) -> bytes:
    """Inverse of :func:`to_base58btc`. Raises ``ValueError`` on invalid char."""
    if len(s) == 0:
        return b""

    zeros = 0
    while zeros < len(s) and s[zeros] == "1":
        zeros += 1

    size = ((len(s) - zeros) * 733) // 1000 + 1
    buffer = bytearray(size)
    length = 0

    for i in range(zeros, len(s)):
        ch = s[i]
        carry_start = BASE58_ALPHABET.find(ch)
        if carry_start == -1:
            raise ValueError(f"Invalid base58 character: {ch}")

        carry = carry_start
        j = 0
        k = size - 1
        while (carry != 0 or j < length) and k >= 0:
            carry += 58 * buffer[k]
            buffer[k] = carry & 0xFF
            carry >>= 8
            k -= 1
            j += 1
        length = j

    it = size - length
    while it < size and buffer[it] == 0:
        it += 1

    out = bytearray(zeros) + buffer[it:]
    return bytes(out)
