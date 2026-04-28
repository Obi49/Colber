import type {
  AgentNodeRecord,
  AgentScoringSnapshot,
  GraphRepository,
  HistoryPage,
  HistoryQuery,
  IssuedFeedbackRecord,
  ReceivedFeedbackRecord,
  RecordFeedbackEdgeInput,
  TransactionEventRecord,
  TransactionParticipationRecord,
} from '../../src/domain/graph-repository.js';

interface InMemoryTx {
  txId: string;
  status: string;
  hasNegativeFeedback: boolean;
  completedAt: Date;
  buyerDid: string;
  sellerDid: string;
  amount: string;
  currency: string;
}

interface InMemoryFeedback {
  feedbackId: string;
  fromDid: string;
  toDid: string;
  txId: string;
  rating: number;
  signedAt: Date;
  comment?: string;
}

/**
 * In-memory `GraphRepository` for unit/integration tests. Tracks the same
 * conceptual graph (Agent / Transaction / RATED edges) without Neo4j.
 *
 * The seeding helpers (`seedTransaction`, `seedFeedback`, `seedAgent`) are
 * test-only convenience surfaces. Production code should never reach for
 * them — they exist only to populate state before exercising the domain
 * service.
 */
export class InMemoryGraphRepository implements GraphRepository {
  private readonly agents = new Map<string, AgentNodeRecord>();
  private readonly transactions = new Map<string, InMemoryTx>();
  private readonly feedbacks: InMemoryFeedback[] = [];

  // ---- domain interface ----

  public async upsertAgent(did: string, registeredAt: Date): Promise<void> {
    if (!this.agents.has(did)) {
      this.agents.set(did, { did, registeredAt });
    }
    return Promise.resolve();
  }

  public async loadScoringSnapshot(did: string): Promise<AgentScoringSnapshot | null> {
    const agent = this.agents.get(did);
    if (!agent) {
      return Promise.resolve(null);
    }

    const txs: TransactionEventRecord[] = [];
    for (const tx of this.transactions.values()) {
      if (tx.buyerDid !== did && tx.sellerDid !== did) {
        continue;
      }
      txs.push({
        txId: tx.txId,
        completed: tx.status === 'completed',
        hasNegativeFeedback: tx.hasNegativeFeedback,
        completedAt: tx.completedAt,
      });
    }

    const fbs: ReceivedFeedbackRecord[] = this.feedbacks
      .filter((f) => f.toDid === did)
      .map((f) => ({
        feedbackId: f.feedbackId,
        fromDid: f.fromDid,
        txId: f.txId,
        rating: f.rating,
        signedAt: f.signedAt,
        ...(f.comment !== undefined ? { comment: f.comment } : {}),
      }));

    return Promise.resolve({ agent, transactions: txs, feedbacks: fbs });
  }

  public async recordFeedbackEdge(input: RecordFeedbackEdgeInput): Promise<void> {
    const now = new Date();
    if (!this.agents.has(input.fromDid)) {
      this.agents.set(input.fromDid, { did: input.fromDid, registeredAt: now });
    }
    if (!this.agents.has(input.toDid)) {
      this.agents.set(input.toDid, { did: input.toDid, registeredAt: now });
    }
    const tx =
      this.transactions.get(input.txId) ??
      (() => {
        const fresh: InMemoryTx = {
          txId: input.txId,
          status: 'completed',
          hasNegativeFeedback: false,
          completedAt: now,
          buyerDid: input.fromDid,
          sellerDid: input.toDid,
          amount: '0',
          currency: 'USDC',
        };
        this.transactions.set(input.txId, fresh);
        return fresh;
      })();
    if (input.rating <= 2) {
      tx.hasNegativeFeedback = true;
    }
    this.feedbacks.push({
      feedbackId: input.feedbackId,
      fromDid: input.fromDid,
      toDid: input.toDid,
      txId: input.txId,
      rating: input.rating,
      signedAt: input.signedAt,
      ...(input.comment !== undefined ? { comment: input.comment } : {}),
    });
    return Promise.resolve();
  }

