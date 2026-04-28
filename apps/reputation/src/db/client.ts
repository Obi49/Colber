import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

import * as schema from './schema.js';

export type Database = PostgresJsDatabase<typeof schema>;

export interface DbClient {
  readonly db: Database;
  readonly sql: Sql;
  /** Closes the underlying connection pool. Idempotent. */
  close(): Promise<void>;
  /** Lightweight readiness check — runs `SELECT 1`. */
  ping(): Promise<void>;
}

/**
 * Creates a postgres-js + drizzle client. Pool size tuned for a write-light,
 * read-heavy reputation service (most reads hit the Redis score cache).
 */
export const createDbClient = (databaseUrl: string): DbClient => {
  const sql = postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: true,
  });
  const db = drizzle(sql, { schema });

  return {
    db,
    sql,
    async close() {
      await sql.end({ timeout: 5 });
    },
    async ping() {
      await sql`SELECT 1`;
    },
  };
};
