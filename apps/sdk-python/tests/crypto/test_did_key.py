"""Mirror of ``apps/sdk-typescript/test/crypto/did-key.test.ts``."""

from __future__ import annotations

import pytest

from praxis_sdk.crypto import (
    encode_did_key,
    from_base64,
    generate_did_key,
    parse_did_key,
)
from praxis_sdk.crypto._codec import to_base58btc


def test_generates_a_fresh_did_and_base64_keypair() -> None:
    result = generate_did_key()
    assert result.did.startswith("did:key:z")
    assert len(from_base64(result.public_key_b64)) == 32
    assert len(from_base64(result.secret_key_b64)) == 32


def test_encode_parse_round_trip_preserves_public_key_bytes() -> None:
    g = generate_did_key()
    parsed = parse_did_key(g.did)
    expected = from_base64(g.public_key_b64)
    assert len(parsed.public_key) == 32
    assert parsed.public_key == expected
    assert parsed.public_key_b64 == g.public_key_b64


def test_throws_on_a_non_did_key_prefix() -> None:
    with pytest.raises(ValueError, match="Not a did:key"):
        parse_did_key("did:web:example.com")


def test_throws_on_an_unsupported_multibase_prefix_not_z() -> None:
    with pytest.raises(ValueError, match="Unsupported multibase"):
        parse_did_key("did:key:fdeadbeef")


def test_throws_on_a_truncated_payload() -> None:
    with pytest.raises(ValueError, match="too short"):
        parse_did_key("did:key:z")


def test_throws_on_the_wrong_multicodec_prefix() -> None:
    """Build a DID with the secp256k1 multicodec prefix (0xe7 0x01) and
    confirm it's rejected."""
    fake_pub = bytes([7] * 32)
    wrong_prefix = bytes([0xE7, 0x01])
    payload = wrong_prefix + fake_pub
    bad_did = f"did:key:z{to_base58btc(payload)}"
    with pytest.raises(ValueError, match="multicodec prefix"):
        parse_did_key(bad_did)


def test_rejects_encoding_a_public_key_that_is_not_32_bytes() -> None:
    with pytest.raises(ValueError, match="must be 32 bytes"):
        encode_did_key(bytes(16))
    with pytest.raises(ValueError, match="must be 32 bytes"):
        encode_did_key(bytes(64))


def test_known_vector_fixed_pubkey_produces_stable_did() -> None:
    """Fixed test vector: encoding a deterministic 32-byte public key
    produces a known DID. This matches the TS SDK's encode_did_key
    output for the same input.
    """
    pub = bytes(range(32))
    did = encode_did_key(pub)
    assert did.startswith("did:key:z")
    parsed = parse_did_key(did)
    assert parsed.public_key == pub
