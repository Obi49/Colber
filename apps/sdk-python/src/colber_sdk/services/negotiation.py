"""``NegotiationService`` — typed client for the ``negotiation`` service.

Mirror of ``apps/sdk-typescript/src/services/negotiation.ts`` and
``apps/negotiation/src/http/routes.ts``:

- ``POST /v1/negotiation``                     (start — idempotent)
- ``GET  /v1/negotiation/:id``                 (get)
- ``GET  /v1/negotiation/:id/history``         (history)
- ``POST /v1/negotiation/:id/propose``         (propose)
- ``POST /v1/negotiation/:id/counter``         (counter)
- ``POST /v1/negotiation/:id/settle``          (settle)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from urllib.parse import quote

from .._http import HttpClientOptions, RequestParams, request
from ._convert import from_wire, to_wire


@dataclass(frozen=True, slots=True)
class NegotiationProposalView:
    proposal_id: str
    from_did: str
    signature: str
    proposed_at: str
    amount: float | None = None
    scores: dict[str, float] | None = None
    payload: dict[str, Any] | None = None


@dataclass(frozen=True, slots=True)
class NegotiationTermsView:
    subject: str
    strategy: str
    party_dids: list[str]
    deadline: str
    constraints: dict[str, Any] = field(default_factory=dict)
    criteria: list[dict[str, Any]] | None = None
    reserve_price: float | None = None
    currency: str | None = None


@dataclass(frozen=True, slots=True)
class SettlementSignature:
    did: str
    signature: str


@dataclass(frozen=True, slots=True)
class NegotiationView:
    negotiation_id: str
    status: str
    strategy: str
    terms: NegotiationTermsView
    party_dids: list[str]
    proposals: list[NegotiationProposalView]
    created_at: str
    updated_at: str
    expires_at: str
    current_best_proposal_id: str | None = None
    winning_proposal_id: str | None = None
    settlement_signatures: list[SettlementSignature] | None = None


@dataclass(frozen=True, slots=True)
class HistoryEvent:
    seq: int
    event: dict[str, Any]


@dataclass(frozen=True, slots=True)
class HistoryView:
    events: list[HistoryEvent] = field(default_factory=list)
    next_cursor: int | None = None


class NegotiationService:
    """Typed client for the ``negotiation`` service."""

    def __init__(self, opts: HttpClientOptions, base_url: str) -> None:
        self._opts = opts
        self._base_url = base_url

    def start(
        self,
        *,
        terms: dict[str, Any],
        created_by: str,
        idempotency_key: str,
    ) -> NegotiationView:
        """``POST /v1/negotiation`` — idempotent on ``idempotency_key``.

        ``idempotency_key`` is required (the service treats start as
        idempotent on this key — generation is the caller's responsibility).
        """
        body_in: dict[str, Any] = {
            "terms": terms,
            "created_by": created_by,
            "idempotency_key": idempotency_key,
        }
        data = request(
            self._opts,
            RequestParams(
                method="POST",
                base_url=self._base_url,
                path="/v1/negotiation",
                body=to_wire(body_in),
            ),
        )
        if data is None:
            raise RuntimeError("negotiation.start: empty response body")
        return from_wire(NegotiationView, data)

    def get(self, negotiation_id: str) -> NegotiationView:
        """``GET /v1/negotiation/:id``."""
        data = request(
            self._opts,
            RequestParams(
                method="GET",
                base_url=self._base_url,
                path=f"/v1/negotiation/{quote(negotiation_id, safe='')}",
            ),
        )
        if data is None:
            raise RuntimeError("negotiation.get: empty response body")
        return from_wire(NegotiationView, data)

    def history(
        self,
        *,
        negotiation_id: str,
        cursor: int | None = None,
        limit: int | None = None,
    ) -> HistoryView:
        """``GET /v1/negotiation/:id/history?cursor=...&limit=...``."""
        query: dict[str, str | int | float | bool | None] = {}
        if cursor is not None:
            query["cursor"] = cursor
        if limit is not None:
            query["limit"] = limit
        data = request(
            self._opts,
            RequestParams(
                method="GET",
                base_url=self._base_url,
                path=f"/v1/negotiation/{quote(negotiation_id, safe='')}/history",
                query=query if query else None,
            ),
        )
        if data is None:
            raise RuntimeError("negotiation.history: empty response body")
        return from_wire(HistoryView, data)

    def propose(
        self,
        *,
        negotiation_id: str,
        proposal: dict[str, Any],
        public_key: str,
    ) -> NegotiationView:
        """``POST /v1/negotiation/:id/propose``."""
        body = to_wire({"proposal": proposal, "public_key": public_key})
        data = request(
            self._opts,
            RequestParams(
                method="POST",
                base_url=self._base_url,
                path=f"/v1/negotiation/{quote(negotiation_id, safe='')}/propose",
                body=body,
            ),
        )
        if data is None:
            raise RuntimeError("negotiation.propose: empty response body")
        return from_wire(NegotiationView, data)

    def counter(
        self,
        *,
        negotiation_id: str,
        counter_to: str,
        proposal: dict[str, Any],
        public_key: str,
    ) -> NegotiationView:
        """``POST /v1/negotiation/:id/counter``."""
        body = to_wire({"counter_to": counter_to, "proposal": proposal, "public_key": public_key})
        data = request(
            self._opts,
            RequestParams(
                method="POST",
                base_url=self._base_url,
                path=f"/v1/negotiation/{quote(negotiation_id, safe='')}/counter",
                body=body,
            ),
        )
        if data is None:
            raise RuntimeError("negotiation.counter: empty response body")
        return from_wire(NegotiationView, data)

    def settle(
        self,
        *,
        negotiation_id: str,
        signatures: list[dict[str, str]],
        public_keys: list[dict[str, str]],
        winning_proposal_id: str | None = None,
    ) -> NegotiationView:
        """``POST /v1/negotiation/:id/settle``."""
        body_in: dict[str, Any] = {"signatures": signatures, "public_keys": public_keys}
        if winning_proposal_id is not None:
            body_in["winning_proposal_id"] = winning_proposal_id
        data = request(
            self._opts,
            RequestParams(
                method="POST",
                base_url=self._base_url,
                path=f"/v1/negotiation/{quote(negotiation_id, safe='')}/settle",
                body=to_wire(body_in),
            ),
        )
        if data is None:
            raise RuntimeError("negotiation.settle: empty response body")
        return from_wire(NegotiationView, data)
