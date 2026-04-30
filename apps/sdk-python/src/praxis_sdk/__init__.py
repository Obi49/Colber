"""``praxis_sdk`` — official Python SDK for the Praxis platform.

Mirror of ``@praxis/sdk@0.1.0`` (TypeScript). Same surface, same wire
format, same crypto vectors. Synchronous-only in v0.1.0.

Example:
    >>> from praxis_sdk import PraxisClient
    >>> from praxis_sdk.crypto import generate_did_key
    >>> client = PraxisClient.local()
    >>> keys = generate_did_key()
"""

from __future__ import annotations

from .client import (
    DEFAULT_INGRESS_PATHS,
    DEFAULT_LOCAL_PORTS,
    PraxisClient,
)
from .envelope import is_error_envelope, is_ok_envelope
from .errors import (
    PraxisApiError,
    PraxisError,
    PraxisNetworkError,
    PraxisNetworkErrorCode,
    PraxisValidationError,
)
from .services.identity import (
    IdentityService,
    RegisterResponse,
    ResolveResponse,
)
from .services.identity import VerifyResponse as IdentityVerifyResponse
from .services.insurance import (
    ClaimView,
    EscrowView,
    InsuranceService,
    PolicyDetailView,
    PolicyListView,
    PolicyView,
    QuoteView,
    SlaTerms,
)
from .services.memory import (
    EmbeddingMeta,
    MemoryRecord,
    MemoryService,
    SearchHit,
    SearchResponse,
    ShareResponse,
    StoreResponse,
    UpdateResponse,
)
from .services.negotiation import (
    HistoryEvent,
    HistoryView,
    NegotiationProposalView,
    NegotiationService,
    NegotiationTermsView,
    NegotiationView,
    SettlementSignature,
)
from .services.observability import (
    AlertListResponse,
    AlertRule,
    IngestRejection,
    IngestResponse,
    ObservabilityService,
    QueryResponse,
    QueryRow,
)
from .services.reputation import (
    FeedbackDimensions,
    FeedbackResponse,
    HistoryIssuedFeedback,
    HistoryReceivedFeedback,
    HistoryResponse,
    HistoryTransaction,
    ReputationService,
    SignedScoreEnvelope,
)
from .services.reputation import VerifyResponse as ReputationVerifyResponse
from .types import BaseUrls, IdempotentOptions, RetryConfig, ServiceName

__version__ = "0.1.0"

__all__ = [
    "DEFAULT_INGRESS_PATHS",
    "DEFAULT_LOCAL_PORTS",
    # Observability
    "AlertListResponse",
    "AlertRule",
    # Types
    "BaseUrls",
    # Insurance
    "ClaimView",
    # Memory
    "EmbeddingMeta",
    "EscrowView",
    # Reputation
    "FeedbackDimensions",
    "FeedbackResponse",
    # Negotiation
    "HistoryEvent",
    "HistoryIssuedFeedback",
    "HistoryReceivedFeedback",
    "HistoryResponse",
    "HistoryTransaction",
    "HistoryView",
    "IdempotentOptions",
    # Identity
    "IdentityService",
    "IdentityVerifyResponse",
    "IngestRejection",
    "IngestResponse",
    "InsuranceService",
    "MemoryRecord",
    "MemoryService",
    "NegotiationProposalView",
    "NegotiationService",
    "NegotiationTermsView",
    "NegotiationView",
    "ObservabilityService",
    "PolicyDetailView",
    "PolicyListView",
    "PolicyView",
    # Errors
    "PraxisApiError",
    # Client
    "PraxisClient",
    "PraxisError",
    "PraxisNetworkError",
    "PraxisNetworkErrorCode",
    "PraxisValidationError",
    "QueryResponse",
    "QueryRow",
    "QuoteView",
    "RegisterResponse",
    "ReputationService",
    "ReputationVerifyResponse",
    "ResolveResponse",
    "RetryConfig",
    "SearchHit",
    "SearchResponse",
    "ServiceName",
    "SettlementSignature",
    "ShareResponse",
    "SignedScoreEnvelope",
    "SlaTerms",
    "StoreResponse",
    "UpdateResponse",
    # Envelope guards
    "is_error_envelope",
    "is_ok_envelope",
]
