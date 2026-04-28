import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit config — used by `pnpm run db:generate` to materialise SQL
 * migrations from our TypeScript schema, and by `db:studio`.
 *
 * Migrations are committed to `./drizzle/` and applied at runtime by
 * `src/db/migrate.ts` (which uses drizzle-orm's migrator, NOT drizzle-kit).
 *
 * The observability service stores ALERT CONFIGS in Postgres (low write
 * volume, transactional). The bulk telemetry data (logs + spans) lives in
 * ClickHouse and is bootstrapped at app start via DDL — see
 * `src/clickhouse/bootstrap.ts`.
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://praxis:praxis_dev@localhost:15432/praxis_observability',
  },
  strict: true,
  verbose: true,
});
