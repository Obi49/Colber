import type { DbClient } from '../db/client.js';
import type { TelemetryRepository } from '../domain/log-repository.js';
import type { FastifyInstance } from 'fastify';

/**
 * Liveness + readiness endpoints (Kubernetes pattern).
 *  - `/healthz` always returns 200 unless the process is dead.
 *  - `/readyz` returns 200 only when Postgres + ClickHouse are reachable.
 */
export interface HealthDeps {
  readonly dbClient: DbClient;
  readonly telemetry: TelemetryRepository;
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
    const [database, clickhouse] = await Promise.all([
      safeCheck(() => deps.dbClient.ping()),
      safeCheck(() => deps.telemetry.ping()),
    ]);
    const healthy = database.ok && clickhouse.ok;
    if (!healthy) {
      req.log.warn({ database, clickhouse }, 'readiness check failed');
    }
    return reply.code(healthy ? 200 : 503).send({
      status: healthy ? 'ready' : 'not_ready',
      checks: {
        database: database.ok ? 'ok' : 'error',
        clickhouse: clickhouse.ok ? 'ok' : 'error',
      },
    });
  });
};
