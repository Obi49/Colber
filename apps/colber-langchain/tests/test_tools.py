"""Tests for the concrete :class:`colber_langchain.ColberToolBase` subclasses."""

from __future__ import annotations

import json
import uuid
from typing import Any

import pytest
from langchain_core.tools import ToolException

from colber_langchain import (
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

# ---------------------------------------------------------------------------
# Identity
# ---------------------------------------------------------------------------


def test_identity_register_happy_path(
    fake_backend: Any,
    colber_client: Any,
) -> None:
    tool = IdentityRegisterTool(client=colber_client)
    rendered = tool.invoke({"public_key": fake_pubkey_b64(), "owner_operator_id": "op-demo"})
    payload = json.loads(rendered)
    assert payload["did"].startswith("did:key:zTest")
    assert "agent_id" in payload
    assert len(fake_backend.agents) == 1


def test_identity_resolve_404_raises_tool_exception(colber_client: Any) -> None:
    tool = IdentityResolveTool(client=colber_client)
    tool.handle_tool_error = False
    with pytest.raises(ToolException) as exc_info:
        tool.invoke({"did": "did:key:zUnknown"})
    assert "code=NOT_FOUND" in str(exc_info.value)


# ---------------------------------------------------------------------------
# Reputation
# ---------------------------------------------------------------------------


def test_reputation_score_returns_envelope(
    fake_backend: Any,
    colber_client: Any,
) -> None:
    fake_backend.scores["did:key:zTarget"] = 600
    tool = ReputationScoreTool(client=colber_client)
    rendered = tool.invoke({"did": "did:key:zTarget"})
    payload = json.loads(rendered)
    assert payload["score"] == 600
    assert payload["did"] == "did:key:zTarget"


def test_reputation_feedback_increases_score(
    fake_backend: Any,
    colber_client: Any,
) -> None:
    tool = ReputationFeedbackTool(client=colber_client)
    rendered = tool.invoke(
        {
            "feedback_id": str(uuid.uuid4()),
            "from_did": "did:key:zA",
            "to_did": "did:key:zB",
            "tx_id": "tx-1",
            "rating": 5,
            "dimensions": {"delivery": 5, "quality": 5, "communication": 5},
            "signed_at": "2026-01-01T00:00:00.000Z",
            "signature": "fake-sig",
            "comment": "great",
        }
    )
    payload = json.loads(rendered)
    assert payload["accepted"] is True
    assert fake_backend.scores["did:key:zB"] == 510


# ---------------------------------------------------------------------------
# Memory
# ---------------------------------------------------------------------------


def test_memory_store_and_query_round_trip(
    fake_backend: Any,
    colber_client: Any,
) -> None:
    store = MemoryStoreTool(client=colber_client)
    rendered = store.invoke(
        {
            "owner_did": "did:key:zM",
            "type": "fact",
            "text": "the capital of France is Paris",
            "visibility": "private",
        }
    )
    payload = json.loads(rendered)
    assert payload["id"].startswith("mem-")

    query = MemoryQueryTool(client=colber_client)
    rendered = query.invoke(
        {
            "query_did": "did:key:zM",
            "query_text": "Paris",
            "top_k": 3,
        }
    )
    payload = json.loads(rendered)
    assert len(payload["hits"]) == 1
    assert "Paris" in payload["hits"][0]["snippet"]


def test_memory_share_grants_access(
    fake_backend: Any,
    colber_client: Any,
) -> None:
    fake_backend.memories["mem-x"] = {
        "ownerDid": "did:key:zOwner",
        "text": "shared knowledge",
        "type": "fact",
    }
    share = MemoryShareTool(client=colber_client)
    rendered = share.invoke(
        {
            "id": "mem-x",
            "caller_did": "did:key:zOwner",
            "share_with": ["did:key:zPeer"],
        }
    )
    payload = json.loads(rendered)
    assert payload["id"] == "mem-x"
    assert "did:key:zPeer" in payload["shared_with"]


# ---------------------------------------------------------------------------
# Negotiation
# ---------------------------------------------------------------------------


def test_negotiation_full_round_trip(
    fake_backend: Any,
    colber_client: Any,
) -> None:
    start = NegotiationStartTool(client=colber_client)
    rendered = start.invoke(
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
        }
    )
    payload = json.loads(rendered)
    nego_id = payload["negotiation_id"]
    assert nego_id.startswith("nego-")

    propose = NegotiationProposeTool(client=colber_client)
    propose.invoke(
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
        }
    )

    counter = NegotiationCounterTool(client=colber_client)
    counter.invoke(
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
        }
    )

    settle = NegotiationSettleTool(client=colber_client)
    settle.invoke(
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
        }
    )
    record = fake_backend.negotiations[nego_id]
    assert record["status"] == "settled"
    assert record["winningProposalId"] == "p2"


def test_negotiation_propose_unknown_negotiation(colber_client: Any) -> None:
    propose = NegotiationProposeTool(client=colber_client)
    propose.handle_tool_error = False
    with pytest.raises(ToolException) as exc_info:
        propose.invoke(
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
            }
        )
    assert "NOT_FOUND" in str(exc_info.value)


# ---------------------------------------------------------------------------
# Insurance
# ---------------------------------------------------------------------------


def test_insurance_quote(fake_backend: Any, colber_client: Any) -> None:
    tool = InsuranceQuoteTool(client=colber_client)
    rendered = tool.invoke(
        {
            "subscriber_did": "did:key:zS",
            "beneficiary_did": "did:key:zB",
            "deal_subject": "test-deal",
            "amount_usdc": 1000.0,
            "sla_terms": {"delivery_window_hours": 24, "requirements": ["UTF-8"]},
        }
    )
    payload = json.loads(rendered)
    assert payload["amount_usdc"] == 1000.0
    assert payload["premium_usdc"] == 20.0


def test_insurance_subscribe_and_claim(
    fake_backend: Any,
    colber_client: Any,
) -> None:
    sub = InsuranceSubscribeTool(client=colber_client)
    rendered = sub.invoke(
        {
            "subscriber_did": "did:key:zS",
            "beneficiary_did": "did:key:zB",
            "deal_subject": "test-deal",
            "amount_usdc": 500.0,
            "sla_terms": {"delivery_window_hours": 24},
            "idempotency_key": str(uuid.uuid4()),
        }
    )
    payload = json.loads(rendered)
    policy_id = payload["policy"]["id"]
    assert policy_id.startswith("pol-")

    claim = InsuranceClaimTool(client=colber_client)
    rendered = claim.invoke(
        {
            "policy_id": policy_id,
            "claimant_did": "did:key:zS",
            "reason": "delivery missed",
            "evidence": {"slack_log": "no delivery"},
            "idempotency_key": str(uuid.uuid4()),
        }
    )
    payload = json.loads(rendered)
    assert payload["status"] == "pending"
    assert len(fake_backend.claims) == 1


def test_insurance_subscribe_validation_failure(colber_client: Any) -> None:
    sub = InsuranceSubscribeTool(client=colber_client)
    with pytest.raises(ToolException) as exc_info:
        # Bypass pydantic by going through invoke with a negative amount,
        # which the args schema accepts as ``ge=0`` is on the model — we
        # need to drive the SDK-level validation here, so pass via the
        # raw run path that skips schema validation.
        sub._run(
            subscriber_did="did:key:zS",
            beneficiary_did="did:key:zB",
            deal_subject="bad-deal",
            amount_usdc=-5.0,
            sla_terms={"delivery_window_hours": 24},
            idempotency_key=str(uuid.uuid4()),
        )
    assert "VALIDATION_FAILED" in str(exc_info.value)
