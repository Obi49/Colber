import {
  bigserial,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Insurance service Postgres tables.
 *
 *   - `policies`         — one row per subscribed policy.
 *   - `escrow_holdings`  — simulated escrow (one per policy).
 *   - `escrow_events`    — append-only state-machine event log per holding.
 *   - `claims`           — claims filed against a policy.
 *
 * v1 MVP is simulation-only: there is no on-chain interaction. The
 * `escrow_holdings` lifecycle is enforced by `EscrowService` and persisted
 * here. The on-chain version is a separate P3 ticket (see étape 7b).
 *
 * Idempotency:
 *   - subscribe → `policies.idempotency_key` is globally unique.
 *   - file claim → `(policy_id, idempotency_key)` is unique.
 */

export const policies = pgTable(
  'policies',
  {
    id: uuid('id').primaryKey(),
    subscriberDid: varchar('subscriber_did', { length: 512 }).notNull(),
    beneficiaryDid: varchar('beneficiary_did', { length: 512 }).notNull(),
    dealSubject: varchar('deal_subject', { length: 256 }).notNull(),
    amountUsdc: numeric('amount_usdc', { precision: 18, scale: 6 }).notNull(),
    premiumUsdc: numeric('premium_usdc', { precision: 18, scale: 6 }).notNull(),
    riskMultiplier: numeric('risk_multiplier', { precision: 6, scale: 3 }).notNull(),
    reputationScore: integer('reputation_score').notNull(),
    slaTerms: jsonb('sla_terms').notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
  },
  (table) => ({
    subscriberIdx: index('policies_subscriber_did_idx').on(table.subscriberDid),
    statusIdx: index('policies_status_idx').on(table.status),
    expiresActiveIdx: index('policies_expires_active_idx').on(table.expiresAt),
    idempotencyUq: uniqueIndex('policies_idempotency_key_unique').on(table.idempotencyKey),
  }),
);

export type PolicyRow = typeof policies.$inferSelect;
export type PolicyInsert = typeof policies.$inferInsert;

export const escrowHoldings = pgTable(
  'escrow_holdings',
  {
    id: uuid('id').primaryKey(),
    policyId: uuid('policy_id').notNull(),
    amountUsdc: numeric('amount_usdc', { precision: 18, scale: 6 }).notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    lockedAt: timestamp('locked_at', { withTimezone: true, mode: 'date' }).notNull(),
    releasedAt: timestamp('released_at', { withTimezone: true, mode: 'date' }),
    claimedAt: timestamp('claimed_at', { withTimezone: true, mode: 'date' }),
    refundedAt: timestamp('refunded_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => ({
    policyUq: uniqueIndex('escrow_holdings_policy_id_unique').on(table.policyId),
    statusIdx: index('escrow_holdings_status_idx').on(table.status),
  }),
);

export type EscrowRow = typeof escrowHoldings.$inferSelect;
export type EscrowInsert = typeof escrowHoldings.$inferInsert;

export const escrowEvents = pgTable(
  'escrow_events',
  {
    seq: bigserial('seq', { mode: 'number' }).primaryKey(),
    holdingId: uuid('holding_id').notNull(),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    payload: jsonb('payload').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => ({
    holdingSeqIdx: index('escrow_events_holding_seq_idx').on(table.holdingId, table.seq),
  }),
);

export type EscrowEventRow = typeof escrowEvents.$inferSelect;
export type EscrowEventInsert = typeof escrowEvents.$inferInsert;

export const claims = pgTable(
  'claims',
  {
    id: uuid('id').primaryKey(),
    policyId: uuid('policy_id').notNull(),
    claimantDid: varchar('claimant_did', { length: 512 }).notNull(),
    reason: text('reason').notNull(),
    evidence: jsonb('evidence').notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
    payoutUsdc: numeric('payout_usdc', { precision: 18, scale: 6 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
  },
  (table) => ({
    policyStatusIdx: index('claims_policy_status_idx').on(table.policyId, table.status),
    policyIdempotencyUq: uniqueIndex('claims_policy_idempotency_uq').on(
      table.policyId,
      table.idempotencyKey,
    ),
  }),
);

export type ClaimRow = typeof claims.$inferSelect;
export type ClaimInsert = typeof claims.$inferInsert;
