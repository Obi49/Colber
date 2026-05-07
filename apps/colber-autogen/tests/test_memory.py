# Copyright 2026 Colber Contributors
# SPDX-License-Identifier: Apache-2.0
"""Tests for :class:`ColberMemory` (AutoGen 0.4 ``Memory`` protocol)."""

from __future__ import annotations

from typing import Any

import pytest
from autogen_core import CancellationToken
from autogen_core.memory import (
    Memory,
    MemoryContent,
    MemoryMimeType,
    MemoryQueryResult,
    UpdateContextResult,
)
from autogen_core.model_context import BufferedChatCompletionContext
from autogen_core.models import UserMessage

from colber_autogen import ColberMemory


def _text(s: str) -> MemoryContent:
    return MemoryContent(content=s, mime_type=MemoryMimeType.TEXT)


def test_constructor_requires_agent_did(colber_client: Any) -> None:
    with pytest.raises(ValueError, match="agent_did"):
        ColberMemory(client=colber_client, agent_did="")


def test_constructor_rejects_bad_top_k(colber_client: Any) -> None:
    with pytest.raises(ValueError, match="top_k"):
        ColberMemory(client=colber_client, agent_did="did:key:zX", top_k=0)


def test_constructor_rejects_bad_update_context_top_k(colber_client: Any) -> None:
    with pytest.raises(ValueError, match="update_context_top_k"):
        ColberMemory(
            client=colber_client,
            agent_did="did:key:zX",
            update_context_top_k=-1,
        )


def test_protocol_conformance(colber_client: Any) -> None:
    """``ColberMemory`` is-a :class:`autogen_core.memory.Memory`."""
    memory = ColberMemory(client=colber_client, agent_did="did:key:zCheck")
    assert isinstance(memory, Memory)


async def test_add_persists_string_value(
    fake_backend: Any,
    make_memory: Any,
) -> None:
    memory = make_memory(agent_did="did:key:zMem")
    await memory.add(_text("Roses are red"))
    assert len(fake_backend.memories) == 1
    stored = next(iter(fake_backend.memories.values()))
    assert stored["ownerDid"] == "did:key:zMem"
    assert "Roses are red" in stored["text"]


async def test_add_persists_metadata(
    fake_backend: Any,
    make_memory: Any,
) -> None:
    memory = make_memory(agent_did="did:key:zMem")
    content = MemoryContent(
        content="Paris is the capital of France",
        mime_type=MemoryMimeType.TEXT,
        metadata={"task": "geography"},
    )
    await memory.add(content)
    stored = next(iter(fake_backend.memories.values()))
    assert stored["payload"]["metadata"] == {"task": "geography"}
    assert stored["payload"]["mimeType"] == "text/plain"


async def test_add_propagates_share_with(
    fake_backend: Any,
    make_memory: Any,
) -> None:
    memory = make_memory(
        agent_did="did:key:zOwner",
        share_with=["did:key:zPeerA", "did:key:zPeerB"],
    )
    await memory.add(_text("Confidential"))
    mem_id = next(iter(fake_backend.memories.keys()))
    assert fake_backend.memory_shares[mem_id] == [
        "did:key:zPeerA",
        "did:key:zPeerB",
    ]


async def test_add_with_dict_value_serialises(
    fake_backend: Any,
    make_memory: Any,
) -> None:
    memory = make_memory(agent_did="did:key:zMem")
    content = MemoryContent(
        content={"role": "assistant", "content": "Done"},
        mime_type=MemoryMimeType.JSON,
    )
    await memory.add(content)
    stored = next(iter(fake_backend.memories.values()))
    # Dict was flattened to ``key=value`` lines.
    assert "role=assistant" in stored["text"]
    assert "content=Done" in stored["text"]
    # Original payload preserved under ``payload.raw`` for round-tripping.
    assert stored["payload"]["raw"] == {"role": "assistant", "content": "Done"}


async def test_add_skips_empty_values(
    fake_backend: Any,
    make_memory: Any,
) -> None:
    memory = make_memory(agent_did="did:key:zMem")
    await memory.add(_text(""))
    # No memory persisted (avoid poisoning the index with empty embeddings).
    assert fake_backend.memories == {}


async def test_add_swallows_transport_failure(
    fake_backend: Any,
    make_memory: Any,
    recwarn: pytest.WarningsRecorder,
) -> None:
    fake_backend.fail_for[("POST", "/v1/memory")] = 99
    memory = make_memory(agent_did="did:key:zResilient")
    # Should not raise — the agent stays alive.
    await memory.add(_text("a memory"))
    assert fake_backend.memories == {}
    assert any(issubclass(w.category, RuntimeWarning) for w in recwarn.list)


