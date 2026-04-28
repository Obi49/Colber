import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit config — used by `pnpm run db:generate` to materialise SQL
 * migrations from our TypeScript schema, and by `db:studio`.
 *
 * Migrations are committed to `./drizzle/` and applied at runtime by
 * `src/db/migrate.ts` (which uses drizzle-orm's migrator, NOT drizzle-kit).
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://praxis:praxis_dev@localhost:15432/praxis',
  },
  strict: true,
  verbose: true,
});
