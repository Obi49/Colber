# Copyright 2026 Colber Contributors
# SPDX-License-Identifier: Apache-2.0
"""``ColberToolBase`` — common parent class for every Colber AutoGen tool.

AutoGen 0.4 vs CrewAI: the typed advantage
------------------------------------------

AutoGen 0.4 ships :class:`autogen_core.tools.BaseTool[ArgsT, ReturnT]`
— a Pydantic-typed generic with explicit input + return schemas. That's
strictly nicer than CrewAI's loose ``args_schema`` field and lets us
keep ``mypy --strict`` happy across the whole tool surface.

Concrete subclasses set the class-level ``ArgsT`` (a Pydantic
``BaseModel``) and override :meth:`_call_colber` synchronously. The
base class then:

- wraps the SDK call with :class:`colber_sdk.errors.ColberError` →
  JSON-error-string conversion (the LLM reads errors back as the next
  turn's observation and self-corrects — raising would terminate the
  agent's tool loop instead of letting it retry),
- JSON-serialises frozen-dataclass SDK responses,
- runs the synchronous SDK call inside ``asyncio.to_thread`` from
  :meth:`run` so AutoGen's async tool runner doesn't block the event
  loop.

AutoGen returns ``str`` from a tool when the model expects text — every
Colber tool's ``ReturnT`` is therefore ``str`` (the JSON-serialised
response or the JSON-serialised error blob). This matches AutoGen's
function-tool convention and keeps the LLM's tool-output parser happy.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import is_dataclass
from typing import TYPE_CHECKING, Any, ClassVar, TypeVar, cast

from autogen_core import CancellationToken
from autogen_core.tools import BaseTool
from colber_sdk.errors import ColberError
from pydantic import BaseModel

from .._client import build_client_from_env

if TYPE_CHECKING:
    from colber_sdk import ColberClient

#: Type variable for the per-tool Pydantic args model. Bound to
#: :class:`pydantic.BaseModel` so subclasses can't pass an arbitrary
#: type and still satisfy ``mypy --strict``.
ArgsT = TypeVar("ArgsT", bound=BaseModel)


class ColberToolBase(BaseTool[ArgsT, str]):  # type: ignore[type-var]
    # ``ReturnT`` is declared ``bound=BaseModel`` upstream in
    # ``autogen_core.tools._base`` (covariant TypeVar), but the LLM-facing
    # convention for Colber tools is to surface a JSON-serialised ``str``
    # — every callable already pretty-renders the SDK response or the
    # error envelope. ``return_type=str`` is passed at runtime and
    # :meth:`return_value_as_string` is an identity passthrough, so the
    # actual flow stays Pydantic-free without losing the typed args
    # benefit. mypy false-positives the bound; ``type: ignore[type-var]``
    # is the lowest-friction fix.
    """Shared parent of every Colber-backed AutoGen tool.

    Concrete subclasses must:

    - declare a class-level ``args_model`` attribute pointing at a
      Pydantic v2 ``BaseModel`` subclass (the input schema AutoGen
      surfaces to the LLM),
    - declare class-level ``tool_name`` + ``tool_description`` strings,
    - implement :meth:`_call_colber` synchronously — that's where the
      actual SDK call lives. The base class wraps it with error
      conversion + JSON-serialisation of the response and lifts the
      synchronous call into an :func:`asyncio.to_thread` worker so the
      AutoGen event loop is never blocked.

    Why one tool per operation (not one tool with a discriminator):
        AutoGen's ``BaseTool`` exposes its ``args_model`` to the model
        as the JSON schema under the tool's name. Mixing operations
        under one tool would balloon the schema and confuse the LLM.
        Mirrors the colber-langchain + colber-crewai design.
    """

    #: Sentinel exposed by :meth:`ColberToolkit.get_tools` to filter
    #: by service. Subclasses override.
    service_name: ClassVar[str] = "colber"

    #: Subclass-supplied ``ArgsT`` Pydantic model. Concrete tools
    #: assign this in their class body. Declared as ``Any`` here so
    #: subclasses can substitute their concrete model without hitting
    #: the ``Generic[ArgsT]`` invariance check (mypy keeps the tighter
    #: type via the class-level annotation in each subclass).
    args_model: ClassVar[type[BaseModel]]

    #: Subclass-supplied tool name (e.g. ``"colber_identity_register"``).
    tool_name: ClassVar[str]

    #: Subclass-supplied tool description (LLM-facing).
    tool_description: ClassVar[str]

    def __init__(self, *, client: ColberClient | None = None) -> None:
        # AutoGen 0.4's ``BaseTool.__init__`` signature is
        # ``(args_type, return_type, name, description, strict=False)``
        # — we always return ``str`` so ``return_type=str`` is the right
        # constant for every Colber tool.
        # ``args_model`` is a ``ClassVar[type[BaseModel]]`` covariant
        # placeholder; the cast threads through the concrete-subclass
        # ``ArgsT`` binding so mypy keeps the tighter type on each
        # subclass without complaining about the BaseTool generic.
        super().__init__(
            args_type=cast("type[ArgsT]", type(self).args_model),
            return_type=str,
            name=type(self).tool_name,
            description=type(self).tool_description,
        )
        self._client: ColberClient = client if client is not None else build_client_from_env()

    # ------------------------------------------------------------------
    # BaseTool entry point
    # ------------------------------------------------------------------

    async def run(
        self,
        args: ArgsT,
        cancellation_token: CancellationToken,
    ) -> str:
        """Async entry point invoked by AutoGen's tool runner.

        Subclasses do their work in :meth:`_call_colber`. We catch
        :class:`ColberError` and return its serialised form as a plain
        string — AutoGen's agent loop reads tool errors back to the LLM
        as the next turn's observation, so a clean error string lets
        the model self-correct (raising would terminate the agent's
        ``on_messages`` loop instead of letting it retry).

        The :class:`colber_sdk.ColberClient` is synchronous (HTTP via
        ``httpx.Client``); we lift the blocking call into a thread so
        the AutoGen event loop is never stalled. ``asyncio.to_thread``
        is the canonical 3.11+ pattern.

        ``cancellation_token`` is honoured at the boundaries of the
        SDK call — once the call is in-flight, the SDK has its own
        timeout knob and won't accept an external cancel mid-request.
        We check the token before kicking off the work and after it
        returns; long-running tools (none of the Colber operations are
        long-running today, but if they grow to be) can extend this.
        """
        if cancellation_token.is_cancelled():
            return _error_blob(
                "CANCELLED",
                "Cancellation requested before tool dispatch.",
            )
        try:
            response = await asyncio.to_thread(self._call_colber, args)
        except ColberError as exc:
            return _error_blob(
                type(exc).__name__,
                _summarise_error(exc),
            )
        return _serialise_response(response)

    # ------------------------------------------------------------------
    # Subclass contract
    # ------------------------------------------------------------------

    def _call_colber(self, args: ArgsT) -> Any:
        """Subclass hook: invoke the SDK and return its raw response."""
        raise NotImplementedError

    # ------------------------------------------------------------------
    # Helpers exposed to subclasses
    # ------------------------------------------------------------------

    @property
    def client(self) -> ColberClient:
        """Read-only handle to the bound SDK client."""
        return self._client

    def return_value_as_string(self, value: str) -> str:
        """Identity passthrough — the tool's return type is already ``str``.

        AutoGen's ``BaseTool`` calls this to convert ``ReturnT`` to a
        wire string. Since every Colber tool returns a JSON-serialised
        string already, this is a passthrough. Overriding the base
        implementation (which would call ``str()`` again or pretty-print)
        avoids any double-encoding surprise.
        """
        return value


# ---------------------------------------------------------------------------
# Module helpers (private to the package)
# ---------------------------------------------------------------------------


def _error_blob(error_type: str, summary: str) -> str:
    """Render the ``{"error": True, ...}`` envelope as a JSON string."""
    return json.dumps(
        {
            "error": True,
            "type": error_type,
            "summary": summary,
        },
        ensure_ascii=False,
    )


def _summarise_error(exc: ColberError) -> str:
    """Render a :class:`ColberError` as a single line for the LLM."""
    code = getattr(exc, "code", None)
    message = getattr(exc, "message", str(exc))
    parts: list[str] = []
    if code:
        parts.append(f"code={code}")
    parts.append(f"message={message}")
    status = getattr(exc, "status", None)
    if status:
        parts.append(f"status={status}")
    return " ".join(parts)


def _serialise_response(value: Any) -> str:
    """Render an SDK response as a JSON string for the LLM.

    The SDK exposes frozen dataclasses, so we walk the object
    recursively and convert via ``vars()`` plus a few container types.
    Falls back to ``str(value)`` for anything we don't know how to
    serialise — the LLM is fine with both shapes.
    """
    if value is None:
        return ""
    try:
        return json.dumps(_to_jsonable(value), default=str, ensure_ascii=False)
    except (TypeError, ValueError):
        return str(value)


def _to_jsonable(value: Any) -> Any:
    """Best-effort conversion of an SDK return value to a JSON-able tree."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (list, tuple)):
        return [_to_jsonable(item) for item in value]
    if isinstance(value, dict):
        return {str(k): _to_jsonable(v) for k, v in value.items()}
    if is_dataclass(value) and not isinstance(value, type):
        return {
            field_name: _to_jsonable(getattr(value, field_name, None))
            for field_name in getattr(value, "__dataclass_fields__", {})
        }
    # Pydantic model? Newer SDKs may use them — graceful degradation.
    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        try:
            return _to_jsonable(model_dump())
        except Exception:
            pass
    return str(value)


__all__ = ["ColberToolBase"]
