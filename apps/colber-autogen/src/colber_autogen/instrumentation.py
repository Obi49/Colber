# Copyright 2026 Colber Contributors
# SPDX-License-Identifier: Apache-2.0
"""``ColberToolInstrumentation`` — bridge AutoGen 0.4 tools to Colber observability.

Why this looks different from ``colber-crewai``
-----------------------------------------------

CrewAI exposes a public ``step_callback``/``task_callback`` plain-callable
hook on every :class:`crewai.Agent` and :class:`crewai.Crew`. The plugin
just emits a span on each invocation and life is good.

AutoGen 0.4's :class:`autogen_agentchat.agents.AssistantAgent` does
**not** ship an equivalent generic step-callback. Tool execution is
handled internally by ``BaseTool.run_json`` (called from the agent's
``on_messages`` loop), and there is no public pre/post hook the
plugin can latch onto without subclassing the agent — which would
couple us to internal class hierarchies that have churned across
AutoGen 0.4.x patch releases.

The cleanest, framework-aligned answer (and the one we ship as the
primary surface) is **Option A: a per-tool wrapper**. The wrapper takes
any :class:`autogen_core.tools.BaseTool` (Colber-backed or not) and
returns a new :class:`autogen_core.tools.BaseTool` that emits one span
+ optional error log per invocation, then delegates to the underlying
tool. This works uniformly for:

- the in-tree :class:`ColberToolBase` subclasses,
- :class:`autogen_core.tools.FunctionTool`-wrapped Python functions,
- any third-party tool the operator brings.

We additionally expose :class:`ColberAgentMessageHook` — a thin
adapter the operator can plug into ``AssistantAgent.on_messages_stream``
themselves to emit one span per message (an Option-B-lite). It's
declarative (no agent subclass required), so operators who want
turn-level spans can wire it without us depending on AutoGen's
agent class hierarchy. When AutoGen 0.4 lands a stable agent-level
callback hook (cf. microsoft/autogen#5891), we'll plug into it from
this module without breaking the public surface.

Tolerance
---------

Network failures to the observability service are caught, logged at
``warning`` level via the standard ``logging`` module, and swallowed.
The agent loop is never aborted because the observability backend is
sick — losing telemetry is better than losing the user's run.

Concurrency
-----------

AutoGen 0.4 is async + actor-based on top of asyncio. The wrapper
holds no shared mutable state between coroutines; every tool call
gets its own perf-counter pair. The :class:`threading.Lock` is kept
only because the plugin can also be called from threaded test
harnesses (or if the operator runs the tool synchronously via
:func:`asyncio.run`).
"""

from __future__ import annotations

import logging
import secrets
import threading
import time
import warnings
from typing import TYPE_CHECKING, Any

import httpx
from autogen_core import CancellationToken
from autogen_core.tools import BaseTool

from ._client import build_client_from_env

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping

    from colber_sdk import ColberClient
    from pydantic import BaseModel

_log = logging.getLogger(__name__)

#: Service tag stamped on every span/log. Overrideable per instance.
DEFAULT_SERVICE_NAME = "autogen-agent"

#: Maximum length of a single string attribute. Long prompts / outputs
#: get truncated with a ``...[truncated]`` suffix to keep the
#: observability payload small (the real content lives in the agent's
#: own logs / artifacts).
DEFAULT_MAX_VALUE_CHARS = 2048


