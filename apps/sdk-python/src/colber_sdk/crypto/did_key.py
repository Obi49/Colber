"""``did:key`` Ed25519 helpers (W3C did:key spec).

Mirror of ``apps/sdk-typescript/src/crypto/did-key.ts`` and
``packages/core-crypto/src/did-key.ts``.

Format: ``did:key:z<multibase-base58btc(0xed01 || pubkey32)>``

``0xed 0x01`` is the varint multicodec prefix for Ed25519 public keys.
The Python implementation produces byte-identical DID strings to the TS
SDK on the same input keypair.
"""

from __future__ import annotations

from dataclasses import dataclass

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from ._codec import from_base58btc, to_base58btc, to_base64

ED25519_MULTICODEC_PREFIX = bytes([0xED, 0x01])
DID_KEY_PREFIX = "did:key:"


@dataclass(frozen=True, slots=True)
class GeneratedDidKey:
    """A freshly minted DID + Ed25519 keypair.

    Attributes:
        did: ``did:key:z6Mk...`` identifier ready to register with the
            ``agent-identity`` service.
        public_key_b64: Raw 32-byte Ed25519 public key, base64-encoded
            (RFC 4648, with padding).
        secret_key_b64: Raw 32-byte Ed25519 secret key, base64-encoded.
            **KEEP SECRET.**
    """

    did: str
    public_key_b64: str
    secret_key_b64: str


@dataclass(frozen=True, slots=True)
class ParsedDidKey:
    """The decoded contents of a ``did:key`` identifier."""

    public_key: bytes
    public_key_b64: str


def generate_did_key() -> GeneratedDidKey:
    """Generate a fresh Ed25519 keypair and encode the public key as a ``did:key``.

    Returns the DID + base64-encoded public/secret keys ready to feed into
    ``client.identity.register(public_key=..., owner_operator_id=...)``.
    """
    private_key = Ed25519PrivateKey.generate()
    secret_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PrivateFormat.Raw,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_bytes = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    return GeneratedDidKey(
        did=encode_did_key(public_bytes),
        public_key_b64=to_base64(public_bytes),
        secret_key_b64=to_base64(secret_bytes),
    )


def encode_did_key(public_key: bytes) -> str:
    """Encode a 32-byte Ed25519 public key into its ``did:key`` form.

    Raises:
        ValueError: when ``public_key`` is not exactly 32 bytes.
    """
    if len(public_key) != 32:
        raise ValueError(f"Ed25519 public key must be 32 bytes, got {len(public_key)}")
    prefixed = ED25519_MULTICODEC_PREFIX + public_key
    return f"{DID_KEY_PREFIX}z{to_base58btc(prefixed)}"


def parse_did_key(did: str) -> ParsedDidKey:
    """Decode a ``did:key`` identifier into its raw + base64 public-key forms.

    Raises:
        ValueError: on malformed prefix, non-``z`` multibase, truncated
            payload, or unknown multicodec prefix.
    """
    if not did.startswith(DID_KEY_PREFIX):
        raise ValueError(f"Not a did:key identifier: {did}")
    multibase = did[len(DID_KEY_PREFIX) :]
    if not multibase.startswith("z"):
        first = multibase[0] if multibase else ""
        raise ValueError(f"Unsupported multibase encoding (expected 'z'): {first}")
    decoded = from_base58btc(multibase[1:])
    if len(decoded) < 3:
        raise ValueError("Decoded did:key payload too short")
    if decoded[0] != ED25519_MULTICODEC_PREFIX[0] or decoded[1] != ED25519_MULTICODEC_PREFIX[1]:
        raise ValueError(f"Unknown did:key multicodec prefix: 0x{decoded[0]:02x}{decoded[1]:02x}")
    public_key = bytes(decoded[len(ED25519_MULTICODEC_PREFIX) :])
    return ParsedDidKey(public_key=public_key, public_key_b64=to_base64(public_key))
