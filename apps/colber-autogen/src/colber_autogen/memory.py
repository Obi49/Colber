# Copyright 2026 Colber Contributors
# SPDX-License-Identifier: Apache-2.0
"""``ColberMemory`` — implement AutoGen 0.4's ``Memory`` protocol on top of colber-memory.

AutoGen 0.4 ships a clean :class:`autogen_core.memory.Memory` abstract
class with five methods:

- ``async update_context(model_context: ChatCompletionContext) ->
  UpdateContextResult`` — query relevant memories + inject them into
  the agent's :class:`ChatCompletionContext` as a system message,
  matching the :class:`ListMemory` reference implementation's idiom.
- ``async query(query, cancellation_token=None, **kwargs) ->
  MemoryQueryResult`` — semantic search over memories the calling
  agent is allowed to see.
- ``async add(content: MemoryContent, cancellation_token=None) ->
  None`` — persist a new memory.
- ``async clear() -> None`` — delete every memory in this scope.
- ``async close() -> None`` — release any resources.

This is strictly nicer than CrewAI's ad-hoc duck-typed
``save``/``search`` interface — we get a stable, abstractly-defined
surface to bind to.

Mapping to colber-memory
------------------------

- ``update_context`` runs a :meth:`query` against the last system /
  user message in the context, takes the top hits, and appends a
  ``SystemMessage`` describing the relevant memories (mirrors the
  :class:`autogen_core.memory.ListMemory` shape).
- ``query`` calls :meth:`colber_sdk.MemoryService.search` with the
  agent's ``did`` as ``query_did``, mapping each hit to a
  :class:`MemoryContent` with ``mime_type=MemoryMimeType.TEXT``.
- ``add`` calls :meth:`colber_sdk.MemoryService.store` and, when
  ``share_with`` is configured, additionally
  :meth:`colber_sdk.MemoryService.share` to broadcast.
- ``clear`` is a logged no-op (colber-memory has no
  bulk-delete-by-owner endpoint as of v0.1; documented as a Wave 2.4
  follow-up).
- ``close`` is a no-op (the SDK client's lifecycle is owned by the
  caller — we don't close someone else's client).

Errors
------

Any :class:`httpx.HTTPError` / :class:`OSError` from the SDK is caught
and logged at ``WARNING`` (plus surfaced via :func:`warnings.warn`) so
the agent run is never aborted because the memory backend is sick.
``add`` swallows the failure silently; ``query`` returns an empty
:class:`MemoryQueryResult` on failure (AutoGen treats that as "no
relevant memory found").

Concurrency
-----------

All five methods are ``async`` per the AutoGen protocol, but the
underlying :class:`colber_sdk.ColberClient` is synchronous (HTTP via
``httpx.Client``). We lift each call into :func:`asyncio.to_thread`
so the agent's event loop is never blocked. The SDK client is
thread-safe (httpx.Client + per-call retry config), so concurrent
``query`` / ``add`` calls don't need an external lock.
"""

from __future__ import annotations

import asyncio
import logging
import warnings
from typing import TYPE_CHECKING, Any

import httpx
from autogen_core.memory import (
    Memory,
    MemoryContent,
    MemoryMimeType,
    MemoryQueryResult,
    UpdateContextResult,
)
from autogen_core.model_context import ChatCompletionContext
from autogen_core.models import SystemMessage

from ._client import build_client_from_env

if TYPE_CHECKING:
    from autogen_core import CancellationToken
    from colber_sdk import ColberClient

_log = logging.getLogger(__name__)

#: Default semantic-retrieval depth.
DEFAULT_TOP_K = 5

#: Default visibility for stored memories.
DEFAULT_VISIBILITY = "private"

#: Default ``type`` for memories saved via :meth:`ColberMemory.add`.
#: We tag memories as ``"event"`` (the closest match in the Colber
#: memory taxonomy: ``fact`` / ``event`` / ``preference`` / ``relation``).
DEFAULT_MEMORY_TYPE = "event"


