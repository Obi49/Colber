import type {
  AppendInput,
  AppendResult,
  EventStore,
  HistoryPage,
} from '../../src/domain/event-store.js';
import type { NegotiationState, StoredEvent } from '../../src/domain/negotiation-types.js';

interface StoredRow extends StoredEvent {
  readonly negotiationId: string;
  readonly eventType: string;
  readonly idempotencyKey: string;
}

/**
 * In-memory `EventStore` for unit + integration tests. No Postgres.
 *
 * Faithful enough for the integration suite: enforces the
 * `(negotiationId, eventType, idempotencyKey)` uniqueness, monotonic seq,
 * atomic event-and-projection update, cursor pagination.
 */
export class InMemoryEventStore implements EventStore {
  private nextSeq = 1;
  private readonly events: StoredRow[] = [];
  private readonly projections = new Map<string, NegotiationState>();
  public closed = false;
  /** When set, the next call throws this error (then resets to null). */
  public throwNext: Error | null = null;

  public append(input: AppendInput): Promise<AppendResult> {
    this.maybeThrow();
    const existing = this.events.find(
      (e) =>
        e.negotiationId === input.negotiationId &&
        e.eventType === input.event.type &&
        e.idempotencyKey === input.idempotencyKey,
    );
    if (existing) {
      const projection = this.projections.get(input.negotiationId);
      if (!projection) {
        throw new Error('idempotency hit but projection missing');
      }
      return Promise.resolve({
        stored: { seq: existing.seq, event: existing.event },
        projection,
        idempotent: true,
      });
    }
    const stored: StoredRow = {
      seq: this.nextSeq++,
      negotiationId: input.negotiationId,
      eventType: input.event.type,
      idempotencyKey: input.idempotencyKey,
      event: input.event,
    };
    this.events.push(stored);
    this.projections.set(input.negotiationId, input.projection);
    return Promise.resolve({
      stored: { seq: stored.seq, event: stored.event },
      projection: input.projection,
      idempotent: false,
    });
  }

  public findStartedByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<{ readonly negotiationId: string; readonly projection: NegotiationState } | null> {
    this.maybeThrow();
    const match = this.events.find(
      (e) => e.eventType === 'negotiation.started' && e.idempotencyKey === idempotencyKey,
    );
    if (!match) {
      return Promise.resolve(null);
    }
    const projection = this.projections.get(match.negotiationId);
    if (!projection) {
      return Promise.resolve(null);
    }
    return Promise.resolve({ negotiationId: match.negotiationId, projection });
  }

  public getState(negotiationId: string): Promise<NegotiationState | null> {
    this.maybeThrow();
    return Promise.resolve(this.projections.get(negotiationId) ?? null);
  }

  public listEvents(negotiationId: string): Promise<readonly StoredEvent[]> {
    this.maybeThrow();
    const out = this.events
      .filter((e) => e.negotiationId === negotiationId)
      .sort((a, b) => a.seq - b.seq)
      .map((e) => ({ seq: e.seq, event: e.event }));
    return Promise.resolve(out);
  }

  public history(
    negotiationId: string,
    cursor: number | null,
    limit: number,
  ): Promise<HistoryPage> {
    this.maybeThrow();
    const all = this.events
      .filter((e) => e.negotiationId === negotiationId)
      .sort((a, b) => a.seq - b.seq);
    const after = cursor !== null ? all.filter((e) => e.seq > cursor) : all;
    const page = after.slice(0, limit).map((e) => ({ seq: e.seq, event: e.event }));
    const last = page[page.length - 1];
    const nextCursor = page.length === limit && last ? last.seq : null;
    return Promise.resolve({ events: page, nextCursor });
  }

  public ping(): Promise<void> {
    this.maybeThrow();
    return Promise.resolve();
  }

  public close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }

  /** Test-only: peek at all stored rows. */
  public dump(): readonly StoredRow[] {
    return [...this.events];
  }

  private maybeThrow(): void {
    if (this.throwNext) {
      const err = this.throwNext;
      this.throwNext = null;
      throw err;
    }
  }
}
