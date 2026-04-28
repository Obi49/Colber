import type { NegotiationEvent, NegotiationState, StoredEvent } from './negotiation-types.js';

/**
 * Event store + projection adapter contract.
 *
 * The Postgres adapter (`src/db/event-store.ts`) implements this against
 * the `negotiation_events` and `negotiation_state` tables in a single
 * transaction. The in-memory fake (`test/fakes/in-memory-event-store.ts`)
 * implements it in-process for tests.
 *
 * The (idempotencyKey, eventType, negotiationId) tuple is unique. The
 * adapter MUST use it to short-circuit replays: when an `append()` call
 * conflicts on that tuple, it should return the previously-stored
 * `{event, projection}` rather than write a new row.
 */

export interface AppendInput {
  readonly negotiationId: string;
  readonly idempotencyKey: string;
  readonly event: NegotiationEvent;
  /**
   * The projection AFTER applying this event. The store writes the event
   * and the projection in the same transaction so readers never see one
   * without the other.
   */
  readonly projection: NegotiationState;
}

export interface AppendResult {
  readonly stored: StoredEvent;
  readonly projection: NegotiationState;
  /** True if this call was an idempotent no-op replay. */
  readonly idempotent: boolean;
}

export interface HistoryPage {
  readonly events: readonly StoredEvent[];
  /** Last `seq` returned. Caller passes back to fetch the next page. */
  readonly nextCursor: number | null;
}

export interface EventStore {
  /**
   * Append `event` and update the projection atomically. Idempotency is
   * enforced on `(negotiation_id, event_type, idempotency_key)`.
   */
  append(input: AppendInput): Promise<AppendResult>;
  /**
   * Look up a `negotiation.started` event by its idempotencyKey alone (the
   * caller does not yet know the negotiationId). Returns the existing
   * `{negotiationId, projection}` or `null` if no such event exists.
   *
   * Used by `NegotiationService.start()` to short-circuit replays without
   * generating a fresh negotiationId.
   */
  findStartedByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<{ readonly negotiationId: string; readonly projection: NegotiationState } | null>;
  /** Read the materialised projection. Returns `null` if not started. */
  getState(negotiationId: string): Promise<NegotiationState | null>;
  /** Read the full ordered event log. Used by the projection rebuilder. */
  listEvents(negotiationId: string): Promise<readonly StoredEvent[]>;
  /** Paginated history. `cursor` is the last seq returned by the previous page (exclusive). */
  history(negotiationId: string, cursor: number | null, limit: number): Promise<HistoryPage>;
  /** Lightweight readiness check (Postgres ping). */
  ping(): Promise<void>;
  /** Idempotent close. */
  close(): Promise<void>;
}
