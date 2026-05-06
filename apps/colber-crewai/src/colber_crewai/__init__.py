# Copyright 2026 Colber Contributors
# SPDX-License-Identifier: Apache-2.0
"""``colber_crewai`` — CrewAI integration for the Colber platform.

Three first-class building blocks are exported:

- :class:`ColberStepCallback` + :class:`ColberTaskCallback` — capture
  CrewAI step / task events as Colber observability spans + structured
  logs (so the crew's internal trace is visible alongside its Colber
  tool calls in Grafana / the operator console).
- :class:`ColberLongTermMemory` — backs CrewAI's long-term memory tier
  with the Colber memory service (Qdrant + ACL + chiffrement, with
  cross-agent ``share`` semantics). Short-term + entity memory stay
  native to CrewAI.
- :class:`ColberToolkit` — exposes 5 of the 6 Colber services
  (identity, reputation, memory, negotiation, insurance — observability
  is intentionally excluded from agent tools) as
  :class:`crewai.tools.BaseTool` subclasses ready to plug into any
  agent.

Example:
    >>> from colber_crewai import (  # doctest: +SKIP
    ...     ColberStepCallback,
    ...     ColberTaskCallback,
    ...     ColberLongTermMemory,
    ...     ColberToolkit,
    ... )
    >>> # Build a tool-using CrewAI agent with Colber on every layer.
    >>> # See README.md for a complete quickstart.

The plugin is published as ``colber-crewai`` on PyPI. The import name
is ``colber_crewai``.
"""

from __future__ import annotations

from ._client import build_client_from_env
from .callbacks import ColberStepCallback, ColberTaskCallback
from .memory import ColberLongTermMemory
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
    "ColberLongTermMemory",
    "ColberStepCallback",
    "ColberTaskCallback",
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
