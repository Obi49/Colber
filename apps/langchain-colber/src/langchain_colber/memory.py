"""``ColberMemory`` — back LangChain memory with the Colber memory service.

Two integration points are exported:

- :class:`ColberMemory` — a :class:`langchain_core.memory.BaseMemory`
  implementation. ``load_memory_variables`` pulls the top-K most
  semantically-similar memories owned by ``agent_did`` (and shared with
  it) and renders them as a single ``history`` string. ``save_context``
  persists the latest ``(input, output)`` pair via ``memory.store``,
  optionally auto-shared with peers.
- :class:`ColberChatMessageHistory` — a thin
  :class:`langchain_core.chat_history.BaseChatMessageHistory` wrapper
  around the same backend, useful with chat-model memories like
  :class:`langchain_core.runnables.history.RunnableWithMessageHistory`.

The colber-memory service handles ACL + chiffrement transparently — the
plugin is just a thin adapter on top of the typed SDK client.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

import httpx
from langchain_core.chat_history import BaseChatMessageHistory
from langchain_core.memory import BaseMemory
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from pydantic import ConfigDict, Field, PrivateAttr

from ._client import build_client_from_env

if TYPE_CHECKING:
    from colber_sdk import ColberClient
    from colber_sdk.services.memory import MemoryType, Visibility

_log = logging.getLogger(__name__)

#: Default key under which ``load_memory_variables`` exposes the rendered history.
DEFAULT_MEMORY_KEY = "history"

#: Default semantic-retrieval depth.
DEFAULT_TOP_K = 5

#: Default visibility for memories created by ``save_context``.
DEFAULT_VISIBILITY: Visibility = "private"

#: Default ``type`` for memories created by ``save_context``.
DEFAULT_MEMORY_TYPE: MemoryType = "event"


class ColberMemory(BaseMemory):
    """Semantic conversation memory backed by the Colber memory service.

    Args:
        agent_did: DID of the agent whose memories this instance owns +
            queries for. All ``store`` and ``search`` calls run as this
            agent. **Required**.
        client: A :class:`colber_sdk.ColberClient`. Defaults to one built
            from environment variables (``COLBER_BASE_URLS`` /
            ``COLBER_BASE_URL`` / fallback to ``ColberClient.local()``).
        memory_key: Output key returned by ``load_memory_variables``.
            Default ``"history"``.
        input_key: Key used to extract the human message from
            ``save_context``'s inputs dict. When ``None`` (default), we
            try ``"input"`` then fall back to the first dict value.
        output_key: Key used to extract the AI message from
            ``save_context``'s outputs dict. When ``None`` (default),
            same heuristic as ``input_key`` with ``"output"``.
        top_k: How many semantic-search hits to include. Default ``5``.
        share_with: Optional list of peer DIDs that newly stored
            memories should be auto-shared with via ``memory.share``.
            Useful when an agent collaborates with a fixed set of
            peers (per :class:`MemoryCollabScenario`).
        memory_type: ``MemoryType`` literal (``"fact"`` /
            ``"event"`` / ``"preference"`` / ``"relation"``). Default
            ``"event"`` — chat turns are events.
        visibility: Initial ``Visibility`` for stored memories
            (``"private"`` / ``"operator"`` / ``"shared"`` / ``"public"``).
            Default ``"private"``.
        return_messages: When ``True``, ``load_memory_variables`` returns
            a list of :class:`BaseMessage`. When ``False`` (default),
            returns a rendered string — the standard LangChain
            ``BaseMemory`` shape.
    """

    # Pydantic v2 config: allow non-pydantic types (the SDK client) and
    # let subclasses live alongside the canonical fields.
    model_config = ConfigDict(arbitrary_types_allowed=True, extra="forbid")

    agent_did: str
    memory_key: str = DEFAULT_MEMORY_KEY
    input_key: str | None = None
    output_key: str | None = None
    top_k: int = DEFAULT_TOP_K
    share_with: list[str] | None = None
    memory_type: str = Field(default=DEFAULT_MEMORY_TYPE)
    visibility: str = Field(default=DEFAULT_VISIBILITY)
    return_messages: bool = False

    # The SDK client is private — we don't want pydantic to try to
    # validate / serialize it (it's an httpx-bound stateful object).
    _client: ColberClient = PrivateAttr()

    def __init__(
        self,
        *,
        agent_did: str,
        client: ColberClient | None = None,
        memory_key: str = DEFAULT_MEMORY_KEY,
        input_key: str | None = None,
        output_key: str | None = None,
        top_k: int = DEFAULT_TOP_K,
        share_with: list[str] | None = None,
        memory_type: str = DEFAULT_MEMORY_TYPE,
        visibility: str = DEFAULT_VISIBILITY,
        return_messages: bool = False,
    ) -> None:
        if not agent_did:
            raise ValueError("ColberMemory requires a non-empty agent_did")
        if top_k <= 0:
            raise ValueError("ColberMemory.top_k must be > 0")
        super().__init__(  # type: ignore[call-arg]
            agent_did=agent_did,
            memory_key=memory_key,
            input_key=input_key,
            output_key=output_key,
            top_k=top_k,
            share_with=list(share_with) if share_with else None,
            memory_type=memory_type,
            visibility=visibility,
            return_messages=return_messages,
        )
        self._client = client if client is not None else build_client_from_env()

    # ------------------------------------------------------------------
    # BaseMemory protocol
    # ------------------------------------------------------------------

    @property
    def memory_variables(self) -> list[str]:
        return [self.memory_key]

    def load_memory_variables(
        self,
        inputs: dict[str, Any],
    ) -> dict[str, Any]:
        """Pull the most relevant memories for ``inputs`` and render them.

        Falls back to an empty result on any transport error so the
        chain is never broken by an observability outage. Errors are
        logged at WARN.
        """
        query = self._select_input_text(inputs)
        try:
            response = self._client.memory.search(
                query_did=self.agent_did,
                query_text=query,
                top_k=self.top_k,
            )
        except (httpx.HTTPError, OSError) as exc:
            _log.warning(
                "colber.memory.search_failed: %s: %s",
                type(exc).__name__,
                str(exc),
            )
            return {self.memory_key: [] if self.return_messages else ""}
        except Exception as exc:
            _log.warning(
                "colber.memory.search_unexpected: %s: %s",
                type(exc).__name__,
                str(exc),
            )
            return {self.memory_key: [] if self.return_messages else ""}

        hits = list(getattr(response, "hits", []) or [])
        if self.return_messages:
            messages: list[BaseMessage] = [
                HumanMessage(content=hit.snippet) for hit in hits
            ]
            return {self.memory_key: messages}
        rendered = "\n".join(f"- {hit.snippet}" for hit in hits)
        return {self.memory_key: rendered}

    def save_context(
        self,
        inputs: dict[str, Any],
        outputs: dict[str, str],
    ) -> None:
        """Persist a (input, output) turn as a single Colber memory.

        Tolerant: errors are logged and swallowed. Returning silently is
        the LangChain idiom — chains shouldn't break because the memory
        backend is sick.
        """
        human = self._select_input_text(inputs)
        ai = self._select_output_text(outputs)
        text = self._render_turn(human, ai)
        try:
            response = self._client.memory.store(
                owner_did=self.agent_did,
                type=self.memory_type,  # type: ignore[arg-type]
                text=text,
                permissions={"visibility": self.visibility, "shared_with": []},
                payload={"human": human, "ai": ai},
            )
        except (httpx.HTTPError, OSError) as exc:
            _log.warning(
                "colber.memory.store_failed: %s: %s",
                type(exc).__name__,
                str(exc),
            )
            return
        except Exception as exc:
            _log.warning(
                "colber.memory.store_unexpected: %s: %s",
                type(exc).__name__,
                str(exc),
            )
            return

        # Optional fan-out share with the configured peer set.
        memory_id = getattr(response, "id", None)
        if memory_id and self.share_with:
            try:
                self._client.memory.share(
                    id=memory_id,
                    caller_did=self.agent_did,
                    share_with=list(self.share_with),
                )
            except (httpx.HTTPError, OSError) as exc:
                _log.warning(
                    "colber.memory.share_failed: %s: %s",
                    type(exc).__name__,
                    str(exc),
                )
            except Exception as exc:
                _log.warning(
                    "colber.memory.share_unexpected: %s: %s",
                    type(exc).__name__,
                    str(exc),
                )

    def clear(self) -> None:
        """Best-effort wipe (no-op).

        The colber-memory service does not currently expose a
        bulk-delete-by-owner endpoint (the SDK's :class:`MemoryService`
        only supports store / search / retrieve / update / share). We
        log a warning so callers know this is a soft no-op rather than
        silently swallowing data — and avoid raising so chains stay green.
        """
        _log.warning(
            "colber.memory.clear_noop: agent_did=%s — colber-memory has no "
            "bulk-delete-by-owner endpoint; clear() is currently a no-op.",
            self.agent_did,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _select_input_text(self, inputs: dict[str, Any]) -> str:
        """Pick the human input out of a LangChain ``inputs`` dict."""
        if self.input_key is not None:
            value = inputs.get(self.input_key, "")
            return str(value)
        for key in ("input", "question", "human", "message"):
            if key in inputs:
                return str(inputs[key])
        # Fallback: first value.
        if inputs:
            return str(next(iter(inputs.values())))
        return ""

    def _select_output_text(self, outputs: dict[str, Any]) -> str:
        if self.output_key is not None:
            value = outputs.get(self.output_key, "")
            return str(value)
        for key in ("output", "answer", "ai", "response"):
            if key in outputs:
                return str(outputs[key])
        if outputs:
            return str(next(iter(outputs.values())))
        return ""

    @staticmethod
    def _render_turn(human: str, ai: str) -> str:
        """Render a (human, ai) turn as a single string for embedding."""
        # Strip trivial whitespace; pad with explicit prefix so the
        # embedding model has the right anchors. The full structured
        # body lives in ``payload`` for retrieval-side reconstruction.
        h = human.strip()
        a = ai.strip()
        return f"Human: {h}\nAI: {a}".strip()


class ColberChatMessageHistory(BaseChatMessageHistory):
    """``BaseChatMessageHistory`` wrapper around the Colber memory service.

    Useful when the upstream component expects the chat-history
    abstraction (newer ``RunnableWithMessageHistory`` pattern).

    Each call to :meth:`add_message` stores a single Colber memory
    (``type=event``). :attr:`messages` re-loads the latest ``top_k``
    memories belonging to ``agent_did``.

    Args:
        agent_did: DID of the agent whose history this represents.
        client: Optional pre-built :class:`ColberClient`.
        top_k: How many memories to materialise on read. Default ``20``.
    """

    def __init__(
        self,
        *,
        agent_did: str,
        client: ColberClient | None = None,
        top_k: int = 20,
    ) -> None:
        if not agent_did:
            raise ValueError(
                "ColberChatMessageHistory requires a non-empty agent_did"
            )
        if top_k <= 0:
            raise ValueError("ColberChatMessageHistory.top_k must be > 0")
        self._agent_did = agent_did
        self._client = client if client is not None else build_client_from_env()
        self._top_k = top_k

    # BaseChatMessageHistory abstract API ------------------------------

    @property
    def messages(self) -> list[BaseMessage]:  # type: ignore[override]
        """Return the most recent stored messages.

        On any transport error, returns an empty list and logs a WARN.
        """
        try:
            response = self._client.memory.search(
                query_did=self._agent_did,
                query_text="",  # empty query → service returns most-recent matches
                top_k=self._top_k,
            )
        except (httpx.HTTPError, OSError) as exc:
            _log.warning(
                "colber.chat_history.search_failed: %s: %s",
                type(exc).__name__,
                str(exc),
            )
            return []
        except Exception as exc:
            _log.warning(
                "colber.chat_history.search_unexpected: %s: %s",
                type(exc).__name__,
                str(exc),
            )
            return []
        out: list[BaseMessage] = []
        for hit in getattr(response, "hits", []) or []:
            snippet = getattr(hit, "snippet", "") or ""
            out.append(HumanMessage(content=snippet))
        return out

    def add_message(self, message: BaseMessage) -> None:
        """Persist a single message as a Colber memory."""
        text = _message_text(message)
        role = _message_role(message)
        try:
            self._client.memory.store(
                owner_did=self._agent_did,
                type="event",
                text=text,
                permissions={"visibility": "private", "shared_with": []},
                payload={"role": role, "content": text},
            )
        except (httpx.HTTPError, OSError) as exc:
            _log.warning(
                "colber.chat_history.add_failed: %s: %s",
                type(exc).__name__,
                str(exc),
            )
        except Exception as exc:
            _log.warning(
                "colber.chat_history.add_unexpected: %s: %s",
                type(exc).__name__,
                str(exc),
            )

    def clear(self) -> None:
        """No-op (see :meth:`ColberMemory.clear` for rationale)."""
        _log.warning(
            "colber.chat_history.clear_noop: agent_did=%s — clear() is a no-op.",
            self._agent_did,
        )


# ---------------------------------------------------------------------------
# Module-level helpers
# ---------------------------------------------------------------------------


def _message_text(message: BaseMessage) -> str:
    """Best-effort string extraction of a LangChain message."""
    content = getattr(message, "content", "")
    if isinstance(content, str):
        return content
    # Rich content (list of dicts) — concatenate the text parts.
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict):
                value = block.get("text")
                if isinstance(value, str):
                    parts.append(value)
            else:
                parts.append(str(block))
        return "\n".join(parts)
    return str(content)


def _message_role(message: BaseMessage) -> str:
    if isinstance(message, HumanMessage):
        return "human"
    if isinstance(message, AIMessage):
        return "ai"
    return getattr(message, "type", "system") or "system"


__all__ = [
    "DEFAULT_MEMORY_KEY",
    "DEFAULT_MEMORY_TYPE",
    "DEFAULT_TOP_K",
    "DEFAULT_VISIBILITY",
    "ColberChatMessageHistory",
    "ColberMemory",
]
