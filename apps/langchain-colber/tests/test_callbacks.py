"""Tests for :class:`langchain_colber.ColberCallbackHandler`."""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

import pytest
from langchain_core.agents import AgentAction, AgentFinish

from langchain_colber import ColberCallbackHandler


def _new_run_id() -> UUID:
    return uuid4()


def test_constructor_requires_agent_did(colber_client: Any) -> None:
    with pytest.raises(ValueError, match="agent_did"):
        ColberCallbackHandler(client=colber_client, agent_did="")


def test_chain_lifecycle_emits_one_span(
    fake_backend: Any,
    make_handler: Any,
) -> None:
    handler = make_handler()
    run_id = _new_run_id()
    handler.on_chain_start(
        serialized={"name": "MyChain", "id": ["langchain", "chain", "MyChain"]},
        inputs={"input": "hello"},
        run_id=run_id,
    )
    handler.on_chain_end(outputs={"output": "world"}, run_id=run_id)

    assert len(fake_backend.spans) == 1
    span = fake_backend.spans[0]
    assert span["name"] == "MyChain"
    assert span["status"] == "ok"
    assert span["agentDid"] == handler.agent_did
    assert span["service"] == handler.service_name
    assert span["operatorId"] == handler.operator_id
    assert "parentSpanId" not in span  # root span


def test_nested_chains_share_trace_id(
    fake_backend: Any,
    make_handler: Any,
) -> None:
    handler = make_handler()
    parent = _new_run_id()
    child = _new_run_id()
    handler.on_chain_start(
        serialized={"name": "Parent"},
        inputs={"input": "x"},
        run_id=parent,
    )
    handler.on_tool_start(
        serialized={"name": "MyTool"},
        input_str="payload",
        run_id=child,
        parent_run_id=parent,
    )
    handler.on_tool_end(output="ok", run_id=child, parent_run_id=parent)
    handler.on_chain_end(outputs={"output": "done"}, run_id=parent)

    assert len(fake_backend.spans) == 2
    # Spans flush on close so the child closes first, then the parent.
    child_span = fake_backend.spans[0]
    parent_span = fake_backend.spans[1]
    assert child_span["traceId"] == parent_span["traceId"]
    assert child_span["parentSpanId"] == parent_span["spanId"]


def test_chain_error_emits_log_and_error_span(
    fake_backend: Any,
    make_handler: Any,
) -> None:
    handler = make_handler()
    run_id = _new_run_id()
    handler.on_chain_start(
        serialized={"name": "Boom"},
        inputs={"input": "bang"},
        run_id=run_id,
    )
    handler.on_chain_error(error=RuntimeError("kaboom"), run_id=run_id)

    assert len(fake_backend.spans) == 1
    assert fake_backend.spans[0]["status"] == "error"
    assert fake_backend.spans[0]["statusMessage"] == "kaboom"
    assert len(fake_backend.logs) == 1
    log = fake_backend.logs[0]
    assert log["level"] == "error"
    assert log["message"] == "langchain.chain.error"
    assert log["attributes"]["langchain.error_type"] == "RuntimeError"


def test_llm_lifecycle_records_token_usage(
    fake_backend: Any,
    make_handler: Any,
) -> None:
    handler = make_handler()
    run_id = _new_run_id()
    handler.on_llm_start(
        serialized={"name": "GPTish"},
        prompts=["hello world"],
        run_id=run_id,
    )

    class _StubResponse:
        def __init__(self) -> None:
            self.llm_output = {
                "token_usage": {"prompt_tokens": 10, "completion_tokens": 5},
            }

    handler.on_llm_end(_StubResponse(), run_id=run_id)
    span = fake_backend.spans[-1]
    assert span["attributes"]["langchain.llm.input_tokens"] == 10
    assert span["attributes"]["langchain.llm.output_tokens"] == 5


def test_chat_model_start_uses_chat_kind(
    fake_backend: Any,
    make_handler: Any,
) -> None:
    handler = make_handler()
    run_id = _new_run_id()
    handler.on_chat_model_start(
        serialized={"name": "ChatGPTish"},
        messages=[[object(), object()], [object()]],
        run_id=run_id,
    )
    handler.on_llm_end(object(), run_id=run_id)
    span = fake_backend.spans[-1]
    assert span["attributes"]["langchain.kind"] == "chat_model"
    assert span["attributes"]["langchain.message_count"] == 3


def test_tool_error_emits_log(
    fake_backend: Any,
    make_handler: Any,
) -> None:
    handler = make_handler()
    run_id = _new_run_id()
    handler.on_tool_start(
        serialized={"name": "BadTool"},
        input_str="oops",
        run_id=run_id,
    )
    handler.on_tool_error(error=ValueError("nope"), run_id=run_id)
    assert any(
        log["message"] == "langchain.tool.error" for log in fake_backend.logs
    )
    assert fake_backend.spans[-1]["status"] == "error"


def test_agent_action_emits_zero_duration_span(
    fake_backend: Any,
    make_handler: Any,
) -> None:
    handler = make_handler()
    run_id = _new_run_id()
    action = AgentAction(tool="my_tool", tool_input={"a": 1}, log="thinking")
    handler.on_agent_action(action=action, run_id=run_id)
    assert len(fake_backend.spans) == 1
    span = fake_backend.spans[0]
    assert span["name"] == "agent.action"
    assert span["durationMs"] == 0.0
    assert span["attributes"]["langchain.tool_name"] == "my_tool"


def test_agent_finish_emits_span(
    fake_backend: Any,
    make_handler: Any,
) -> None:
    handler = make_handler()
    run_id = _new_run_id()
    finish = AgentFinish(return_values={"output": "done"}, log="finished")
    handler.on_agent_finish(finish=finish, run_id=run_id)
    assert any(span["name"] == "agent.finish" for span in fake_backend.spans)


def test_log_input_outputs_truncates_large_values(
    fake_backend: Any,
    make_handler: Any,
) -> None:
    handler = make_handler(log_input_outputs=True)
    handler._max_value_chars = 32  # type: ignore[attr-defined]
    run_id = _new_run_id()
    long_input = {"input": "x" * 1024}
    handler.on_chain_start(serialized={"name": "Big"}, inputs=long_input, run_id=run_id)
    handler.on_chain_end(outputs={"output": "y" * 1024}, run_id=run_id)
    span = fake_backend.spans[-1]
    rendered_input = span["attributes"]["langchain.inputs"]
    rendered_output = span["attributes"]["langchain.outputs"]
    assert "...[truncated]" in rendered_input
    assert "...[truncated]" in rendered_output


def test_observability_failure_does_not_break_chain(
    fake_backend: Any,
    make_handler: Any,
) -> None:
    """When observability ingestion 5xx-fails, the handler swallows it."""
    fake_backend.fail_for[("POST", "/v1/observability/traces")] = 99
    handler = make_handler()
    run_id = _new_run_id()
    # Should not raise — the chain stays alive.
    handler.on_chain_start(serialized={"name": "Resilient"}, inputs={}, run_id=run_id)
    handler.on_chain_end(outputs={}, run_id=run_id)
    # No spans landed (the fake backend rejected them all), but the
    # handler stayed silent.
    assert fake_backend.spans == []
