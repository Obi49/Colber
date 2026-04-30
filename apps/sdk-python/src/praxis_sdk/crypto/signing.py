"""Ed25519 sign / verify helpers operating on base64-encoded keys + signatures.

Mirrors the on-the-wire convention used by every Praxis service:

  - 32-byte raw secret key, base64-encoded
  - 32-byte raw public key, base64-encoded
  - 64-byte signature, base64-encoded
  - message: ``bytes`` of UTF-8 (typically the JCS canonical form of a
    payload — see :func:`praxis_sdk.crypto.jcs.canonicalize_jcs_bytes`).

Both functions accept the message either as ``bytes`` or as a ``str``
(UTF-8 encoded internally) for caller convenience.

Backed by ``cryptography.hazmat.primitives.asymmetric.ed25519``. The
signatures produced here byte-for-byte match those produced by the TS
SDK (which uses ``@noble/ed25519``) for the same input keys + message.
"""

from __future__ import annotations

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

from ._codec import from_base64, to_base64

ED25519_SECRET_KEY_BYTES = 32
ED25519_PUBLIC_KEY_BYTES = 32
ED25519_SIGNATURE_BYTES = 64


def _to_bytes(message: bytes | str) -> bytes:
    return message.encode("utf-8") if isinstance(message, str) else message


def sign_message(secret_key_b64: str, message: bytes | str) -> str:
    """Sign ``message`` with ``secret_key_b64`` and return the signature as base64.

    The secret key MUST be a 32-byte raw Ed25519 secret key (the kind
    produced by :func:`praxis_sdk.crypto.generate_did_key`).

    Raises:
        ValueError: if the decoded key length is wrong.
    """
    secret_key = from_base64(secret_key_b64)
    if len(secret_key) != ED25519_SECRET_KEY_BYTES:
        raise ValueError(
            "Invalid Ed25519 secret key length: "
            f"expected {ED25519_SECRET_KEY_BYTES}, got {len(secret_key)}"
        )
    private = Ed25519PrivateKey.from_private_bytes(secret_key)
    sig = private.sign(_to_bytes(message))
    return to_base64(sig)


def verify_signature(
    public_key_b64: str,
    message: bytes | str,
    signature_b64: str,
) -> bool:
    """Verify ``signature_b64`` against ``message`` + ``public_key_b64``.

    Returns ``False`` for any cryptographic mismatch or malformed input —
    never raises on a bad signature.
    """
    try:
        public_key = from_base64(public_key_b64)
        signature = from_base64(signature_b64)
    except Exception:
        return False
    if len(public_key) != ED25519_PUBLIC_KEY_BYTES or len(signature) != ED25519_SIGNATURE_BYTES:
        return False
    try:
        Ed25519PublicKey.from_public_bytes(public_key).verify(signature, _to_bytes(message))
        return True
    except (InvalidSignature, ValueError):
        return False
    except Exception:
        return False
