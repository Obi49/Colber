import { and, asc, eq, gt } from 'drizzle-orm';

import { negotiationEvents, negotiationState } from './schema.js';

import type { Database, DbClient } from './client.js';
import type { NegotiationEventRow, NegotiationStateRow } from './schema.js';
import type { AppendInput, AppendResult, EventStore, HistoryPage } from '../domain/event-store.js';
import type {
  NegotiationEvent,
  NegotiationEventType,
  NegotiationState,
  NegotiationStatus,
  Strategy,
  StoredEvent,
} from '../domain/negotiation-types.js';

/**
 * Postgres-backed event store + projection.
 *
 * Append flow (transactional):
 *   1. INSERT event ON CONFLICT DO NOTHING on `(negotiation_id, event_type,
 *      idempotency_key)`.
 *   2. If the conflict fires (replay), SELECT the stored row + projection
 *      and return them with `idempotent: true`.
 *   3. Otherwise UPSERT the projection row.
 *
 * The unique constraint on the events table makes the idempotency check
 * race-free: two concurrent appends with the same key collapse to one row.
 */
export class DrizzlePostgresEventStore implements EventStore {
  private readonly db: Database;
  private readonly client: DbClient;

  constructor(client: DbClient) {
    this.client = client;
    this.db = client.db;
  }

