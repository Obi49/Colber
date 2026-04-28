import type { DbClient } from '../db/client.js';
import type { FastifyInstance } from 'fastify';

/**
 * Liveness + readiness endpoints (Kubernetes pattern).
 *  - `/healthz` always returns 200 unless the process is dead.
 *  - `/readyz` returns 200 only when Postgres is reachable.
 */
export interface HealthDeps {
  readonly dbClient: DbClient;
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
    const database = await safeCheck(() => deps.dbClient.ping());
    const healthy = database.ok;
    if (!healthy) {
      req.log.warn({ database }, 'readiness check failed');
    }
    return reply.code(healthy ? 200 : 503).send({
      status: healthy ? 'ready' : 'not_ready',
      checks: {
        database: database.ok ? 'ok' : 'error',
      },
    });
  });
};
