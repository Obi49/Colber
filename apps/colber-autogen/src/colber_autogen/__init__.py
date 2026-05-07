# Copyright 2026 Colber Contributors
# SPDX-License-Identifier: Apache-2.0
"""``colber_autogen`` — AutoGen 0.4+ integration for the Colber platform.

Three first-class building blocks are exported:

- :class:`ColberToolInstrumentation` (+ :class:`ColberAgentMessageHook`)
  — wrap any AutoGen :class:`autogen_core.tools.BaseTool` to emit one
  Colber observability span per call (so the agent's tool-loop trace
  is visible alongside its Colber-service calls in Grafana / the
  operator console). The optional message hook adds turn-level spans
  for operators who iterate ``on_messages_stream`` themselves.
- :class:`ColberMemory` — implements AutoGen 0.4's
  :class:`autogen_core.memory.Memory` protocol against the Colber
  memory service (Qdrant + ACL + chiffrement, with cross-agent
  ``share`` semantics).
- :class:`ColberToolkit` — exposes 5 of the 6 Colber services
  (identity, reputation, memory, negotiation, insurance —
  observability is intentionally excluded from agent tools) as
  :class:`autogen_core.tools.BaseTool[Args, str]` subclasses ready to
  plug into any :class:`autogen_agentchat.agents.AssistantAgent`.

Example:
    >>> from colber_autogen import (  # doctest: +SKIP
    ...     ColberToolInstrumentation,
    ...     ColberMemory,
    ...     ColberToolkit,
    ... )
    >>> # Build a tool-using AutoGen 0.4 agent with Colber on every layer.
    >>> # See README.md for a complete quickstart.

The plugin is published as ``colber-autogen`` on PyPI. The import
name is ``colber_autogen``.

Targets ``autogen-agentchat>=0.4`` + ``autogen-core>=0.4`` (the
Microsoft 2024-2025 redesign — NOT the legacy ``pyautogen`` 0.2 line).
"""

from __future__ import annotations

from ._client import build_client_from_env
from .instrumentation import (
    ColberAgentMessageHook,
    ColberToolInstrumentation,
)
from .memory import ColberMemory
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
    "ColberAgentMessageHook",
    "ColberMemory",
    "ColberToolBase",
    "ColberToolInstrumentation",
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
