"""``ColberCallbackHandler`` — bridge LangChain run events to Colber observability.

Implements :class:`langchain_core.callbacks.BaseCallbackHandler` and turns
each chain / LLM / tool / agent event into:

- One W3C-style span flushed to ``colber-observability``
  (``POST /v1/observability/traces``) — mirrors the
  ``ObservabilityExporter`` pattern from ``apps/bench-agents`` but
  reimplemented here so the plugin is standalone publishable.
- One structured log event (``POST /v1/observability/logs``) when the
  hook is an ``*_error`` variant.

Trace correlation
-----------------

LangChain assigns a fresh ``run_id: UUID`` to every event and (when
relevant) a ``parent_run_id``. We keep an internal map ``run_id ->
(traceId, spanId, startedAt)`` so:

- ``on_chain_start`` opens a span and (when no parent run exists) a new
  ``traceId``. Children inherit the trace from their parent run via
  ``parent_run_id`` lookup.
- ``on_*_end`` closes the span (computes ``durationMs`` + ``status``).
- ``on_*_error`` closes the span with ``status="error"`` and emits a
  matching log event.

Tolerance
---------

Network failures to the observability service are caught, logged at
``warning`` level via the standard ``logging`` module, and swallowed.
The LangChain run is never aborted because the observability backend
is sick — losing telemetry is better than losing the user's chain.
"""

from __future__ import annotations

import logging
import secrets
import threading
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any
from uuid import UUID

import httpx
from langchain_core.callbacks import BaseCallbackHandler

from ._client import build_client_from_env

if TYPE_CHECKING:
    from colber_sdk import ColberClient
    from langchain_core.agents import AgentAction, AgentFinish

_log = logging.getLogger(__name__)

#: Service tag stamped on every span/log. Overrideable via constructor.
DEFAULT_SERVICE_NAME = "langchain-agent"


@dataclass(slots=True)
class _RunSpan:
    """In-flight span bookkeeping for one LangChain ``run_id``."""

    trace_id: str
    span_id: str
    parent_span_id: str | None
    name: str
    kind: str
    started_at_perf: float
    started_at_iso: str
    attributes: dict[str, Any] = field(default_factory=dict)


