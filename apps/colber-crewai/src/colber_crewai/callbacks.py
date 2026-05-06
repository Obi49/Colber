# Copyright 2026 Colber Contributors
# SPDX-License-Identifier: Apache-2.0
"""``ColberStepCallback`` + ``ColberTaskCallback`` — bridge CrewAI to Colber observability.

CrewAI exposes two extension points (plain callables, **not** a
``BaseCallbackHandler`` like LangChain):

- ``step_callback``: invoked after each agent step (LLM call OR tool
  call). Wired on either an :class:`crewai.Agent` or a
  :class:`crewai.Crew` (the latter applies it to every agent in the
  crew).
- ``task_callback``: invoked after each task completes. Wired on a
  :class:`crewai.Task` (or, similarly, on a :class:`crewai.Crew`).

Both callables turn each event into:

- One W3C-style span flushed to ``colber-observability``
  (``POST /v1/observability/traces``) — mirrors the
  ``ObservabilityExporter`` pattern from ``apps/bench-agents`` but
  reimplemented here so the plugin is standalone publishable.
- One structured log event (``POST /v1/observability/logs``) when the
  step/task ends in error.

Trace correlation
-----------------

CrewAI does not surface a ``parent_run_id``-style chain to user
callbacks (unlike LangChain). Instead, every step callback opens a
fresh trace and every task callback opens a fresh trace; tasks set a
``crewai.task_id`` attribute on their span so dashboards can group
steps that ran inside the same task. When a future CrewAI version
exposes a parent-run-id-style hook, this implementation can switch to
threading the same ``traceId`` across step + task spans.

Tolerance
---------

Network failures to the observability service are caught, logged at
``warning`` level via the standard ``logging`` module, and swallowed.
The crew is never aborted because the observability backend is sick —
losing telemetry is better than losing the user's run.

Thread safety
-------------

CrewAI may run agents concurrently (kickoff_for_each, hierarchical
process). Both callbacks therefore guard their internal state with a
:class:`threading.Lock` and use ``time.perf_counter`` for monotonic
duration measurements.

Signature assumption
--------------------

CrewAI 0.80+ documents the step / task callback signatures as a single
positional argument — the step output (``crewai.agents.parser
.AgentAction`` / ``AgentFinish``) or the task output
(``crewai.tasks.task_output.TaskOutput``) respectively. We accept the
argument as ``Any`` and best-effort-extract attributes (``description``,
``raw``, ``output``, ``tool``) without importing any CrewAI types — the
plugin stays usable across CrewAI 0.80..0.x patch releases without
chasing internal-class moves.
"""

from __future__ import annotations

import logging
import secrets
import threading
import time
import warnings
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

import httpx

from ._client import build_client_from_env

if TYPE_CHECKING:
    from colber_sdk import ColberClient

_log = logging.getLogger(__name__)

#: Service tag stamped on every span/log. Overrideable via constructor.
DEFAULT_SERVICE_NAME = "crewai-agent"

#: Maximum length of a single string attribute. Long prompts / outputs
#: get truncated with a ``...[truncated]`` suffix to keep the
#: observability payload small (the real content lives in the agent's
#: own logs / artifacts).
DEFAULT_MAX_VALUE_CHARS = 2048


@dataclass(slots=True)
class _StepRecord:
    """In-flight measurement state for one CrewAI step.

    CrewAI does not pass a ``run_id`` to the callback (the run id lives
    inside the step output object, but its shape varies by event type).
    We therefore track ``perf_counter()`` deltas between successive
    callback invocations: the first call records ``last_perf``, every
    subsequent call computes ``now - last_perf`` as that step's
    duration, then resets the anchor. Threads each get their own
    record (keyed by ``threading.get_ident()``) so concurrent agents
    don't pollute each other's timings.
    """

    last_perf: float


