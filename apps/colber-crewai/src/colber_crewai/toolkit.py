# Copyright 2026 Colber Contributors
# SPDX-License-Identifier: Apache-2.0
"""``ColberToolkit`` — a one-stop bundle of every Colber CrewAI tool.

Use :meth:`ColberToolkit.get_tools` to drop the full surface into any
CrewAI agent that takes a list of :class:`crewai.tools.BaseTool`.
Optionally pass ``services=["identity", "reputation", ...]`` to
restrict to a subset.

The ``observability`` service is **not** exposed as a tool. Letting an
LLM call ``log_ingest`` is a footgun — the agent could DoS its own log
pipeline. Use :class:`ColberStepCallback` / :class:`ColberTaskCallback`
for telemetry instead. Passing ``services=["observability"]`` raises
:class:`ValueError` with the explicit reason.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, ClassVar

from crewai.tools import BaseTool

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

#: Services that are intentionally NOT exposed as agent-callable tools.
#: Each entry maps to the rationale shown in the ``ValueError`` raised
#: when a caller asks for them.
EXCLUDED_SERVICES: dict[str, str] = {
    "observability": (
        "observability is excluded from agent tools by design — exposing "
        "log_ingest as a tool lets the agent DoS its own log pipeline. "
        "Use ColberStepCallback / ColberTaskCallback for telemetry."
    ),
}

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


class ColberToolkit:
    """Bundle of every Colber-backed CrewAI tool.

    Args:
        client: A :class:`colber_sdk.ColberClient`. Optional — defaults
            to one built from environment variables.
        agent_did: Optional DID of the agent these tools belong to.
            Stored for parity with the LangChain plugin and made
            available via :attr:`agent_did`; not currently used by the
            tool implementations themselves (each tool takes an explicit
            ``did`` / ``owner_did`` / ``from_did`` arg per the underlying
            service contract).
        services: Optional sub-list of service names to expose. ``None``
            (default) returns the full set. Pass e.g.
            ``["negotiation", "insurance"]`` to limit a deal-only agent.

    Example:
        >>> from colber_crewai import ColberToolkit  # doctest: +SKIP
        >>> toolkit = ColberToolkit(agent_did="did:key:z6Mk...")  # doctest: +SKIP
        >>> tools = toolkit.get_tools()  # doctest: +SKIP
        >>> # Plug ``tools`` into any CrewAI Agent.
    """

    #: All service names recognised by :meth:`get_tools`.
    KNOWN_SERVICES: ClassVar[tuple[str, ...]] = ALL_SERVICES

    def __init__(
        self,
        *,
        client: ColberClient | None = None,
        agent_did: str | None = None,
        services: list[str] | None = None,
    ) -> None:
        if services is not None:
            excluded = [s for s in services if s in EXCLUDED_SERVICES]
            if excluded:
                # Surface the FIRST excluded reason — clearer error in
                # the common case where only one service is off-limits.
                reason = EXCLUDED_SERVICES[excluded[0]]
                raise ValueError(
                    f"ColberToolkit: service(s) {excluded!r} not exposed. {reason}"
                )
            unknown = [s for s in services if s not in _TOOL_FACTORIES]
            if unknown:
                raise ValueError(
                    f"ColberToolkit: unknown service(s): {unknown!r}. "
                    f"Allowed: {sorted(_TOOL_FACTORIES)}"
                )
        self._client = client if client is not None else build_client_from_env()
        self._agent_did = agent_did
        self._services = list(services) if services is not None else None

    @property
    def client(self) -> ColberClient:
        return self._client

    @property
    def agent_did(self) -> str | None:
        return self._agent_did

    @property
    def services(self) -> list[str] | None:
        return list(self._services) if self._services is not None else None

    def get_tools(self) -> list[BaseTool]:
        """Return one tool instance per Colber operation in the chosen services."""
        target_services = (
            self._services if self._services else list(ALL_SERVICES)
        )
        out: list[BaseTool] = []
        for service in target_services:
            factories = _TOOL_FACTORIES[service]
            for factory in factories:
                out.append(factory(client=self._client))
        return out


__all__ = ["ALL_SERVICES", "EXCLUDED_SERVICES", "ColberToolkit"]
