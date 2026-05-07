# Copyright 2026 Colber Contributors
# SPDX-License-Identifier: Apache-2.0
"""Memory service tools — store, query, share semantic memories."""

from __future__ import annotations

from typing import Any, ClassVar

from pydantic import BaseModel, Field

from ._base import ColberToolBase


class MemoryStoreArgs(BaseModel):
    """Args model for :class:`MemoryStoreTool`."""

    owner_did: str = Field(
        description=(
            "DID of the agent that owns the memory. Becomes the only "
            "principal allowed to update or share it."
        )
    )
    type: str = Field(
        description=("Memory category. One of: ``fact``, ``event``, ``preference``, ``relation``."),
        pattern="^(fact|event|preference|relation)$",
    )
    text: str = Field(
        description="Free-form text to embed and index.",
        min_length=1,
        max_length=64 * 1024,
    )
    visibility: str = Field(
        default="private",
        description=(
            "ACL visibility of the new memory: ``private`` / ``operator`` / "
            "``shared`` / ``public``."
        ),
        pattern="^(private|operator|shared|public)$",
    )
    payload: dict[str, Any] | None = Field(
        default=None,
        description="Optional structured payload stored alongside the text.",
    )


class MemoryQueryArgs(BaseModel):
    """Args model for :class:`MemoryQueryTool`."""

    query_did: str = Field(
        description=(
            "DID of the agent issuing the query. Only memories owned by — or "
            "shared with — this DID are returned."
        )
    )
    query_text: str = Field(
        description="Natural-language query text. Embedded server-side.",
        min_length=1,
    )
    top_k: int = Field(
        default=5,
        description="Maximum number of hits to return (1..50).",
        ge=1,
        le=50,
    )


class MemoryShareArgs(BaseModel):
    """Args model for :class:`MemoryShareTool`."""

    id: str = Field(description="Memory id returned by ``colber_memory_store``.")
    caller_did: str = Field(
        description=("DID of the agent issuing the share grant — must be the memory owner.")
    )
    share_with: list[str] = Field(
        description="List of DIDs that should gain read access.",
        min_length=1,
    )
    expires_at: str | None = Field(
        default=None,
        description="Optional ISO-8601 expiration timestamp for the grant.",
    )


class MemoryStoreTool(ColberToolBase[MemoryStoreArgs]):
    """Store a new memory in colber-memory."""

    service_name: ClassVar[str] = "memory"
    args_model: ClassVar[type[BaseModel]] = MemoryStoreArgs
    tool_name: ClassVar[str] = "colber_memory_store"
    tool_description: ClassVar[str] = (
        "Persist a new semantic memory owned by ``owner_did``. The text is "
        "embedded server-side and indexed for similarity search. Use this "
        "to record facts, events, preferences, or relationships you want to "
        "retrieve later via ``colber_memory_query``."
    )

    def _call_colber(self, args: MemoryStoreArgs) -> Any:
        return self._client.memory.store(
            owner_did=args.owner_did,
            type=args.type,  # type: ignore[arg-type]
            text=args.text,
            permissions={
                "visibility": args.visibility,
                "shared_with": [],
            },
            payload=args.payload,
        )


class MemoryQueryTool(ColberToolBase[MemoryQueryArgs]):
    """Semantic search over memories accessible to ``query_did``."""

    service_name: ClassVar[str] = "memory"
    args_model: ClassVar[type[BaseModel]] = MemoryQueryArgs
    tool_name: ClassVar[str] = "colber_memory_query"
    tool_description: ClassVar[str] = (
        "Retrieve up to ``top_k`` memories most relevant to the query text, "
        "scoped to memories ``query_did`` is allowed to see (its own + ones "
        "explicitly shared with it). Returns a list of ``{id, score, type, "
        "owner_did, snippet}`` hits."
    )

    def _call_colber(self, args: MemoryQueryArgs) -> Any:
        return self._client.memory.search(
            query_did=args.query_did,
            query_text=args.query_text,
            top_k=args.top_k,
        )


class MemoryShareTool(ColberToolBase[MemoryShareArgs]):
    """Grant read access on a memory to one or more peer DIDs."""

    service_name: ClassVar[str] = "memory"
    args_model: ClassVar[type[BaseModel]] = MemoryShareArgs
    tool_name: ClassVar[str] = "colber_memory_share"
    tool_description: ClassVar[str] = (
        "Grant read access on a memory record to one or more peer DIDs. The "
        "caller must be the memory's owner. Returns the updated "
        "``shared_with`` list."
    )

    def _call_colber(self, args: MemoryShareArgs) -> Any:
        return self._client.memory.share(
            id=args.id,
            caller_did=args.caller_did,
            share_with=list(args.share_with),
            expires_at=args.expires_at,
        )


__all__ = [
    "MemoryQueryArgs",
    "MemoryQueryTool",
    "MemoryShareArgs",
    "MemoryShareTool",
    "MemoryStoreArgs",
    "MemoryStoreTool",
]
