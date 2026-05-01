"""Mirror of ``apps/sdk-typescript/test/services/insurance.test.ts``."""

from __future__ import annotations

import json
from collections.abc import Callable
from urllib.parse import parse_qs, urlparse

import respx

from colber_sdk import ColberClient

from .._helpers import TEST_BASE_URLS

POLICY_ID = "00000000-0000-0000-0000-0000000000ff"
SUBSCRIBER = "did:key:zA"
BENEFICIARY = "did:key:zB"

SAMPLE_QUOTE = {
    "subscriberDid": SUBSCRIBER,
    "beneficiaryDid": BENEFICIARY,
    "dealSubject": "render",
    "amountUsdc": 1000,
    "premiumUsdc": 20,
    "riskMultiplier": 1,
    "reputationScore": 500,
    "computedAt": "2026-04-30T00:00:00.000Z",
    "validUntil": "2026-04-30T01:00:00.000Z",
}

SAMPLE_POLICY_DETAIL = {
    "policy": {
        "id": POLICY_ID,
        "subscriberDid": SUBSCRIBER,
        "beneficiaryDid": BENEFICIARY,
        "dealSubject": "render",
        "amountUsdc": 1000,
        "premiumUsdc": 20,
        "riskMultiplier": 1,
        "reputationScore": 500,
        "slaTerms": {"deliveryWindowHours": 24},
        "status": "active",
        "createdAt": "2026-04-30T00:00:00.000Z",
        "expiresAt": "2026-05-01T00:00:00.000Z",
    },
    "escrow": {
        "id": "00000000-0000-0000-0000-0000000000aa",
        "policyId": POLICY_ID,
        "amountUsdc": 1000,
        "status": "locked",
        "lockedAt": "2026-04-30T00:00:00.000Z",
    },
    "claims": [],
}

SAMPLE_CLAIM = {
    "id": "00000000-0000-0000-0000-0000000000bb",
    "policyId": POLICY_ID,
    "claimantDid": BENEFICIARY,
    "reason": "late delivery",
    "evidence": {"tickets": ["OPS-1234"]},
    "status": "open",
    "createdAt": "2026-04-30T00:00:00.000Z",
}


def test_quote_posts_quote_returns_priced_view(
    make_client: Callable[..., ColberClient],
) -> None:
    with respx.mock:
        respx.post(f"{TEST_BASE_URLS['insurance']}/v1/insurance/quote").respond(
            json={"ok": True, "data": SAMPLE_QUOTE}
        )
        client = make_client()
        r = client.insurance.quote(
            subscriber_did=SUBSCRIBER,
            beneficiary_did=BENEFICIARY,
            deal_subject="render",
            amount_usdc=1000,
            sla_terms={"delivery_window_hours": 24},
        )
        assert r.premium_usdc == 20


class TestSubscribe:
    def test_posts_subscribe_forwards_idempotency_key(
        self, make_client: Callable[..., ColberClient]
    ) -> None:
        with respx.mock:
            route = respx.post(f"{TEST_BASE_URLS['insurance']}/v1/insurance/subscribe").respond(
                status_code=201, json={"ok": True, "data": SAMPLE_POLICY_DETAIL}
            )
            client = make_client()
            r = client.insurance.subscribe(
                subscriber_did=SUBSCRIBER,
                beneficiary_did=BENEFICIARY,
                deal_subject="render",
                amount_usdc=1000,
                sla_terms={"delivery_window_hours": 24},
                idempotency_key="k-sub-1",
            )
            body = json.loads(route.calls.last.request.content)
            assert body["idempotencyKey"] == "k-sub-1"
            assert body["amountUsdc"] == 1000
            assert body["slaTerms"] == {"deliveryWindowHours": 24}
            assert r.policy.id == POLICY_ID

    def test_treats_a_200_idempotent_replay_as_success(
        self, make_client: Callable[..., ColberClient]
    ) -> None:
        with respx.mock:
            respx.post(f"{TEST_BASE_URLS['insurance']}/v1/insurance/subscribe").respond(
                status_code=200, json={"ok": True, "data": SAMPLE_POLICY_DETAIL}
            )
            client = make_client()
            r = client.insurance.subscribe(
                subscriber_did=SUBSCRIBER,
                beneficiary_did=BENEFICIARY,
                deal_subject="render",
                amount_usdc=1000,
                sla_terms={"delivery_window_hours": 24},
                idempotency_key="k-sub-1",
            )
            assert r.policy.id == POLICY_ID


def test_claim_posts_claims_forwards_idempotency_key(
    make_client: Callable[..., ColberClient],
) -> None:
    with respx.mock:
        route = respx.post(f"{TEST_BASE_URLS['insurance']}/v1/insurance/claims").respond(
            status_code=201, json={"ok": True, "data": SAMPLE_CLAIM}
        )
        client = make_client()
        r = client.insurance.claim(
            policy_id=POLICY_ID,
            claimant_did=BENEFICIARY,
            reason="late delivery",
            evidence={"tickets": ["OPS-1234"]},
            idempotency_key="k-claim-1",
        )
        body = json.loads(route.calls.last.request.content)
        assert body["idempotencyKey"] == "k-claim-1"
        assert body["policyId"] == POLICY_ID
        assert r.status == "open"


def test_status_gets_policies_id(
    make_client: Callable[..., ColberClient],
) -> None:
    with respx.mock:
        route = respx.get(
            f"{TEST_BASE_URLS['insurance']}/v1/insurance/policies/{POLICY_ID}"
        ).respond(json={"ok": True, "data": SAMPLE_POLICY_DETAIL})
        client = make_client()
        client.insurance.status(POLICY_ID)
        assert urlparse(str(route.calls.last.request.url)).path == (
            f"/v1/insurance/policies/{POLICY_ID}"
        )


def test_list_gets_policies_with_subscriber_did_and_pagination(
    make_client: Callable[..., ColberClient],
) -> None:
    with respx.mock:
        route = respx.get(f"{TEST_BASE_URLS['insurance']}/v1/insurance/policies").respond(
            json={
                "ok": True,
                "data": {"policies": [], "total": 0, "limit": 10, "offset": 0},
            }
        )
        client = make_client()
        client.insurance.list(subscriber_did=SUBSCRIBER, limit=10, offset=0)
        qs = parse_qs(urlparse(str(route.calls.last.request.url)).query)
        assert qs["subscriberDid"] == [SUBSCRIBER]
        assert qs["limit"] == ["10"]
        assert qs["offset"] == ["0"]
