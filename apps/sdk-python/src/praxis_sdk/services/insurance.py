"""``InsuranceService`` — typed client for the ``insurance`` service.

Mirror of ``apps/sdk-typescript/src/services/insurance.ts`` and
``apps/insurance/src/http/routes.ts``:

- ``POST /v1/insurance/quote``                                 (quote)
- ``POST /v1/insurance/subscribe``                             (subscribe — idempotent)
- ``POST /v1/insurance/claims``                                (claim — idempotent)
- ``GET  /v1/insurance/policies/:id``                          (status)
- ``GET  /v1/insurance/policies?subscriberDid=...``            (list)

The admin endpoint
``POST /v1/insurance/admin/escrow/:holdingId/transition`` is intentionally
NOT exposed by the SDK — it is gated server-side by
``INSURANCE_ADMIN_ENABLED=true`` and is only used by the e2e harness.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from urllib.parse import quote

from .._http import HttpClientOptions, RequestParams, request
from ._convert import from_wire, to_wire


@dataclass(frozen=True, slots=True)
class SlaTerms:
    delivery_window_hours: int
    requirements: list[str] | None = None


@dataclass(frozen=True, slots=True)
class QuoteView:
    subscriber_did: str
    beneficiary_did: str
    deal_subject: str
    amount_usdc: float
    premium_usdc: float
    risk_multiplier: float
    reputation_score: int
    computed_at: str
    valid_until: str


@dataclass(frozen=True, slots=True)
class PolicyView:
    id: str
    subscriber_did: str
    beneficiary_did: str
    deal_subject: str
    amount_usdc: float
    premium_usdc: float
    risk_multiplier: float
    reputation_score: int
    sla_terms: SlaTerms
    status: str
    created_at: str
    expires_at: str


@dataclass(frozen=True, slots=True)
class EscrowView:
    id: str
    policy_id: str
    amount_usdc: float
    status: str
    locked_at: str
    released_at: str | None = None
    claimed_at: str | None = None
    refunded_at: str | None = None


@dataclass(frozen=True, slots=True)
class ClaimView:
    id: str
    policy_id: str
    claimant_did: str
    reason: str
    evidence: dict[str, Any]
    status: str
    created_at: str
    decided_at: str | None = None
    payout_usdc: float | None = None


@dataclass(frozen=True, slots=True)
class PolicyDetailView:
    policy: PolicyView
    escrow: EscrowView
    claims: list[ClaimView] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class PolicyListView:
    policies: list[PolicyDetailView]
    total: int
    limit: int
    offset: int


class InsuranceService:
    """Typed client for the ``insurance`` service."""

    def __init__(self, opts: HttpClientOptions, base_url: str) -> None:
        self._opts = opts
        self._base_url = base_url

    def quote(
        self,
        *,
        subscriber_did: str,
        beneficiary_did: str,
        deal_subject: str,
        amount_usdc: float,
        sla_terms: dict[str, Any],
    ) -> QuoteView:
        """``POST /v1/insurance/quote``."""
        body = to_wire(
            {
                "subscriber_did": subscriber_did,
                "beneficiary_did": beneficiary_did,
                "deal_subject": deal_subject,
                "amount_usdc": amount_usdc,
                "sla_terms": sla_terms,
            }
        )
        data = request(
            self._opts,
            RequestParams(
                method="POST",
                base_url=self._base_url,
                path="/v1/insurance/quote",
                body=body,
            ),
        )
        if data is None:
            raise RuntimeError("insurance.quote: empty response body")
        return from_wire(QuoteView, data)

    def subscribe(
        self,
        *,
        subscriber_did: str,
        beneficiary_did: str,
        deal_subject: str,
        amount_usdc: float,
        sla_terms: dict[str, Any],
        idempotency_key: str,
    ) -> PolicyDetailView:
        """``POST /v1/insurance/subscribe`` — idempotent on ``idempotency_key``."""
        body = to_wire(
            {
                "subscriber_did": subscriber_did,
                "beneficiary_did": beneficiary_did,
                "deal_subject": deal_subject,
                "amount_usdc": amount_usdc,
                "sla_terms": sla_terms,
                "idempotency_key": idempotency_key,
            }
        )
        data = request(
            self._opts,
            RequestParams(
                method="POST",
                base_url=self._base_url,
                path="/v1/insurance/subscribe",
                body=body,
            ),
        )
        if data is None:
            raise RuntimeError("insurance.subscribe: empty response body")
        return from_wire(PolicyDetailView, data)

    def claim(
        self,
        *,
        policy_id: str,
        claimant_did: str,
        reason: str,
        evidence: dict[str, Any],
        idempotency_key: str,
    ) -> ClaimView:
        """``POST /v1/insurance/claims`` — idempotent on ``(policy_id, idempotency_key)``."""
        body = to_wire(
            {
                "policy_id": policy_id,
                "claimant_did": claimant_did,
                "reason": reason,
                "evidence": evidence,
                "idempotency_key": idempotency_key,
            }
        )
        data = request(
            self._opts,
            RequestParams(
                method="POST",
                base_url=self._base_url,
                path="/v1/insurance/claims",
                body=body,
            ),
        )
        if data is None:
            raise RuntimeError("insurance.claim: empty response body")
        return from_wire(ClaimView, data)

    def status(self, policy_id: str) -> PolicyDetailView:
        """``GET /v1/insurance/policies/:id``."""
        data = request(
            self._opts,
            RequestParams(
                method="GET",
                base_url=self._base_url,
                path=f"/v1/insurance/policies/{quote(policy_id, safe='')}",
            ),
        )
        if data is None:
            raise RuntimeError("insurance.status: empty response body")
        return from_wire(PolicyDetailView, data)

    def list(
        self,
        *,
        subscriber_did: str,
        limit: int | None = None,
        offset: int | None = None,
    ) -> PolicyListView:
        """``GET /v1/insurance/policies?subscriberDid=...&limit=...&offset=...``."""
        query: dict[str, str | int | float | bool | None] = {"subscriberDid": subscriber_did}
        if limit is not None:
            query["limit"] = limit
        if offset is not None:
            query["offset"] = offset
        data = request(
            self._opts,
            RequestParams(
                method="GET",
                base_url=self._base_url,
                path="/v1/insurance/policies",
                query=query,
            ),
        )
        if data is None:
            raise RuntimeError("insurance.list: empty response body")
        return from_wire(PolicyListView, data)
