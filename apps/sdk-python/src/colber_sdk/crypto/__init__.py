"""``colber_sdk.crypto`` — public crypto surface.

- DID:key Ed25519 generation + parsing
- Sign / verify on base64-encoded payloads
- JCS RFC 8785 canonicalization
- Base64 encode/decode helpers (since the wire format is base64 everywhere)
"""

from __future__ import annotations

from ._codec import from_base64, to_base64
from .did_key import GeneratedDidKey, ParsedDidKey, encode_did_key, generate_did_key, parse_did_key
from .jcs import canonicalize_jcs, canonicalize_jcs_bytes
from .signing import sign_message, verify_signature

__all__ = [
    "GeneratedDidKey",
    "ParsedDidKey",
    "canonicalize_jcs",
    "canonicalize_jcs_bytes",
    "encode_did_key",
    "from_base64",
    "generate_did_key",
    "parse_did_key",
    "sign_message",
    "to_base64",
    "verify_signature",
]