  public async loadHistory(did: string, query: HistoryQuery): Promise<HistoryPage> {
    const limit = Math.max(1, Math.min(query.limit, 200));
    const cursorDate = query.cursor ? new Date(query.cursor) : null;

    const txParticipations: TransactionParticipationRecord[] = [];
    for (const tx of this.transactions.values()) {
      if (tx.buyerDid !== did && tx.sellerDid !== did) {
        continue;
      }
      if (cursorDate && tx.completedAt > cursorDate) {
        continue;
      }
      txParticipations.push({
        txId: tx.txId,
        counterpartyDid: tx.buyerDid === did ? tx.sellerDid : tx.buyerDid,
        role: tx.buyerDid === did ? 'buyer' : 'seller',
        amount: tx.amount,
        currency: tx.currency,
        completedAt: tx.completedAt,
        status: tx.status,
      });
    }
    txParticipations.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
    const transactions = txParticipations.slice(0, limit);

    const filteredReceived = this.feedbacks
      .filter((f) => f.toDid === did && (!cursorDate || f.signedAt <= cursorDate))
      .sort((a, b) => b.signedAt.getTime() - a.signedAt.getTime())
      .slice(0, limit);
    const feedbacksReceived: ReceivedFeedbackRecord[] = filteredReceived.map((f) => ({
      feedbackId: f.feedbackId,
      fromDid: f.fromDid,
      txId: f.txId,
      rating: f.rating,
      signedAt: f.signedAt,
      ...(f.comment !== undefined ? { comment: f.comment } : {}),
    }));

    const filteredIssued = this.feedbacks
      .filter((f) => f.fromDid === did && (!cursorDate || f.signedAt <= cursorDate))
      .sort((a, b) => b.signedAt.getTime() - a.signedAt.getTime())
      .slice(0, limit);
    const feedbacksIssued: IssuedFeedbackRecord[] = filteredIssued.map((f) => ({
      feedbackId: f.feedbackId,
      fromDid: f.fromDid,
      toDid: f.toDid,
      txId: f.txId,
      rating: f.rating,
      signedAt: f.signedAt,
      ...(f.comment !== undefined ? { comment: f.comment } : {}),
    }));

    const allDates: Date[] = [
      ...transactions.map((t) => t.completedAt),
      ...feedbacksReceived.map((f) => f.signedAt),
      ...feedbacksIssued.map((f) => f.signedAt),
    ];
    const oldest = allDates.reduce<Date | null>(
      (acc, d) => (acc === null || d < acc ? d : acc),
      null,
    );
    const exhausted =
      transactions.length < limit &&
      feedbacksReceived.length < limit &&
      feedbacksIssued.length < limit;
    const nextCursor = exhausted || oldest === null ? null : oldest.toISOString();

    return Promise.resolve({
      transactions,
      feedbacksReceived,
      feedbacksIssued,
      nextCursor,
    });
  }

  public async ping(): Promise<void> {
    return Promise.resolve();
  }

  public async close(): Promise<void> {
    return Promise.resolve();
  }

  // ---- test-only seeding helpers ----

  public seedAgent(did: string, registeredAt: Date = new Date()): void {
    this.agents.set(did, { did, registeredAt });
  }

  public seedTransaction(opts: {
    txId: string;
    status?: string;
    buyerDid: string;
    sellerDid: string;
    amount?: string;
    currency?: string;
    completedAt?: Date;
    hasNegativeFeedback?: boolean;
  }): void {
    this.seedAgent(opts.buyerDid);
    this.seedAgent(opts.sellerDid);
    this.transactions.set(opts.txId, {
      txId: opts.txId,
      status: opts.status ?? 'completed',
      hasNegativeFeedback: opts.hasNegativeFeedback ?? false,
      completedAt: opts.completedAt ?? new Date(),
      buyerDid: opts.buyerDid,
      sellerDid: opts.sellerDid,
      amount: opts.amount ?? '0',
      currency: opts.currency ?? 'USDC',
    });
  }

  public seedFeedback(opts: InMemoryFeedback): void {
    this.feedbacks.push(opts);
    const tx = this.transactions.get(opts.txId);
    if (tx && opts.rating <= 2) {
      tx.hasNegativeFeedback = true;
    }
  }
}