async def test_add_respects_cancellation_token(
    fake_backend: Any,
    make_memory: Any,
) -> None:
    """A pre-cancelled token must short-circuit ``add``."""
    memory = make_memory(agent_did="did:key:zMem")
    token = CancellationToken()
    token.cancel()
    await memory.add(_text("ignored"), cancellation_token=token)
    assert fake_backend.memories == {}


async def test_query_returns_memory_query_result(
    fake_backend: Any,
    make_memory: Any,
) -> None:
    fake_backend.memories["mem-1"] = {
        "ownerDid": "did:key:zReader",
        "text": "Paris is the capital of France",
        "type": "fact",
    }
    memory = make_memory(agent_did="did:key:zReader")
    result = await memory.query("Paris", top_k=5)
    assert isinstance(result, MemoryQueryResult)
    assert len(result.results) == 1
    hit = result.results[0]
    assert hit.mime_type == MemoryMimeType.TEXT
    assert "Paris" in (hit.content if isinstance(hit.content, str) else "")
    assert hit.metadata is not None
    assert hit.metadata["id"] == "mem-1"


async def test_query_uses_default_top_k(
    fake_backend: Any,
    make_memory: Any,
) -> None:
    memory = make_memory(agent_did="did:key:zR", top_k=3)
    await memory.query("anything")
    payloads = [b for (_, p, b) in fake_backend.calls if p == "/v1/memory/search"]
    assert payloads
    assert payloads[-1] is not None
    assert payloads[-1]["topK"] == 3


async def test_query_score_threshold_filters(
    fake_backend: Any,
    make_memory: Any,
) -> None:
    fake_backend.memories["mem-low"] = {
        "ownerDid": "did:key:zR",
        "text": "weakly relevant note",
        "type": "fact",
    }
    memory = make_memory(agent_did="did:key:zR")
    # The fake backend always returns score=0.92; threshold above that
    # should drop everything.
    result_high = await memory.query("note", top_k=5, score_threshold=0.95)
    assert result_high.results == []
    result_low = await memory.query("note", top_k=5, score_threshold=0.5)
    assert len(result_low.results) == 1


async def test_query_failure_returns_empty(
    fake_backend: Any,
    make_memory: Any,
    recwarn: pytest.WarningsRecorder,
) -> None:
    fake_backend.fail_for[("POST", "/v1/memory/search")] = 99
    memory = make_memory(agent_did="did:key:zResilient")
    result = await memory.query("ping", top_k=3)
    assert result.results == []
    assert any(issubclass(w.category, RuntimeWarning) for w in recwarn.list)


async def test_query_accepts_memory_content(
    fake_backend: Any,
    make_memory: Any,
) -> None:
    """:meth:`query` accepts a :class:`MemoryContent` query object."""
    fake_backend.memories["mem-1"] = {
        "ownerDid": "did:key:zReader",
        "text": "Tokyo is the capital of Japan",
        "type": "fact",
    }
    memory = make_memory(agent_did="did:key:zReader")
    query = MemoryContent(content="Tokyo", mime_type=MemoryMimeType.TEXT)
    result = await memory.query(query)
    assert len(result.results) == 1


async def test_update_context_injects_system_message(
    fake_backend: Any,
    make_memory: Any,
) -> None:
    fake_backend.memories["mem-1"] = {
        "ownerDid": "did:key:zR",
        "text": "Paris is the capital of France",
        "type": "fact",
    }
    memory = make_memory(agent_did="did:key:zR")
    context = BufferedChatCompletionContext(buffer_size=10)
    # The fake backend matches with a case-insensitive substring check, so
    # the user message must contain a substring of the stored memory's text.
    await context.add_message(UserMessage(content="paris", source="user"))
    result = await memory.update_context(context)
    assert isinstance(result, UpdateContextResult)
    assert len(result.memories.results) == 1
    messages = await context.get_messages()
    # User message + injected system message.
    assert len(messages) == 2


async def test_update_context_empty_context_returns_empty(
    fake_backend: Any,
    make_memory: Any,
) -> None:
    memory = make_memory(agent_did="did:key:zR")
    context = BufferedChatCompletionContext(buffer_size=10)
    result = await memory.update_context(context)
    assert isinstance(result, UpdateContextResult)
    assert result.memories.results == []


async def test_clear_is_a_logged_noop(
    fake_backend: Any,
    make_memory: Any,
    caplog: pytest.LogCaptureFixture,
) -> None:
    memory = make_memory(agent_did="did:key:zR")
    with caplog.at_level("WARNING"):
        await memory.clear()
    # No deletion call landed on the backend.
    assert all(m != "DELETE" for (m, _p, _b) in fake_backend.calls)
    # And we logged a clear warning.
    assert any("clear_noop" in r.message for r in caplog.records)


async def test_close_is_a_safe_noop(
    fake_backend: Any,
    make_memory: Any,
) -> None:
    memory = make_memory(agent_did="did:key:zR")
    # Must not raise, must not close the underlying client we don't own.
    await memory.close()
