"""``ColberToolBase`` — common parent class for every Colber LangChain tool.

Centralises:

- the bound :class:`colber_sdk.ColberClient` (with env fallback),
- conversion of :class:`colber_sdk.errors.ColberError` to LangChain's
  :class:`ToolException` so the agent-side error path stays clean,
- the inert ``_arun`` implementation that defers to the LangChain
  executor (the SDK is sync only in v0.1.x).
"""

from __future__ import annotations

import json
from dataclasses import is_dataclass
from typing import TYPE_CHECKING, Any, ClassVar

from colber_sdk.errors import ColberError
from langchain_core.tools import BaseTool, ToolException
from pydantic import ConfigDict, PrivateAttr

from .._client import build_client_from_env

if TYPE_CHECKING:
    from colber_sdk import ColberClient


class ColberToolBase(BaseTool):
    """Shared parent of every Colber-backed LangChain tool.

    Concrete subclasses must:

    - set ``name`` and ``description`` as Pydantic fields,
    - declare ``args_schema`` as a Pydantic v2 ``BaseModel`` subclass,
    - implement :meth:`_call_colber` synchronously — that's where the
      actual SDK call lives. The base class wraps it with error
      conversion + JSON-serialisation of the response.
    """

    # Default ``BaseTool`` config tweaks. ``arbitrary_types_allowed`` lets
    # subclasses store the SDK client without pydantic validation.
    model_config = ConfigDict(arbitrary_types_allowed=True)

    handle_tool_error: bool = True
    handle_validation_error: bool = True
    return_direct: bool = False

    #: Sentinel exposed by :meth:`get_tools` to filter by service.
    service_name: ClassVar[str] = "colber"

    _client: ColberClient = PrivateAttr()

    def __init__(self, *, client: ColberClient | None = None, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._client = client if client is not None else build_client_from_env()

    # ------------------------------------------------------------------
    # BaseTool sync/async entry points
    # ------------------------------------------------------------------

    def _run(self, **kwargs: Any) -> str:
        """Synchronous entry point invoked by LangChain's executor.

        Subclasses do their work in :meth:`_call_colber`. We catch
        :class:`ColberError` and raise it as :class:`ToolException` —
        LangChain agents understand that exception and surface it
        cleanly to the LLM (so the model can self-correct on the next
        turn).
        """
        try:
            response = self._call_colber(**kwargs)
        except ColberError as exc:
            # Capture the structured fields so the LLM can react. We
            # serialise the most useful subset; the original error is
            # preserved on ``__cause__`` for callers who want it.
            payload = _summarise_error(exc)
            raise ToolException(f"{type(exc).__name__}: {payload}") from exc
        return _serialise_response(response)

    async def _arun(self, **kwargs: Any) -> str:
        """Async path — delegates to the sync run via LangChain's executor.

        The Colber SDK is sync-only in v0.1.x. Implementing a real
        ``_arun`` would mean spawning a thread; LangChain already does
        that for tools that don't override ``_arun``, so we forward.
        """
        # ``BaseTool._arun`` raises NotImplementedError by default; we
        # override to call the sync impl — LangChain's tool runner uses
        # ``run_in_executor`` to keep the event loop alive when the tool
        # only exposes the sync method, which is the conventional
        # pattern for sync-only third-party SDKs.
        return self._run(**kwargs)

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

    The SDK exposes frozen dataclasses, so we walk the object recursively
    and convert via ``vars()`` plus a few container types. Falls back to
    ``str(value)`` for anything we don't know how to serialise — the LLM
    is fine with both shapes.
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
