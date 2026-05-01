import { decodeDidKey } from '@colber/core-crypto';
import { sql } from 'drizzle-orm';

import type { Database } from '../db/client.js';

/**
 * Resolves a DID to the Ed25519 public key used to verify its signatures.
 *
 * # Strategy
 *
 * 1. If the DID is `did:key:z6Mk…`, decode the key directly from the DID
 *    string. This is **always** consistent with the agent-identity service,
 *    because the agent-identity service derives the DID from the public key
 *    using the same algorithm — so we don't need to consult any database.
 *
 * 2. Otherwise (future: `did:web`, `did:ethr`), fall back to the
 *    `agents` table that the agent-identity service writes to. We share the
 *    Postgres database in dev; in production this will move behind an
 *    explicit gRPC call to agent-identity.
 *
 * The agent-identity service writes to a table named `agents` with columns
 * `did`, `public_key`, `signature_scheme`, `revoked_at`. We query the
 * minimum subset needed via raw SQL so we avoid coupling to its drizzle
 * schema (and breaking `pnpm test` in the reputation service if that schema
 * shifts).
 *
 * If the table is absent (e.g. in unit tests with an empty Postgres), the
 * resolver returns `null` for non-`did:key` DIDs and the caller decides how
 * to handle it.
 */

export interface ResolvedIdentity {
  readonly did: string;
  readonly publicKey: Uint8Array;
  readonly signatureScheme: string;
  readonly revoked: boolean;
}

export interface IdentityResolver {
  /** Returns the resolved record or `null` if the DID is unknown. */
  resolve(did: string): Promise<ResolvedIdentity | null>;
}

/**
 * Composite identity resolver: did:key (in-memory crypto) plus
 * Postgres-shared `agents` table for everything else.
 */
export class CompositeIdentityResolver implements IdentityResolver {
  constructor(private readonly db: Database) {}

  public async resolve(did: string): Promise<ResolvedIdentity | null> {
    if (did.startsWith('did:key:')) {
      try {
        const decoded = decodeDidKey(did);
        return {
          did,
          publicKey: decoded.publicKey,
          signatureScheme: decoded.scheme,
          revoked: false,
        };
      } catch {
        return null;
      }
    }

    // `agents` is owned by the agent-identity service. Use raw SQL to keep
    // the coupling minimal — we read three columns we treat as a stable
    // contract with that service.
    try {
      const rows = await this.db.execute<{
        did: string;
        public_key: string;
        signature_scheme: string;
        revoked_at: Date | null;
      }>(
        sql`SELECT did, public_key, signature_scheme, revoked_at FROM agents WHERE did = ${did} LIMIT 1`,
      );
      // postgres-js returns an array-like result; pick the first row.
      const arr = rows as unknown as {
        did: string;
        public_key: string;
        signature_scheme: string;
        revoked_at: Date | null;
      }[];
      const first = arr[0];
      if (!first) {
        return null;
      }
      return {
        did: first.did,
        publicKey: Uint8Array.from(Buffer.from(first.public_key, 'base64')),
        signatureScheme: first.signature_scheme,
        revoked: first.revoked_at !== null,
      };
    } catch {
      // Table missing or query failed — surface as "unknown DID".
      return null;
    }
  }
}
