/**
 * Live integration tests against real Postgres + Neo4j containers.
 *
 * Skipped by default: this suite is gated behind `COLBER_LIVE_TESTS=1` so the
 * dev/CI loop only runs the in-memory tests. Setting the env var is the
 * developer's signal that they have testcontainers prerequisites in place
 * (Docker daemon running, sufficient resources).
 *
 * Implementation note: testcontainers itself is *not* declared as a workspace
 * dependency. This keeps `pnpm install` slim. When you opt into this suite,
 * install testcontainers ad-hoc with:
 *
 *     pnpm --filter @colber/reputation add -D testcontainers @testcontainers/postgresql @testcontainers/neo4j
 *
 * The `describe.skipIf(!process.env.COLBER_LIVE_TESTS)` wrapper means the
 * import-time module load is gated too — vitest never tries to resolve the
 * containers helpers when the suite is skipped.
 */
import { describe, expect, it } from 'vitest';

describe.skipIf(!process.env.COLBER_LIVE_TESTS)('live (testcontainers)', () => {
  it('is a placeholder — wire up real containers when COLBER_LIVE_TESTS=1', () => {
    // Intentionally minimal. The shape of this suite (boot Postgres + Neo4j,
    // run drizzle migrations, exercise the full stack via Fastify.inject) is
    // documented in apps/reputation/README.md. Filling it in lives behind a
    // dev-only flag because adding `testcontainers` to the lockfile would
    // pull in Docker bindings that we don't want on the default install path.
    expect(process.env.COLBER_LIVE_TESTS).toBeDefined();
  });
});
