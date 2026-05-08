"""Tests for :class:`colber_langchain.ColberToolkit`."""

from __future__ import annotations

from typing import Any

import pytest
from langchain_core.tools import BaseTool

from colber_langchain import ColberToolkit
from colber_langchain.tools import (
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


def test_get_tools_returns_all_14_tools(colber_client: Any) -> None:
    toolkit = ColberToolkit(client=colber_client)
    tools = toolkit.get_tools()
    assert len(tools) == 14
    assert all(isinstance(t, BaseTool) for t in tools)
    # Make sure every concrete tool class is represented exactly once.
    tool_classes = {type(t) for t in tools}
    expected = {
        IdentityRegisterTool,
        IdentityResolveTool,
        ReputationScoreTool,
        ReputationFeedbackTool,
        MemoryStoreTool,
        MemoryQueryTool,
        MemoryShareTool,
        NegotiationStartTool,
        NegotiationProposeTool,
        NegotiationCounterTool,
        NegotiationSettleTool,
        InsuranceQuoteTool,
        InsuranceSubscribeTool,
        InsuranceClaimTool,
    }
    assert tool_classes == expected


def test_get_tools_filters_by_service(colber_client: Any) -> None:
    toolkit = ColberToolkit(client=colber_client, services=["negotiation", "insurance"])
    tools = toolkit.get_tools()
    # 4 negotiation + 3 insurance = 7
    assert len(tools) == 7
    names = {t.name for t in tools}
    assert "colber_negotiation_start" in names
    assert "colber_insurance_quote" in names
    assert all(not t.name.startswith("colber_identity_") for t in tools)


def test_unknown_service_raises(colber_client: Any) -> None:
    with pytest.raises(ValueError, match="unknown service"):
        ColberToolkit(client=colber_client, services=["nonexistent"])
