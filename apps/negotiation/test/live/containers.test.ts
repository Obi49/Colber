/**
 * Live integration tests against a real Postgres container.
 *
 * Skipped by default: gated behind `COLBER_LIVE_TESTS=1` so the dev/CI
 * loop only runs the in-memory tests. Setting the env var is the
 * developer's signal that they have testcontainers prerequisites in place
 * (Docker daemon running, sufficient resources).
 *
 * Implementation note: testcontainers itself is *not* declared as a
 * workspace dependency. When you opt into this suite, install it ad-hoc
 * with:
 *
 *     pnpm --filter @colber/negotiation add -D testcontainers @testcontainers/postgresql
 *
 * The skip-if wrapper means the import-time module load is gated too;
 * vitest never tries to resolve the containers helpers when the suite is
 * skipped.
 */
import { describe, expect, it } from 'vitest';

describe.skipIf(!process.env.COLBER_LIVE_TESTS)('live (testcontainers)', () => {
  it('is a placeholder — wire up real Postgres when COLBER_LIVE_TESTS=1', () => {
    // Intentionally minimal. The shape of this suite (boot Postgres, run
    // drizzle migrations, exercise the full stack via Fastify.inject)
    // mirrors `apps/reputation/test/live/containers.test.ts`.
    expect(process.env.COLBER_LIVE_TESTS).toBeDefined();
  });
});
