import type { DbClient } from '../db/client.js';
import type { ReputationClient } from '../integrations/reputation-client.js';
import type { FastifyInstance } from 'fastify';

/**
 * Liveness + readiness endpoints (Kubernetes pattern).
 *  - `/healthz` always returns 200 unless the process is dead.
 *  - `/readyz`:
 *      * Postgres MUST be reachable → otherwise 503.
 *      * Reputation `/healthz` is checked but degraded: if it's down, the
 *        endpoint still returns 200 because pricing falls back to score=500
 *        with a warn log. The body reports `reputation: 'degraded'`.
 */
export interface HealthDeps {
  readonly dbClient: DbClient;
  readonly reputation: ReputationClient;
}

interface CheckResult {
  ok: boolean;
  err?: string;
}

const safeCheck = async (fn: () => Promise<void>): Promise<CheckResult> => {
  try {
    await fn();
    return { ok: true };
  } catch (cause) {
    return { ok: false, err: cause instanceof Error ? cause.message : String(cause) };
  }
};

export const registerHealthRoutes = (app: FastifyInstance, deps: HealthDeps): void => {
  app.get('/healthz', async (_req, reply) => reply.code(200).send({ status: 'ok' }));

  app.get('/readyz', async (req, reply) => {
    const [database, reputation] = await Promise.all([
      safeCheck(() => deps.dbClient.ping()),
      safeCheck(() => deps.reputation.ping()),
    ]);
    const healthy = database.ok;
    if (!healthy) {
      req.log.warn({ database, reputation }, 'readiness check failed');
    } else if (!reputation.ok) {
      req.log.warn(
        { reputation },
        'reputation upstream is down; pricing will fallback to score=500',
      );
    }
    return reply.code(healthy ? 200 : 503).send({
      status: healthy ? 'ready' : 'not_ready',
      checks: {
        database: database.ok ? 'ok' : 'error',
        reputation: reputation.ok ? 'ok' : 'degraded',
      },
    });
  });
};
