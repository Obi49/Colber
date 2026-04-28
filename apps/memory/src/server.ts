/**
 * Composition root for the memory service.
 * Wires config, logger, Postgres, Qdrant, embedding provider, encryption,
 * domain service, REST + gRPC + MCP.
 *
 * Lifecycle:
 *   1. Load + validate config (fail-fast).
 *   2. Build logger.
 *   3. Open Postgres pool. (Migrations are NOT run here — they go in Docker entrypoint.)
 *   4. Build Qdrant client + ensure collection.
 *   5. Build embedding provider (Ollama or stub).
 *   6. Build encryption service (single-key AES-GCM).
 *   7. Construct domain service.
 *   8. Build Fastify (REST + /metrics + health).
 *   9. Build MCP registry.
 *  10. Build gRPC server.
 *  11. Listen on both transports + register graceful shutdown.
 */
import { createLogger } from '@praxis/core-logger';

import { loadAppConfig } from './config.js';
import { createDbClient } from './db/client.js';
import { AesGcmEncryptionService } from './domain/encryption.js';
import { DrizzleMemoryRepository } from './domain/memory-repository.js';
import { MemoryService } from './domain/memory-service.js';
import { PostgresOperatorResolver } from './domain/operator-resolver.js';
import { buildEmbeddingProvider } from './embeddings/factory.js';
import { buildGrpcServer } from './grpc/server.js';
import { buildApp } from './http/app.js';
import { buildMemoryMcpRegistry } from './mcp/tools.js';
import { createQdrantVectorRepository } from './qdrant/client.js';

const main = async (): Promise<void> => {
  const cfg = loadAppConfig();
  const logger = createLogger({
    serviceName: cfg.SERVICE_NAME,
    level: cfg.LOG_LEVEL,
    pretty: cfg.PRETTY_LOGS,
  });

  logger.info({ httpPort: cfg.HTTP_PORT, grpcPort: cfg.GRPC_PORT }, 'starting memory service');

  const dbClient = createDbClient(cfg.DATABASE_URL);
  const vectors = createQdrantVectorRepository({
    url: cfg.QDRANT_URL,
    ...(cfg.QDRANT_API_KEY !== undefined ? { apiKey: cfg.QDRANT_API_KEY } : {}),
    collection: cfg.QDRANT_COLLECTION,
  });
  const embeddings = buildEmbeddingProvider({
    provider: cfg.MEMORY_EMBEDDING_PROVIDER,
    dim: cfg.MEMORY_EMBEDDING_DIM,
    model: cfg.OLLAMA_EMBED_MODEL,
    ollamaUrl: cfg.OLLAMA_URL,
  });
  const encryption = new AesGcmEncryptionService({ keyB64: cfg.MEMORY_ENCRYPTION_KEY });
  const operators = new PostgresOperatorResolver(dbClient.db);
  const repo = new DrizzleMemoryRepository(dbClient.db);

  const memoryService = new MemoryService(repo, vectors, embeddings, encryption, operators, {
    maxVersions: cfg.MEMORY_MAX_VERSIONS,
  });

  // Best-effort collection bootstrap. If Qdrant is briefly unavailable at
  // boot we still bring up the HTTP server (readiness will fail until the
  // first /readyz call retries) — this matches how Postgres migrations are
  // managed.
  try {
    await memoryService.init();
  } catch (err) {
    logger.warn({ err }, 'failed to initialise Qdrant collection; will retry on demand');
  }

  const app = await buildApp({
    logger,
    dbClient,
    vectors,
    embeddings,
    memoryService,
  });

  // MCP registry built but exposed lazily — there is no MCP transport in P0.
  const mcpRegistry = buildMemoryMcpRegistry(memoryService);
  logger.info(
    { tools: mcpRegistry.list().map((t) => `${t.name}@${t.version}`) },
    'MCP tools registered',
  );

  const grpc = buildGrpcServer(memoryService, logger);

  await app.listen({ host: cfg.HTTP_HOST, port: cfg.HTTP_PORT });
  await grpc.start(cfg.GRPC_HOST, cfg.GRPC_PORT);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    try {
      await app.close();
      await grpc.stop();
      await vectors.close();
      await dbClient.close();
      logger.info('shutdown complete');
      process.exit(0);
    } catch (cause) {
      logger.error({ err: cause }, 'error during shutdown');
      process.exit(1);
    }
  };

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      void shutdown(sig);
    });
  }
};

main().catch((err: unknown) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
