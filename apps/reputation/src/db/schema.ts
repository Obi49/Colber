import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Reputation service Postgres tables.
 *
 * The graph (agents/transactions/feedbacks) lives in Neo4j; Postgres holds
 * configuration + the *attestation issuance log* (signed score snapshots,
 * idempotency log for inbound feedback, future Merkle anchors).
 */

/**
 * `score_snapshots` — every signed `SignedScore` we hand out.
 *
 * One row per (did, computedAt) tuple. Lets us audit what was published, and
 * lets `reputation.verify` sanity-check that the attestation was actually
 * issued by us if a verifier ever wants more than just the signature.
 */
export const scoreSnapshots = pgTable(
  'score_snapshots',
  {
    id: uuid('id').primaryKey(),
    did: text('did').notNull(),
    score: integer('score').notNull(),
    scoreVersion: text('score_version').notNull(),
    computedAt: timestamp('computed_at', { withTimezone: true, mode: 'date' }).notNull(),
    /** Base64 Ed25519 signature over the JCS canonical form of the SignedScore. */
    attestation: text('attestation').notNull(),
    /** Server clock at which the row was inserted. */
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    didIdx: index('score_snapshots_did_idx').on(table.did),
    computedAtIdx: index('score_snapshots_computed_at_idx').on(table.computedAt),
  }),
);

export type ScoreSnapshotRow = typeof scoreSnapshots.$inferSelect;
export type ScoreSnapshotInsert = typeof scoreSnapshots.$inferInsert;

/**
 * `feedback_log` — idempotency + anti-spam record.
 *
 * - `feedback_id` is the unique idempotency key (UUID v4 from the issuer).
 * - The `(from_did, to_did, tx_id)` triple is unique: a given issuer cannot
 *   submit more than one feedback per (counterparty, transaction).
 *
 * The full feedback payload is stored on the Neo4j RATED edge; this table is
 * the canonical source of truth for "has this feedback already been recorded".
 */
export const feedbackLog = pgTable(
  'feedback_log',
  {
    feedbackId: uuid('feedback_id').primaryKey(),
    fromDid: text('from_did').notNull(),
    toDid: text('to_did').notNull(),
    txId: text('tx_id').notNull(),
    rating: smallint('rating').notNull(),
    signedAt: timestamp('signed_at', { withTimezone: true, mode: 'date' }).notNull(),
    /** Base64 ed25519 signature submitted with the feedback. */
    signature: text('signature').notNull(),
    /** Server clock at which we acknowledged the feedback. */
    recordedAt: timestamp('recorded_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    fromToTxUq: uniqueIndex('feedback_log_from_to_tx_uq').on(
      table.fromDid,
      table.toDid,
      table.txId,
    ),
    toDidIdx: index('feedback_log_to_did_idx').on(table.toDid),
  }),
);

export type FeedbackLogRow = typeof feedbackLog.$inferSelect;
export type FeedbackLogInsert = typeof feedbackLog.$inferInsert;

/**
 * `merkle_anchors` — placeholder for future on-chain anchoring.
 *
 * Each row records that a Merkle tree built over a batch of score snapshots
 * was anchored to a public chain. Wired in a later sprint; the table is
 * created now so callers (`reputation.verify`) can be evolved to consult it
 * without a schema migration on the critical path.
 */
export const merkleAnchors = pgTable('merkle_anchors', {
  id: uuid('id').primaryKey(),
  /** Hex-encoded Merkle root (no `0x` prefix). */
  rootHash: text('root_hash').notNull().unique(),
  /** Hex-encoded transaction hash on the anchor chain. */
  txHash: text('tx_hash').notNull(),
  /** Chain ID per EIP-155. */
  chainId: integer('chain_id').notNull(),
  anchoredAt: timestamp('anchored_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .default(sql`now()`),
});

export type MerkleAnchorRow = typeof merkleAnchors.$inferSelect;
export type MerkleAnchorInsert = typeof merkleAnchors.$inferInsert;
