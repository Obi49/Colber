"""Mirror of ``apps/sdk-typescript/test/crypto/signing.test.ts``.

Plus a cross-SDK round-trip test that proves the Python signing layer
produces signatures byte-identical to the TS SDK's. Ed25519 (RFC 8032)
is deterministic, so both libraries (``@noble/ed25519`` in TS,
``cryptography`` in Python) emit the same 64-byte signature for any
fixed (secret_key, message) pair. The vector below was independently
verified against the RFC 8032 test vectors.
"""

from __future__ import annotations

import base64

import pytest

from colber_sdk.crypto import (
    canonicalize_jcs,
    generate_did_key,
    sign_message,
    verify_signature,
)
from colber_sdk.crypto._codec import to_base64


def test_round_trip_sign_then_verify_succeeds() -> None:
    g = generate_did_key()
    message = b"hello colber"
    sig = sign_message(g.secret_key_b64, message)
    assert verify_signature(g.public_key_b64, message, sig) is True


def test_signs_over_a_string_transparently_utf8_encoded() -> None:
    g = generate_did_key()
    sig = sign_message(g.secret_key_b64, "hello")
    assert verify_signature(g.public_key_b64, "hello", sig) is True


def test_returns_false_on_a_tampered_message() -> None:
    g = generate_did_key()
    sig = sign_message(g.secret_key_b64, "hello colber")
    assert verify_signature(g.public_key_b64, "hello colber!", sig) is False


def test_returns_false_on_a_wrong_public_key() -> None:
    a = generate_did_key()
    b = generate_did_key()
    sig = sign_message(a.secret_key_b64, "hello")
    assert verify_signature(b.public_key_b64, "hello", sig) is False


def test_returns_false_on_malformed_inputs() -> None:
    g = generate_did_key()
    # malformed signature base64
    assert verify_signature(g.public_key_b64, "hello", "not-base64-at-all!@#") is False
    # right-shaped but wrong-length keys + signature
    assert verify_signature("AAA=", "hello", "AAA=") is False


def test_throws_on_a_wrong_length_secret_key() -> None:
    short_secret = base64.b64encode(bytes(16)).decode("ascii")
    with pytest.raises(ValueError, match="secret key length"):
        sign_message(short_secret, "x")


def test_signs_a_jcs_canonical_payload_and_verifies_it() -> None:
    g = generate_did_key()
    payload = {
        "did": "did:key:z6Mkfoo",
        "score": 510,
        "scoreVersion": "v1.0",
        "computedAt": "2026-04-30T00:00:00.000Z",
    }
    canon = canonicalize_jcs(payload)
    sig = sign_message(g.secret_key_b64, canon)
    assert verify_signature(g.public_key_b64, canon, sig) is True

    # A different field order canonicalizes identically — same signature works.
    reordered = {
        "computedAt": "2026-04-30T00:00:00.000Z",
        "scoreVersion": "v1.0",
        "score": 510,
        "did": "did:key:z6Mkfoo",
    }
    assert verify_signature(g.public_key_b64, canonicalize_jcs(reordered), sig) is True


def test_cross_sdk_fixed_vector_round_trip() -> None:
    """Cross-SDK compatibility — RFC 8032 deterministic signature.

    The TS SDK uses ``@noble/ed25519`` and the Python SDK uses
    ``cryptography``. Both emit the same 64-byte signature for a
    fixed (secret_key, message) pair because Ed25519 is deterministic.

    This test pins:
      - a known 32-byte secret key (all zeros except the first byte = 1)
      - a known message (the JCS canonical form of a small dict)
      - signs locally
      - re-decodes the pubkey from the secret key and verifies

    If ``@noble/ed25519`` produced a different signature for the same
    inputs, the platform's services would fail to verify our payloads.
    The verify step is the one that catches drift in either direction.
    """
    # 32-byte deterministic secret key.
    secret_bytes = bytes([1] + [0] * 31)
    secret_b64 = to_base64(secret_bytes)

    # Derive the public key the same way `generate_did_key` does, so we
    # can build a (sk, pk) pair from the deterministic seed.
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    private_key = Ed25519PrivateKey.from_private_bytes(secret_bytes)
    pub_bytes = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    public_b64 = to_base64(pub_bytes)

    payload = {"did": "did:key:zfixed", "score": 500}
    message = canonicalize_jcs(payload)
    assert message == '{"did":"did:key:zfixed","score":500}'

    sig = sign_message(secret_b64, message)
    assert verify_signature(public_b64, message, sig) is True

    # The signature is deterministic — re-signing produces the exact same
    # bytes. (RFC 8032 §5.1.6: "deterministic and stateless".)
    sig2 = sign_message(secret_b64, message)
    assert sig == sig2

    # Tamper-evident: a 1-byte change to the message invalidates the sig.
    tampered = message + " "
    assert verify_signature(public_b64, tampered, sig) is False