class _BaseObservability:
    """Shared plumbing between the tool wrapper and the message hook.

    Holds the SDK client, the agent DID, the service name, and the
    common emission helpers (``_safe_ingest_spans``,
    ``_safe_ingest_logs``).
    """

    def __init__(
        self,
        *,
        agent_did: str,
        client: ColberClient | None,
        operator_id: str,
        service_name: str,
        log_input_outputs: bool,
        max_value_chars: int,
    ) -> None:
        if not agent_did:
            raise ValueError(f"{type(self).__name__} requires a non-empty agent_did")
        if max_value_chars <= 0:
            raise ValueError(f"{type(self).__name__}.max_value_chars must be > 0")
        self._client = client if client is not None else build_client_from_env()
        self._agent_did = agent_did
        self._operator_id = operator_id
        self._service_name = service_name
        self._log_input_outputs = log_input_outputs
        self._max_value_chars = max_value_chars
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def agent_did(self) -> str:
        return self._agent_did

    @property
    def service_name(self) -> str:
        return self._service_name

    @property
    def operator_id(self) -> str:
        return self._operator_id

    # ------------------------------------------------------------------
    # Internals — emission helpers
    # ------------------------------------------------------------------

    def _safe_ingest_spans(self, spans: list[dict[str, Any]]) -> None:
        """Push spans to colber-observability, swallowing any transport failure."""
        try:
            self._client.observability.ingest_spans(spans=spans)
        except (httpx.HTTPError, OSError) as exc:
            self._warn("ingest_spans_failed", exc)
        except Exception as exc:  # pragma: no cover - defensive
            self._warn("ingest_spans_unexpected", exc)

    def _safe_ingest_logs(self, events: list[dict[str, Any]]) -> None:
        """Push log events to colber-observability, swallowing any failure."""
        try:
            self._client.observability.ingest_logs(events=events)
        except (httpx.HTTPError, OSError) as exc:
            self._warn("ingest_logs_failed", exc)
        except Exception as exc:  # pragma: no cover - defensive
            self._warn("ingest_logs_unexpected", exc)

    def _warn(self, event: str, exc: BaseException) -> None:
        message = f"colber.autogen.{event}: {type(exc).__name__}: {exc}"
        _log.warning(message)
        # ``warnings.warn`` makes the failure visible at the test layer
        # without needing a logging handler.
        warnings.warn(message, RuntimeWarning, stacklevel=3)

    def _truncate(self, value: str) -> str:
        if len(value) <= self._max_value_chars:
            return value
        return value[: self._max_value_chars] + "...[truncated]"

    def _build_span_payload(
        self,
        *,
        name: str,
        kind: str,
        status: str,
        duration_ms: float,
        attributes: dict[str, Any],
        status_message: str | None,
        trace_id: str | None = None,
    ) -> dict[str, Any]:
        end_iso = _iso_now()
        start_iso = _iso_subtract_ms(end_iso, duration_ms)
        attrs = dict(attributes)
        attrs.setdefault("agentDid", self._agent_did)
        span_payload: dict[str, Any] = {
            "traceId": trace_id if trace_id is not None else _new_trace_id(),
            "spanId": _new_span_id(),
            "name": name,
            "kind": kind,
            "service": self._service_name,
            "agentDid": self._agent_did,
            "operatorId": self._operator_id,
            "startTimestamp": start_iso,
            "endTimestamp": end_iso,
            "durationMs": float(duration_ms),
            "status": status,
            "attributes": attrs,
        }
        if status_message is not None:
            span_payload["statusMessage"] = status_message
        return span_payload

    def _build_log_event(
        self,
        *,
        message: str,
        level: str,
        attributes: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "timestamp": _iso_now(),
            "traceId": _new_trace_id(),
            "spanId": _new_span_id(),
            "service": self._service_name,
            "agentDid": self._agent_did,
            "operatorId": self._operator_id,
            "level": level,
            "message": message,
            "attributes": dict(attributes),
        }


