# Copyright 2026 Colber Contributors
# SPDX-License-Identifier: Apache-2.0
"""Tests for :class:`ColberToolkit`."""

from __future__ import annotations

from typing import Any

import pytest
from autogen_core.tools import BaseTool

from colber_autogen import ColberToolkit
from colber_autogen.tools import (
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


def test_observability_service_explicitly_excluded(colber_client: Any) -> None:
    """Asking for the observability service must yield a clear, design-rationale error."""
    with pytest.raises(ValueError, match="observability") as exc_info:
        ColberToolkit(client=colber_client, services=["observability"])
    msg = str(exc_info.value)
    assert "observability" in msg
    # Mention the recommended replacement so operators can self-fix.
    assert "ColberToolInstrumentation" in msg


def test_agent_did_round_trips(colber_client: Any) -> None:
    toolkit = ColberToolkit(client=colber_client, agent_did="did:key:zAgent")
    assert toolkit.agent_did == "did:key:zAgent"


def test_services_round_trips(colber_client: Any) -> None:
    toolkit = ColberToolkit(client=colber_client, services=["identity"])
    assert toolkit.services == ["identity"]
    # Mutating the returned list does not affect the toolkit (defensive copy).
    services = toolkit.services
    assert services is not None
    services.append("memory")
    assert toolkit.services == ["identity"]


def test_each_tool_has_pydantic_args_schema(colber_client: Any) -> None:
    """Every tool must surface a Pydantic args model AutoGen can serialize."""
    toolkit = ColberToolkit(client=colber_client)
    for tool in toolkit.get_tools():
        args_type = tool.args_type()
        # Pydantic v2 BaseModel subclasses expose `model_fields`.
        assert hasattr(args_type, "model_fields"), f"{tool.name} args_type lacks model_fields"
        assert tool.return_type() is str
