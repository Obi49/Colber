# Copyright 2026 Colber Contributors
# SPDX-License-Identifier: Apache-2.0
"""Insurance service tools — quote, subscribe, claim."""

from __future__ import annotations

from typing import Any, ClassVar

from pydantic import BaseModel, Field

from ._base import ColberToolBase


class InsuranceSlaTermsModel(BaseModel):
    """SLA terms — delivery window + optional contractual requirements."""

    delivery_window_hours: int = Field(
        description="Maximum number of hours between subscription and delivery.",
        gt=0,
        le=24 * 365,
    )
    requirements: list[str] | None = Field(
        default=None,
        description="Optional list of free-form contractual requirements.",
    )


class InsuranceQuoteArgs(BaseModel):
    """Args model for :class:`InsuranceQuoteTool`."""

    subscriber_did: str = Field(description="DID of the policy subscriber.")
    beneficiary_did: str = Field(
        description="DID of the policy beneficiary (typically the seller).",
    )
    deal_subject: str = Field(
        description="Free-form subject describing the deal being insured.",
        min_length=1,
        max_length=512,
    )
    amount_usdc: float = Field(
        description="Insured amount, in USDC (non-negative; integer-valued recommended).",
    )
    # No client-side ``ge=0`` constraint here on purpose: the colber-insurance
    # service is the authority for validation and returns a structured 400
    # with the canonical error code/message that the agent can surface back
    # to the LLM. Duplicating the check in pydantic would short-circuit that
    # flow with a less actionable ``ValidationError``.
    sla_terms: InsuranceSlaTermsModel = Field(
        description="SLA terms — delivery window + optional requirements list."
    )


class InsuranceSubscribeArgs(InsuranceQuoteArgs):
    """Args model for :class:`InsuranceSubscribeTool`."""

    idempotency_key: str = Field(
        description=(
            "Idempotency key for the subscribe call (UUIDv4 recommended). "
            "Replays return the same policy id."
        )
    )


class InsuranceClaimArgs(BaseModel):
    """Args model for :class:`InsuranceClaimTool`."""

    policy_id: str = Field(description="Policy to file a claim against.")
    claimant_did: str = Field(description="DID of the party filing the claim.")
    reason: str = Field(
        description="Short reason summary for the claim.",
        min_length=1,
        max_length=512,
    )
    evidence: dict[str, Any] = Field(
        default_factory=dict,
        description="Free-form evidence payload supporting the claim.",
    )
    idempotency_key: str = Field(description="Idempotency key (UUIDv4 recommended).")


class InsuranceQuoteTool(ColberToolBase[InsuranceQuoteArgs]):
    """Quote an insurance premium without subscribing."""

    service_name: ClassVar[str] = "insurance"
    args_model: ClassVar[type[BaseModel]] = InsuranceQuoteArgs
    tool_name: ClassVar[str] = "colber_insurance_quote"
    tool_description: ClassVar[str] = (
        "Compute an insurance premium for a deal without committing to a "
        "policy. The premium depends on the insured amount, the seller's "
        "reputation score, and the SLA window. Use this to inform "
        "negotiation before calling ``colber_insurance_subscribe``."
    )

    def _call_colber(self, args: InsuranceQuoteArgs) -> Any:
        sla_payload = args.sla_terms.model_dump(exclude_none=True)
        return self._client.insurance.quote(
            subscriber_did=args.subscriber_did,
            beneficiary_did=args.beneficiary_did,
            deal_subject=args.deal_subject,
            amount_usdc=float(args.amount_usdc),
            sla_terms=sla_payload,
        )


class InsuranceSubscribeTool(ColberToolBase[InsuranceSubscribeArgs]):
    """Subscribe to an insurance policy and lock the escrow."""

    service_name: ClassVar[str] = "insurance"
    args_model: ClassVar[type[BaseModel]] = InsuranceSubscribeArgs
    tool_name: ClassVar[str] = "colber_insurance_subscribe"
    tool_description: ClassVar[str] = (
        "Subscribe to an insurance policy for a deal. Locks the premium in "
        "escrow until delivery (or claim). Idempotent on "
        "``idempotency_key`` — replays return the same policy id. Returns "
        "the policy + escrow records."
    )

    def _call_colber(self, args: InsuranceSubscribeArgs) -> Any:
        sla_payload = args.sla_terms.model_dump(exclude_none=True)
        return self._client.insurance.subscribe(
            subscriber_did=args.subscriber_did,
            beneficiary_did=args.beneficiary_did,
            deal_subject=args.deal_subject,
            amount_usdc=float(args.amount_usdc),
            sla_terms=sla_payload,
            idempotency_key=args.idempotency_key,
        )


class InsuranceClaimTool(ColberToolBase[InsuranceClaimArgs]):
    """File a claim against an active policy."""

    service_name: ClassVar[str] = "insurance"
    args_model: ClassVar[type[BaseModel]] = InsuranceClaimArgs
    tool_name: ClassVar[str] = "colber_insurance_claim"
    tool_description: ClassVar[str] = (
        "File a claim against an active insurance policy. Submits a "
        "claimant DID, free-form reason, and evidence payload. Idempotent "
        "on ``(policy_id, idempotency_key)`` — replays return the same "
        "claim record."
    )

    def _call_colber(self, args: InsuranceClaimArgs) -> Any:
        return self._client.insurance.claim(
            policy_id=args.policy_id,
            claimant_did=args.claimant_did,
            reason=args.reason,
            evidence=dict(args.evidence),
            idempotency_key=args.idempotency_key,
        )


__all__ = [
    "InsuranceClaimArgs",
    "InsuranceClaimTool",
    "InsuranceQuoteArgs",
    "InsuranceQuoteTool",
    "InsuranceSlaTermsModel",
    "InsuranceSubscribeArgs",
    "InsuranceSubscribeTool",
]
