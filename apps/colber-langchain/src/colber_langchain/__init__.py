"""``colber_langchain`` — LangChain integration for the Colber platform.

Three first-class building blocks are exported:

- :class:`ColberCallbackHandler` — captures LangChain run events as
  Colber observability spans + structured logs (so the agent's
  internal trace is visible alongside its Colber tool calls in
  Grafana / the operator console).
- :class:`ColberMemory` — backs LangChain's ``BaseMemory`` (and
  optionally ``BaseChatMessageHistory``) with the Colber memory
  service (Qdrant + ACL + chiffrement, with cross-agent ``share``
  semantics).
- :class:`ColberToolkit` — exposes the 6 Colber services (identity,
  reputation, memory, observability, negotiation, insurance) as
  LangChain :class:`BaseTool` subclasses ready to plug into any
  agent.

Example:
    >>> from colber_langchain import (
    ...     ColberCallbackHandler,
    ...     ColberMemory,
    ...     ColberToolkit,
    ... )
    >>> # Build a tool-calling LangChain agent with Colber on every layer.
    >>> # See README.md for a complete quickstart.

The plugin is published as ``colber-langchain`` on PyPI, following the
``langchain-<provider>`` convention. The import name is
``colber_langchain``.
"""

from __future__ import annotations

from ._client import build_client_from_env
from .callbacks import ColberCallbackHandler
from .memory import ColberChatMessageHistory, ColberMemory
from .toolkit import ColberToolkit
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

__version__ = "0.1.0"

__all__ = [
    "ColberCallbackHandler",
    "ColberChatMessageHistory",
    "ColberMemory",
    "ColberToolBase",
    "ColberToolkit",
    "IdentityRegisterTool",
    "IdentityResolveTool",
    "InsuranceClaimTool",
    "InsuranceQuoteTool",
    "InsuranceSubscribeTool",
    "MemoryQueryTool",
    "MemoryShareTool",
    "MemoryStoreTool",
    "NegotiationCounterTool",
    "NegotiationProposeTool",
    "NegotiationSettleTool",
    "NegotiationStartTool",
    "ReputationFeedbackTool",
    "ReputationScoreTool",
    "build_client_from_env",
]
