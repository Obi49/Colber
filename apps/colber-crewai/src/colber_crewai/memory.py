# Copyright 2026 Colber Contributors
# SPDX-License-Identifier: Apache-2.0
"""``ColberLongTermMemory`` — back CrewAI's long-term memory tier with Colber.

CrewAI ships a 3-tier memory hierarchy:

- :class:`crewai.memory.short_term.ShortTermMemory` — recent
  conversation buffer (kept in-memory).
- :class:`crewai.memory.entity.EntityMemory` — extracted-entity
  knowledge graph (kept in SQLite by default).
- :class:`crewai.memory.long_term.LongTermMemory` — long-horizon
  semantic recall (the tier we plug Colber into).

We only override **long-term**: that's the tier where Colber
differentiates (ACL + chiffrement + cross-agent ``share`` semantics +
semantic search via Qdrant). Short-term and entity stay native to keep
the CrewAI defaults unchanged for users who don't need Colber's data
plane.

CrewAI 0.80+ interface
----------------------

The expected duck-typed interface for a long-term memory adapter is:

- ``save(value: str | object, metadata: dict | None = None) -> None``:
  persist a memory item.
- ``search(query: str, limit: int = 3, score_threshold: float | None = None
  ) -> list[dict]``: return semantic-search hits, each shaped like
  ``{"context": str, "metadata": dict, "score": float}``.

We expose **exactly** that surface. Subclassing
:class:`crewai.memory.long_term.LongTermMemory` directly would couple
the plugin to CrewAI's internal storage abstraction (`RAGStorage`,
`LTMSQLiteStorage`), which has churned across 0.80..0.95. The
duck-typed adapter is what CrewAI's :class:`crewai.Crew` accepts via
the ``long_term_memory=`` kwarg today and is the most stable contract.

Errors
------

Any :class:`httpx.HTTPError` / :class:`OSError` from the SDK is caught
and logged at ``WARNING`` (plus surfaced via :func:`warnings.warn`) so
the crew is never aborted because the memory backend is sick. ``save``
swallows the failure silently; ``search`` returns an empty list on
failure (CrewAI treats that as "no relevant memory found").
"""

from __future__ import annotations

import logging
import warnings
from typing import TYPE_CHECKING, Any

import httpx

from ._client import build_client_from_env

if TYPE_CHECKING:
    from colber_sdk import ColberClient

_log = logging.getLogger(__name__)

#: Default semantic-retrieval depth.
DEFAULT_TOP_K = 5

#: Default visibility for stored memories.
DEFAULT_VISIBILITY = "private"

#: Default ``type`` for memories saved via :meth:`ColberLongTermMemory.save`.
#: We tag long-term memory items as ``"event"`` (the closest match in the
#: Colber memory taxonomy: ``fact`` / ``event`` / ``preference`` / ``relation``).
DEFAULT_MEMORY_TYPE = "event"


