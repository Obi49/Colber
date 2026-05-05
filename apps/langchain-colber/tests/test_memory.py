"""Tests for :class:`langchain_colber.ColberMemory` + :class:`ColberChatMessageHistory`."""

from __future__ import annotations

from typing import Any

import pytest
from langchain_core.messages import HumanMessage

from langchain_colber import ColberChatMessageHistory, ColberMemory


def test_constructor_requires_agent_did(colber_client: Any) -> None:
    with pytest.raises(ValueError, match="agent_did"):
        ColberMemory(client=colber_client, agent_did="")


def test_constructor_rejects_bad_top_k(colber_client: Any) -> None:
    with pytest.raises(ValueError, match="top_k"):
        ColberMemory(client=colber_client, agent_did="did:key:zX", top_k=0)


def test_save_context_stores_a_memory(
    fake_backend: Any,
    make_memory: Any,
) -> None:
    memory = make_memory(agent_did="did:key:zMem")
    memory.save_context({"input": "hello"}, {"output": "hi back"})
    assert len(fake_backend.memories) == 1
    stored = next(iter(fake_backend.memories.values()))
    assert stored["ownerDid"] == "did:key:zMem"
    assert "Human: hello" in stored["text"]
    assert "AI: hi back" in stored["text"]


def test_save_context_with_share_with_propagates(
    fake_backend: Any,
    make_memory: Any,
) -> None:
    memory = make_memory(
        agent_did="did:key:zOwner",
        share_with=["did:key:zPeerA", "did:key:zPeerB"],
    )
    memory.save_context({"input": "secret"}, {"output": "ok"})
    assert len(fake_backend.memories) == 1
    mem_id = next(iter(fake_backend.memories.keys()))
    assert fake_backend.memory_shares[mem_id] == [
        "did:key:zPeerA",
        "did:key:zPeerB",
    ]


def test_load_memory_variables_returns_string_history(
    fake_backend: Any,
    make_memory: Any,
) -> None:
    memory = make_memory(agent_did="did:key:zReader")
    # Seed the backend.
    fake_backend.memories["mem-1"] = {
        "ownerDid": "did:key:zReader",
        "text": "Human: prior question\nAI: prior answer",
        "type": "event",
    }
    result = memory.load_memory_variables({"input": "prior"})
    rendered = result[memory.memory_key]
    assert isinstance(rendered, str)
    assert "prior question" in rendered


def test_load_memory_variables_returns_messages_when_flagged(
    fake_backend: Any,
    make_memory: Any,
) -> None:
    memory = make_memory(agent_did="did:key:zReader", return_messages=True)
    fake_backend.memories["mem-1"] = {
        "ownerDid": "did:key:zReader",
        "text": "Human: hello\nAI: hi",
        "type": "event",
    }
    result = memory.load_memory_variables({"input": "hello"})
    history = result[memory.memory_key]
    assert isinstance(history, list)
    assert all(isinstance(m, HumanMessage) for m in history)


def test_search_failure_returns_empty(
    fake_backend: Any,
    make_memory: Any,
) -> None:
    fake_backend.fail_for[("POST", "/v1/memory/search")] = 99
    memory = make_memory(agent_did="did:key:zResilient")
    result = memory.load_memory_variables({"input": "ping"})
    assert result[memory.memory_key] == ""


def test_chat_message_history_round_trip(
    fake_backend: Any,
    colber_client: Any,
) -> None:
    history = ColberChatMessageHistory(
        client=colber_client,
        agent_did="did:key:zChat",
    )
    history.add_message(HumanMessage(content="ping"))
    assert len(fake_backend.memories) == 1
    # Re-read.
    messages = history.messages
    assert any("ping" in m.content for m in messages)