class ColberCallbackHandler(BaseCallbackHandler):
    """Capture LangChain runs as Colber observability spans + logs.

    Attach to any LangChain runnable / agent / chain via the standard
    ``callbacks=[...]`` kwarg or ``RunnableConfig``.

    Args:
        client: A :class:`colber_sdk.ColberClient`. When omitted, a fresh
            client is built from environment variables (see
            :func:`colber_langchain._client.build_client_from_env`).
        agent_did: The DID of the agent running this chain. Stamped on
            every span as the ``agentDid`` attribute so dashboards can
            group by agent. Required.
        operator_id: Owner operator id (defaults to ``"default"``).
        service_name: The ``service`` column on every emitted span/log
            (defaults to ``"langchain-agent"``). Use a more specific
            value if you run multiple distinct chains in one process.
        log_input_outputs: When ``True``, the prompt / completion / tool
            input / tool output strings are added to span ``attributes``
            (truncated to ``max_value_chars``). Default ``False`` — the
            content can be sensitive (PII, secrets) and we never opt
            users in by default.
        max_value_chars: Truncation for any large string attribute.
            Default ``2048``.
    """

    # The base class advertises a few class-level switches we want to keep.
    # Setting these to ``True`` is the LangChain idiom for "yes, route every
    # variant of these events to me even when the caller picks a synchronous
    # vs streaming branch".
    raise_error: bool = False
    run_inline: bool = True

    def __init__(
        self,
        *,
        agent_did: str,
        client: ColberClient | None = None,
        operator_id: str = "default",
        service_name: str = DEFAULT_SERVICE_NAME,
        log_input_outputs: bool = False,
        max_value_chars: int = 2048,
    ) -> None:
        super().__init__()
        if not agent_did:
            raise ValueError("ColberCallbackHandler requires a non-empty agent_did")
        self._client = client if client is not None else build_client_from_env()
        self._agent_did = agent_did
        self._operator_id = operator_id
        self._service_name = service_name
        self._log_input_outputs = log_input_outputs
        self._max_value_chars = max_value_chars
        # Map of LangChain run_id (UUID) → in-flight span bookkeeping.
        # LangChain may run hooks across threads (sync agent executor uses
        # a thread pool), so we guard mutations with a lock.
        self._spans: dict[UUID, _RunSpan] = {}
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
    # Chain hooks
    # ------------------------------------------------------------------

    def on_chain_start(
        self,
        serialized: dict[str, Any] | None,
        inputs: dict[str, Any],
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        **_kwargs: Any,
    ) -> None:
        name = self._extract_name(serialized, fallback="chain")
        attributes: dict[str, Any] = {
            "langchain.kind": "chain",
            "langchain.tags": _join_list(tags),
        }
        if self._log_input_outputs:
            attributes["langchain.inputs"] = self._truncate(_safe_str(inputs))
        if metadata:
            attributes["langchain.metadata"] = self._truncate(_safe_str(metadata))
        self._open_span(
            run_id=run_id,
            parent_run_id=parent_run_id,
            name=name,
            kind="internal",
            attributes=attributes,
        )

    def on_chain_end(
        self,
        outputs: dict[str, Any],
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **_kwargs: Any,
    ) -> None:
        attributes: dict[str, Any] = {}
        if self._log_input_outputs:
            attributes["langchain.outputs"] = self._truncate(_safe_str(outputs))
        self._close_span(run_id=run_id, status="ok", extra_attributes=attributes)

    def on_chain_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **_kwargs: Any,
    ) -> None:
        self._close_span(
            run_id=run_id,
            status="error",
            status_message=str(error),
            extra_attributes={"langchain.error_type": type(error).__name__},
        )
        self._emit_error_log(
            event="langchain.chain.error",
            error=error,
            run_id=run_id,
        )

    # ------------------------------------------------------------------
    # LLM hooks
    # ------------------------------------------------------------------

    def on_llm_start(
        self,
        serialized: dict[str, Any] | None,
        prompts: list[str],
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        **_kwargs: Any,
    ) -> None:
        name = self._extract_name(serialized, fallback="llm")
        attributes: dict[str, Any] = {
            "langchain.kind": "llm",
            "langchain.prompt_count": len(prompts),
            "langchain.tags": _join_list(tags),
        }
        if self._log_input_outputs and prompts:
            attributes["langchain.prompts_preview"] = self._truncate(prompts[0])
        self._open_span(
            run_id=run_id,
            parent_run_id=parent_run_id,
            name=name,
            kind="client",
            attributes=attributes,
        )

    def on_chat_model_start(
        self,
        serialized: dict[str, Any] | None,
        messages: list[list[Any]],
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        **_kwargs: Any,
    ) -> None:
        # LangChain dispatches chat models to this method instead of
        # ``on_llm_start``. Reuse the same span shape — the model class
        # name still ends up on the span ``name``.
        name = self._extract_name(serialized, fallback="chat_model")
        attributes: dict[str, Any] = {
            "langchain.kind": "chat_model",
            "langchain.message_count": sum(len(batch) for batch in messages),
            "langchain.tags": _join_list(tags),
        }
        self._open_span(
            run_id=run_id,
            parent_run_id=parent_run_id,
            name=name,
            kind="client",
            attributes=attributes,
        )

    def on_llm_end(
        self,
        response: Any,
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **_kwargs: Any,
    ) -> None:
        attributes: dict[str, Any] = {}
        usage = _extract_token_usage(response)
        if usage is not None:
            attributes["langchain.llm.input_tokens"] = usage.get("input_tokens", 0)
            attributes["langchain.llm.output_tokens"] = usage.get("output_tokens", 0)
        self._close_span(run_id=run_id, status="ok", extra_attributes=attributes)

    def on_llm_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **_kwargs: Any,
    ) -> None:
        self._close_span(
            run_id=run_id,
            status="error",
            status_message=str(error),
            extra_attributes={"langchain.error_type": type(error).__name__},
        )
        self._emit_error_log(
            event="langchain.llm.error",
            error=error,
            run_id=run_id,
        )

    # ------------------------------------------------------------------
    # Tool hooks
    # ------------------------------------------------------------------

    def on_tool_start(
        self,
        serialized: dict[str, Any] | None,
        input_str: str,
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        **_kwargs: Any,
    ) -> None:
        name = self._extract_name(serialized, fallback="tool")
        attributes: dict[str, Any] = {
            "langchain.kind": "tool",
            "langchain.tool_name": name,
            "langchain.tags": _join_list(tags),
        }
        if self._log_input_outputs:
            attributes["langchain.tool_input"] = self._truncate(input_str)
        self._open_span(
            run_id=run_id,
            parent_run_id=parent_run_id,
            name=f"tool.{name}",
            kind="client",
            attributes=attributes,
        )

    def on_tool_end(
        self,
        output: Any,
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **_kwargs: Any,
    ) -> None:
        attributes: dict[str, Any] = {}
        if self._log_input_outputs:
            attributes["langchain.tool_output"] = self._truncate(_safe_str(output))
        self._close_span(run_id=run_id, status="ok", extra_attributes=attributes)

    def on_tool_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **_kwargs: Any,
    ) -> None:
        self._close_span(
            run_id=run_id,
            status="error",
            status_message=str(error),
            extra_attributes={"langchain.error_type": type(error).__name__},
        )
        self._emit_error_log(
            event="langchain.tool.error",
            error=error,
            run_id=run_id,
        )

    # ------------------------------------------------------------------
    # Agent hooks
    # ------------------------------------------------------------------

    def on_agent_action(
        self,
        action: AgentAction,
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **_kwargs: Any,
    ) -> None:
        # Agent actions are points in time, not spans. Emit a synthetic
        # zero-duration span for the dashboard.
        attributes: dict[str, Any] = {
            "langchain.kind": "agent_action",
            "langchain.tool_name": str(getattr(action, "tool", "")),
        }
        if self._log_input_outputs:
            attributes["langchain.tool_input"] = self._truncate(
                _safe_str(getattr(action, "tool_input", ""))
            )
        self._emit_point_span(
            name="agent.action",
            kind="internal",
            run_id=run_id,
            parent_run_id=parent_run_id,
            attributes=attributes,
        )

    def on_agent_finish(
        self,
        finish: AgentFinish,
        *,
        run_id: UUID,
        parent_run_id: UUID | None = None,
        **_kwargs: Any,
    ) -> None:
        attributes: dict[str, Any] = {
            "langchain.kind": "agent_finish",
        }
        if self._log_input_outputs:
            return_values = getattr(finish, "return_values", {})
            attributes["langchain.return_values"] = self._truncate(_safe_str(return_values))
        self._emit_point_span(
            name="agent.finish",
            kind="internal",
            run_id=run_id,
            parent_run_id=parent_run_id,
            attributes=attributes,
        )

    # ------------------------------------------------------------------
    # Internals — span lifecycle
    # ------------------------------------------------------------------

    def _open_span(
        self,
        *,
        run_id: UUID,
        parent_run_id: UUID | None,
        name: str,
        kind: str,
        attributes: dict[str, Any],
    ) -> None:
        with self._lock:
            parent_span = self._spans.get(parent_run_id) if parent_run_id else None
            if parent_span is not None:
                trace_id = parent_span.trace_id
                parent_span_id: str | None = parent_span.span_id
            else:
                trace_id = _new_trace_id()
                parent_span_id = None
            span_id = _new_span_id()
            self._spans[run_id] = _RunSpan(
                trace_id=trace_id,
                span_id=span_id,
                parent_span_id=parent_span_id,
                name=name,
                kind=kind,
                started_at_perf=time.perf_counter(),
                started_at_iso=_iso_now(),
                attributes=dict(attributes),
            )

    def _close_span(
        self,
        *,
        run_id: UUID,
        status: str,
        status_message: str | None = None,
        extra_attributes: dict[str, Any] | None = None,
    ) -> None:
        with self._lock:
            span = self._spans.pop(run_id, None)
        if span is None:
            # Defensive: hooks can fire out of order if upstream callers
            # mismatch start/end. We just log and move on.
            _log.debug("colber.callback.close_unknown_run_id", extra={"run_id": str(run_id)})
            return
        duration_ms = max(0.0, (time.perf_counter() - span.started_at_perf) * 1000.0)
        ended_at_iso = _iso_add_ms(span.started_at_iso, duration_ms)
        attributes = dict(span.attributes)
        if extra_attributes:
            attributes.update(extra_attributes)
        attributes.setdefault("agentDid", self._agent_did)

        span_payload: dict[str, Any] = {
            "traceId": span.trace_id,
            "spanId": span.span_id,
            "name": span.name,
            "kind": span.kind,
            "service": self._service_name,
            "agentDid": self._agent_did,
            "operatorId": self._operator_id,
            "startTimestamp": span.started_at_iso,
            "endTimestamp": ended_at_iso,
            "durationMs": float(duration_ms),
            "status": status,
            "attributes": attributes,
        }
        if span.parent_span_id is not None:
            span_payload["parentSpanId"] = span.parent_span_id
        if status_message is not None:
            span_payload["statusMessage"] = status_message
        self._safe_ingest_spans([span_payload])

    def _emit_point_span(
        self,
        *,
        name: str,
        kind: str,
        run_id: UUID,
        parent_run_id: UUID | None,
        attributes: dict[str, Any],
    ) -> None:
        """Emit a zero-duration span for events that are points-in-time
        (``on_agent_action``, ``on_agent_finish``)."""
        with self._lock:
            parent_span = self._spans.get(parent_run_id) if parent_run_id else None
            if parent_span is not None:
                trace_id = parent_span.trace_id
                parent_span_id: str | None = parent_span.span_id
            else:
                trace_id = _new_trace_id()
                parent_span_id = None
        now_iso = _iso_now()
        attrs = dict(attributes)
        attrs.setdefault("agentDid", self._agent_did)
        span_payload: dict[str, Any] = {
            "traceId": trace_id,
            "spanId": _new_span_id(),
            "name": name,
            "kind": kind,
            "service": self._service_name,
            "agentDid": self._agent_did,
            "operatorId": self._operator_id,
            "startTimestamp": now_iso,
            "endTimestamp": now_iso,
            "durationMs": 0.0,
            "status": "ok",
            "attributes": attrs,
        }
        if parent_span_id is not None:
            span_payload["parentSpanId"] = parent_span_id
        self._safe_ingest_spans([span_payload])

    # ------------------------------------------------------------------
    # Internals — emission helpers
    # ------------------------------------------------------------------

    def _safe_ingest_spans(self, spans: list[dict[str, Any]]) -> None:
        """Push spans, swallowing any transport failure."""
        try:
            self._client.observability.ingest_spans(spans=spans)
        except (httpx.HTTPError, OSError) as exc:
            _log.warning(
                "colber.callback.ingest_spans_failed: %s: %s",
                type(exc).__name__,
                str(exc),
            )
        except Exception as exc:
            _log.warning(
                "colber.callback.ingest_spans_unexpected: %s: %s",
                type(exc).__name__,
                str(exc),
            )

    def _emit_error_log(
        self,
        *,
        event: str,
        error: BaseException,
        run_id: UUID,
    ) -> None:
        with self._lock:
            current = self._spans.get(run_id)
        # If the span has already been closed by close_span (the normal
        # path is *_error → close_span which pops, then this method),
        # the trace/span ids are gone. We still want a log event tied to
        # the same trace if possible — store a best-effort reference.
        trace_id = current.trace_id if current is not None else _new_trace_id()
        span_id = current.span_id if current is not None else _new_span_id()
        log_event: dict[str, Any] = {
            "timestamp": _iso_now(),
            "traceId": trace_id,
            "spanId": span_id,
            "service": self._service_name,
            "agentDid": self._agent_did,
            "operatorId": self._operator_id,
            "level": "error",
            "message": event,
            "attributes": {
                "langchain.error_type": type(error).__name__,
                "langchain.error_message": self._truncate(str(error)),
                "langchain.run_id": str(run_id),
            },
        }
        try:
            self._client.observability.ingest_logs(events=[log_event])
        except (httpx.HTTPError, OSError) as exc:
            _log.warning(
                "colber.callback.ingest_logs_failed: %s: %s",
                type(exc).__name__,
                str(exc),
            )
        except Exception as exc:
            _log.warning(
                "colber.callback.ingest_logs_unexpected: %s: %s",
                type(exc).__name__,
                str(exc),
            )

    # ------------------------------------------------------------------
    # Internals — small helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_name(
        serialized: dict[str, Any] | None,
        *,
        fallback: str,
    ) -> str:
        """Pull the most informative name out of LangChain's ``serialized`` dict."""
        if not serialized:
            return fallback
        # ``serialized`` typically has ``id: ["langchain", "module", "ClassName"]``
        # plus an optional ``name`` and ``kwargs``.
        name = serialized.get("name")
        if isinstance(name, str) and name:
            return name
        ident = serialized.get("id")
        if isinstance(ident, list) and ident:
            tail = ident[-1]
            if isinstance(tail, str) and tail:
                return tail
        return fallback

    def _truncate(self, value: str) -> str:
        if len(value) <= self._max_value_chars:
            return value
        return value[: self._max_value_chars] + "...[truncated]"


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