class ColberMemory(Memory):
    """AutoGen :class:`Memory`-compatible adapter backed by colber-memory.

    Args:
        agent_did: DID of the agent whose memories this instance owns +
            queries for. All ``add`` and ``query`` calls run as this
            agent. **Required**.
        client: A :class:`colber_sdk.ColberClient`. Defaults to one
            built from environment variables.
        top_k: How many semantic-search hits :meth:`query` may return
            when the caller doesn't pass an explicit ``top_k``. Default
            ``5``.
        share_with: Optional list of peer DIDs that newly stored
            memories should be auto-shared with via
            :meth:`colber_sdk.MemoryService.share`. Useful when an
            agent collaborates with a fixed set of peers.
        memory_type: ``MemoryType`` literal (``"fact"`` / ``"event"`` /
            ``"preference"`` / ``"relation"``). Default ``"event"`` —
            agent runtime memories typically describe events.
        visibility: Initial ACL visibility (``"private"`` / ``"operator"``
            / ``"shared"`` / ``"public"``). Default ``"private"``.
        update_context_top_k: How many memories :meth:`update_context`
            should pull when no explicit query text is in the agent's
            context. Default ``5`` (matches ``top_k``).

    Example:

        >>> from autogen_agentchat.agents import AssistantAgent  # doctest: +SKIP
        >>> from colber_autogen import ColberMemory
        >>> memory = ColberMemory(  # doctest: +SKIP
        ...     agent_did="did:key:z6Mk...", top_k=5,
        ... )
        >>> agent = AssistantAgent(  # doctest: +SKIP
        ...     name="trader", model_client=..., memory=[memory],
        ... )
    """

    def __init__(
        self,
        *,
        agent_did: str,
        client: ColberClient | None = None,
        top_k: int = DEFAULT_TOP_K,
        share_with: list[str] | None = None,
        memory_type: str = DEFAULT_MEMORY_TYPE,
        visibility: str = DEFAULT_VISIBILITY,
        update_context_top_k: int | None = None,
    ) -> None:
        if not agent_did:
            raise ValueError("ColberMemory requires a non-empty agent_did")
        if top_k <= 0:
            raise ValueError("ColberMemory.top_k must be > 0")
        if update_context_top_k is not None and update_context_top_k <= 0:
            raise ValueError("ColberMemory.update_context_top_k must be > 0")
        # ``ComponentBase`` may define an ``__init__`` (or pick up
        # multiple inheritance side effects from ``ABC``); call ``super``
        # so we stay forward-compatible with future AutoGen versions
        # that grow optional setup work in the base class.
        super().__init__()
        self._agent_did = agent_did
        self._client = client if client is not None else build_client_from_env()
        self._top_k = top_k
        self._share_with = list(share_with) if share_with else None
        self._memory_type = memory_type
        self._visibility = visibility
        self._update_context_top_k = update_context_top_k or top_k

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def agent_did(self) -> str:
        return self._agent_did

    @property
    def top_k(self) -> int:
        return self._top_k

    # ------------------------------------------------------------------
    # AutoGen 0.4 Memory protocol
    # ------------------------------------------------------------------

    async def add(
        self,
        content: MemoryContent,
        cancellation_token: CancellationToken | None = None,
    ) -> None:
        """Persist ``content`` as a Colber memory.

        ``content.content`` may be a ``str`` (the common case AutoGen
        passes), :class:`bytes`, or a structured ``dict``. We render
        it via :func:`_render_memory_content` and stash the metadata
        bag alongside it under colber-memory's ``payload``.

        ``cancellation_token`` is honoured at the boundary — checked
        before kicking off the SDK call. Once the HTTP request is
        in-flight, the SDK manages its own timeout.

        Tolerant: any transport error is caught and logged at WARN.
        Returning silently is the AutoGen idiom — agents shouldn't
        break because the memory backend is sick.
        """
        if cancellation_token is not None and cancellation_token.is_cancelled():
            return
        text = _render_memory_content(content)
        if not text:
            # Nothing meaningful to persist — skip silently rather than
            # poison the index with empty embeddings.
            return
        payload: dict[str, Any] = {"value": text}
        if isinstance(content.content, dict):
            payload["raw"] = dict(content.content)
        if content.metadata:
            payload["metadata"] = dict(content.metadata)
        payload["mimeType"] = _mime_str(content.mime_type)

        try:
            response = await asyncio.to_thread(
                self._client.memory.store,
                owner_did=self._agent_did,
                type=self._memory_type,  # type: ignore[arg-type]
                text=text,
                permissions={"visibility": self._visibility, "shared_with": []},
                payload=payload,
            )
        except (httpx.HTTPError, OSError) as exc:
            self._warn("add_failed", exc)
            return
        except Exception as exc:  # pragma: no cover - defensive
            self._warn("add_unexpected", exc)
            return

        memory_id = getattr(response, "id", None)
        if memory_id and self._share_with:
            try:
                await asyncio.to_thread(
                    self._client.memory.share,
                    id=memory_id,
                    caller_did=self._agent_did,
                    share_with=list(self._share_with),
                )
            except (httpx.HTTPError, OSError) as exc:
                self._warn("share_failed", exc)
            except Exception as exc:  # pragma: no cover - defensive
                self._warn("share_unexpected", exc)

    async def query(
        self,
        query: str | MemoryContent,
        cancellation_token: CancellationToken | None = None,
        **kwargs: Any,
    ) -> MemoryQueryResult:
        """Return semantic-search hits matching ``query``.

        ``query`` may be either a plain string (the common case) or a
        :class:`MemoryContent` (we extract its ``content`` as the
        query text). ``kwargs["top_k"]`` overrides the constructor
        default; ``kwargs["score_threshold"]`` filters hits below the
        given score (the colber-memory backend does its own scoring,
        we filter client-side).

        Returns:
            :class:`MemoryQueryResult` whose ``results`` field is a
            list of :class:`MemoryContent` (one per hit). Empty list
            on transport failure.
        """
        if cancellation_token is not None and cancellation_token.is_cancelled():
            return MemoryQueryResult(results=[])

        query_text = _extract_query_text(query)
        if not query_text:
            return MemoryQueryResult(results=[])

        top_k_kw = kwargs.get("top_k")
        effective_top_k = (
            int(top_k_kw) if isinstance(top_k_kw, int) and top_k_kw > 0 else self._top_k
        )
        score_threshold_kw = kwargs.get("score_threshold")
        score_threshold: float | None = (
            float(score_threshold_kw) if isinstance(score_threshold_kw, (int, float)) else None
        )

        try:
            response = await asyncio.to_thread(
                self._client.memory.search,
                query_did=self._agent_did,
                query_text=query_text,
                top_k=effective_top_k,
            )
        except (httpx.HTTPError, OSError) as exc:
            self._warn("query_failed", exc)
            return MemoryQueryResult(results=[])
        except Exception as exc:  # pragma: no cover - defensive
            self._warn("query_unexpected", exc)
            return MemoryQueryResult(results=[])

        hits = list(getattr(response, "hits", []) or [])
        results: list[MemoryContent] = []
        for hit in hits:
            score = float(getattr(hit, "score", 0.0) or 0.0)
            if score_threshold is not None and score < score_threshold:
                continue
            snippet = getattr(hit, "snippet", "") or ""
            metadata: dict[str, Any] = {
                "id": str(getattr(hit, "id", "") or ""),
                "owner_did": str(getattr(hit, "owner_did", "") or ""),
                "type": str(getattr(hit, "type", "") or ""),
                "score": score,
            }
            results.append(
                MemoryContent(
                    content=snippet,
                    mime_type=MemoryMimeType.TEXT,
                    metadata=metadata,
                )
            )
        return MemoryQueryResult(results=results)

    async def update_context(
        self,
        model_context: ChatCompletionContext,
    ) -> UpdateContextResult:
        """Inject relevant memories into ``model_context`` as a system message.

        Strategy:

        1. Read the last user / system message from the context — that
           is the "topic" the agent is currently reasoning about.
        2. Run a :meth:`query` for that topic.
        3. Append a :class:`SystemMessage` summarising the hits to the
           context (matches AutoGen's :class:`ListMemory` reference
           implementation idiom — easy to render in any LLM prompt).

        When the context is empty, we skip the inject (nothing useful
        to do) but still return an empty :class:`UpdateContextResult`
        so the agent loop can proceed normally.
        """
        topic = await _extract_context_topic(model_context)
        if not topic:
            return UpdateContextResult(memories=MemoryQueryResult(results=[]))

        result = await self.query(topic, top_k=self._update_context_top_k)
        if not result.results:
            return UpdateContextResult(memories=result)

        formatted = _format_memories_for_context(result.results)
        try:
            await model_context.add_message(SystemMessage(content=formatted))
        except Exception as exc:  # pragma: no cover - defensive
            # ChatCompletionContext.add_message can in principle raise
            # if the underlying buffer rejects new messages. We don't
            # want a memory-injection failure to abort the agent; log
            # and return the query result unchanged.
            self._warn("update_context_inject_failed", exc)
        return UpdateContextResult(memories=result)

    async def clear(self) -> None:
        """No-op (logs a WARN).

        The colber-memory service does not currently expose a
        bulk-delete-by-owner endpoint. We log a warning so callers
        know this is a soft no-op rather than silently swallowing data
        — and avoid raising so the agent stays alive. Wave 2.4 will
        add a real ``DELETE /v1/memory?ownerDid=...`` endpoint to
        colber-memory and this method will switch to using it.
        """
        _log.warning(
            "colber.memory.clear_noop: agent_did=%s — colber-memory has no "
            "bulk-delete-by-owner endpoint; clear() is currently a no-op.",
            self._agent_did,
        )

    async def close(self) -> None:
        """No-op.

        The :class:`ColberClient`'s lifecycle is owned by the caller —
        we don't close a client we don't own.
        """
        return None

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _warn(self, event: str, exc: BaseException) -> None:
        message = f"colber.memory.{event}: {type(exc).__name__}: {exc}"
        _log.warning(message)
        warnings.warn(message, RuntimeWarning, stacklevel=3)


