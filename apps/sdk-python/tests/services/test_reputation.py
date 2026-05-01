"""Mirror of ``apps/sdk-typescript/test/services/reputation.test.ts``."""

from __future__ import annotations

import json
from collections.abc import Callable
from urllib.parse import parse_qs, urlparse

import respx

from colber_sdk import ColberClient
from colber_sdk.services.reputation import FeedbackDimensions

from .._helpers import TEST_BASE_URLS

DID = "did:key:zbar"


class TestScore:
    def test_gets_score_did_and_returns_signed_envelope(
        self, make_client: Callable[..., ColberClient]
    ) -> None:
        with respx.mock:
            respx.get(
                f"{TEST_BASE_URLS['reputation']}/v1/reputation/score/{DID.replace(':', '%3A')}"
            ).respond(
                json={
                    "ok": True,
                    "data": {
                        "did": DID,
                        "score": 510,
                        "scoreVersion": "v1.0",
                        "computedAt": "2026-04-30T00:00:00.000Z",
                        "attestation": "AAA",
                    },
                }
            )
            client = make_client()
            r = client.reputation.score(did=DID)
            assert r.score == 510
            assert r.attestation == "AAA"
            assert r.score_version == "v1.0"


class TestHistory:
    def test_gets_history_did_with_optional_query_params(
        self, make_client: Callable[..., ColberClient]
    ) -> None:
        with respx.mock:
            route = respx.get(
                f"{TEST_BASE_URLS['reputation']}/v1/reputation/history/{DID.replace(':', '%3A')}"
            ).respond(
                json={
                    "ok": True,
                    "data": {
                        "did": DID,
                        "transactions": [],
                        "feedbacksReceived": [],
                        "feedbacksIssued": [],
                        "nextCursor": None,
                    },
                }
            )
            client = make_client()
            client.reputation.history(did=DID, limit=25, cursor="abc")
            qs = parse_qs(urlparse(str(route.calls.last.request.url)).query)
            assert qs["limit"] == ["25"]
            assert qs["cursor"] == ["abc"]

    def test_omits_absent_optional_params(self, make_client: Callable[..., ColberClient]) -> None:
        with respx.mock:
            route = respx.get(
                f"{TEST_BASE_URLS['reputation']}/v1/reputation/history/{DID.replace(':', '%3A')}"
            ).respond(
                json={
                    "ok": True,
                    "data": {
                        "did": DID,
                        "transactions": [],
                        "feedbacksReceived": [],
                        "feedbacksIssued": [],
                        "nextCursor": None,
                    },
                }
            )
            client = make_client()
            client.reputation.history(did=DID)
            assert urlparse(str(route.calls.last.request.url)).query == ""


class TestVerify:
    def test_posts_score_attestation_pair_to_verify(
        self, make_client: Callable[..., ColberClient]
    ) -> None:
        with respx.mock:
            route = respx.post(f"{TEST_BASE_URLS['reputation']}/v1/reputation/verify").respond(
                json={"ok": True, "data": {"valid": True}}
            )
            client = make_client()
            r = client.reputation.verify(
                score={
                    "did": DID,
                    "score": 510,
                    "score_version": "v1.0",
                    "computed_at": "2026-04-30T00:00:00.000Z",
                },
                attestation="AAA",
            )
            assert json.loads(route.calls.last.request.content) == {
                "score": {
                    "did": DID,
                    "score": 510,
                    "scoreVersion": "v1.0",
                    "computedAt": "2026-04-30T00:00:00.000Z",
                },
                "attestation": "AAA",
            }
            assert r.valid is True


class TestSubmitFeedback:
    def test_posts_signed_feedback_envelope(self, make_client: Callable[..., ColberClient]) -> None:
        with respx.mock:
            route = respx.post(f"{TEST_BASE_URLS['reputation']}/v1/reputation/feedback").respond(
                status_code=201,
                json={
                    "ok": True,
                    "data": {
                        "accepted": True,
                        "idempotent": False,
                        "feedbackId": "00000000-0000-0000-0000-000000000001",
                    },
                },
            )
            client = make_client()
            r = client.reputation.submit_feedback(
                feedback_id="00000000-0000-0000-0000-000000000001",
                from_did="did:key:zfoo",
                to_did=DID,
                tx_id="tx-1",
                rating=5,
                dimensions=FeedbackDimensions(delivery=5, quality=5, communication=5),
                signed_at="2026-04-30T00:00:00.000Z",
                signature="AAA",
            )
            body = json.loads(route.calls.last.request.content)
            assert body["rating"] == 5
            assert body["txId"] == "tx-1"
            assert r.accepted is True
            assert r.feedback_id == "00000000-0000-0000-0000-000000000001"

    def test_forwards_optional_comment(self, make_client: Callable[..., ColberClient]) -> None:
        with respx.mock:
            route = respx.post(f"{TEST_BASE_URLS['reputation']}/v1/reputation/feedback").respond(
                status_code=201,
                json={
                    "ok": True,
                    "data": {
                        "accepted": True,
                        "idempotent": False,
                        "feedbackId": "00000000-0000-0000-0000-000000000002",
                    },
                },
            )
            client = make_client()
            client.reputation.submit_feedback(
                feedback_id="00000000-0000-0000-0000-000000000002",
                from_did="did:key:zfoo",
                to_did=DID,
                tx_id="tx-2",
                rating=4,
                dimensions={"delivery": 4, "quality": 4, "communication": 4},
                signed_at="2026-04-30T00:00:00.000Z",
                signature="AAA",
                comment="solid work",
            )
            body = json.loads(route.calls.last.request.content)
            assert body["comment"] == "solid work"
