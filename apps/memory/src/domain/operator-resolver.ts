import { sql } from 'drizzle-orm';

import type { Database } from '../db/client.js';

/**
 * Resolves the operator that owns a given agent DID.
 *
 * # Strategy
 *
 * The agent-identity service maintains an `agents` table with an
 * `owner_operator_id` column. We share the Postgres database in dev (and
 * defer the typed gRPC call into agent-identity to a later sprint), so this
 * resolver reads the operator id directly via raw SQL.
 *
 * If the table is missing (e.g. unit test against an empty Postgres) or the
 * agent has not been registered, we return `null`. Callers must treat
 * `null` as "operator scope unavailable" — typically by falling back to the
 * agent's own DID for the `operator` visibility check.
 *
 * The resolver is intentionally silent on errors (best-effort) for the same
 * reason the reputation service's `CompositeIdentityResolver` is: the
 * shared-table coupling is expedient, and we don't want a missing table to
 * cascade into 500s on every memory.store.
 */
export interface OperatorResolver {
  /** Returns the agent's operator id, or `null` if unknown. */
  resolveOperatorId(agentDid: string): Promise<string | null>;
}

export class PostgresOperatorResolver implements OperatorResolver {
  constructor(private readonly db: Database) {}

  public async resolveOperatorId(agentDid: string): Promise<string | null> {
    try {
      const rows = await this.db.execute<{ owner_operator_id: string }>(
        sql`SELECT owner_operator_id FROM agents WHERE did = ${agentDid} LIMIT 1`,
      );
      const arr = rows as unknown as { owner_operator_id: string }[];
      const first = arr[0];
      if (!first || typeof first.owner_operator_id !== 'string') {
        return null;
      }
      return first.owner_operator_id;
    } catch {
      // Table missing or query failed — surface as "unknown".
      return null;
    }
  }
}
