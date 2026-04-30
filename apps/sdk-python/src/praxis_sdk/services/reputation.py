"""``ReputationService`` — typed client for the ``reputation`` service.

Mirror of ``apps/sdk-typescript/src/services/reputation.ts`` and
``apps/reputation/src/http/routes.ts``:

- ``GET  /v1/reputation/score/:did``
- ``GET  /v1/reputation/history/:did``
- ``POST /v1/reputation/verify``
- ``POST /v1/reputation/feedback``
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from urllib.parse import quote

from .._http import HttpClientOptions, RequestParams, request
from ._convert import from_wire, to_wire


@dataclass(frozen=True, slots=True)
class SignedScoreEnvelope:
    """The reputation score + Ed25519 attestation for a given DID."""

    did: str
    score: int
    score_version: str
    computed_at: str
    attestation: str


@dataclass(frozen=True, slots=True)
class HistoryTransaction:
    tx_id: str
    counterparty_did: str
    role: str  # 'buyer' | 'seller'
    amount: str
    currency: str
    status: str
    completed_at: str


@dataclass(frozen=True, slots=True)
class HistoryReceivedFeedback:
    feedback_id: str
    from_did: str
    tx_id: str
    rating: int
    signed_at: str
    comment: str | None = None


@dataclass(frozen=True, slots=True)
class HistoryIssuedFeedback:
    feedback_id: str
    from_did: str
    tx_id: str
    rating: int
    signed_at: str
    to_did: str
    comment: str | None = None


@dataclass(frozen=True, slots=True)
class HistoryResponse:
    did: str
    transactions: list[HistoryTransaction] = field(default_factory=list)
    feedbacks_received: list[HistoryReceivedFeedback] = field(default_factory=list)
    feedbacks_issued: list[HistoryIssuedFeedback] = field(default_factory=list)
    next_cursor: str | None = None


@dataclass(frozen=True, slots=True)
class VerifyResponse:
    valid: bool
    reason: str | None = None


@dataclass(frozen=True, slots=True)
class FeedbackResponse:
    accepted: bool
    idempotent: bool
    feedback_id: str


@dataclass(frozen=True, slots=True)
class FeedbackDimensions:
    delivery: int
    quality: int
    communication: int


class ReputationService:
    """Typed client for the ``reputation`` service."""

    def __init__(self, opts: HttpClientOptions, base_url: str) -> None:
        self._opts = opts
        self._base_url = base_url

    def score(self, *, did: str) -> SignedScoreEnvelope:
        """``GET /v1/reputation/score/:did``."""
        data = request(
            self._opts,
            RequestParams(
                method="GET",
                base_url=self._base_url,
                path=f"/v1/reputation/score/{quote(did, safe='')}",
            ),
        )
        if data is None:
            raise RuntimeError("reputation.score: empty response body")
        return from_wire(SignedScoreEnvelope, data)

    def history(
        self,
        *,
        did: str,
        limit: int | None = None,
        cursor: str | None = None,
    ) -> HistoryResponse:
        """``GET /v1/reputation/history/:did?limit=...&cursor=...``."""
        query: dict[str, str | int | float | bool | None] = {}
        if limit is not None:
            query["limit"] = limit
        if cursor is not None:
            query["cursor"] = cursor
        data = request(
            self._opts,
            RequestParams(
                method="GET",
                base_url=self._base_url,
                path=f"/v1/reputation/history/{quote(did, safe='')}",
                query=query if query else None,
            ),
        )
        if data is None:
            raise RuntimeError("reputation.history: empty response body")
        return from_wire(HistoryResponse, data)

    def verify(self, *, score: dict[str, Any], attestation: str) -> VerifyResponse:
        """``POST /v1/reputation/verify``.

        Args:
            score: Snake-case dict ``{"did", "score", "score_version",
                "computed_at"}`` (or already camelCase — the SDK forwards
                the structure as-is by detecting wire-style keys).
            attestation: Base64 Ed25519 signature over the JCS canonical
                form of ``score``.
        """
        body = to_wire({"score": score, "attestation": attestation})
        data = request(
            self._opts,
            RequestParams(
                method="POST",
                base_url=self._base_url,
                path="/v1/reputation/verify",
                body=body,
            ),
        )
        if data is None:
            raise RuntimeError("reputation.verify: empty response body")
        return from_wire(VerifyResponse, data)

    def submit_feedback(
        self,
        *,
        feedback_id: str,
        from_did: str,
        to_did: str,
        tx_id: str,
        rating: int,
        dimensions: FeedbackDimensions | dict[str, int],
        signed_at: str,
        signature: str,
        comment: str | None = None,
    ) -> FeedbackResponse:
        """``POST /v1/reputation/feedback``.

        Forwards a fully-formed signed feedback envelope to the service.
        """
        if isinstance(dimensions, FeedbackDimensions):
            dim_dict = {
                "delivery": dimensions.delivery,
                "quality": dimensions.quality,
                "communication": dimensions.communication,
            }
        else:
            dim_dict = dict(dimensions)
        body_in: dict[str, Any] = {
            "feedback_id": feedback_id,
            "from_did": from_did,
            "to_did": to_did,
            "tx_id": tx_id,
            "rating": rating,
            "dimensions": dim_dict,
            "signed_at": signed_at,
            "signature": signature,
        }
        if comment is not None:
            body_in["comment"] = comment
        data = request(
            self._opts,
            RequestParams(
                method="POST",
                base_url=self._base_url,
                path="/v1/reputation/feedback",
                body=to_wire(body_in),
            ),
        )
        if data is None:
            raise RuntimeError("reputation.submit_feedback: empty response body")
        return from_wire(FeedbackResponse, data)