class ColberToolInstrumentation(_BaseObservability):
    """Per-call observability for AutoGen 0.4 tools.

    Construct one instance per agent run, then call
    :meth:`wrap` on every :class:`autogen_core.tools.BaseTool` you want
    to instrument. The wrapped tool is a drop-in replacement that emits
    one span (status=``ok`` or ``error``) per invocation, plus a
    structured log event on error, then delegates to the underlying
    tool's :meth:`run_json`.

    Example:

        >>> from autogen_agentchat.agents import AssistantAgent  # doctest: +SKIP
        >>> from colber_autogen import (  # doctest: +SKIP
        ...     ColberToolInstrumentation, ColberToolkit,
        ... )
        >>> instr = ColberToolInstrumentation(  # doctest: +SKIP
        ...     agent_did="did:key:z6Mk...",
        ...     operator_id="op-demo",
        ...     service_name="my-autogen-agent",
        ... )
        >>> toolkit = ColberToolkit(agent_did="did:key:z6Mk...")  # doctest: +SKIP
        >>> tools = [instr.wrap(t) for t in toolkit.get_tools()]  # doctest: +SKIP
        >>> agent = AssistantAgent(  # doctest: +SKIP
        ...     name="trader", model_client=..., tools=tools,
        ... )

    Args:
        agent_did: DID of the agent calling the tools. Stamped on every
            span as the ``agentDid`` attribute. Required.
        client: A :class:`colber_sdk.ColberClient`. Defaults to one
            built from environment variables.
        operator_id: Owner operator id (defaults to ``"default"``).
        service_name: Stamped on every span/log
            (defaults to ``"autogen-agent"``).
        log_input_outputs: When ``True``, the tool's input args + output
            string are added to span ``attributes`` (truncated to
            ``max_value_chars``). Default ``False`` — content can be
            sensitive and we never opt users in by default.
        max_value_chars: Truncation for any large string attribute.
            Default ``2048``.
    """

    def __init__(
        self,
        *,
        agent_did: str,
        client: ColberClient | None = None,
        operator_id: str = "default",
        service_name: str = DEFAULT_SERVICE_NAME,
        log_input_outputs: bool = False,
        max_value_chars: int = DEFAULT_MAX_VALUE_CHARS,
    ) -> None:
        super().__init__(
            agent_did=agent_did,
            client=client,
            operator_id=operator_id,
            service_name=service_name,
            log_input_outputs=log_input_outputs,
            max_value_chars=max_value_chars,
        )
        self._span_buffer: list[dict[str, Any]] = []

    def wrap(self, tool: BaseTool[Any, Any]) -> BaseTool[Any, Any]:
        """Return a new :class:`BaseTool` that emits a span per call.

        The wrapper preserves the underlying tool's ``name``,
        ``description``, ``args_type``, ``return_type``, and ``schema``,
        so the LLM sees the exact same tool definition. Only the
        runtime path is different: ``run_json`` is delegated, with one
        span built before/after.
        """
        return _InstrumentedTool(tool, self)

    def wrap_all(self, tools: Iterable[BaseTool[Any, Any]]) -> list[BaseTool[Any, Any]]:
        """Convenience: wrap every tool in ``tools`` and return a fresh list."""
        return [self.wrap(t) for t in tools]

    @property
    def captured_spans(self) -> list[dict[str, Any]]:
        """Read-only view of every span emitted via this instrumentation.

        Useful for tests + bench harnesses (the bench dogfood scenario
        asserts ≥ N spans were emitted). Mirrors the
        ``colber-langchain`` callback's ``captured_spans`` introspection.
        """
        return list(self._span_buffer)

    # ------------------------------------------------------------------
    # Internal — invoked by _InstrumentedTool
    # ------------------------------------------------------------------

    def _emit_tool_span(
        self,
        *,
        tool_name: str,
        args_payload: Mapping[str, Any] | None,
        rendered_output: Any,
        duration_ms: float,
        is_error: bool,
        error_message: str | None,
    ) -> None:
        attributes: dict[str, Any] = {
            "autogen.kind": "tool",
            "autogen.tool_name": tool_name,
        }
        if self._log_input_outputs:
            if args_payload is not None:
                attributes["autogen.tool_input"] = self._truncate(_safe_str(dict(args_payload)))
            if rendered_output is not None:
                attributes["autogen.tool_output"] = self._truncate(_safe_str(rendered_output))

        span_payload = self._build_span_payload(
            name=f"tool.{tool_name}",
            kind="internal",
            status="error" if is_error else "ok",
            duration_ms=duration_ms,
            attributes=attributes,
            status_message=error_message if is_error else None,
        )
        with self._lock:
            self._span_buffer.append(span_payload)
        self._safe_ingest_spans([span_payload])

        if is_error:
            log_event = self._build_log_event(
                message="autogen.tool.error",
                level="error",
                attributes={
                    "autogen.error_message": self._truncate(error_message or ""),
                    "autogen.tool_name": tool_name,
                },
            )
            self._safe_ingest_logs([log_event])


