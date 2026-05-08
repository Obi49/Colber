"""Negotiation service tools — start, propose, counter, settle."""

from __future__ import annotations

from typing import Any, ClassVar

from pydantic import BaseModel, Field

from ._base import ColberToolBase


class _StartArgs(BaseModel):
    terms: dict[str, Any] = Field(
        description=(
            "Negotiation terms: ``{subject, strategy, partyDids, deadline, "
            "constraints, currency, reservePrice?}``. ``reservePrice`` and "
            "monetary fields must be **integer cents** (no floats — JCS "
            "canonicalisation can't safely round-trip floats)."
        )
    )
    created_by: str = Field(description="DID of the party opening the negotiation.")
    idempotency_key: str = Field(
        description=(
            "Idempotency key for the start call (UUIDv4 recommended). "
            "Replays return the same negotiation id."
        )
    )


class _ProposeArgs(BaseModel):
    negotiation_id: str = Field(description="Negotiation to propose against.")
    proposal: dict[str, Any] = Field(
        description=(
            "Signed proposal envelope: ``{proposalId, fromDid, amount (int "
            "cents), signature, proposedAt}``. The signature covers the JCS "
            "canonical form of the envelope."
        )
    )
    public_key: str = Field(description="Base64 Ed25519 public key of ``fromDid``.")


class _CounterArgs(BaseModel):
    negotiation_id: str = Field(description="Negotiation to counter against.")
    counter_to: str = Field(description="``proposalId`` being countered.")
    proposal: dict[str, Any] = Field(
        description=("Signed counter-proposal envelope (same shape as ``propose``).")
    )
    public_key: str = Field(description="Base64 Ed25519 public key of the proposer.")


class _SettleArgs(BaseModel):
    negotiation_id: str = Field(description="Negotiation to settle.")
    signatures: list[dict[str, str]] = Field(
        description=(
            "List of ``{did, signature}`` objects, one per party. The "
            "signature covers ``{negotiationId, winningProposalId}`` in JCS."
        ),
        min_length=1,
    )
    public_keys: list[dict[str, str]] = Field(
        description=(
            "List of ``{did, publicKey}`` objects so the service can verify each signature."
        ),
        min_length=1,
    )
    winning_proposal_id: str | None = Field(
        default=None,
        description=(
            "The ``proposalId`` everyone agrees on. Optional — if omitted, "
            "the service picks ``current_best_proposal_id``."
        ),
    )


class NegotiationStartTool(ColberToolBase):
    """Open a new multi-party negotiation."""

    service_name: ClassVar[str] = "negotiation"

    name: str = "colber_negotiation_start"
    description: str = (
        "Open a new multi-party negotiation with explicit terms (subject, "
        "strategy, deadline, currency, reservePrice in integer cents). "
        "Idempotent on ``idempotency_key``. Returns the negotiation record "
        "with ``negotiation_id``."
    )
    args_schema: type[BaseModel] = _StartArgs

    def _call_colber(self, **kwargs: Any) -> Any:
        return self._client.negotiation.start(
            terms=dict(kwargs["terms"]),
            created_by=str(kwargs["created_by"]),
            idempotency_key=str(kwargs["idempotency_key"]),
        )


class NegotiationProposeTool(ColberToolBase):
    """Submit a signed proposal to an open negotiation."""

    service_name: ClassVar[str] = "negotiation"

    name: str = "colber_negotiation_propose"
    description: str = (
        "Submit a signed proposal to an open negotiation. The proposal "
        "envelope must include an Ed25519 signature over its JCS canonical "
        "form, and integer-cent amounts (never floats). Returns the updated "
        "negotiation record."
    )
    args_schema: type[BaseModel] = _ProposeArgs

    def _call_colber(self, **kwargs: Any) -> Any:
        return self._client.negotiation.propose(
            negotiation_id=str(kwargs["negotiation_id"]),
            proposal=dict(kwargs["proposal"]),
            public_key=str(kwargs["public_key"]),
        )


class NegotiationCounterTool(ColberToolBase):
    """Counter an existing proposal."""

    service_name: ClassVar[str] = "negotiation"

    name: str = "colber_negotiation_counter"
    description: str = (
        "Counter an existing proposal in an open negotiation. Same envelope "
        "+ signature requirements as ``colber_negotiation_propose``. Use "
        "``counter_to`` to point at the proposal id you're countering."
    )
    args_schema: type[BaseModel] = _CounterArgs

    def _call_colber(self, **kwargs: Any) -> Any:
        return self._client.negotiation.counter(
            negotiation_id=str(kwargs["negotiation_id"]),
            counter_to=str(kwargs["counter_to"]),
            proposal=dict(kwargs["proposal"]),
            public_key=str(kwargs["public_key"]),
        )


class NegotiationSettleTool(ColberToolBase):
    """Settle a negotiation by submitting signatures from every party."""

    service_name: ClassVar[str] = "negotiation"

    name: str = "colber_negotiation_settle"
    description: str = (
        "Settle a negotiation. Provide one signature per party (each over "
        "``{negotiationId, winningProposalId}`` in JCS) plus the matching "
        "public keys. The service verifies every signature against the "
        "stored agent identities."
    )
    args_schema: type[BaseModel] = _SettleArgs

    def _call_colber(self, **kwargs: Any) -> Any:
        signatures_raw = kwargs["signatures"]
        public_keys_raw = kwargs["public_keys"]
        signatures = [{str(k): str(v) for k, v in dict(sig).items()} for sig in signatures_raw]
        public_keys = [{str(k): str(v) for k, v in dict(pk).items()} for pk in public_keys_raw]
        winning = kwargs.get("winning_proposal_id")
        return self._client.negotiation.settle(
            negotiation_id=str(kwargs["negotiation_id"]),
            signatures=signatures,
            public_keys=public_keys,
            winning_proposal_id=(str(winning) if winning is not None else None),
        )


__all__ = [
    "NegotiationCounterTool",
    "NegotiationProposeTool",
    "NegotiationSettleTool",
    "NegotiationStartTool",
]
