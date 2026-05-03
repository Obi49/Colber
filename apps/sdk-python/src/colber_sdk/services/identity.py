"""``IdentityService`` — typed client for the ``agent-identity`` service.

Mirror of ``apps/sdk-typescript/src/services/identity.ts`` and
``apps/agent-identity/src/http/routes.ts``:

- ``POST /v1/identity/register``
- ``GET  /v1/identity/:did``
- ``POST /v1/identity/verify``
"""

from __future__ import annotations

from dataclasses import dataclass

from .._http import HttpClientOptions, RequestParams, request
from ._convert import from_wire, to_wire


@dataclass(frozen=True, slots=True)
class RegisterResponse:
    """Response of ``POST /v1/identity/register``."""

    did: str
    agent_id: str
    registered_at: str


@dataclass(frozen=True, slots=True)
class ResolveResponse:
    """Response of ``GET /v1/identity/:did``."""

    did: str
    agent_id: str
    public_key: str
    signature_scheme: str
    owner_operator_id: str
    registered_at: str
    revoked_at: str | None = None


@dataclass(frozen=True, slots=True)
class VerifyResponse:
    """Response of ``POST /v1/identity/verify``."""

    valid: bool
    reason: str | None = None


class IdentityService:
    """Typed client for the ``agent-identity`` service."""

    def __init__(self, opts: HttpClientOptions, base_url: str) -> None:
        self._opts = opts
        self._base_url = base_url

    def register(self, *, public_key: str, owner_operator_id: str) -> RegisterResponse:
        """``POST /v1/identity/register``.

        Args:
            public_key: Ed25519 public key, raw 32 bytes, base64-encoded.
            owner_operator_id: Operator that owns this agent (1..128 chars).
        """
        body = to_wire({"public_key": public_key, "owner_operator_id": owner_operator_id})
        data = request(
            self._opts,
            RequestParams(
                method="POST",
                base_url=self._base_url,
                path="/v1/identity/register",
                body=body,
            ),
        )
        if data is None:
            raise RuntimeError("identity.register: empty response body")
        return from_wire(RegisterResponse, data)

    def resolve(self, did: str) -> ResolveResponse:
        """``GET /v1/identity/:did``."""
        from urllib.parse import quote

        data = request(
            self._opts,
            RequestParams(
                method="GET",
                base_url=self._base_url,
                path=f"/v1/identity/{quote(did, safe='')}",
            ),
        )
        if data is None:
            raise RuntimeError("identity.resolve: empty response body")
        return from_wire(ResolveResponse, data)

    def verify(self, *, did: str, message: str, signature: str) -> VerifyResponse:
        """``POST /v1/identity/verify``.

        Args:
            did: The signer's ``did:key:z...`` identifier.
            message: base64-encoded message bytes.
            signature: base64-encoded Ed25519 signature.
        """
        body = to_wire({"did": did, "message": message, "signature": signature})
        data = request(
            self._opts,
            RequestParams(
                method="POST",
                base_url=self._base_url,
                path="/v1/identity/verify",
                body=body,
            ),
        )
        if data is None:
            raise RuntimeError("identity.verify: empty response body")
        return from_wire(VerifyResponse, data)
