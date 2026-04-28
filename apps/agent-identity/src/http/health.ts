import type { DbClient } from '../db/client.js';
import type { FastifyInstance } from 'fastify';

/**
 * Liveness + readiness endpoints (Kubernetes pattern).
 *  - `/healthz` always returns 200 unless the process is dead.
 *  - `/readyz` returns 200 only when the DB is reachable.
 */
export const registerHealthRoutes = (app: FastifyInstance, dbClient: DbClient): void => {
  app.get('/healthz', async (_req, reply) => reply.code(200).send({ status: 'ok' }));

  app.get('/readyz', async (req, reply) => {
    try {
      await dbClient.ping();
      return reply.code(200).send({ status: 'ready', checks: { database: 'ok' } });
    } catch (cause) {
      req.log.error({ err: cause }, 'readiness check failed');
      return reply.code(503).send({ status: 'not_ready', checks: { database: 'error' } });
    }
  });
};
