import { sql } from 'drizzle-orm';
import {
  bigserial,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Negotiation service Postgres tables.
 *
 *  - `negotiation_events`: append-only event log. Source of truth.
 *  - `negotiation_state`:   materialised projection. One row per negotiation.
 *
 * Both tables are written atomically in a single transaction by
 * `DrizzleEventStore.append`. The unique `(negotiation_id, event_type,
 * idempotency_key)` constraint on the event log enforces idempotency on
 * retries.
 */

export const negotiationEvents = pgTable(
  'negotiation_events',
  {
    seq: bigserial('seq', { mode: 'number' }).primaryKey(),
    negotiationId: uuid('negotiation_id').notNull(),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    payload: jsonb('payload').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
  },
  (table) => ({
    byNegotiationSeq: index('negotiation_events_by_negotiation_seq_idx').on(
      table.negotiationId,
      table.seq,
    ),
    idempotencyUq: uniqueIndex('negotiation_events_idempotency_uq').on(
      table.negotiationId,
      table.eventType,
      table.idempotencyKey,
    ),
  }),
);

export type NegotiationEventRow = typeof negotiationEvents.$inferSelect;
export type NegotiationEventInsert = typeof negotiationEvents.$inferInsert;

export const negotiationState = pgTable(
  'negotiation_state',
  {
    negotiationId: uuid('negotiation_id').primaryKey(),
    status: varchar('status', { length: 32 }).notNull(),
    strategy: varchar('strategy', { length: 32 }).notNull(),
    terms: jsonb('terms').notNull(),
    partyDids: text('party_dids').array().notNull(),
    currentBestProposalId: uuid('current_best_proposal_id'),
    proposals: jsonb('proposals')
      .notNull()
      .default(sql`'[]'::jsonb`),
    settledSignatures: jsonb('settled_signatures'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => ({
    statusIdx: index('negotiation_state_status_idx').on(table.status),
    expiresIdx: index('negotiation_state_expires_idx').on(table.expiresAt),
  }),
);

export type NegotiationStateRow = typeof negotiationState.$inferSelect;
export type NegotiationStateInsert = typeof negotiationState.$inferInsert;