class ColberLongTermMemory:
    """CrewAI-compatible long-term memory adapter backed by colber-memory.

    Args:
        agent_did: DID of the agent whose memories this instance owns +
            queries for. All ``store`` and ``search`` calls run as this
            agent. **Required**.
        client: A :class:`colber_sdk.ColberClient`. Defaults to one
            built from environment variables.
        top_k: How many semantic-search hits :meth:`search` may return
            when the caller doesn't pass an explicit ``limit``. Default
            ``5``.
        share_with: Optional list of peer DIDs that newly stored
            memories should be auto-shared with via
            :meth:`colber_sdk.MemoryService.share`. Useful when an
            agent collaborates with a fixed set of peers.
        memory_type: ``MemoryType`` literal (``"fact"`` / ``"event"`` /
            ``"preference"`` / ``"relation"``). Default ``"event"``
            — long-term memories typically describe events.
        visibility: Initial ACL visibility (``"private"`` / ``"operator"``
            / ``"shared"`` / ``"public"``). Default ``"private"``.

    Example:

        >>> from crewai import Crew  # doctest: +SKIP
        >>> from colber_crewai import ColberLongTermMemory  # doctest: +SKIP
        >>> long_term = ColberLongTermMemory(  # doctest: +SKIP
        ...     agent_did="did:key:z6Mk...", top_k=5,
        ... )
        >>> crew = Crew(  # doctest: +SKIP
        ...     agents=[...], tasks=[...],
        ...     memory=True, long_term_memory=long_term,
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
    ) -> None:
        if not agent_did:
            raise ValueError("ColberLongTermMemory requires a non-empty agent_did")
        if top_k <= 0:
            raise ValueError("ColberLongTermMemory.top_k must be > 0")
        self._agent_did = agent_did
        self._client = client if client is not None else build_client_from_env()
        self._top_k = top_k
        self._share_with = list(share_with) if share_with else None
        self._memory_type = memory_type
        self._visibility = visibility

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
    # CrewAI long-term memory contract
    # ------------------------------------------------------------------

    def save(
        self,
        value: Any,
        metadata: dict[str, Any] | None = None,
        agent: str | None = None,
    ) -> None:
        """Persist ``value`` as a Colber memory.

        ``value`` may be either a plain string (the simple case CrewAI
        passes) or a structured object — we render it via
        :func:`_render_value` and stash the original payload alongside
        in the colber-memory ``payload`` field for round-tripping.

        Args:
            value: The text or structured value to persist.
            metadata: Optional CrewAI metadata bag (task description,
                quality scores, expected output, etc.). Stored verbatim
                under the ``payload`` field.
            agent: Optional CrewAI agent name string (passed by some
                CrewAI versions as a third argument). Stored on
                ``payload.agent`` when present; otherwise ignored.

        Tolerant: any transport error is caught and logged at WARN.
        Returning silently is the CrewAI idiom — crews shouldn't break
        because the memory backend is sick.
        """
        text = _render_value(value)
        if not text:
            # Nothing meaningful to persist — skip silently rather than
            # poison the index with empty embeddings.
            return
        payload: dict[str, Any] = {"value": text}
        if isinstance(value, dict):
            payload["raw"] = dict(value)
        if metadata:
            payload["metadata"] = dict(metadata)
        if agent:
            payload["agent"] = str(agent)

        try:
            response = self._client.memory.store(
                owner_did=self._agent_did,
                type=self._memory_type,  # type: ignore[arg-type]
                text=text,
                permissions={"visibility": self._visibility, "shared_with": []},
                payload=payload,
            )
        except (httpx.HTTPError, OSError) as exc:
            self._warn("store_failed", exc)
            return
        except Exception as exc:  # pragma: no cover - defensive
            self._warn("store_unexpected", exc)
            return

        memory_id = getattr(response, "id", None)
        if memory_id and self._share_with:
            try:
                self._client.memory.share(
                    id=memory_id,
                    caller_did=self._agent_did,
                    share_with=list(self._share_with),
                )
            except (httpx.HTTPError, OSError) as exc:
                self._warn("share_failed", exc)
            except Exception as exc:  # pragma: no cover - defensive
                self._warn("share_unexpected", exc)

    def search(
        self,
        query: str,
        limit: int | None = None,
        score_threshold: float | None = None,
    ) -> list[dict[str, Any]]:
        """Return up to ``limit`` semantic-search hits matching ``query``.

        Each hit is shaped per CrewAI's expected long-term-memory
        result format: ``{"context": str, "metadata": dict, "score":
        float}``. ``context`` is the memory snippet; ``metadata`` is
        the original metadata bag (or ``{}`` if none was stored);
        ``score`` is the semantic similarity score.

        Args:
            query: Natural-language query text.
            limit: Maximum number of hits. Defaults to the constructor's
                ``top_k`` when ``None``.
            score_threshold: Reserved for forward-compat with CrewAI's
                evolving signature. The colber-memory backend does its
                own scoring; we filter results client-side when this is
                set.

        Returns:
            List of hit dicts. Empty list on transport failure.
        """
        effective_limit = limit if limit and limit > 0 else self._top_k
        try:
            response = self._client.memory.search(
                query_did=self._agent_did,
                query_text=str(query),
                top_k=int(effective_limit),
            )
        except (httpx.HTTPError, OSError) as exc:
            self._warn("search_failed", exc)
            return []
        except Exception as exc:  # pragma: no cover - defensive
            self._warn("search_unexpected", exc)
            return []

        hits = list(getattr(response, "hits", []) or [])
        out: list[dict[str, Any]] = []
        for hit in hits:
            score = float(getattr(hit, "score", 0.0) or 0.0)
            if score_threshold is not None and score < float(score_threshold):
                continue
            snippet = getattr(hit, "snippet", "") or ""
            out.append(
                {
                    "context": snippet,
                    "metadata": {
                        "id": getattr(hit, "id", ""),
                        "owner_did": getattr(hit, "owner_did", ""),
                        "type": getattr(hit, "type", ""),
                    },
                    "score": score,
                }
            )
        return out

    def reset(self) -> None:
        """No-op (logs a WARN).

        The colber-memory service does not currently expose a
        bulk-delete-by-owner endpoint. We log a warning so callers know
        this is a soft no-op rather than silently swallowing data — and
        avoid raising so the crew stays green.
        """
        _log.warning(
            "colber.memory.reset_noop: agent_did=%s — colber-memory has no "
            "bulk-delete-by-owner endpoint; reset() is currently a no-op.",
            self._agent_did,
        )

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


def _render_value(value: Any) -> str:
    """Render a CrewAI memory value as a single embedding-ready string.

    Plain strings pass through; dicts are flattened to ``key=value``
    lines (sorted for deterministic embedding); other types fall back
    to ``str()``.
    """
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        parts: list[str] = []
        for key in sorted(value.keys()):
            v = value[key]
            parts.append(f"{key}={_render_value(v) if not isinstance(v, str) else v}")
        return "\n".join(parts).strip()
    if isinstance(value, (list, tuple)):
        return "\n".join(_render_value(item) for item in value if item is not None).strip()
    try:
        return str(value).strip()
    except Exception:
        return ""


__all__ = [
    "DEFAULT_MEMORY_TYPE",
    "DEFAULT_TOP_K",
    "DEFAULT_VISIBILITY",
    "ColberLongTermMemory",
]
