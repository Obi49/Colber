"""``MemoryService`` — typed client for the ``memory`` service.

Mirror of ``apps/sdk-typescript/src/services/memory.ts`` and
``apps/memory/src/http/routes.ts``:

- ``POST  /v1/memory``                 (store)
- ``POST  /v1/memory/search``          (search)
- ``GET   /v1/memory/:id``             (retrieve)
- ``PATCH /v1/memory/:id``             (update)
- ``POST  /v1/memory/:id/share``       (share)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal
from urllib.parse import quote

from .._http import HttpClientOptions, RequestParams, request
from ._convert import from_wire, to_wire

MemoryType = Literal["fact", "event", "preference", "relation"]
Visibility = Literal["private", "operator", "shared", "public"]


@dataclass(frozen=True, slots=True)
class EmbeddingMeta:
    model: str
    dim: int


@dataclass(frozen=True, slots=True)
class StoreResponse:
    id: str
    embedding: EmbeddingMeta


@dataclass(frozen=True, slots=True)
class SearchHit:
    id: str
    score: float
    type: str
    owner_did: str
    snippet: str


@dataclass(frozen=True, slots=True)
class SearchResponse:
    hits: list[SearchHit] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class MemoryRecordPermissions:
    visibility: str
    shared_with: list[str] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class MemoryRecordEncryption:
    enabled: bool
    algorithm: str
    key_id: str


@dataclass(frozen=True, slots=True)
class MemoryRecord:
    id: str
    owner_did: str
    type: str
    text: str
    payload: dict[str, Any]
    permissions: MemoryRecordPermissions
    encryption: MemoryRecordEncryption
    created_at: str
    updated_at: str
    version: int
    embedding: EmbeddingMeta


@dataclass(frozen=True, slots=True)
class UpdateResponse:
    id: str
    version: int
    embedding: EmbeddingMeta


@dataclass(frozen=True, slots=True)
class ShareResponse:
    id: str
    shared_with: list[str] = field(default_factory=list)


class MemoryService:
    """Typed client for the ``memory`` service."""

    def __init__(self, opts: HttpClientOptions, base_url: str) -> None:
        self._opts = opts
        self._base_url = base_url

    def store(
        self,
        *,
        owner_did: str,
        type: MemoryType,
        text: str,
        permissions: dict[str, Any],
        payload: dict[str, Any] | None = None,
        encryption: dict[str, Any] | None = None,
    ) -> StoreResponse:
        """``POST /v1/memory``."""
        body_in: dict[str, Any] = {
            "owner_did": owner_did,
            "type": type,
            "text": text,
            "permissions": permissions,
        }
        if payload is not None:
            body_in["payload"] = payload
        if encryption is not None:
            body_in["encryption"] = encryption
        data = request(
            self._opts,
            RequestParams(
                method="POST",
                base_url=self._base_url,
                path="/v1/memory",
                body=to_wire(body_in),
            ),
        )
        if data is None:
            raise RuntimeError("memory.store: empty response body")
        return from_wire(StoreResponse, data)

    def search(
        self,
        *,
        query_did: str,
        query_text: str,
        top_k: int | None = None,
        filters: dict[str, Any] | None = None,
    ) -> SearchResponse:
        """``POST /v1/memory/search``."""
        body_in: dict[str, Any] = {"query_did": query_did, "query_text": query_text}
        if top_k is not None:
            body_in["top_k"] = top_k
        if filters is not None:
            body_in["filters"] = filters
        data = request(
            self._opts,
            RequestParams(
                method="POST",
                base_url=self._base_url,
                path="/v1/memory/search",
                body=to_wire(body_in),
            ),
        )
        if data is None:
            raise RuntimeError("memory.search: empty response body")
        return from_wire(SearchResponse, data)

    def retrieve(self, *, id: str, caller_did: str) -> MemoryRecord:
        """``GET /v1/memory/:id?callerDid=...``."""
        data = request(
            self._opts,
            RequestParams(
                method="GET",
                base_url=self._base_url,
                path=f"/v1/memory/{quote(id, safe='')}",
                query={"callerDid": caller_did},
            ),
        )
        if data is None:
            raise RuntimeError("memory.retrieve: empty response body")
        return from_wire(MemoryRecord, data)

    def update(
        self,
        *,
        id: str,
        caller_did: str,
        text: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> UpdateResponse:
        """``PATCH /v1/memory/:id``."""
        body_in: dict[str, Any] = {"caller_did": caller_did}
        if text is not None:
            body_in["text"] = text
        if payload is not None:
            body_in["payload"] = payload
        data = request(
            self._opts,
            RequestParams(
                method="PATCH",
                base_url=self._base_url,
                path=f"/v1/memory/{quote(id, safe='')}",
                body=to_wire(body_in),
            ),
        )
        if data is None:
            raise RuntimeError("memory.update: empty response body")
        return from_wire(UpdateResponse, data)

    def share(
        self,
        *,
        id: str,
        caller_did: str,
        share_with: list[str],
        expires_at: str | None = None,
    ) -> ShareResponse:
        """``POST /v1/memory/:id/share``."""
        body_in: dict[str, Any] = {"caller_did": caller_did, "share_with": share_with}
        if expires_at is not None:
            body_in["expires_at"] = expires_at
        data = request(
            self._opts,
            RequestParams(
                method="POST",
                base_url=self._base_url,
                path=f"/v1/memory/{quote(id, safe='')}/share",
                body=to_wire(body_in),
            ),
        )
        if data is None:
            raise RuntimeError("memory.share: empty response body")
        return from_wire(ShareResponse, data)