class _InstrumentedTool(BaseTool[Any, Any]):
    """The wrapped :class:`BaseTool` returned by :meth:`ColberToolInstrumentation.wrap`.

    Subclasses :class:`autogen_core.tools.BaseTool` so AutoGen treats
    it like any other tool. Delegates schema + execution to the
    underlying tool; emits a Colber span around every ``run_json``.

    We only override ``run`` (and keep ``run_json`` inherited) so the
    base class's ``run_json`` → ``args_type.model_validate`` → ``run``
    pipeline still flows naturally. ``run`` is the natural seam for
    instrumentation: ``args`` is already a validated Pydantic model
    and ``cancellation_token`` is forwarded straight through.
    """

    def __init__(
        self,
        underlying: BaseTool[Any, Any],
        instrumentation: ColberToolInstrumentation,
    ) -> None:
        super().__init__(
            args_type=underlying.args_type(),
            return_type=underlying.return_type(),
            name=underlying.name,
            description=underlying.description,
        )
        self._underlying = underlying
        self._instrumentation = instrumentation

    async def run(self, args: BaseModel, cancellation_token: CancellationToken) -> Any:
        start = time.perf_counter()
        is_error = False
        error_message: str | None = None
        rendered: Any = None
        args_payload: dict[str, Any] = {}
        try:
            args_payload = args.model_dump()
        except Exception:
            # Defensive: model_dump should never fail on a validated
            # Pydantic model, but if a custom subclass overrides it
            # we don't want telemetry to crash the tool call.
            args_payload = {}
        try:
            rendered = await self._underlying.run(args, cancellation_token)
        except Exception as exc:
            # Note: ``KeyboardInterrupt`` / ``SystemExit`` deliberately
            # bypass instrumentation — those signal interpreter shutdown,
            # and the tool span is not the right place to surface them.
            is_error = True
            error_message = f"{type(exc).__name__}: {exc}"
            raise
        finally:
            duration_ms = max(0.0, (time.perf_counter() - start) * 1000.0)
            self._instrumentation._emit_tool_span(
                tool_name=self._underlying.name,
                args_payload=args_payload,
                rendered_output=rendered,
                duration_ms=duration_ms,
                is_error=is_error,
                error_message=error_message,
            )
        return rendered

    def return_value_as_string(self, value: Any) -> str:
        return self._underlying.return_value_as_string(value)


class ColberAgentMessageHook(_BaseObservability):
    """Operator-pluggable per-message hook for an AutoGen agent stream.

    AutoGen 0.4 has no native ``message_callback``. Operators who want
    one span per message — to see "agent thought" / "tool call" /
    "agent finish" granularity in Grafana — can iterate the agent's
    ``on_messages_stream`` themselves and call this hook on each
    message:

        >>> hook = ColberAgentMessageHook(  # doctest: +SKIP
        ...     agent_did="did:key:z6Mk...",
        ...     operator_id="op-demo",
        ... )
        >>> async for msg in agent.on_messages_stream(...):  # doctest: +SKIP
        ...     hook(msg)

    The hook duck-types its argument (any object with a ``source``
    attribute and best-effort ``content`` / ``type``) so it stays
    forward-compatible across AutoGen 0.4.x message-class refactors.

    See :class:`ColberToolInstrumentation` for the primary
    tool-level instrumentation path — this hook is supplementary.

    Args:
        Same as :class:`ColberToolInstrumentation`.
    """

    def __init__(
        self,
        *,
        agent_did: str,
        client: ColberClient | None = None,
        operator_id: str = "default",
        service_name: str = DEFAULT_SERVICE_NAME,
        log_input_outputs: bool = False,
        max_value_chars: int = DEFAULT_MAX_VALUE_CHARS,
    ) -> None:
        super().__init__(
            agent_did=agent_did,
            client=client,
            operator_id=operator_id,
            service_name=service_name,
            log_input_outputs=log_input_outputs,
            max_value_chars=max_value_chars,
        )
        self._last_perf: float | None = None
        self._captured: list[dict[str, Any]] = []

    @property
    def captured_spans(self) -> list[dict[str, Any]]:
        """Read-only view of every span emitted via this hook."""
        return list(self._captured)

    def __call__(self, message: Any) -> None:
        """Emit one span (and possibly one error log) for ``message``."""
        now = time.perf_counter()
        with self._lock:
            if self._last_perf is None:
                duration_ms = 0.0
            else:
                duration_ms = max(0.0, (now - self._last_perf) * 1000.0)
            self._last_perf = now

        message_kind = _classify_message(message)
        is_error, error_message = _detect_message_error(message)
        attributes: dict[str, Any] = {
            "autogen.kind": message_kind,
            "autogen.message_type": type(message).__name__,
        }
        source = _safe_attr_str(message, "source")
        if source:
            attributes["autogen.source"] = source
        if self._log_input_outputs:
            content = _safe_attr_str(message, "content")
            if content:
                attributes["autogen.content"] = self._truncate(content)

        span_payload = self._build_span_payload(
            name=f"agent.message.{message_kind}",
            kind="internal",
            status="error" if is_error else "ok",
            duration_ms=duration_ms,
            attributes=attributes,
            status_message=error_message if is_error else None,
        )
        with self._lock:
            self._captured.append(span_payload)
        self._safe_ingest_spans([span_payload])

        if is_error:
            log_event = self._build_log_event(
                message="autogen.agent.error",
                level="error",
                attributes={
                    "autogen.error_message": self._truncate(error_message or ""),
                    "autogen.message_type": type(message).__name__,
                },
            )
            self._safe_ingest_logs([log_event])