  public async append(input: AppendInput): Promise<AppendResult> {
    return this.db.transaction(async (tx) => {
      const insert = await tx
        .insert(negotiationEvents)
        .values({
          negotiationId: input.negotiationId,
          eventType: input.event.type,
          payload: input.event,
          occurredAt: new Date(input.event.at),
          idempotencyKey: input.idempotencyKey,
        })
        .onConflictDoNothing({
          target: [
            negotiationEvents.negotiationId,
            negotiationEvents.eventType,
            negotiationEvents.idempotencyKey,
          ],
        })
        .returning();

      if (insert.length === 0) {
        // Idempotent replay — fetch the stored row + the current projection.
        const existingRows = await tx
          .select()
          .from(negotiationEvents)
          .where(
            and(
              eq(negotiationEvents.negotiationId, input.negotiationId),
              eq(negotiationEvents.eventType, input.event.type),
              eq(negotiationEvents.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1);
        const existingRow = existingRows[0];
        if (!existingRow) {
          throw new Error('idempotency conflict but no row found');
        }
        const stateRow = await this.fetchStateRow(input.negotiationId, tx);
        if (!stateRow) {
          throw new Error('idempotency conflict but state row missing');
        }
        return {
          stored: rowToStoredEvent(existingRow),
          projection: rowToState(stateRow),
          idempotent: true,
        };
      }

      const insertedRow = insert[0];
      if (!insertedRow) {
        throw new Error('insert returned no rows');
      }

      // UPSERT the projection.
      await tx
        .insert(negotiationState)
        .values({
          negotiationId: input.projection.negotiationId,
          status: input.projection.status,
          strategy: input.projection.strategy,
          terms: input.projection.terms,
          partyDids: [...input.projection.partyDids],
          ...(input.projection.currentBestProposalId !== undefined
            ? { currentBestProposalId: input.projection.currentBestProposalId }
            : {}),
          proposals: input.projection.proposals,
          ...(input.projection.settlementSignatures !== undefined
            ? { settledSignatures: input.projection.settlementSignatures }
            : {}),
          createdAt: new Date(input.projection.createdAt),
          updatedAt: new Date(input.projection.updatedAt),
          expiresAt: new Date(input.projection.expiresAt),
        })
        .onConflictDoUpdate({
          target: negotiationState.negotiationId,
          set: {
            status: input.projection.status,
            terms: input.projection.terms,
            partyDids: [...input.projection.partyDids],
            currentBestProposalId: input.projection.currentBestProposalId ?? null,
            proposals: input.projection.proposals,
            settledSignatures: input.projection.settlementSignatures ?? null,
            updatedAt: new Date(input.projection.updatedAt),
            expiresAt: new Date(input.projection.expiresAt),
          },
        });

      return {
        stored: rowToStoredEvent(insertedRow),
        projection: input.projection,
        idempotent: false,
      };
    });
  }

  public async findStartedByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<{ readonly negotiationId: string; readonly projection: NegotiationState } | null> {
    const rows = await this.db
      .select({ negotiationId: negotiationEvents.negotiationId })
      .from(negotiationEvents)
      .where(
        and(
          eq(negotiationEvents.eventType, 'negotiation.started'),
          eq(negotiationEvents.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) {
      return null;
    }
    const stateRow = await this.fetchStateRow(row.negotiationId, this.db);
    if (!stateRow) {
      return null;
    }
    return { negotiationId: row.negotiationId, projection: rowToState(stateRow) };
  }

  public async getState(negotiationId: string): Promise<NegotiationState | null> {
    const row = await this.fetchStateRow(negotiationId, this.db);
    return row ? rowToState(row) : null;
  }

  public async listEvents(negotiationId: string): Promise<readonly StoredEvent[]> {
    const rows = await this.db
      .select()
      .from(negotiationEvents)
      .where(eq(negotiationEvents.negotiationId, negotiationId))
      .orderBy(asc(negotiationEvents.seq));
    return rows.map(rowToStoredEvent);
  }

  public async history(
    negotiationId: string,
    cursor: number | null,
    limit: number,
  ): Promise<HistoryPage> {
    const rows = await this.db
      .select()
      .from(negotiationEvents)
      .where(
        cursor !== null
          ? and(
              eq(negotiationEvents.negotiationId, negotiationId),
              gt(negotiationEvents.seq, cursor),
            )
          : eq(negotiationEvents.negotiationId, negotiationId),
      )
      .orderBy(asc(negotiationEvents.seq))
      .limit(limit);

    const events = rows.map(rowToStoredEvent);
    const last = events[events.length - 1];
    const nextCursor = events.length === limit && last ? last.seq : null;
    return { events, nextCursor };
  }

  public async ping(): Promise<void> {
    await this.client.ping();
  }

  public async close(): Promise<void> {
    await this.client.close();
  }

  private async fetchStateRow(
    id: string,
    runner: Database,
  ): Promise<NegotiationStateRow | undefined> {
    const rows = await runner
      .select()
      .from(negotiationState)
      .where(eq(negotiationState.negotiationId, id))
      .limit(1);
    return rows[0];
  }
}

const rowToStoredEvent = (row: NegotiationEventRow): StoredEvent => ({
  seq: row.seq,
  event: row.payload as NegotiationEvent,
});

const KNOWN_STATUSES: readonly NegotiationStatus[] = [
  'open',
  'negotiating',
  'settled',
  'cancelled',
  'expired',
];
const KNOWN_STRATEGIES: readonly Strategy[] = ['ascending-auction', 'multi-criteria'];

const isStatus = (raw: string): raw is NegotiationStatus =>
  (KNOWN_STATUSES as readonly string[]).includes(raw);
const isStrategy = (raw: string): raw is Strategy =>
  (KNOWN_STRATEGIES as readonly string[]).includes(raw);

const rowToState = (row: NegotiationStateRow): NegotiationState => {
  const status: NegotiationStatus = isStatus(row.status) ? row.status : 'open';
  const strategy: Strategy = isStrategy(row.strategy) ? row.strategy : 'ascending-auction';
  const proposals = Array.isArray(row.proposals)
    ? (row.proposals as NegotiationState['proposals'])
    : [];
  const settlementSignatures = Array.isArray(row.settledSignatures)
    ? (row.settledSignatures as NegotiationState['settlementSignatures'])
    : undefined;

  // After `settle`, the projection row's `currentBestProposalId` is updated
  // to point at the winner. So we can recover the winningProposalId from
  // it without needing a dedicated column.
  const winningProposalId =
    status === 'settled' && row.currentBestProposalId ? row.currentBestProposalId : undefined;

  const base: NegotiationState = {
    negotiationId: row.negotiationId,
    status,
    strategy,
    terms: row.terms as NegotiationState['terms'],
    partyDids: row.partyDids,
    proposals,
    ...(row.currentBestProposalId !== null
      ? { currentBestProposalId: row.currentBestProposalId }
      : {}),
    ...(winningProposalId !== undefined ? { winningProposalId } : {}),
    ...(settlementSignatures !== undefined ? { settlementSignatures } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
  return base;
};

const _eventTypeOk = (raw: string): raw is NegotiationEventType =>
  raw.startsWith('negotiation.') || raw === 'proposal.submitted' || raw === 'counter.submitted';
void _eventTypeOk;