# ---------------------------------------------------------------------------
# Module-level helpers
# ---------------------------------------------------------------------------


def _render_memory_content(content: MemoryContent) -> str:
    """Render a :class:`MemoryContent` as a single embedding-ready string.

    Plain strings pass through; dicts are flattened to ``key=value``
    lines (sorted for deterministic embedding); bytes fall back to a
    UTF-8 best-effort decode; other types fall back to ``str()``.
    """
    raw = content.content
    if raw is None:
        return ""
    if isinstance(raw, str):
        return raw.strip()
    if isinstance(raw, bytes):
        try:
            return raw.decode("utf-8").strip()
        except UnicodeDecodeError:
            return raw.decode("utf-8", errors="replace").strip()
    if isinstance(raw, dict):
        parts: list[str] = []
        for key in sorted(raw.keys()):
            value = raw[key]
            rendered = value if isinstance(value, str) else _render_value(value)
            parts.append(f"{key}={rendered}")
        return "\n".join(parts).strip()
    return _render_value(raw)


def _render_value(value: Any) -> str:
    """Best-effort string conversion that never raises."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    try:
        return str(value)
    except Exception:
        return f"<unrepresentable {type(value).__name__}>"


def _mime_str(mime_type: Any) -> str:
    """Render a :class:`MemoryMimeType` (enum) or string as a plain string."""
    value = getattr(mime_type, "value", None)
    if isinstance(value, str):
        return value
    return _render_value(mime_type)


def _extract_query_text(query: str | MemoryContent) -> str:
    """Pull the query text out of either a string or a MemoryContent."""
    if isinstance(query, str):
        return query.strip()
    return _render_memory_content(query)


async def _extract_context_topic(model_context: ChatCompletionContext) -> str:
    """Best-effort topic extraction from a :class:`ChatCompletionContext`.

    Walks the context's messages from the most recent backwards,
    returning the first non-empty user / system message content as
    a single string. Returns ``""`` when no usable message is found.
    """
    try:
        messages = await model_context.get_messages()
    except Exception:
        return ""
    if not messages:
        return ""
    for msg in reversed(list(messages)):
        content = getattr(msg, "content", None)
        if not content:
            continue
        if isinstance(content, str):
            stripped = content.strip()
            if stripped:
                return stripped
        # AutoGen messages may carry a list of content blocks.
        if isinstance(content, list):
            joined = " ".join(str(item) for item in content if item is not None).strip()
            if joined:
                return joined
    return ""


def _format_memories_for_context(memories: list[MemoryContent]) -> str:
    """Format a list of memories as a single system-message string.

    Mirrors the layout :class:`autogen_core.memory.ListMemory` uses,
    so operators eyeballing the prompt see a familiar shape:

        Relevant memory content (in chronological order):
        1. <snippet>
        2. <snippet>
        ...
    """
    lines = ["Relevant memory content (in chronological order):"]
    for idx, mem in enumerate(memories, start=1):
        snippet = mem.content if isinstance(mem.content, str) else _render_value(mem.content)
        lines.append(f"{idx}. {snippet}")
    return "\n".join(lines)


__all__ = [
    "DEFAULT_MEMORY_TYPE",
    "DEFAULT_TOP_K",
    "DEFAULT_VISIBILITY",
    "ColberMemory",
]
