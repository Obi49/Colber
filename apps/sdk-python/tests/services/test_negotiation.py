"""Mirror of ``apps/sdk-typescript/test/services/negotiation.test.ts``."""

from __future__ import annotations

import json
from collections.abc import Callable
from urllib.parse import parse_qs, urlparse

import respx

from praxis_sdk import PraxisClient

from .._helpers import TEST_BASE_URLS

NID = "00000000-0000-0000-0000-0000000000bb"

SAMPLE_VIEW = {
    "negotiationId": NID,
    "status": "open",
    "strategy": "ascending-auction",
    "terms": {
        "subject": "rent a chunk of GPU",
        "strategy": "ascending-auction",
        "constraints": {},
        "partyDids": ["did:key:zA", "did:key:zB"],
        "deadline": "2026-05-01T00:00:00.000Z",
    },
    "partyDids": ["did:key:zA", "did:key:zB"],
    "proposals": [],
    "createdAt": "2026-04-30T00:00:00.000Z",
    "updatedAt": "2026-04-30T00:00:00.000Z",
    "expiresAt": "2026-05-01T00:00:00.000Z",
}


class TestStart:
    def test_posts_to_negotiation_with_idempotency_key_in_body(
        self, make_client: Callable[..., PraxisClient]
    ) -> None:
        with respx.mock:
            route = respx.post(f"{TEST_BASE_URLS['negotiation']}/v1/negotiation").respond(
                status_code=201, json={"ok": True, "data": SAMPLE_VIEW}
            )
            client = make_client()
            client.negotiation.start(
                terms={
                    "subject": "rent a chunk of GPU",
                    "strategy": "ascending-auction",
                    "party_dids": ["did:key:zA", "did:key:zB"],
                    "deadline": "2026-05-01T00:00:00.000Z",
                },
                created_by="did:key:zA",
                idempotency_key="00000000-0000-0000-0000-0000000000aa",
            )
            body = json.loads(route.calls.last.request.content)
            assert body["idempotencyKey"] == "00000000-0000-0000-0000-0000000000aa"
            assert body["createdBy"] == "did:key:zA"
            assert body["terms"]["partyDids"] == ["did:key:zA", "did:key:zB"]

    def test_returns_same_view_on_idempotent_replay(
        self, make_client: Callable[..., PraxisClient]
    ) -> None:
        with respx.mock:
            respx.post(f"{TEST_BASE_URLS['negotiation']}/v1/negotiation").respond(
                status_code=200, json={"ok": True, "data": SAMPLE_VIEW}
            )
            client = make_client()
            r = client.negotiation.start(
                terms={
                    "subject": "rent a chunk of GPU",
                    "strategy": "ascending-auction",
                    "party_dids": ["did:key:zA", "did:key:zB"],
                    "deadline": "2026-05-01T00:00:00.000Z",
                },
                created_by="did:key:zA",
                idempotency_key="k-1",
            )
            assert r.negotiation_id == NID


def test_get_gets_negotiation_id(
    make_client: Callable[..., PraxisClient],
) -> None:
    with respx.mock:
        respx.get(f"{TEST_BASE_URLS['negotiation']}/v1/negotiation/{NID}").respond(
            json={"ok": True, "data": SAMPLE_VIEW}
        )
        client = make_client()
        r = client.negotiation.get(NID)
        assert r.negotiation_id == NID


def test_history_gets_history_with_cursor_limit(
    make_client: Callable[..., PraxisClient],
) -> None:
    with respx.mock:
        route = respx.get(f"{TEST_BASE_URLS['negotiation']}/v1/negotiation/{NID}/history").respond(
            json={"ok": True, "data": {"events": [], "nextCursor": None}}
        )
        client = make_client()
        client.negotiation.history(negotiation_id=NID, cursor=5, limit=10)
        url = urlparse(str(route.calls.last.request.url))
        qs = parse_qs(url.query)
        assert qs["cursor"] == ["5"]
        assert qs["limit"] == ["10"]


def test_propose_posts_propose_with_proposal_and_public_key(
    make_client: Callable[..., PraxisClient],
) -> None:
    with respx.mock:
        route = respx.post(f"{TEST_BASE_URLS['negotiation']}/v1/negotiation/{NID}/propose").respond(
            json={"ok": True, "data": SAMPLE_VIEW}
        )
        client = make_client()
        client.negotiation.propose(
            negotiation_id=NID,
            proposal={
                "proposal_id": "00000000-0000-0000-0000-0000000000cc",
                "from_did": "did:key:zA",
                "amount": 100,
                "signature": "AAA",
                "proposed_at": "2026-04-30T00:00:00.000Z",
            },
            public_key="BBB",
        )
        body = json.loads(route.calls.last.request.content)
        assert body["publicKey"] == "BBB"
        assert body["proposal"]["proposalId"] == "00000000-0000-0000-0000-0000000000cc"


def test_counter_posts_counter_with_counter_to(
    make_client: Callable[..., PraxisClient],
) -> None:
    with respx.mock:
        route = respx.post(f"{TEST_BASE_URLS['negotiation']}/v1/negotiation/{NID}/counter").respond(
            json={"ok": True, "data": SAMPLE_VIEW}
        )
        client = make_client()
        client.negotiation.counter(
            negotiation_id=NID,
            counter_to="00000000-0000-0000-0000-0000000000cc",
            proposal={
                "proposal_id": "00000000-0000-0000-0000-0000000000dd",
                "from_did": "did:key:zB",
                "amount": 150,
                "signature": "AAA",
                "proposed_at": "2026-04-30T00:01:00.000Z",
            },
            public_key="BBB",
        )
        body = json.loads(route.calls.last.request.content)
        assert body["counterTo"] == "00000000-0000-0000-0000-0000000000cc"


def test_settle_omits_winning_proposal_id_when_not_provided(
    make_client: Callable[..., PraxisClient],
) -> None:
    with respx.mock:
        route = respx.post(f"{TEST_BASE_URLS['negotiation']}/v1/negotiation/{NID}/settle").respond(
            json={"ok": True, "data": SAMPLE_VIEW}
        )
        client = make_client()
        client.negotiation.settle(
            negotiation_id=NID,
            signatures=[{"did": "did:key:zA", "signature": "AAA"}],
            public_keys=[{"did": "did:key:zA", "public_key": "BBB"}],
        )
        body = json.loads(route.calls.last.request.content)
        assert "winningProposalId" not in body


def test_settle_forwards_winning_proposal_id_when_provided(
    make_client: Callable[..., PraxisClient],
) -> None:
    with respx.mock:
        route = respx.post(f"{TEST_BASE_URLS['negotiation']}/v1/negotiation/{NID}/settle").respond(
            json={"ok": True, "data": SAMPLE_VIEW}
        )
        client = make_client()
        client.negotiation.settle(
            negotiation_id=NID,
            winning_proposal_id="00000000-0000-0000-0000-0000000000cc",
            signatures=[{"did": "did:key:zA", "signature": "AAA"}],
            public_keys=[{"did": "did:key:zA", "public_key": "BBB"}],
        )
        body = json.loads(route.calls.last.request.content)
        assert body["winningProposalId"] == "00000000-0000-0000-0000-0000000000cc"