# ---------------------------------------------------------------------------
# Module-level helpers
# ---------------------------------------------------------------------------


def _new_trace_id() -> str:
    """W3C trace id — 16 random bytes, hex-encoded (32 chars)."""
    return secrets.token_hex(16)


def _new_span_id() -> str:
    """W3C span id — 8 random bytes, hex-encoded (16 chars)."""
    return secrets.token_hex(8)


def _iso_now() -> str:
    """Current UTC time in ISO-8601 with millisecond precision and ``Z``."""
    from datetime import UTC, datetime

    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _iso_subtract_ms(end_iso: str, duration_ms: float) -> str:
    """Return ``end_iso`` minus ``duration_ms`` (clamped to 0)."""
    from datetime import datetime, timedelta

    parsed = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
    start = parsed - timedelta(milliseconds=max(0.0, duration_ms))
    return start.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _classify_message(message: Any) -> str:
    """Best-effort kind classification of an AutoGen agent-stream message.

    Inspects ``type(message).__name__`` without importing AutoGen's
    internal class hierarchy. Falls back to ``"message"`` when the
    shape is unknown.

    AutoGen 0.4 names tool-related messages
    ``ToolCallRequestEvent`` / ``ToolCallExecutionEvent`` /
    ``ToolCallSummaryMessage`` (cf. ``autogen_agentchat.messages``).
    "Result" is the legacy 0.4.0..0.4.2 spelling — kept here for
    forward+backward compat.
    """
    type_name = type(message).__name__.lower()
    if "toolcall" in type_name and (
        "execution" in type_name or "result" in type_name or "summary" in type_name
    ):
        return "tool_result"
    if "toolcall" in type_name:
        return "tool_call"
    if "text" in type_name:
        return "text"
    if "error" in type_name or "exception" in type_name:
        return "error"
    return "message"


def _detect_message_error(message: Any) -> tuple[bool, str | None]:
    """Best-effort error detection on an AutoGen message."""
    err_attr = getattr(message, "error", None)
    if err_attr is not None and bool(err_attr):
        return True, _safe_str(err_attr)
    is_error_attr = getattr(message, "is_error", None)
    if isinstance(is_error_attr, bool) and is_error_attr:
        message_text = _safe_attr_str(message, "content") or "is_error=True"
        return True, message_text
    type_name = type(message).__name__.lower()
    if "error" in type_name or "exception" in type_name:
        message_text = _safe_attr_str(message, "content") or type(message).__name__
        return True, message_text
    return False, None


def _safe_attr_str(obj: Any, name: str) -> str:
    """Return ``getattr(obj, name)`` rendered as ``str``, or ``""``."""
    value = getattr(obj, name, None)
    if value is None:
        return ""
    return _safe_str(value)


def _safe_str(value: Any) -> str:
    """Best-effort string conversion that never raises."""
    try:
        return str(value)
    except Exception:
        return f"<unrepresentable {type(value).__name__}>"


__all__ = [
    "DEFAULT_MAX_VALUE_CHARS",
    "DEFAULT_SERVICE_NAME",
    "ColberAgentMessageHook",
    "ColberToolInstrumentation",
]
