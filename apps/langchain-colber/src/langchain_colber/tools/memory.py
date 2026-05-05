"""Memory service tools — store, query, share semantic memories."""

from __future__ import annotations

from typing import Any, ClassVar

from pydantic import BaseModel, Field

from ._base import ColberToolBase


class _StoreArgs(BaseModel):
    owner_did: str = Field(
        description="DID of the agent that owns the memory. Becomes the only "
        "principal allowed to update or share it."
    )
    type: str = Field(
        description=(
            "Memory category. One of: ``fact``, ``event``, ``preference``, "
            "``relation``."
        ),
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


class _QueryArgs(BaseModel):
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


class _ShareArgs(BaseModel):
    id: str = Field(description="Memory id returned by ``colber_memory_store``.")
    caller_did: str = Field(
        description=(
            "DID of the agent issuing the share grant — must be the memory "
            "owner."
        )
    )
    share_with: list[str] = Field(
        description="List of DIDs that should gain read access.",
        min_length=1,
    )
    expires_at: str | None = Field(
        default=None,
        description="Optional ISO-8601 expiration timestamp for the grant.",
    )


class MemoryStoreTool(ColberToolBase):
    """Store a new memory in colber-memory."""

    service_name: ClassVar[str] = "memory"

    name: str = "colber_memory_store"
    description: str = (
        "Persist a new semantic memory owned by ``owner_did``. The text is "
        "embedded server-side and indexed for similarity search. Use this "
        "to record facts, events, preferences, or relationships you want to "
        "retrieve later via ``colber_memory_query``."
    )
    args_schema: type[BaseModel] = _StoreArgs

    def _call_colber(self, **kwargs: Any) -> Any:
        return self._client.memory.store(
            owner_did=str(kwargs["owner_did"]),
            type=str(kwargs["type"]),  # type: ignore[arg-type]
            text=str(kwargs["text"]),
            permissions={
                "visibility": str(kwargs.get("visibility", "private")),
                "shared_with": [],
            },
            payload=kwargs.get("payload"),
        )


class MemoryQueryTool(ColberToolBase):
    """Semantic search over memories accessible to ``query_did``."""

    service_name: ClassVar[str] = "memory"

    name: str = "colber_memory_query"
    description: str = (
        "Retrieve up to ``top_k`` memories most relevant to the query text, "
        "scoped to memories ``query_did`` is allowed to see (its own + ones "
        "explicitly shared with it). Returns a list of ``{id, score, type, "
        "owner_did, snippet}`` hits."
    )
    args_schema: type[BaseModel] = _QueryArgs

    def _call_colber(self, **kwargs: Any) -> Any:
        return self._client.memory.search(
            query_did=str(kwargs["query_did"]),
            query_text=str(kwargs["query_text"]),
            top_k=int(kwargs.get("top_k", 5)),
        )


class MemoryShareTool(ColberToolBase):
    """Grant read access on a memory to one or more peer DIDs."""

    service_name: ClassVar[str] = "memory"

    name: str = "colber_memory_share"
    description: str = (
        "Grant read access on a memory record to one or more peer DIDs. The "
        "caller must be the memory's owner. Returns the updated "
        "``shared_with`` list."
    )
    args_schema: type[BaseModel] = _ShareArgs

    def _call_colber(self, **kwargs: Any) -> Any:
        share_with_raw = kwargs["share_with"]
        if isinstance(share_with_raw, list):
            share_with = [str(item) for item in share_with_raw]
        else:
            share_with = [str(share_with_raw)]
        return self._client.memory.share(
            id=str(kwargs["id"]),
            caller_did=str(kwargs["caller_did"]),
            share_with=share_with,
            expires_at=(
                str(kwargs["expires_at"])
                if kwargs.get("expires_at") is not None
                else None
            ),
        )


__all__ = ["MemoryQueryTool", "MemoryShareTool", "MemoryStoreTool"]
