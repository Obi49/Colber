# Copyright 2026 Colber Contributors
# SPDX-License-Identifier: Apache-2.0
"""Identity service tools — register + resolve agents."""

from __future__ import annotations

from typing import Any, ClassVar

from pydantic import BaseModel, Field

from ._base import ColberToolBase


class IdentityRegisterArgs(BaseModel):
    """Args model for :class:`IdentityRegisterTool`."""

    public_key: str = Field(
        description=(
            "Ed25519 public key, raw 32 bytes encoded as base64. The agent's "
            "DID is derived from this key on the server side."
        )
    )
    owner_operator_id: str = Field(
        description=(
            "Identifier of the operator that owns this agent — typically the "
            "tenant the agent belongs to."
        ),
        min_length=1,
        max_length=128,
    )


class IdentityResolveArgs(BaseModel):
    """Args model for :class:`IdentityResolveTool`."""

    did: str = Field(
        description=(
            "The ``did:key:z...`` identifier to resolve. Returns the agent's "
            "public key, signature scheme, owner operator, and registration "
            "timestamp."
        )
    )


class IdentityRegisterTool(ColberToolBase[IdentityRegisterArgs]):
    """Register a new agent on the Colber identity service."""

    service_name: ClassVar[str] = "identity"
    args_model: ClassVar[type[BaseModel]] = IdentityRegisterArgs
    tool_name: ClassVar[str] = "colber_identity_register"
    tool_description: ClassVar[str] = (
        "Register a new agent on Colber by providing its Ed25519 public key. "
        "Returns the freshly-minted ``did:key`` and an internal agent id. "
        "Use this once per agent, before the agent participates in "
        "negotiations or builds a reputation."
    )

    def _call_colber(self, args: IdentityRegisterArgs) -> Any:
        return self._client.identity.register(
            public_key=args.public_key,
            owner_operator_id=args.owner_operator_id,
        )


class IdentityResolveTool(ColberToolBase[IdentityResolveArgs]):
    """Resolve a Colber DID to its full identity record."""

    service_name: ClassVar[str] = "identity"
    args_model: ClassVar[type[BaseModel]] = IdentityResolveArgs
    tool_name: ClassVar[str] = "colber_identity_resolve"
    tool_description: ClassVar[str] = (
        "Look up an agent's identity record by its ``did:key`` identifier. "
        "Returns the agent's public key (for signature verification), owner "
        "operator id, and registration / revocation timestamps. Use this "
        "before trusting a counterparty's signed payload."
    )

    def _call_colber(self, args: IdentityResolveArgs) -> Any:
        return self._client.identity.resolve(args.did)


__all__ = [
    "IdentityRegisterArgs",
    "IdentityRegisterTool",
    "IdentityResolveArgs",
    "IdentityResolveTool",
]