class _BaseColberCallback:
    """Shared plumbing between :class:`ColberStepCallback` and
    :class:`ColberTaskCallback`.

    Holds the SDK client, the agent DID, the service name, and the
    common emission helpers (``_safe_ingest_spans``,
    ``_safe_ingest_logs``). Subclasses implement ``__call__`` with the
    CrewAI-specific argument shape and decide what attributes to stamp
    on each span.
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
            raise ValueError(
                f"{type(self).__name__} requires a non-empty agent_did"
            )
        if max_value_chars <= 0:
            raise ValueError(
                f"{type(self).__name__}.max_value_chars must be > 0"
            )
        self._client = client if client is not None else build_client_from_env()
        self._agent_did = agent_did
        self._operator_id = operator_id
        self._service_name = service_name
        self._log_input_outputs = log_input_outputs
        self._max_value_chars = max_value_chars
        self._lock = threading.Lock()
        # Per-thread step bookkeeping. CrewAI agents that run on a
        # ProcessPoolExecutor would land in different processes (and
        # thus different in-memory dicts), which is fine — they each
        # get their own clock and their own client connection.
        self._records: dict[int, _StepRecord] = {}

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
        """Push spans to colber-observability, swallowing any transport failure.

        Errors are forwarded to both the Python ``logging`` module
        (``WARNING`` level) and to :func:`warnings.warn` so a noisy
        observability outage is visible to operators running the crew
        with default warning filters, without crashing the agent loop.
        """
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
        message = f"colber.callback.{event}: {type(exc).__name__}: {exc}"
        _log.warning(message)
        # ``warnings.warn`` makes the failure visible at the test layer
        # without needing a logging handler. ``stacklevel=3`` points at
        # the caller of ``__call__`` in pytest tracebacks.
        warnings.warn(message, RuntimeWarning, stacklevel=3)

    # ------------------------------------------------------------------
    # Helpers for subclasses
    # ------------------------------------------------------------------

    def _consume_step_duration_ms(self) -> float:
        """Compute the millisecond-resolution duration since the previous
        callback invocation on this thread (or 0.0 on the first call).

        CrewAI does not pass a ``start_time`` attribute on step outputs;
        approximating "duration since previous step" is a reasonable
        proxy that matches what an operator would see in a Grafana
        timeline. Resets the anchor on every call.
        """
        thread_key = threading.get_ident()
        now = time.perf_counter()
        with self._lock:
            record = self._records.get(thread_key)
            if record is None:
                self._records[thread_key] = _StepRecord(last_perf=now)
                return 0.0
            elapsed = max(0.0, (now - record.last_perf) * 1000.0)
            record.last_perf = now
            return elapsed

    def _truncate(self, value: str) -> str:
        if len(value) <= self._max_value_chars:
            return value
        return value[: self._max_value_chars] + "...[truncated]"

    def _build_span(
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
        """Build a span payload matching the colber-observability wire shape."""
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


class ColberStepCallback(_BaseColberCallback):
    """Per-step CrewAI callback emitting one span (and one error log on failure).

    Wire it on an agent (preferred) or on a crew:

    >>> from crewai import Agent  # doctest: +SKIP
    >>> from colber_crewai import ColberStepCallback
    >>> step_cb = ColberStepCallback(  # doctest: +SKIP
    ...     agent_did="did:key:z6Mk...",
    ...     operator_id="op-demo",
    ...     service_name="my-crewai-agent",
    ... )
    >>> agent = Agent(role="...", step_callback=step_cb, ...)  # doctest: +SKIP

    Args:
        agent_did: DID of the agent running the step. Stamped on every
            span as the ``agentDid`` attribute. Required.
        client: A :class:`colber_sdk.ColberClient`. Defaults to one
            built from environment variables.
        operator_id: Owner operator id (defaults to ``"default"``).
        service_name: Stamped on every span/log
            (defaults to ``"crewai-agent"``).
        log_input_outputs: When ``True``, the step's tool input / tool
            output / log strings are added to span ``attributes``
            (truncated to ``max_value_chars``). Default ``False`` —
            the content can be sensitive and we never opt users in by
            default.
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

    def __call__(self, step_output: Any) -> None:
        """Emit one span (and possibly one error log) for ``step_output``.

        CrewAI calls this after every agent step. The signature is a
        single positional argument; we accept ``Any`` and best-effort
        attribute extraction so the callback survives across CrewAI's
        own internal class refactors.
        """
        duration_ms = self._consume_step_duration_ms()
        kind, name = _classify_step(step_output)
        is_error, error_message = _detect_step_error(step_output)
        attributes: dict[str, Any] = {
            "crewai.kind": kind,
            "crewai.step_type": type(step_output).__name__,
        }
        tool_name = _first_attr_str(step_output, "tool")
        if tool_name:
            attributes["crewai.tool_name"] = tool_name
        if self._log_input_outputs:
            tool_input = _first_attr_str(step_output, "tool_input")
            if tool_input:
                attributes["crewai.tool_input"] = self._truncate(tool_input)
            log_text = _first_attr_str(step_output, "log") or _first_attr_str(
                step_output, "thought"
            )
            if log_text:
                attributes["crewai.log"] = self._truncate(log_text)
            output_text = _first_attr_str(step_output, "output") or _first_attr_str(
                step_output, "result"
            )
            if output_text:
                attributes["crewai.output"] = self._truncate(output_text)

        span = self._build_span(
            name=name,
            kind="internal",
            status="error" if is_error else "ok",
            duration_ms=duration_ms,
            attributes=attributes,
            status_message=error_message if is_error else None,
        )
        self._safe_ingest_spans([span])

        if is_error:
            log_event = self._build_log_event(
                message="crewai.step.error",
                level="error",
                attributes={
                    "crewai.error_message": self._truncate(error_message or ""),
                    "crewai.step_type": type(step_output).__name__,
                },
            )
            self._safe_ingest_logs([log_event])


