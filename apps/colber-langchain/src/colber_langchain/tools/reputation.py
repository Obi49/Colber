"""Reputation service tools — read scores + submit feedback."""

from __future__ import annotations

from typing import Any, ClassVar

from pydantic import BaseModel, Field

from ._base import ColberToolBase


class _ScoreArgs(BaseModel):
    did: str = Field(
        description=(
            "The agent ``did:key`` whose reputation score should be looked "
            "up. Returns the score envelope including the platform "
            "Ed25519 attestation."
        )
    )


class _DimensionsModel(BaseModel):
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


class _FeedbackArgs(BaseModel):
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
    dimensions: _DimensionsModel = Field(
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


class ReputationScoreTool(ColberToolBase):
    """Read an agent's reputation score."""

    service_name: ClassVar[str] = "reputation"

    name: str = "colber_reputation_score"
    description: str = (
        "Look up an agent's current reputation score (0..1000). The response "
        "is a signed score envelope verifiable offline against the Colber "
        "platform Ed25519 public key. Use this before engaging in a "
        "high-stakes deal with an unknown counterparty."
    )
    args_schema: type[BaseModel] = _ScoreArgs

    def _call_colber(self, **kwargs: Any) -> Any:
        return self._client.reputation.score(did=str(kwargs["did"]))


class ReputationFeedbackTool(ColberToolBase):
    """Submit signed feedback about a counterparty."""

    service_name: ClassVar[str] = "reputation"

    name: str = "colber_reputation_feedback"
    description: str = (
        "Submit a signed feedback record about a counterparty after a "
        "completed transaction. The envelope is Ed25519-signed against its "
        "JCS canonical form — generate the signature with the issuer's "
        "secret key before calling. Returns ``{accepted, idempotent, "
        "feedback_id}``."
    )
    args_schema: type[BaseModel] = _FeedbackArgs

    def _call_colber(self, **kwargs: Any) -> Any:
        dimensions = kwargs["dimensions"]
        if isinstance(dimensions, _DimensionsModel):
            dim_payload = dimensions.model_dump()
        else:
            dim_payload = dict(dimensions)
        return self._client.reputation.submit_feedback(
            feedback_id=str(kwargs["feedback_id"]),
            from_did=str(kwargs["from_did"]),
            to_did=str(kwargs["to_did"]),
            tx_id=str(kwargs["tx_id"]),
            rating=int(kwargs["rating"]),
            dimensions=dim_payload,
            signed_at=str(kwargs["signed_at"]),
            signature=str(kwargs["signature"]),
            comment=(str(kwargs["comment"]) if kwargs.get("comment") is not None else None),
        )


__all__ = ["ReputationFeedbackTool", "ReputationScoreTool"]
