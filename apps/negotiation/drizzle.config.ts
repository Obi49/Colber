import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit config for the negotiation service.
 *
 * Used by `pnpm run db:generate` to materialise SQL migrations from the
 * TypeScript schema, and by `db:studio`. Migrations are committed under
 * `./drizzle/` and applied at runtime by `src/db/migrate.ts` (which uses
 * drizzle-orm's migrator, NOT drizzle-kit).
 *
 * The negotiation service is event-sourced: `negotiation_events` is the
 * append-only source of truth, `negotiation_state` is the materialised
 * projection updated atomically with each event in the same transaction.
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://colber:colber_dev@localhost:15432/colber_negotiation',
  },
  strict: true,
  verbose: true,
});
