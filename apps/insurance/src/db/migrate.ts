/**
 * Standalone migration runner.
 * Used by:
 *   - `pnpm run db:migrate` for local dev.
 *   - The Docker entrypoint in production (run before the server boots).
 */
import { fileURLToPath } from 'node:url';

import { createLogger } from '@praxis/core-logger';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { loadAppConfig } from '../config.js';

const main = async (): Promise<void> => {
  const cfg = loadAppConfig();
  const log = createLogger({
    serviceName: cfg.SERVICE_NAME,
    level: cfg.LOG_LEVEL,
    pretty: cfg.PRETTY_LOGS,
  });

  log.info({ databaseUrl: redactUrl(cfg.DATABASE_URL) }, 'running migrations');

  const sql = postgres(cfg.DATABASE_URL, { max: 1 });
  const db = drizzle(sql);

  try {
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
    });
    log.info('migrations applied');
  } finally {
    await sql.end({ timeout: 5 });
  }
};

const redactUrl = (url: string): string => url.replace(/:[^:@/]+@/, ':***@');

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
