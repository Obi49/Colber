# Copyright 2026 Colber Contributors
# SPDX-License-Identifier: Apache-2.0
"""Tests for the concrete :class:`ColberToolBase` subclasses."""

from __future__ import annotations

import json
import uuid
from typing import Any

from autogen_core import CancellationToken

from colber_autogen import (
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
from tests.conftest import fake_pubkey_b64


def _ct() -> CancellationToken:
    """Fresh cancellation token for an individual tool call."""
    return CancellationToken()


# ---------------------------------------------------------------------------
# Identity
# ---------------------------------------------------------------------------


async def test_identity_register_happy_path(
    fake_backend: Any,
    colber_client: Any,
) -> None:
    tool = IdentityRegisterTool(client=colber_client)
    rendered = await tool.run_json(
        {
            "public_key": fake_pubkey_b64(),
            "owner_operator_id": "op-demo",
        },
        _ct(),
    )
    payload = json.loads(rendered)
    assert payload["did"].startswith("did:key:zTest")
    assert "agent_id" in payload
    assert len(fake_backend.agents) == 1


async def test_identity_resolve_404_returns_error_string(
    colber_client: Any,
) -> None:
    """A ``NOT_FOUND`` from the SDK becomes a JSON error blob the LLM can read."""
    tool = IdentityResolveTool(client=colber_client)
    rendered = await tool.run_json({"did": "did:key:zUnknown"}, _ct())
    payload = json.loads(rendered)
    assert payload["error"] is True
    assert "NOT_FOUND" in payload["summary"]


async def test_identity_register_cancelled_short_circuit(
    colber_client: Any,
) -> None:
    """A pre-cancelled token must short-circuit the tool dispatch."""
    tool = IdentityRegisterTool(client=colber_client)
    token = CancellationToken()
    token.cancel()
    rendered = await tool.run_json(
        {"public_key": fake_pubkey_b64(), "owner_operator_id": "op"},
        token,
    )
    payload = json.loads(rendered)
    assert payload["error"] is True
    assert "CANCELLED" in payload["type"]


# ---------------------------------------------------------------------------
# Reputation
# ---------------------------------------------------------------------------


async def test_reputation_score_returns_envelope(
    fake_backend: Any,
    colber_client: Any,
) -> None:
    fake_backend.scores["did:key:zTarget"] = 600
    tool = ReputationScoreTool(client=colber_client)
    rendered = await tool.run_json({"did": "did:key:zTarget"}, _ct())
    payload = json.loads(rendered)
    assert payload["score"] == 600
    assert payload["did"] == "did:key:zTarget"


async def test_reputation_feedback_increases_score(
    fake_backend: Any,
    colber_client: Any,
) -> None:
    tool = ReputationFeedbackTool(client=colber_client)
    rendered = await tool.run_json(
        {
            "feedback_id": str(uuid.uuid4()),
            "from_did": "did:key:zA",
            "to_did": "did:key:zB",
            "tx_id": "tx-1",
            "rating": 5,
            "dimensions": {
                "delivery": 5,
                "quality": 5,
                "communication": 5,
            },
            "signed_at": "2026-01-01T00:00:00.000Z",
            "signature": "fake-sig",
            "comment": "great",
        },
        _ct(),
    )
    payload = json.loads(rendered)
    assert payload["accepted"] is True
    assert fake_backend.scores["did:key:zB"] == 510


# ---------------------------------------------------------------------------
# Memory
# ---------------------------------------------------------------------------


async def test_memory_store_and_query_round_trip(
    fake_backend: Any,
    colber_client: Any,
) -> None:
    store = MemoryStoreTool(client=colber_client)
    rendered = await store.run_json(
        {
            "owner_did": "did:key:zM",
            "type": "fact",
            "text": "the capital of France is Paris",
            "visibility": "private",
        },
        _ct(),
    )
    payload = json.loads(rendered)
    assert payload["id"].startswith("mem-")

    query = MemoryQueryTool(client=colber_client)
    rendered = await query.run_json(
        {
            "query_did": "did:key:zM",
            "query_text": "Paris",
            "top_k": 3,
        },
        _ct(),
    )
    payload = json.loads(rendered)
    assert len(payload["hits"]) == 1
    assert "Paris" in payload["hits"][0]["snippet"]


async def test_memory_share_grants_access(
    fake_backend: Any,
    colber_client: Any,
) -> None:
    fake_backend.memories["mem-x"] = {
        "ownerDid": "did:key:zOwner",
        "text": "shared knowledge",
        "type": "fact",
    }
    share = MemoryShareTool(client=colber_client)
    rendered = await share.run_json(
        {
            "id": "mem-x",
            "caller_did": "did:key:zOwner",
            "share_with": ["did:key:zPeer"],
        },
        _ct(),
    )
    payload = json.loads(rendered)
    assert payload["id"] == "mem-x"
    assert "did:key:zPeer" in payload["shared_with"]


async def test_memory_query_unknown_caller_returns_no_hits(
    fake_backend: Any,
    colber_client: Any,
) -> None:
    """Memories owned by another agent are not returned to a stranger."""
    fake_backend.memories["mem-private"] = {
        "ownerDid": "did:key:zOwner",
        "text": "private note",
        "type": "fact",
    }
    query = MemoryQueryTool(client=colber_client)
    rendered = await query.run_json(
        {
            "query_did": "did:key:zStranger",
            "query_text": "note",
            "top_k": 5,
        },
        _ct(),
    )
    payload = json.loads(rendered)
    assert payload["hits"] == []


# ---------------------------------------------------------------------------
# Negotiation
# ---------------------------------------------------------------------------


async def test_negotiation_full_round_trip(
    fake_backend: Any,
    colber_client: Any,
) -> None:
    start = NegotiationStartTool(client=colber_client)
    rendered = await start.run_json(
        {
            "terms": {
                "subject": "delivery-deal",
                "strategy": "ascending-auction",
                "partyDids": ["did:key:zA", "did:key:zB"],
                "deadline": "2026-12-31T00:00:00.000Z",
                "constraints": {},
                "currency": "USDC",
                "reservePrice": 50,
            },
            "created_by": "did:key:zA",
            "idempotency_key": str(uuid.uuid4()),
        },
        _ct(),
    )
    payload = json.loads(rendered)
    nego_id = payload["negotiation_id"]
    assert nego_id.startswith("nego-")

    propose = NegotiationProposeTool(client=colber_client)
    await propose.run_json(
        {
            "negotiation_id": nego_id,
            "proposal": {
                "proposalId": "p1",
                "fromDid": "did:key:zA",
                "amount": 100,
                "signature": "sig",
                "proposedAt": "2026-01-01T00:00:00.000Z",
            },
            "public_key": "pk",
        },
        _ct(),
    )

    counter = NegotiationCounterTool(client=colber_client)
    await counter.run_json(
        {
            "negotiation_id": nego_id,
            "counter_to": "p1",
            "proposal": {
                "proposalId": "p2",
                "fromDid": "did:key:zB",
                "amount": 150,
                "signature": "sig2",
                "proposedAt": "2026-01-01T00:01:00.000Z",
            },
            "public_key": "pk2",
        },
        _ct(),
    )

    settle = NegotiationSettleTool(client=colber_client)
    await settle.run_json(
        {
            "negotiation_id": nego_id,
            "signatures": [
                {"did": "did:key:zA", "signature": "sigA"},
                {"did": "did:key:zB", "signature": "sigB"},
            ],
            "public_keys": [
                {"did": "did:key:zA", "publicKey": "pkA"},
                {"did": "did:key:zB", "publicKey": "pkB"},
            ],
            "winning_proposal_id": "p2",
        },
        _ct(),
    )
    record = fake_backend.negotiations[nego_id]
    assert record["status"] == "settled"
    assert record["winningProposalId"] == "p2"


async def test_negotiation_propose_unknown_returns_error_string(
    colber_client: Any,
) -> None:
    propose = NegotiationProposeTool(client=colber_client)
    rendered = await propose.run_json(
        {
            "negotiation_id": "nego-missing",
            "proposal": {
                "proposalId": "p1",
                "fromDid": "did:key:zA",
                "amount": 100,
                "signature": "sig",
                "proposedAt": "2026-01-01T00:00:00.000Z",
            },
            "public_key": "pk",
        },
        _ct(),
    )
    payload = json.loads(rendered)
    assert payload["error"] is True
    assert "NOT_FOUND" in payload["summary"]


# ---------------------------------------------------------------------------
# Insurance
# ---------------------------------------------------------------------------


async def test_insurance_quote(
    fake_backend: Any,
    colber_client: Any,
) -> None:
    tool = InsuranceQuoteTool(client=colber_client)
    rendered = await tool.run_json(
        {
            "subscriber_did": "did:key:zS",
            "beneficiary_did": "did:key:zB",
            "deal_subject": "test-deal",
            "amount_usdc": 1000.0,
            "sla_terms": {
                "delivery_window_hours": 24,
                "requirements": ["UTF-8"],
            },
        },
        _ct(),
    )
    payload = json.loads(rendered)
    assert payload["amount_usdc"] == 1000.0
    assert payload["premium_usdc"] == 20.0


async def test_insurance_subscribe_and_claim(
    fake_backend: Any,
    colber_client: Any,
) -> None:
    sub = InsuranceSubscribeTool(client=colber_client)
    rendered = await sub.run_json(
        {
            "subscriber_did": "did:key:zS",
            "beneficiary_did": "did:key:zB",
            "deal_subject": "test-deal",
            "amount_usdc": 500.0,
            "sla_terms": {"delivery_window_hours": 24},
            "idempotency_key": str(uuid.uuid4()),
        },
        _ct(),
    )
    payload = json.loads(rendered)
    policy_id = payload["policy"]["id"]
    assert policy_id.startswith("pol-")

    claim = InsuranceClaimTool(client=colber_client)
    rendered = await claim.run_json(
        {
            "policy_id": policy_id,
            "claimant_did": "did:key:zS",
            "reason": "delivery missed",
            "evidence": {"slack_log": "no delivery"},
            "idempotency_key": str(uuid.uuid4()),
        },
        _ct(),
    )
    payload = json.loads(rendered)
    assert payload["status"] == "pending"
    assert len(fake_backend.claims) == 1


async def test_insurance_subscribe_validation_failure_returns_error(
    colber_client: Any,
) -> None:
    sub = InsuranceSubscribeTool(client=colber_client)
    rendered = await sub.run_json(
        {
            "subscriber_did": "did:key:zS",
            "beneficiary_did": "did:key:zB",
            "deal_subject": "bad-deal",
            "amount_usdc": -5.0,
            "sla_terms": {"delivery_window_hours": 24},
            "idempotency_key": str(uuid.uuid4()),
        },
        _ct(),
    )
    payload = json.loads(rendered)
    assert payload["error"] is True
    assert "VALIDATION_FAILED" in payload["summary"]


async def test_insurance_claim_unknown_policy_returns_error(
    colber_client: Any,
) -> None:
    claim = InsuranceClaimTool(client=colber_client)
    rendered = await claim.run_json(
        {
            "policy_id": "pol-doesnotexist",
            "claimant_did": "did:key:zS",
            "reason": "delivery missed",
            "evidence": {},
            "idempotency_key": str(uuid.uuid4()),
        },
        _ct(),
    )
    payload = json.loads(rendered)
    assert payload["error"] is True
    assert "NOT_FOUND" in payload["summary"]


# ---------------------------------------------------------------------------
# Tool surface checks
# ---------------------------------------------------------------------------


async def test_each_tool_returns_str(colber_client: Any) -> None:
    """Every tool's return type is `str`. AutoGen 0.4 stamps this on schema."""
    tool = IdentityResolveTool(client=colber_client)
    assert tool.return_type() is str


async def test_tool_name_is_stable(colber_client: Any) -> None:
    """Tool names match the published convention: ``colber_<service>_<op>``."""
    tool = NegotiationStartTool(client=colber_client)
    assert tool.name == "colber_negotiation_start"
    assert tool.description.startswith("Open a new")


async def test_tool_args_type_is_pydantic(colber_client: Any) -> None:
    """Tool args type is the per-tool Pydantic model."""
    tool = IdentityRegisterTool(client=colber_client)
    args_type = tool.args_type()
    fields = getattr(args_type, "model_fields", None)
    assert fields is not None
    assert "public_key" in fields
    assert "owner_operator_id" in fields
