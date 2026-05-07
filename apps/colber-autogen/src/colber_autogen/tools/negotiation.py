# Copyright 2026 Colber Contributors
# SPDX-License-Identifier: Apache-2.0
"""Negotiation service tools — start, propose, counter, settle."""

from __future__ import annotations

from typing import Any, ClassVar

from pydantic import BaseModel, Field

from ._base import ColberToolBase


class NegotiationStartArgs(BaseModel):
    """Args model for :class:`NegotiationStartTool`."""

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


class NegotiationProposeArgs(BaseModel):
    """Args model for :class:`NegotiationProposeTool`."""

    negotiation_id: str = Field(description="Negotiation to propose against.")
    proposal: dict[str, Any] = Field(
        description=(
            "Signed proposal envelope: ``{proposalId, fromDid, amount (int "
            "cents), signature, proposedAt}``. The signature covers the JCS "
            "canonical form of the envelope."
        )
    )
    public_key: str = Field(description="Base64 Ed25519 public key of ``fromDid``.")


class NegotiationCounterArgs(BaseModel):
    """Args model for :class:`NegotiationCounterTool`."""

    negotiation_id: str = Field(description="Negotiation to counter against.")
    counter_to: str = Field(description="``proposalId`` being countered.")
    proposal: dict[str, Any] = Field(
        description=("Signed counter-proposal envelope (same shape as ``propose``).")
    )
    public_key: str = Field(description="Base64 Ed25519 public key of the proposer.")


class NegotiationSettleArgs(BaseModel):
    """Args model for :class:`NegotiationSettleTool`."""

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


class NegotiationStartTool(ColberToolBase[NegotiationStartArgs]):
    """Open a new multi-party negotiation."""

    service_name: ClassVar[str] = "negotiation"
    args_model: ClassVar[type[BaseModel]] = NegotiationStartArgs
    tool_name: ClassVar[str] = "colber_negotiation_start"
    tool_description: ClassVar[str] = (
        "Open a new multi-party negotiation with explicit terms (subject, "
        "strategy, deadline, currency, reservePrice in integer cents). "
        "Idempotent on ``idempotency_key``. Returns the negotiation record "
        "with ``negotiation_id``."
    )

    def _call_colber(self, args: NegotiationStartArgs) -> Any:
        return self._client.negotiation.start(
            terms=dict(args.terms),
            created_by=args.created_by,
            idempotency_key=args.idempotency_key,
        )


class NegotiationProposeTool(ColberToolBase[NegotiationProposeArgs]):
    """Submit a signed proposal to an open negotiation."""

    service_name: ClassVar[str] = "negotiation"
    args_model: ClassVar[type[BaseModel]] = NegotiationProposeArgs
    tool_name: ClassVar[str] = "colber_negotiation_propose"
    tool_description: ClassVar[str] = (
        "Submit a signed proposal to an open negotiation. The proposal "
        "envelope must include an Ed25519 signature over its JCS canonical "
        "form, and integer-cent amounts (never floats). Returns the updated "
        "negotiation record."
    )

    def _call_colber(self, args: NegotiationProposeArgs) -> Any:
        return self._client.negotiation.propose(
            negotiation_id=args.negotiation_id,
            proposal=dict(args.proposal),
            public_key=args.public_key,
        )


class NegotiationCounterTool(ColberToolBase[NegotiationCounterArgs]):
    """Counter an existing proposal."""

    service_name: ClassVar[str] = "negotiation"
    args_model: ClassVar[type[BaseModel]] = NegotiationCounterArgs
    tool_name: ClassVar[str] = "colber_negotiation_counter"
    tool_description: ClassVar[str] = (
        "Counter an existing proposal in an open negotiation. Same envelope "
        "+ signature requirements as ``colber_negotiation_propose``. Use "
        "``counter_to`` to point at the proposal id you're countering."
    )

    def _call_colber(self, args: NegotiationCounterArgs) -> Any:
        return self._client.negotiation.counter(
            negotiation_id=args.negotiation_id,
            counter_to=args.counter_to,
            proposal=dict(args.proposal),
            public_key=args.public_key,
        )


class NegotiationSettleTool(ColberToolBase[NegotiationSettleArgs]):
    """Settle a negotiation by submitting signatures from every party."""

    service_name: ClassVar[str] = "negotiation"
    args_model: ClassVar[type[BaseModel]] = NegotiationSettleArgs
    tool_name: ClassVar[str] = "colber_negotiation_settle"
    tool_description: ClassVar[str] = (
        "Settle a negotiation. Provide one signature per party (each over "
        "``{negotiationId, winningProposalId}`` in JCS) plus the matching "
        "public keys. The service verifies every signature against the "
        "stored agent identities."
    )

    def _call_colber(self, args: NegotiationSettleArgs) -> Any:
        signatures = [{str(k): str(v) for k, v in dict(sig).items()} for sig in args.signatures]
        public_keys = [{str(k): str(v) for k, v in dict(pk).items()} for pk in args.public_keys]
        return self._client.negotiation.settle(
            negotiation_id=args.negotiation_id,
            signatures=signatures,
            public_keys=public_keys,
            winning_proposal_id=args.winning_proposal_id,
        )


__all__ = [
    "NegotiationCounterArgs",
    "NegotiationCounterTool",
    "NegotiationProposeArgs",
    "NegotiationProposeTool",
    "NegotiationSettleArgs",
    "NegotiationSettleTool",
    "NegotiationStartArgs",
    "NegotiationStartTool",
]
