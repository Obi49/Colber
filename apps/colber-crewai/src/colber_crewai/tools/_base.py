# Copyright 2026 Colber Contributors
# SPDX-License-Identifier: Apache-2.0
"""``ColberToolBase`` — common parent class for every Colber CrewAI tool.

Centralises:

- the bound :class:`colber_sdk.ColberClient` (with env fallback),
- conversion of :class:`colber_sdk.errors.ColberError` to a JSON-serialised
  error string (CrewAI's tool-error convention is to return the error
  text — the agent loop reads it back as the next turn's observation
  and self-corrects),
- JSON serialisation of the SDK's frozen-dataclass responses.

CrewAI version note
-------------------

CrewAI 0.80+ exposes :class:`crewai.tools.BaseTool` as the canonical
parent for in-tree tool implementations (the older
``crewai_tools.BaseTool`` external package is now an alias). We import
``BaseTool`` from :mod:`crewai.tools` and stay forward-compatible by
not depending on any other CrewAI internals.
"""

from __future__ import annotations

import json
from dataclasses import is_dataclass
from typing import TYPE_CHECKING, Any, ClassVar

from colber_sdk.errors import ColberError
from crewai.tools import BaseTool
from pydantic import ConfigDict, PrivateAttr

from .._client import build_client_from_env

if TYPE_CHECKING:
    from colber_sdk import ColberClient


class ColberToolBase(BaseTool):  # type: ignore[misc]
    """Shared parent of every Colber-backed CrewAI tool.

    Concrete subclasses must:

    - set ``name`` and ``description`` as Pydantic fields (CrewAI's
      :class:`BaseTool` is a Pydantic v2 model),
    - declare ``args_schema`` as a Pydantic v2 ``BaseModel`` subclass
      (CrewAI feeds the schema to the LLM as the tool's input shape),
    - implement :meth:`_call_colber` synchronously — that's where the
      actual SDK call lives. The base class wraps it with error
      conversion + JSON-serialisation of the response.
    """

    # Pydantic v2 config: ``arbitrary_types_allowed`` lets subclasses
    # store the SDK client without pydantic validation. CrewAI's own
    # BaseTool already sets some of this; we redeclare for clarity.
    model_config = ConfigDict(arbitrary_types_allowed=True)

    #: Sentinel exposed by :meth:`ColberToolkit.get_tools` to filter
    #: by service. Subclasses override.
    service_name: ClassVar[str] = "colber"

    _client: ColberClient = PrivateAttr()

    def __init__(self, *, client: ColberClient | None = None, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._client = client if client is not None else build_client_from_env()

    # ------------------------------------------------------------------
    # BaseTool entry point
    # ------------------------------------------------------------------

    def _run(self, **kwargs: Any) -> str:
        """Synchronous entry point invoked by CrewAI's tool runner.

        Subclasses do their work in :meth:`_call_colber`. We catch
        :class:`ColberError` and return its serialised form as a plain
        string — CrewAI's agent loop reads tool errors back to the LLM
        as the next turn's observation, so a clean error string lets
        the model self-correct (raising would terminate the agent
        instead of letting it retry).
        """
        try:
            response = self._call_colber(**kwargs)
        except ColberError as exc:
            payload = _summarise_error(exc)
            return json.dumps(
                {
                    "error": True,
                    "type": type(exc).__name__,
                    "summary": payload,
                },
                ensure_ascii=False,
            )
        return _serialise_response(response)

    # ------------------------------------------------------------------
    # Subclass contract
    # ------------------------------------------------------------------

    def _call_colber(self, **kwargs: Any) -> Any:
        """Subclass hook: invoke the SDK and return its raw response."""
        raise NotImplementedError

    # ------------------------------------------------------------------
    # Helpers exposed to subclasses
    # ------------------------------------------------------------------

    @property
    def client(self) -> ColberClient:
        """Read-only handle to the bound SDK client."""
        return self._client


# ---------------------------------------------------------------------------
# Module helpers (private to the package)
# ---------------------------------------------------------------------------


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
