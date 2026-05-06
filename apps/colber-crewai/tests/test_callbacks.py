# Copyright 2026 Colber Contributors
# SPDX-License-Identifier: Apache-2.0
"""Tests for :class:`ColberStepCallback` + :class:`ColberTaskCallback`."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pytest

from colber_crewai import ColberStepCallback, ColberTaskCallback

# ---------------------------------------------------------------------------
# Lightweight stand-ins for CrewAI step / task output shapes.
# CrewAI's own classes (AgentAction, AgentFinish, ToolResult, TaskOutput)
# have evolved across 0.80..0.95 patch releases. The callback uses
# duck-typing to stay forward-compatible — these stubs validate that
# behaviour without depending on the upstream package.
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class _StubAgentAction:
    tool: str = "stub_tool"
    tool_input: str = "{\"q\": \"hello\"}"
    log: str = "Thinking about it..."


@dataclass(slots=True)
class _StubToolResult:
    tool: str = "stub_tool"
    output: str = "tool answer"


@dataclass(slots=True)
class _StubAgentFinish:
    output: str = "All done"
    log: str = "Final answer: All done"


@dataclass(slots=True)
class _StubFailedStep:
    tool: str = "broken_tool"
    error: str = "Something went wrong"


@dataclass(slots=True)
class _StubTaskOutput:
    description: str = "Investigate the problem and report findings."
    raw: str = "Found root cause."
    agent: str = "Researcher"


@dataclass(slots=True)
class _StubFailedTaskOutput:
    description: str = "Run the build."
    status: str = "failed"
    message: str = "Compilation error"
    agent: str = "Builder"


# ---------------------------------------------------------------------------
# ColberStepCallback
# ---------------------------------------------------------------------------


def test_step_callback_constructor_requires_agent_did(colber_client: Any) -> None:
    with pytest.raises(ValueError, match="agent_did"):
        ColberStepCallback(client=colber_client, agent_did="")


def test_step_callback_constructor_rejects_zero_max_chars(colber_client: Any) -> None:
    with pytest.raises(ValueError, match="max_value_chars"):
        ColberStepCallback(
            client=colber_client,
            agent_did="did:key:zX",
            max_value_chars=0,
        )


def test_step_callback_emits_one_span(
    fake_backend: Any,
    make_step_callback: Any,
) -> None:
    callback = make_step_callback()
    callback(_StubAgentAction())
    assert len(fake_backend.spans) == 1
    span = fake_backend.spans[0]
    assert span["status"] == "ok"
    assert span["agentDid"] == callback.agent_did
    assert span["service"] == callback.service_name
    assert span["operatorId"] == callback.operator_id
    assert span["attributes"]["crewai.tool_name"] == "stub_tool"


def test_step_callback_classifies_action_kind(
    fake_backend: Any,
    make_step_callback: Any,
) -> None:
    callback = make_step_callback()
    callback(_StubAgentAction())
    span = fake_backend.spans[0]
    assert span["attributes"]["crewai.kind"] == "agent_action"
    assert span["name"].startswith("agent.action")


def test_step_callback_classifies_tool_result_kind(
    fake_backend: Any,
    make_step_callback: Any,
) -> None:
    callback = make_step_callback()
    callback(_StubToolResult())
    span = fake_backend.spans[0]
    assert span["attributes"]["crewai.kind"] == "tool"
    assert span["name"].startswith("tool.")


def test_step_callback_classifies_finish_kind(
    fake_backend: Any,
    make_step_callback: Any,
) -> None:
    callback = make_step_callback()
    callback(_StubAgentFinish())
    span = fake_backend.spans[0]
    assert span["attributes"]["crewai.kind"] == "agent_finish"


def test_step_callback_records_error_status_and_log(
    fake_backend: Any,
    make_step_callback: Any,
) -> None:
    callback = make_step_callback()
    callback(_StubFailedStep())
    assert len(fake_backend.spans) == 1
    span = fake_backend.spans[0]
    assert span["status"] == "error"
    assert "Something went wrong" in span["statusMessage"]
    assert len(fake_backend.logs) == 1
    log = fake_backend.logs[0]
    assert log["level"] == "error"
    assert log["message"] == "crewai.step.error"


def test_step_callback_log_input_outputs_off_by_default(
    fake_backend: Any,
    make_step_callback: Any,
) -> None:
    callback = make_step_callback()
    callback(_StubAgentAction(log="this should NOT be on the wire"))
    span = fake_backend.spans[0]
    assert "crewai.log" not in span["attributes"]
    assert "crewai.tool_input" not in span["attributes"]


def test_step_callback_log_input_outputs_on(
    fake_backend: Any,
    make_step_callback: Any,
) -> None:
    callback = make_step_callback(log_input_outputs=True)
    callback(_StubAgentAction(log="agent thoughts here"))
    span = fake_backend.spans[0]
    assert "agent thoughts here" in span["attributes"]["crewai.log"]
    assert span["attributes"]["crewai.tool_input"]


def test_step_callback_truncates_large_strings(
    fake_backend: Any,
    make_step_callback: Any,
) -> None:
    callback = make_step_callback(log_input_outputs=True)
    callback._max_value_chars = 32  # type: ignore[attr-defined]
    callback(_StubAgentAction(log="x" * 1024))
    rendered = fake_backend.spans[0]["attributes"]["crewai.log"]
    assert rendered.endswith("...[truncated]")


def test_step_callback_observability_failure_swallowed(
    fake_backend: Any,
    make_step_callback: Any,
    recwarn: pytest.WarningsRecorder,
) -> None:
    """A 5xx ingest must not abort the agent loop."""
    fake_backend.fail_for[("POST", "/v1/observability/traces")] = 99
    callback = make_step_callback()
    # Should not raise.
    callback(_StubAgentAction())
    # No spans landed (the fake backend rejected them all), but the
    # callback emitted a RuntimeWarning so the operator is informed.
    assert fake_backend.spans == []
    assert any(issubclass(w.category, RuntimeWarning) for w in recwarn.list)


def test_step_callback_thread_safety_basic(
    fake_backend: Any,
    make_step_callback: Any,
) -> None:
    """Concurrent invocations must not corrupt the per-thread record map."""
    import threading

    callback = make_step_callback()

    def _hammer() -> None:
        for _ in range(10):
            callback(_StubAgentAction())

    threads = [threading.Thread(target=_hammer) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # 4 threads x 10 calls each = 40 spans.
    assert len(fake_backend.spans) == 40


# ---------------------------------------------------------------------------
# ColberTaskCallback
# ---------------------------------------------------------------------------


def test_task_callback_constructor_requires_agent_did(colber_client: Any) -> None:
    with pytest.raises(ValueError, match="agent_did"):
        ColberTaskCallback(client=colber_client, agent_did="")


def test_task_callback_emits_one_span(
    fake_backend: Any,
    make_task_callback: Any,
) -> None:
    callback = make_task_callback()
    callback(_StubTaskOutput())
    assert len(fake_backend.spans) == 1
    span = fake_backend.spans[0]
    assert span["status"] == "ok"
    assert span["attributes"]["crewai.kind"] == "task"
    assert span["attributes"]["crewai.agent"] == "Researcher"
    assert "Investigate" in span["name"]


def test_task_callback_uses_long_description_prefix(
    fake_backend: Any,
    make_task_callback: Any,
) -> None:
    long_desc = "X" * 300
    callback = make_task_callback()
    callback(_StubTaskOutput(description=long_desc, raw="ok"))
    span = fake_backend.spans[0]
    # The span name truncates long descriptions to 96 chars (+ ...).
    assert len(span["name"]) <= len("task.") + 96 + len("...")


def test_task_callback_records_failure(
    fake_backend: Any,
    make_task_callback: Any,
) -> None:
    callback = make_task_callback()
    callback(_StubFailedTaskOutput())
    assert fake_backend.spans[0]["status"] == "error"
    assert any(log["message"] == "crewai.task.error" for log in fake_backend.logs)


def test_task_callback_log_input_outputs_attaches_raw(
    fake_backend: Any,
    make_task_callback: Any,
) -> None:
    callback = make_task_callback(log_input_outputs=True)
    callback(_StubTaskOutput(raw="full task output goes here"))
    attrs = fake_backend.spans[0]["attributes"]
    assert "full task output" in attrs["crewai.task_output"]
    assert attrs["crewai.task_description"]


def test_task_callback_observability_failure_swallowed(
    fake_backend: Any,
    make_task_callback: Any,
    recwarn: pytest.WarningsRecorder,
) -> None:
    fake_backend.fail_for[("POST", "/v1/observability/traces")] = 99
    callback = make_task_callback()
    callback(_StubTaskOutput())
    assert fake_backend.spans == []
    assert any(issubclass(w.category, RuntimeWarning) for w in recwarn.list)
