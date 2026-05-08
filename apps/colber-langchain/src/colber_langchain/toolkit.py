"""``ColberToolkit`` — a one-stop :class:`BaseToolkit` exposing every Colber tool.

Use :meth:`ColberToolkit.get_tools` to drop the full surface into any
LangChain agent that takes a list of :class:`BaseTool`. Optionally pass
``services=["identity", "reputation", ...]`` to restrict to a subset.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, ClassVar

from langchain_core.tools import BaseTool, BaseToolkit
from pydantic import ConfigDict, PrivateAttr

from ._client import build_client_from_env
from .tools import (
    ColberToolBase,
    IdentityRegisterTool,
    IdentityResolveTool,
    InsuranceClaimTool,
    InsuranceQuoteTool,
    InsuranceSubscribeTool,
    MemoryQueryTool,
    MemoryShareTool,
    MemoryStoreTool,
    NegotiationCounterTool,
    NegotiationProposeTool,
    NegotiationSettleTool,
    NegotiationStartTool,
    ReputationFeedbackTool,
    ReputationScoreTool,
)

if TYPE_CHECKING:
    from colber_sdk import ColberClient

#: Default service set returned by :meth:`ColberToolkit.get_tools`.
ALL_SERVICES: tuple[str, ...] = (
    "identity",
    "reputation",
    "memory",
    "negotiation",
    "insurance",
)


_TOOL_FACTORIES: dict[str, tuple[type[ColberToolBase], ...]] = {
    "identity": (IdentityRegisterTool, IdentityResolveTool),
    "reputation": (ReputationFeedbackTool, ReputationScoreTool),
    "memory": (MemoryStoreTool, MemoryQueryTool, MemoryShareTool),
    "negotiation": (
        NegotiationStartTool,
        NegotiationProposeTool,
        NegotiationCounterTool,
        NegotiationSettleTool,
    ),
    "insurance": (
        InsuranceQuoteTool,
        InsuranceSubscribeTool,
        InsuranceClaimTool,
    ),
}


class ColberToolkit(BaseToolkit):
    """Bundle of every Colber-backed LangChain tool.

    Args:
        client: A :class:`colber_sdk.ColberClient`. Optional — defaults
            to one built from environment variables (see
            :func:`colber_langchain._client.build_client_from_env`).
        services: Optional sub-list of service names to expose.
            ``None`` (default) returns the full set. Pass e.g.
            ``["negotiation", "insurance"]`` to limit a deal-only agent.

    Example:
        >>> from colber_langchain import ColberToolkit
        >>> toolkit = ColberToolkit()  # doctest: +SKIP
        >>> tools = toolkit.get_tools()  # doctest: +SKIP
        >>> # Plug ``tools`` into any LangChain agent.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    services: list[str] | None = None

    #: All service names recognised by :meth:`get_tools`.
    KNOWN_SERVICES: ClassVar[tuple[str, ...]] = ALL_SERVICES

    _client: ColberClient = PrivateAttr()

    def __init__(
        self,
        *,
        client: ColberClient | None = None,
        services: list[str] | None = None,
    ) -> None:
        if services is not None:
            unknown = [s for s in services if s not in _TOOL_FACTORIES]
            if unknown:
                raise ValueError(
                    f"ColberToolkit: unknown service(s): {unknown!r}. "
                    f"Allowed: {sorted(_TOOL_FACTORIES)}"
                )
        super().__init__(  # type: ignore[call-arg]
            services=list(services) if services is not None else None,
        )
        self._client = client if client is not None else build_client_from_env()

    def get_tools(self) -> list[BaseTool]:
        """Return one tool instance per Colber operation in the chosen services."""
        target_services = self.services if self.services else list(ALL_SERVICES)
        out: list[BaseTool] = []
        for service in target_services:
            factories = _TOOL_FACTORIES[service]
            for factory in factories:
                out.append(factory(client=self._client))
        return out


__all__ = ["ALL_SERVICES", "ColberToolkit"]