def _iso_add_ms(start_iso: str, duration_ms: float) -> str:
    """Add ``duration_ms`` milliseconds to ``start_iso``.

    The observability service expects matching ``start`` and ``end`` ISO
    timestamps so it can compute durations server-side and reconcile
    against the SDK-reported duration.
    """
    from datetime import datetime, timedelta

    # ``start_iso`` is always emitted by ``_iso_now`` — we control the format.
    parsed = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
    end = parsed + timedelta(milliseconds=duration_ms)
    return end.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _safe_str(value: Any) -> str:
    """Best-effort string conversion that never raises."""
    try:
        return str(value)
    except Exception:
        return f"<unrepresentable {type(value).__name__}>"


def _join_list(values: list[str] | None) -> str:
    if not values:
        return ""
    return ",".join(str(v) for v in values)


def _extract_token_usage(response: Any) -> dict[str, int] | None:
    """Pull token usage out of a LangChain LLMResult, if present.

    LangChain's ``LLMResult`` carries usage in ``llm_output["token_usage"]``
    or in some chat models on the message ``response_metadata``. We try a
    few shapes and return ``None`` if none match.
    """
    llm_output = getattr(response, "llm_output", None)
    if isinstance(llm_output, dict):
        usage = llm_output.get("token_usage")
        if isinstance(usage, dict):
            return _normalise_usage(usage)
    # Newer chat-model path: ``response.generations[0][0].message.response_metadata``.
    generations = getattr(response, "generations", None)
    if isinstance(generations, list) and generations:
        first_batch = generations[0]
        if isinstance(first_batch, list) and first_batch:
            first_gen = first_batch[0]
            message = getattr(first_gen, "message", None)
            metadata = getattr(message, "response_metadata", None) if message else None
            if isinstance(metadata, dict):
                usage = metadata.get("token_usage") or metadata.get("usage")
                if isinstance(usage, dict):
                    return _normalise_usage(usage)
    return None


def _normalise_usage(usage: dict[str, Any]) -> dict[str, int]:
    """Coerce a usage dict into ``{input_tokens, output_tokens}``."""

    def _int(*candidates: str) -> int:
        for key in candidates:
            value = usage.get(key)
            if isinstance(value, int):
                return value
            if isinstance(value, float):
                return int(value)
        return 0

    return {
        "input_tokens": _int("input_tokens", "prompt_tokens"),
        "output_tokens": _int("output_tokens", "completion_tokens"),
    }


__all__ = ["DEFAULT_SERVICE_NAME", "ColberCallbackHandler"]
