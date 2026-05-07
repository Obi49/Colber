# Copyright 2026 Colber Contributors
# SPDX-License-Identifier: Apache-2.0
"""Reputation service tools — read scores + submit feedback."""

from __future__ import annotations

from typing import Any, ClassVar

from pydantic import BaseModel, Field

from ._base import ColberToolBase


class ReputationScoreArgs(BaseModel):
    """Args model for :class:`ReputationScoreTool`."""

    did: str = Field(
        description=(
            "The agent ``did:key`` whose reputation score should be looked "
            "up. Returns the score envelope including the platform "
            "Ed25519 attestation."
        )
    )


class ReputationDimensionsModel(BaseModel):
    """Per-dimension feedback ratings (delivery, quality, communication)."""

    delivery: int = Field(
        description="Delivery rating (1..5).",
        ge=1,
        le=5,
    )
    quality: int = Field(
        description="Quality rating (1..5).",
        ge=1,
        le=5,
    )
    communication: int = Field(
        description="Communication rating (1..5).",
        ge=1,
        le=5,
    )


class ReputationFeedbackArgs(BaseModel):
    """Args model for :class:`ReputationFeedbackTool`."""

    feedback_id: str = Field(description="Globally unique feedback id (UUIDv4 recommended).")
    from_did: str = Field(description="DID of the feedback issuer.")
    to_did: str = Field(description="DID of the feedback recipient.")
    tx_id: str = Field(
        description="Reference to the off-platform transaction the feedback is about."
    )
    rating: int = Field(
        description="Overall rating (1..5).",
        ge=1,
        le=5,
    )
    dimensions: ReputationDimensionsModel = Field(
        description="Per-dimension ratings (delivery, quality, communication)."
    )
    signed_at: str = Field(
        description="ISO-8601 UTC timestamp the feedback envelope was signed at."
    )
    signature: str = Field(
        description=(
            "Ed25519 signature of the JCS canonical form of the feedback "
            "envelope, base64-encoded. Generated client-side using the "
            "issuer's secret key."
        )
    )
    comment: str | None = Field(
        default=None,
        description="Optional free-form comment (max 1024 chars).",
        max_length=1024,
    )


class ReputationScoreTool(ColberToolBase[ReputationScoreArgs]):
    """Read an agent's reputation score."""

    service_name: ClassVar[str] = "reputation"
    args_model: ClassVar[type[BaseModel]] = ReputationScoreArgs
    tool_name: ClassVar[str] = "colber_reputation_score"
    tool_description: ClassVar[str] = (
        "Look up an agent's current reputation score (0..1000). The response "
        "is a signed score envelope verifiable offline against the Colber "
        "platform Ed25519 public key. Use this before engaging in a "
        "high-stakes deal with an unknown counterparty."
    )

    def _call_colber(self, args: ReputationScoreArgs) -> Any:
        return self._client.reputation.score(did=args.did)


class ReputationFeedbackTool(ColberToolBase[ReputationFeedbackArgs]):
    """Submit signed feedback about a counterparty."""

    service_name: ClassVar[str] = "reputation"
    args_model: ClassVar[type[BaseModel]] = ReputationFeedbackArgs
    tool_name: ClassVar[str] = "colber_reputation_feedback"
    tool_description: ClassVar[str] = (
        "Submit a signed feedback record about a counterparty after a "
        "completed transaction. The envelope is Ed25519-signed against its "
        "JCS canonical form — generate the signature with the issuer's "
        "secret key before calling. Returns ``{accepted, idempotent, "
        "feedback_id}``."
    )

    def _call_colber(self, args: ReputationFeedbackArgs) -> Any:
        return self._client.reputation.submit_feedback(
            feedback_id=args.feedback_id,
            from_did=args.from_did,
            to_did=args.to_did,
            tx_id=args.tx_id,
            rating=args.rating,
            dimensions=args.dimensions.model_dump(),
            signed_at=args.signed_at,
            signature=args.signature,
            comment=args.comment,
        )


__all__ = [
    "ReputationDimensionsModel",
    "ReputationFeedbackArgs",
    "ReputationFeedbackTool",
    "ReputationScoreArgs",
    "ReputationScoreTool",
]
