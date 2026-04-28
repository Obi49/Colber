import type { DbClient } from '../db/client.js';
import type { GraphRepository } from '../domain/graph-repository.js';
import type { ScoreCache } from '../domain/score-cache.js';
import type { FastifyInstance } from 'fastify';

/**
 * Liveness + readiness endpoints (Kubernetes pattern).
 *  - `/healthz` always returns 200 unless the process is dead.
 *  - `/readyz` returns 200 only when Postgres + Neo4j + Redis are reachable.
 */
export interface HealthDeps {
  readonly dbClient: DbClient;
  readonly graphRepo: GraphRepository;
  readonly cache: ScoreCache;
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
    const [database, graph, cache] = await Promise.all([
      safeCheck(() => deps.dbClient.ping()),
      safeCheck(() => deps.graphRepo.ping()),
      safeCheck(() => deps.cache.ping()),
    ]);
    const healthy = database.ok && graph.ok && cache.ok;
    if (!healthy) {
      req.log.warn({ database, graph, cache }, 'readiness check failed');
    }
    return reply.code(healthy ? 200 : 503).send({
      status: healthy ? 'ready' : 'not_ready',
      checks: {
        database: database.ok ? 'ok' : 'error',
        graph: graph.ok ? 'ok' : 'error',
        cache: cache.ok ? 'ok' : 'error',
      },
    });
  });
};
