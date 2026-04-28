/**
 * Graph repository — abstraction over Neo4j for the reputation domain.
 *
 * The interface is intentionally small: the domain service only ever needs
 * (a) to load enough events to compute a score, (b) to record a participation
 * edge when a transaction completes, (c) to record a RATED edge when a
 * feedback is accepted.
 *
 * A second implementation `InMemoryGraphRepository` lives under `test/fakes/`
 * for unit-testing without Neo4j.
 */

export interface AgentNodeRecord {
  readonly did: string;
  readonly registeredAt: Date;
}

export interface TransactionEventRecord {
  readonly txId: string;
  /** Whether the transaction reached a positive terminal state. */
  readonly completed: boolean;
  /** Whether *any* RATED edge linked to this transaction has rating ≤ 2. */
  readonly hasNegativeFeedback: boolean;
  /** Best estimate of when the transaction completed. */
  readonly completedAt: Date;
}

export interface ReceivedFeedbackRecord {
  readonly feedbackId: string;
  readonly fromDid: string;
  readonly txId: string;
  readonly rating: number;
  readonly signedAt: Date;
  readonly comment?: string;
}

export interface IssuedFeedbackRecord extends ReceivedFeedbackRecord {
  readonly toDid: string;
}

export interface TransactionParticipationRecord {
  readonly txId: string;
  readonly counterpartyDid: string;
  readonly role: 'buyer' | 'seller';
  readonly amount: string; // string-encoded decimal — bigints/decimals safer than JS Number
  readonly currency: string;
  readonly completedAt: Date;
  readonly status: string;
}

export interface AgentScoringSnapshot {
  readonly agent: AgentNodeRecord;
  readonly transactions: readonly TransactionEventRecord[];
  readonly feedbacks: readonly ReceivedFeedbackRecord[];
}

export interface RecordFeedbackEdgeInput {
  readonly feedbackId: string;
  readonly fromDid: string;
  readonly toDid: string;
  readonly txId: string;
  readonly rating: number;
  readonly dimensions: { delivery: number; quality: number; communication: number };
  readonly comment?: string;
  readonly signedAt: Date;
  readonly signature: string;
}

export interface HistoryPage {
  readonly transactions: readonly TransactionParticipationRecord[];
  readonly feedbacksReceived: readonly ReceivedFeedbackRecord[];
  readonly feedbacksIssued: readonly IssuedFeedbackRecord[];
  /**
   * Opaque cursor for the next page. `null` once the caller has paged through
   * everything we have.
   */
  readonly nextCursor: string | null;
}

export interface HistoryQuery {
  readonly limit: number;
  readonly cursor: string | null;
}

export interface GraphRepository {
  /** Idempotent upsert of an `Agent` node keyed by `did`. */
  upsertAgent(did: string, registeredAt: Date): Promise<void>;

  /**
   * Fetch everything needed to compute the agent's reputation score.
   * Returns `null` if the agent has no node yet.
   */
  loadScoringSnapshot(did: string): Promise<AgentScoringSnapshot | null>;

  /** Records a `RATED` edge plus updates the negative-feedback flag on the tx. */
  recordFeedbackEdge(input: RecordFeedbackEdgeInput): Promise<void>;

  /** Reads paginated history for `reputation.history`. */
  loadHistory(did: string, query: HistoryQuery): Promise<HistoryPage>;

  /** Closes the underlying driver. Idempotent. */
  close(): Promise<void>;

  /** Lightweight readiness check (executes `RETURN 1`). */
  ping(): Promise<void>;
}
