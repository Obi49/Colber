import type { DbClient } from '../db/client.js';
import type { VectorRepository } from '../domain/vector-repository.js';
import type { EmbeddingProvider } from '../embeddings/provider.js';
import type { FastifyInstance } from 'fastify';

/**
 * Liveness + readiness endpoints (Kubernetes pattern).
 *  - `/healthz` always returns 200 unless the process is dead.
 *  - `/readyz` returns 200 only when Postgres + Qdrant + Ollama are reachable.
 *
 * The Ollama check is intentionally a soft check — we do a single embed of a
 * fixed seed string. If the embedding provider is the in-process stub, this
 * is a no-op that always succeeds, which is exactly what we want in tests.
 */
export interface HealthDeps {
  readonly dbClient: DbClient;
  readonly vectors: VectorRepository;
  readonly embeddings: EmbeddingProvider;
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
    const [database, vectors, embeddings] = await Promise.all([
      safeCheck(() => deps.dbClient.ping()),
      safeCheck(() => deps.vectors.ping()),
      safeCheck(async () => {
        // One-shot probe with a tiny seed string to make sure the provider
        // is reachable. Catches Ollama being down before requests fail.
        await deps.embeddings.embed('colber readiness probe');
      }),
    ]);
    const healthy = database.ok && vectors.ok && embeddings.ok;
    if (!healthy) {
      req.log.warn({ database, vectors, embeddings }, 'readiness check failed');
    }
    return reply.code(healthy ? 200 : 503).send({
      status: healthy ? 'ready' : 'not_ready',
      checks: {
        database: database.ok ? 'ok' : 'error',
        vectors: vectors.ok ? 'ok' : 'error',
        embeddings: embeddings.ok ? 'ok' : 'error',
      },
    });
  });
};
