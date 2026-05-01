import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit config for the insurance service.
 *
 * Used by `pnpm run db:generate` to materialise SQL migrations from the
 * TypeScript schema, and by `db:studio`. Migrations are committed under
 * `./drizzle/` and applied at runtime by `src/db/migrate.ts` (which uses
 * drizzle-orm's migrator, NOT drizzle-kit).
 *
 * v1 MVP is simulation-only: the `escrow_holdings` + `escrow_events` tables
 * model an on-chain escrow without any chain integration. The real on-chain
 * version is a separate P3 ticket (étape 7b).
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ?? 'postgresql://colber:colber_dev@localhost:15432/colber_insurance',
  },
  strict: true,
  verbose: true,
});
