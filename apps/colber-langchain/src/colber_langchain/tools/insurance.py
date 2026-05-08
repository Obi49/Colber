"""Insurance service tools — quote, subscribe, claim."""

from __future__ import annotations

from typing import Any, ClassVar

from pydantic import BaseModel, Field

from ._base import ColberToolBase


class _SlaTermsModel(BaseModel):
    delivery_window_hours: int = Field(
        description="Maximum number of hours between subscription and delivery.",
        gt=0,
        le=24 * 365,
    )
    requirements: list[str] | None = Field(
        default=None,
        description="Optional list of free-form contractual requirements.",
    )


class _QuoteArgs(BaseModel):
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
        description="Insured amount, in USDC (integer-valued recommended).",
        ge=0,
    )
    sla_terms: _SlaTermsModel = Field(
        description="SLA terms — delivery window + optional requirements list."
    )


class _SubscribeArgs(_QuoteArgs):
    idempotency_key: str = Field(
        description=(
            "Idempotency key for the subscribe call (UUIDv4 recommended). "
            "Replays return the same policy id."
        )
    )


class _ClaimArgs(BaseModel):
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


class InsuranceQuoteTool(ColberToolBase):
    """Quote an insurance premium without subscribing."""

    service_name: ClassVar[str] = "insurance"

    name: str = "colber_insurance_quote"
    description: str = (
        "Compute an insurance premium for a deal without committing to a "
        "policy. The premium depends on the insured amount, the seller's "
        "reputation score, and the SLA window. Use this to inform "
        "negotiation before calling ``colber_insurance_subscribe``."
    )
    args_schema: type[BaseModel] = _QuoteArgs

    def _call_colber(self, **kwargs: Any) -> Any:
        sla_terms = kwargs["sla_terms"]
        sla_payload = (
            sla_terms.model_dump(exclude_none=True)
            if isinstance(sla_terms, _SlaTermsModel)
            else dict(sla_terms)
        )
        return self._client.insurance.quote(
            subscriber_did=str(kwargs["subscriber_did"]),
            beneficiary_did=str(kwargs["beneficiary_did"]),
            deal_subject=str(kwargs["deal_subject"]),
            amount_usdc=float(kwargs["amount_usdc"]),
            sla_terms=sla_payload,
        )


class InsuranceSubscribeTool(ColberToolBase):
    """Subscribe to an insurance policy and lock the escrow."""

    service_name: ClassVar[str] = "insurance"

    name: str = "colber_insurance_subscribe"
    description: str = (
        "Subscribe to an insurance policy for a deal. Locks the premium in "
        "escrow until delivery (or claim). Idempotent on "
        "``idempotency_key`` — replays return the same policy id. Returns "
        "the policy + escrow records."
    )
    args_schema: type[BaseModel] = _SubscribeArgs

    def _call_colber(self, **kwargs: Any) -> Any:
        sla_terms = kwargs["sla_terms"]
        sla_payload = (
            sla_terms.model_dump(exclude_none=True)
            if isinstance(sla_terms, _SlaTermsModel)
            else dict(sla_terms)
        )
        return self._client.insurance.subscribe(
            subscriber_did=str(kwargs["subscriber_did"]),
            beneficiary_did=str(kwargs["beneficiary_did"]),
            deal_subject=str(kwargs["deal_subject"]),
            amount_usdc=float(kwargs["amount_usdc"]),
            sla_terms=sla_payload,
            idempotency_key=str(kwargs["idempotency_key"]),
        )


class InsuranceClaimTool(ColberToolBase):
    """File a claim against an active policy."""

    service_name: ClassVar[str] = "insurance"

    name: str = "colber_insurance_claim"
    description: str = (
        "File a claim against an active insurance policy. Submits a "
        "claimant DID, free-form reason, and evidence payload. Idempotent "
        "on ``(policy_id, idempotency_key)`` — replays return the same "
        "claim record."
    )
    args_schema: type[BaseModel] = _ClaimArgs

    def _call_colber(self, **kwargs: Any) -> Any:
        evidence = kwargs.get("evidence") or {}
        return self._client.insurance.claim(
            policy_id=str(kwargs["policy_id"]),
            claimant_did=str(kwargs["claimant_did"]),
            reason=str(kwargs["reason"]),
            evidence=dict(evidence),
            idempotency_key=str(kwargs["idempotency_key"]),
        )


__all__ = [
    "InsuranceClaimTool",
    "InsuranceQuoteTool",
    "InsuranceSubscribeTool",
]
