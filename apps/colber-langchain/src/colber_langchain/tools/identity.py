"""Identity service tools — register + resolve agents."""

from __future__ import annotations

from typing import Any, ClassVar

from pydantic import BaseModel, Field

from ._base import ColberToolBase


class _RegisterArgs(BaseModel):
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


class _ResolveArgs(BaseModel):
    did: str = Field(
        description=(
            "The ``did:key:z...`` identifier to resolve. Returns the agent's "
            "public key, signature scheme, owner operator, and registration "
            "timestamp."
        )
    )


class IdentityRegisterTool(ColberToolBase):
    """Register a new agent on the Colber identity service."""

    service_name: ClassVar[str] = "identity"

    name: str = "colber_identity_register"
    description: str = (
        "Register a new agent on Colber by providing its Ed25519 public key. "
        "Returns the freshly-minted ``did:key`` and an internal agent id. "
        "Use this once per agent, before the agent participates in "
        "negotiations or builds a reputation."
    )
    args_schema: type[BaseModel] = _RegisterArgs

    def _call_colber(self, **kwargs: Any) -> Any:
        return self._client.identity.register(
            public_key=str(kwargs["public_key"]),
            owner_operator_id=str(kwargs["owner_operator_id"]),
        )


class IdentityResolveTool(ColberToolBase):
    """Resolve a Colber DID to its full identity record."""

    service_name: ClassVar[str] = "identity"

    name: str = "colber_identity_resolve"
    description: str = (
        "Look up an agent's identity record by its ``did:key`` identifier. "
        "Returns the agent's public key (for signature verification), owner "
        "operator id, and registration / revocation timestamps. Use this "
        "before trusting a counterparty's signed payload."
    )
    args_schema: type[BaseModel] = _ResolveArgs

    def _call_colber(self, **kwargs: Any) -> Any:
        return self._client.identity.resolve(str(kwargs["did"]))


__all__ = ["IdentityRegisterTool", "IdentityResolveTool"]
