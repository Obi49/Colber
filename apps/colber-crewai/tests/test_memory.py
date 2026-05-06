# Copyright 2026 Colber Contributors
# SPDX-License-Identifier: Apache-2.0
"""Tests for :class:`ColberLongTermMemory`."""

from __future__ import annotations

from typing import Any

import pytest

from colber_crewai import ColberLongTermMemory


def test_constructor_requires_agent_did(colber_client: Any) -> None:
    with pytest.raises(ValueError, match="agent_did"):
        ColberLongTermMemory(client=colber_client, agent_did="")


def test_constructor_rejects_bad_top_k(colber_client: Any) -> None:
    with pytest.raises(ValueError, match="top_k"):
        ColberLongTermMemory(
            client=colber_client, agent_did="did:key:zX", top_k=0
        )


def test_save_persists_string_value(
    fake_backend: Any,
    make_memory: Any,
) -> None:
    memory = make_memory(agent_did="did:key:zMem")
    memory.save("Roses are red", metadata={"task": "poem"})
    assert len(fake_backend.memories) == 1
    stored = next(iter(fake_backend.memories.values()))
    assert stored["ownerDid"] == "did:key:zMem"
    assert "Roses are red" in stored["text"]
    assert stored["payload"]["metadata"] == {"task": "poem"}


def test_save_propagates_share_with(
    fake_backend: Any,
    make_memory: Any,
) -> None:
    memory = make_memory(
        agent_did="did:key:zOwner",
        share_with=["did:key:zPeerA", "did:key:zPeerB"],
    )
    memory.save("Confidential", metadata=None)
    mem_id = next(iter(fake_backend.memories.keys()))
    assert fake_backend.memory_shares[mem_id] == [
        "did:key:zPeerA",
        "did:key:zPeerB",
    ]


def test_save_with_dict_value_serialises(
    fake_backend: Any,
    make_memory: Any,
) -> None:
    memory = make_memory(agent_did="did:key:zMem")
    memory.save({"role": "assistant", "content": "Done"}, metadata={"step": 3})
    stored = next(iter(fake_backend.memories.values()))
    # The dict was flattened to ``key=value`` lines.
    assert "role=assistant" in stored["text"]
    assert "content=Done" in stored["text"]
    # Original payload preserved under ``payload.raw`` for round-tripping.
    assert stored["payload"]["raw"] == {"role": "assistant", "content": "Done"}


def test_save_skips_empty_values(
    fake_backend: Any,
    make_memory: Any,
) -> None:
    memory = make_memory(agent_did="did:key:zMem")
    memory.save("", metadata=None)
    memory.save(None, metadata=None)
    # No memories persisted (avoid poisoning the index with empty embeddings).
    assert fake_backend.memories == {}


def test_save_swallows_transport_failure(
    fake_backend: Any,
    make_memory: Any,
    recwarn: pytest.WarningsRecorder,
) -> None:
    fake_backend.fail_for[("POST", "/v1/memory")] = 99
    memory = make_memory(agent_did="did:key:zResilient")
    # Should not raise — the crew stays alive.
    memory.save("a memory", metadata=None)
    assert fake_backend.memories == {}
    assert any(issubclass(w.category, RuntimeWarning) for w in recwarn.list)


def test_search_returns_crewai_shape(
    fake_backend: Any,
    make_memory: Any,
) -> None:
    fake_backend.memories["mem-1"] = {
        "ownerDid": "did:key:zReader",
        "text": "Paris is the capital of France",
        "type": "fact",
    }
    memory = make_memory(agent_did="did:key:zReader")
    hits = memory.search("Paris", limit=5)
    assert len(hits) == 1
    hit = hits[0]
    assert "context" in hit
    assert "metadata" in hit
    assert "score" in hit
    assert "Paris" in hit["context"]
    assert hit["metadata"]["id"] == "mem-1"


def test_search_uses_default_top_k(
    fake_backend: Any,
    make_memory: Any,
) -> None:
    memory = make_memory(agent_did="did:key:zR", top_k=3)
    # Expose the default by mocking out the backend hit list and asserting
    # the search payload that gets through.
    memory.search("anything")
    payloads = [b for (_, p, b) in fake_backend.calls if p == "/v1/memory/search"]
    assert payloads
    assert payloads[-1]["topK"] == 3


def test_search_score_threshold_filters(
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
    hits_with_floor = memory.search("note", limit=5, score_threshold=0.95)
    assert hits_with_floor == []
    hits_below_floor = memory.search("note", limit=5, score_threshold=0.5)
    assert len(hits_below_floor) == 1


def test_search_failure_returns_empty(
    fake_backend: Any,
    make_memory: Any,
    recwarn: pytest.WarningsRecorder,
) -> None:
    fake_backend.fail_for[("POST", "/v1/memory/search")] = 99
    memory = make_memory(agent_did="did:key:zResilient")
    result = memory.search("ping", limit=3)
    assert result == []
    assert any(issubclass(w.category, RuntimeWarning) for w in recwarn.list)


def test_reset_is_a_logged_noop(
    fake_backend: Any,
    make_memory: Any,
    caplog: pytest.LogCaptureFixture,
) -> None:
    memory = make_memory(agent_did="did:key:zR")
    with caplog.at_level("WARNING"):
        memory.reset()
    # No deletion call landed on the backend.
    assert all(
        m != "DELETE" for (m, _p, _b) in fake_backend.calls
    )
    # And we logged a clear warning.
    assert any("reset_noop" in r.message for r in caplog.records)
