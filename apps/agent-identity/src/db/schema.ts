import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * `agents` — canonical record of an agent's cryptographic identity.
 *
 * One row per (DID, public key) pair. The DID is uniquely derived from the
 * public key for `did:key`, but we still store the raw public key + scheme
 * so future DID methods (did:web, did:ethr) and signature schemes (Secp256k1)
 * can coexist in the same table.
 */
export const agents = pgTable('agents', {
  /** Internal stable identifier — UUIDv7 generated at registration time. */
  id: uuid('id').primaryKey(),

  /** The W3C DID, e.g. `did:key:z6Mk…`. Unique. */
  did: text('did').notNull().unique(),

  /** Raw public key bytes, base64-encoded. */
  publicKey: text('public_key').notNull(),

  /** Signature scheme (`Ed25519`, `Secp256k1`, …). */
  signatureScheme: text('signature_scheme').notNull(),

  /** Operator that owns this agent (no FK yet — operator-console comes later). */
  ownerOperatorId: text('owner_operator_id').notNull(),

  registeredAt: timestamp('registered_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),

  /** Soft-revocation timestamp; `null` means active. */
  revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
});

export type AgentRow = typeof agents.$inferSelect;
export type AgentInsert = typeof agents.$inferInsert;
