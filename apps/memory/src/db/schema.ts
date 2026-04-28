import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Memory service Postgres tables.
 *
 * Postgres holds the canonical metadata + (encrypted) text + audit trail.
 * The vector lives in Qdrant; the Qdrant payload only carries the minimal
 * filter columns (`memoryId`, `ownerDid`, `type`, `visibility`, `sharedWith`).
 *
 * Tables:
 *  - `memories`         — current revision of each memory record.
 *  - `memory_versions`  — append-only history (one row per write/update).
 *  - `memory_shares`    — explicit per-grantee share log (visibility=shared).
 *  - `memory_quotas`    — per-owner quota counters (placeholder for P1.7).
 */

export const memories = pgTable(
  'memories',
  {
    id: uuid('id').primaryKey(),
    ownerDid: text('owner_did').notNull(),
    /** "fact" | "event" | "preference" | "relation" — validated by the domain. */
    type: text('type').notNull(),
    /**
     * Memory body. When `encryption_enabled=true`, this is base64(IV|ciphertext|tag);
     * when false, it is the cleartext UTF-8 text. The domain layer is responsible
     * for encoding/decoding — the DB never sees a raw key.
     */
    text: text('text').notNull(),
    /** Free-form structured metadata, validated per-type by the domain. */
    payload: jsonb('payload')
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** "private" | "operator" | "shared" | "public" */
    visibility: text('visibility').notNull(),
    /** Owners can grant explicit share grants here when visibility='shared'. */
    sharedWith: jsonb('shared_with')
      .notNull()
      .default(sql`'[]'::jsonb`),
    encryptionEnabled: text('encryption_enabled').notNull().default('false'),
    /** Algorithm tag, e.g. 'aes-256-gcm'. Empty when not encrypted. */
    encryptionAlgorithm: text('encryption_algorithm').notNull().default(''),
    /** KMS reference (placeholder for v1 single-key model). */
    encryptionKeyId: text('encryption_key_id').notNull().default(''),
    /** Embedding metadata only — the vector itself lives in Qdrant. */
    embeddingModel: text('embedding_model').notNull(),
    embeddingDim: integer('embedding_dim').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    ownerIdx: index('memories_owner_did_idx').on(table.ownerDid),
    typeIdx: index('memories_type_idx').on(table.type),
    visibilityIdx: index('memories_visibility_idx').on(table.visibility),
    createdAtIdx: index('memories_created_at_idx').on(table.createdAt),
  }),
);

export type MemoryRow = typeof memories.$inferSelect;
export type MemoryInsert = typeof memories.$inferInsert;

/**
 * `memory_versions` — append-only history of previous revisions.
 * One row inserted whenever a memory is updated; the **previous** state is
 * captured here BEFORE the new one is written to `memories`.
 */
export const memoryVersions = pgTable(
  'memory_versions',
  {
    id: uuid('id').primaryKey(),
    memoryId: uuid('memory_id').notNull(),
    version: integer('version').notNull(),
    text: text('text').notNull(),
    payload: jsonb('payload')
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** DID of the agent that performed the write that created THIS row. */
    authorDid: text('author_did').notNull(),
    encryptionEnabled: text('encryption_enabled').notNull().default('false'),
    capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    memoryIdIdx: index('memory_versions_memory_id_idx').on(table.memoryId),
    memoryVersionUq: uniqueIndex('memory_versions_memory_version_uq').on(
      table.memoryId,
      table.version,
    ),
  }),
);

export type MemoryVersionRow = typeof memoryVersions.$inferSelect;
export type MemoryVersionInsert = typeof memoryVersions.$inferInsert;

/**
 * `memory_shares` — explicit grant log used to power `memory.share`.
 * Mostly redundant with `memories.shared_with` but lets us record a per-grant
 * timestamp + optional expiry, and is the canonical source for "who has
 * been granted access at what time".
 */
export const memoryShares = pgTable(
  'memory_shares',
  {
    id: uuid('id').primaryKey(),
    memoryId: uuid('memory_id').notNull(),
    grantedToDid: text('granted_to_did').notNull(),
    grantedByDid: text('granted_by_did').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    /** Null = no expiry. */
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => ({
    memoryGranteeUq: uniqueIndex('memory_shares_memory_grantee_uq').on(
      table.memoryId,
      table.grantedToDid,
    ),
    granteeIdx: index('memory_shares_grantee_idx').on(table.grantedToDid),
  }),
);

export type MemoryShareRow = typeof memoryShares.$inferSelect;
export type MemoryShareInsert = typeof memoryShares.$inferInsert;

/**
 * `memory_quotas` — per-DID counters used by the future quota engine
 * (P1.7 — 100 MB + 5000 req/month free tier). Wired now so adding the
 * enforcer later does not require a schema migration.
 */
export const memoryQuotas = pgTable('memory_quotas', {
  ownerDid: text('owner_did').primaryKey(),
  bytesStored: bigint('bytes_stored', { mode: 'bigint' }).notNull().default(0n),
  memoryCount: integer('memory_count').notNull().default(0),
  /** Rolling counter reset by an external worker; not enforced here. */
  requestsThisMonth: integer('requests_this_month').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type MemoryQuotaRow = typeof memoryQuotas.$inferSelect;
export type MemoryQuotaInsert = typeof memoryQuotas.$inferInsert;