class ColberTaskCallback(_BaseColberCallback):
    """Per-task CrewAI callback emitting one span (and one error log on failure).

    Wire it on a task (preferred) or on a crew:

    >>> from crewai import Task  # doctest: +SKIP
    >>> from colber_crewai import ColberTaskCallback
    >>> task_cb = ColberTaskCallback(  # doctest: +SKIP
    ...     agent_did="did:key:z6Mk...",
    ...     operator_id="op-demo",
    ...     service_name="my-crewai-agent",
    ... )
    >>> task = Task(description="...", agent=agent, callback=task_cb)  # doctest: +SKIP

    See :class:`ColberStepCallback` for argument semantics — they are
    identical, only the emitted span ``name`` and ``kind`` attribute
    differ.
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

    def __call__(self, task_output: Any) -> None:
        """Emit one span (and possibly one error log) for ``task_output``.

        CrewAI passes a :class:`crewai.tasks.task_output.TaskOutput`
        instance — typed as ``Any`` here for forward-compat. The
        ``description`` (or ``raw_output``) attribute is the most
        useful name candidate; we fall back to ``"task"`` if neither
        is available.
        """
        duration_ms = self._consume_step_duration_ms()
        description = (
            _first_attr_str(task_output, "description")
            or _first_attr_str(task_output, "task_description")
            or "task"
        )
        # Truncate the description for the span name itself (96 chars
        # so it stays readable in Grafana columns) — the full text
        # lives in attributes when ``log_input_outputs=True``.
        name = description if len(description) <= 96 else description[:96] + "..."
        is_error, error_message = _detect_step_error(task_output)
        attributes: dict[str, Any] = {
            "crewai.kind": "task",
            "crewai.task_type": type(task_output).__name__,
        }
        agent_name = _first_attr_str(task_output, "agent")
        if agent_name:
            attributes["crewai.agent"] = agent_name
        if self._log_input_outputs:
            attributes["crewai.task_description"] = self._truncate(description)
            raw_output = _first_attr_str(task_output, "raw") or _first_attr_str(
                task_output, "raw_output"
            )
            if raw_output:
                attributes["crewai.task_output"] = self._truncate(raw_output)

        span = self._build_span(
            name=f"task.{name}",
            kind="internal",
            status="error" if is_error else "ok",
            duration_ms=duration_ms,
            attributes=attributes,
            status_message=error_message if is_error else None,
        )
        self._safe_ingest_spans([span])

        if is_error:
            log_event = self._build_log_event(
                message="crewai.task.error",
                level="error",
                attributes={
                    "crewai.error_message": self._truncate(error_message or ""),
                    "crewai.task_type": type(task_output).__name__,
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

    return (
        datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    )


def _iso_subtract_ms(end_iso: str, duration_ms: float) -> str:
    """Return ``end_iso`` minus ``duration_ms`` (clamped to 0)."""
    from datetime import datetime, timedelta

    parsed = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
    start = parsed - timedelta(milliseconds=max(0.0, duration_ms))
    return start.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _classify_step(step_output: Any) -> tuple[str, str]:
    """Best-effort classification of a CrewAI step output → ``(kind, span_name)``.

    Inspects the type name + a handful of common attributes without
    importing CrewAI's internals. Falls back to ``("step", "step")``
    when the shape is unknown.
    """
    type_name = type(step_output).__name__
    lowered = type_name.lower()
    # CrewAI step outputs commonly include ``AgentAction``, ``AgentFinish``,
    # ``ToolResult``, ``ToolUsage`` (or similar names across patch releases).
    if "toolresult" in lowered or "toolusage" in lowered:
        tool = _first_attr_str(step_output, "tool")
        return "tool", f"tool.{tool}" if tool else "tool"
    if "agentaction" in lowered or "action" in lowered:
        tool = _first_attr_str(step_output, "tool")
        return "agent_action", f"agent.action.{tool}" if tool else "agent.action"
    if "agentfinish" in lowered or "finish" in lowered:
        return "agent_finish", "agent.finish"
    return "step", "step"


def _detect_step_error(step_output: Any) -> tuple[bool, str | None]:
    """Best-effort error detection on a CrewAI step output.

    Looks at common attributes (``error``, ``exception``, ``status``)
    without raising. Returns ``(is_error, message_or_None)``.
    """
    err_attr = getattr(step_output, "error", None)
    if err_attr is not None and bool(err_attr):
        return True, _safe_str(err_attr)
    exc_attr = getattr(step_output, "exception", None)
    if exc_attr is not None and bool(exc_attr):
        return True, _safe_str(exc_attr)
    status_attr = getattr(step_output, "status", None)
    if isinstance(status_attr, str) and status_attr.lower() in {"error", "failed", "failure"}:
        message = _first_attr_str(step_output, "message") or status_attr
        return True, message
    return False, None


def _first_attr_str(obj: Any, *names: str) -> str:
    """Return the first attribute among ``names`` rendered as ``str``, or ``""``.

    ``names`` is a single-name varargs to allow callers to either pass
    one attribute or a list of fallbacks.
    """
    for name in names:
        value = getattr(obj, name, None)
        if value is None:
            continue
        rendered = _safe_str(value)
        if rendered:
            return rendered
    return ""


def _safe_str(value: Any) -> str:
    """Best-effort string conversion that never raises."""
    try:
        return str(value)
    except Exception:
        return f"<unrepresentable {type(value).__name__}>"


__all__ = [
    "DEFAULT_MAX_VALUE_CHARS",
    "DEFAULT_SERVICE_NAME",
    "ColberStepCallback",
    "ColberTaskCallback",
]
