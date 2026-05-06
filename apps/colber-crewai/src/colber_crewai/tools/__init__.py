# Copyright 2026 Colber Contributors
# SPDX-License-Identifier: Apache-2.0
"""Concrete CrewAI :class:`BaseTool` implementations for Colber services.

One module per Colber service, each exporting one tool per operation.
Imports are kept narrow so ``from colber_crewai.tools import
ColberToolBase`` (or any concrete tool) is cheap.
"""

from __future__ import annotations

from ._base import ColberToolBase
from .identity import IdentityRegisterTool, IdentityResolveTool
from .insurance import (
    InsuranceClaimTool,
    InsuranceQuoteTool,
    InsuranceSubscribeTool,
)
from .memory import MemoryQueryTool, MemoryShareTool, MemoryStoreTool
from .negotiation import (
    NegotiationCounterTool,
    NegotiationProposeTool,
    NegotiationSettleTool,
    NegotiationStartTool,
)
from .reputation import ReputationFeedbackTool, ReputationScoreTool

__all__ = [
    "ColberToolBase",
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
]
