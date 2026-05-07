# Copyright 2026 Colber Contributors
# SPDX-License-Identifier: Apache-2.0
"""Tests for :class:`ColberToolInstrumentation` + :class:`ColberAgentMessageHook`."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pytest
from autogen_core import CancellationToken
from autogen_core.tools import FunctionTool

from colber_autogen import (
    ColberAgentMessageHook,
    ColberToolInstrumentation,
    ColberToolkit,
)

# ---------------------------------------------------------------------------
# Lightweight stand-ins for AutoGen 0.4 message shapes.
# AutoGen's own classes (TextMessage, ToolCallRequestEvent, etc.) live
# under ``autogen_agentchat.messages`` and have evolved across patch
# releases. The hook duck-types its argument — these stubs validate
# that without depending on the upstream package.
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class _StubTextMessage:
    source: str = "assistant"
    content: str = "Hello there"


@dataclass(slots=True)
class _StubToolCallRequestEvent:
    source: str = "assistant"
    content: str = "tool_call_payload"


@dataclass(slots=True)
class _StubToolCallExecutionEvent:
    source: str = "tool"
    content: str = "tool_call_result_payload"


@dataclass(slots=True)
class _StubErrorMessage:
    source: str = "tool"
    content: str = "Something went wrong"
    is_error: bool = True


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _greeting(name: str) -> str:
    """Trivial Python function used to build a FunctionTool for tests."""
    return f"Hello, {name}!"


def _ct() -> CancellationToken:
    return CancellationToken()


# ---------------------------------------------------------------------------
# ColberToolInstrumentation
# ---------------------------------------------------------------------------


def test_instrumentation_constructor_requires_agent_did(colber_client: Any) -> None:
    with pytest.raises(ValueError, match="agent_did"):
        ColberToolInstrumentation(client=colber_client, agent_did="")


def test_instrumentation_constructor_rejects_zero_max_chars(
    colber_client: Any,
) -> None:
    with pytest.raises(ValueError, match="max_value_chars"):
        ColberToolInstrumentation(
            client=colber_client,
            agent_did="did:key:zX",
            max_value_chars=0,
        )


async def test_wrap_emits_one_span_on_success(
    fake_backend: Any,
    make_instrumentation: Any,
) -> None:
    instr = make_instrumentation()
    raw_tool = FunctionTool(
        _greeting,
        description="Greet a name",
        name="greeting",
    )
    wrapped = instr.wrap(raw_tool)
    rendered = await wrapped.run_json({"name": "World"}, _ct())
    assert "Hello, World!" in str(rendered)
    assert len(fake_backend.spans) == 1
    span = fake_backend.spans[0]
    assert span["status"] == "ok"
    assert span["agentDid"] == instr.agent_did
    assert span["service"] == instr.service_name
    assert span["operatorId"] == instr.operator_id
    assert span["attributes"]["autogen.kind"] == "tool"
    assert span["attributes"]["autogen.tool_name"] == "greeting"


async def test_wrap_preserves_tool_metadata(
    make_instrumentation: Any,
) -> None:
    """Wrapped tool must surface the same name + description + schema."""
    instr = make_instrumentation()
    raw_tool = FunctionTool(
        _greeting,
        description="Greet a name",
        name="greeting",
    )
    wrapped = instr.wrap(raw_tool)
    assert wrapped.name == "greeting"
    assert wrapped.description == "Greet a name"
    assert wrapped.return_type() is str
    # Args type matches the underlying tool's args type (Pydantic schema).
    assert wrapped.args_type() is raw_tool.args_type()


async def test_wrap_propagates_exception_and_emits_error_span(
    fake_backend: Any,
    make_instrumentation: Any,
) -> None:
    """Tool exceptions are NOT swallowed — they propagate after the error span."""

    # Pydantic 2.12+ rejects fields with leading underscores, and AutoGen
    # builds the args model from the function signature — parameter names
    # must therefore be plain identifiers ("arg", not "_").
    def _broken(arg: str) -> str:
        raise RuntimeError("boom")

    instr = make_instrumentation()
    raw_tool = FunctionTool(_broken, description="broken", name="broken")
    wrapped = instr.wrap(raw_tool)
    with pytest.raises(RuntimeError, match="boom"):
        await wrapped.run_json({"arg": "anything"}, _ct())
    assert len(fake_backend.spans) == 1
    span = fake_backend.spans[0]
    assert span["status"] == "error"
    assert "RuntimeError" in span["statusMessage"]
    assert len(fake_backend.logs) == 1
    log = fake_backend.logs[0]
    assert log["message"] == "autogen.tool.error"


async def test_wrap_log_input_outputs_off_by_default(
    fake_backend: Any,
    make_instrumentation: Any,
) -> None:
    instr = make_instrumentation()
    raw_tool = FunctionTool(_greeting, description="g", name="greeting")
    wrapped = instr.wrap(raw_tool)
    await wrapped.run_json({"name": "World"}, _ct())
    span = fake_backend.spans[0]
    assert "autogen.tool_input" not in span["attributes"]
    assert "autogen.tool_output" not in span["attributes"]


async def test_wrap_log_input_outputs_on_attaches_payloads(
    fake_backend: Any,
    make_instrumentation: Any,
) -> None:
    instr = make_instrumentation(log_input_outputs=True)
    raw_tool = FunctionTool(_greeting, description="g", name="greeting")
    wrapped = instr.wrap(raw_tool)
    await wrapped.run_json({"name": "World"}, _ct())
    attrs = fake_backend.spans[0]["attributes"]
    assert "World" in attrs["autogen.tool_input"]
    assert "Hello, World!" in attrs["autogen.tool_output"]


async def test_wrap_truncates_large_strings(
    fake_backend: Any,
    make_instrumentation: Any,
) -> None:
    big_name = "x" * 4096

    def _echo(name: str) -> str:
        return name

    instr = make_instrumentation(log_input_outputs=True)
    instr._max_value_chars = 32  # type: ignore[attr-defined]
    raw_tool = FunctionTool(_echo, description="e", name="echo")
    wrapped = instr.wrap(raw_tool)
    await wrapped.run_json({"name": big_name}, _ct())
    attrs = fake_backend.spans[0]["attributes"]
    assert attrs["autogen.tool_output"].endswith("...[truncated]")


async def test_wrap_observability_failure_swallowed(
    fake_backend: Any,
    make_instrumentation: Any,
    recwarn: pytest.WarningsRecorder,
) -> None:
    """A 5xx ingest must not abort the agent loop."""
    fake_backend.fail_for[("POST", "/v1/observability/traces")] = 99
    instr = make_instrumentation()
    raw_tool = FunctionTool(_greeting, description="g", name="greeting")
    wrapped = instr.wrap(raw_tool)
    # Must not raise — observability is best-effort.
    rendered = await wrapped.run_json({"name": "World"}, _ct())
    assert "Hello, World!" in str(rendered)
    assert fake_backend.spans == []
    assert any(issubclass(w.category, RuntimeWarning) for w in recwarn.list)


async def test_wrap_all_returns_one_per_tool(
    colber_client: Any,
    make_instrumentation: Any,
) -> None:
    """:meth:`wrap_all` is a list-shaped helper around :meth:`wrap`."""
    instr = make_instrumentation()
    toolkit = ColberToolkit(client=colber_client)
    tools = toolkit.get_tools()
    wrapped = instr.wrap_all(tools)
    assert len(wrapped) == len(tools)
    assert {t.name for t in wrapped} == {t.name for t in tools}


async def test_captured_spans_introspection(
    fake_backend: Any,
    make_instrumentation: Any,
) -> None:
    """Bench harnesses introspect spans via the ``captured_spans`` property."""
    instr = make_instrumentation()
    raw_tool = FunctionTool(_greeting, description="g", name="greeting")
    wrapped = instr.wrap(raw_tool)
    await wrapped.run_json({"name": "A"}, _ct())
    await wrapped.run_json({"name": "B"}, _ct())
    captured = instr.captured_spans
    assert len(captured) == 2
    # Read-only — mutating the returned list does not poison the buffer.
    captured.clear()
    assert len(instr.captured_spans) == 2


async def test_wrap_real_colber_tool(
    fake_backend: Any,
    colber_client: Any,
    make_instrumentation: Any,
) -> None:
    """A wrapped Colber tool emits the same span + delegates correctly."""
    from colber_autogen import IdentityRegisterTool

    instr = make_instrumentation()
    real_tool = IdentityRegisterTool(client=colber_client)
    wrapped = instr.wrap(real_tool)
    rendered = await wrapped.run_json(
        {
            "public_key": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            "owner_operator_id": "op",
        },
        _ct(),
    )
    assert "did:key:zTest" in str(rendered)
    assert len(fake_backend.spans) == 1
    assert fake_backend.spans[0]["attributes"]["autogen.tool_name"] == ("colber_identity_register")


# ---------------------------------------------------------------------------
# ColberAgentMessageHook
# ---------------------------------------------------------------------------


def test_message_hook_constructor_requires_agent_did(colber_client: Any) -> None:
    with pytest.raises(ValueError, match="agent_did"):
        ColberAgentMessageHook(client=colber_client, agent_did="")


def test_message_hook_emits_span_for_text(
    fake_backend: Any,
    make_message_hook: Any,
) -> None:
    hook = make_message_hook()
    hook(_StubTextMessage(content="Hello"))
    assert len(fake_backend.spans) == 1
    span = fake_backend.spans[0]
    assert span["status"] == "ok"
    assert span["attributes"]["autogen.kind"] == "text"
    assert span["attributes"]["autogen.source"] == "assistant"


def test_message_hook_classifies_tool_call(
    fake_backend: Any,
    make_message_hook: Any,
) -> None:
    hook = make_message_hook()
    hook(_StubToolCallRequestEvent())
    span = fake_backend.spans[0]
    assert span["attributes"]["autogen.kind"] == "tool_call"


def test_message_hook_classifies_tool_result(
    fake_backend: Any,
    make_message_hook: Any,
) -> None:
    hook = make_message_hook()
    hook(_StubToolCallExecutionEvent())
    span = fake_backend.spans[0]
    assert span["attributes"]["autogen.kind"] == "tool_result"


def test_message_hook_records_error_status_and_log(
    fake_backend: Any,
    make_message_hook: Any,
) -> None:
    hook = make_message_hook()
    hook(_StubErrorMessage())
    assert len(fake_backend.spans) == 1
    span = fake_backend.spans[0]
    assert span["status"] == "error"
    assert "Something went wrong" in span["statusMessage"]
    assert len(fake_backend.logs) == 1
    log = fake_backend.logs[0]
    assert log["level"] == "error"
    assert log["message"] == "autogen.agent.error"


def test_message_hook_log_input_outputs_off_by_default(
    fake_backend: Any,
    make_message_hook: Any,
) -> None:
    hook = make_message_hook()
    hook(_StubTextMessage(content="should not be on the wire"))
    span = fake_backend.spans[0]
    assert "autogen.content" not in span["attributes"]


def test_message_hook_log_input_outputs_on(
    fake_backend: Any,
    make_message_hook: Any,
) -> None:
    hook = make_message_hook(log_input_outputs=True)
    hook(_StubTextMessage(content="agent thoughts here"))
    span = fake_backend.spans[0]
    assert "agent thoughts here" in span["attributes"]["autogen.content"]


def test_message_hook_observability_failure_swallowed(
    fake_backend: Any,
    make_message_hook: Any,
    recwarn: pytest.WarningsRecorder,
) -> None:
    """A 5xx ingest must not abort the agent loop."""
    fake_backend.fail_for[("POST", "/v1/observability/traces")] = 99
    hook = make_message_hook()
    hook(_StubTextMessage())
    assert fake_backend.spans == []
    assert any(issubclass(w.category, RuntimeWarning) for w in recwarn.list)


def test_message_hook_captured_spans_introspection(
    fake_backend: Any,
    make_message_hook: Any,
) -> None:
    hook = make_message_hook()
    hook(_StubTextMessage(content="A"))
    hook(_StubTextMessage(content="B"))
    captured = hook.captured_spans
    assert len(captured) == 2


def test_message_hook_thread_safety_basic(
    fake_backend: Any,
    make_message_hook: Any,
) -> None:
    """Concurrent invocations must not corrupt the captured-spans list."""
    import threading

    hook = make_message_hook()

    def _hammer() -> None:
        for _ in range(10):
            hook(_StubTextMessage())

    threads = [threading.Thread(target=_hammer) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    # 4 threads x 10 calls each = 40 spans.
    assert len(fake_backend.spans) == 40
