/**
 * `@praxis/sdk` — public surface.
 *
 * Crypto helpers (DID:key, signing, JCS) are exported from `@praxis/sdk/crypto`
 * (see `src/crypto/index.ts`). This entry point covers the typed REST client.
 */

// Client + factories
export {
  PraxisClient,
  type PraxisClientOptions,
  DEFAULT_LOCAL_PORTS,
  DEFAULT_INGRESS_PATHS,
} from './client.js';

// Types shared across services
export type { BaseUrls, IdempotentOptions, ServiceName } from './types.js';

// HTTP layer types (advanced — exposing for tests + tooling)
export type { FetchLike, HttpClientOptions, RetryConfig } from './http.js';

// Errors
export {
  PraxisError,
  PraxisApiError,
  PraxisNetworkError,
  PraxisValidationError,
  type PraxisApiErrorInit,
  type PraxisNetworkErrorCode,
  type PraxisNetworkErrorInit,
} from './errors.js';

// Envelope (advanced — useful for callers that proxy responses)
export {
  isErrorEnvelope,
  isOkEnvelope,
  type ApiErrorBody,
  type Envelope,
  type ErrorEnvelope,
  type OkEnvelope,
} from './envelope.js';

// Per-service classes + their request/response types
export {
  IdentityService,
  type RegisterRequest as IdentityRegisterRequest,
  type RegisterResponse as IdentityRegisterResponse,
  type ResolveResponse as IdentityResolveResponse,
  type VerifyRequest as IdentityVerifyRequest,
  type VerifyResponse as IdentityVerifyResponse,
} from './services/identity.js';

export {
  ReputationService,
  type FeedbackDimensions,
  type FeedbackRequest as ReputationFeedbackRequest,
  type FeedbackResponse as ReputationFeedbackResponse,
  type HistoryIssuedFeedback,
  type HistoryReceivedFeedback,
  type HistoryRequest as ReputationHistoryRequest,
  type HistoryResponse as ReputationHistoryResponse,
  type HistoryTransaction,
  type ScoreRequest as ReputationScoreRequest,
  type SignedScoreEnvelope,
  type VerifyRequest as ReputationVerifyRequest,
  type VerifyResponse as ReputationVerifyResponse,
} from './services/reputation.js';

export {
  MemoryService,
  type EmbeddingMeta,
  type MemoryRecord,
  type MemoryType,
  type Permissions,
  type RetrieveRequest as MemoryRetrieveRequest,
  type SearchFilters,
  type SearchHit,
  type SearchRequest as MemorySearchRequest,
  type SearchResponse as MemorySearchResponse,
  type ShareRequest as MemoryShareRequest,
  type ShareResponse as MemoryShareResponse,
  type StoreRequest as MemoryStoreRequest,
  type StoreResponse as MemoryStoreResponse,
  type UpdateRequest as MemoryUpdateRequest,
  type UpdateResponse as MemoryUpdateResponse,
  type Visibility,
} from './services/memory.js';

export {
  ObservabilityService,
  type AlertCombinator,
  type AlertCondition,
  type AlertCreateRequest,
  type AlertListResponse,
  type AlertRule,
  type AlertScope,
  type AlertUpdateRequest,
  type FilterOperator,
  type FilterValue,
  type IngestLogsRequest,
  type IngestResponse,
  type IngestSpansRequest,
  type NotificationChannel,
  type NotificationConfig,
  type QueryFilter,
  type QueryRequest as ObservabilityQueryRequest,
  type QueryResponse as ObservabilityQueryResponse,
  type QueryRow,
} from './services/observability.js';

export {
  NegotiationService,
  type AttributeValue,
  type CounterRequest as NegotiationCounterRequest,
  type CriterionWeight,
  type HistoryRequest as NegotiationHistoryRequest,
  type HistoryView as NegotiationHistoryView,
  type NegotiationTerms,
  type NegotiationView,
  type ProposalInput,
  type ProposeRequest as NegotiationProposeRequest,
  type SettlePublicKey,
  type SettleRequest as NegotiationSettleRequest,
  type SettleSignature,
  type StartRequest as NegotiationStartRequest,
  type Strategy,
} from './services/negotiation.js';

export {
  InsuranceService,
  type ClaimRequest as InsuranceClaimRequest,
  type ClaimView,
  type EscrowView,
  type PolicyDetailView,
  type PolicyListRequest,
  type PolicyListView,
  type PolicyView,
  type QuoteRequest as InsuranceQuoteRequest,
  type QuoteView,
  type SlaTerms,
  type SubscribeRequest as InsuranceSubscribeRequest,
} from './services/insurance.js';
