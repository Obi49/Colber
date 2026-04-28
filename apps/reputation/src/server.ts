/**
 * Composition root for the reputation service.
 * Wires config, logger, Postgres, Neo4j, Redis, domain service, REST + gRPC + MCP.
 *
 * Lifecycle:
 *   1. Load + validate config (fail-fast).
 *   2. Build logger.
 *   3. Open Postgres pool. (Migrations are NOT run here — they go in Docker entrypoint.)
 *   4. Open Neo4j driver, ensure constraints.
 *   5. Open Redis client.
 *   6. Construct domain service + initialise platform key.
 *   7. Build Fastify (REST + /metrics + health).
 *   8. Build MCP registry.
 *   9. Build gRPC server.
 *  10. Listen on both transports + register graceful shutdown.
 */
import { createLogger } from '@praxis/core-logger';

import { loadAppConfig } from './config.js';
import { createDbClient } from './db/client.js';
import { DrizzleFeedbackRepository } from './domain/feedback-repository.js';
import { CompositeIdentityResolver } from './domain/identity-resolver.js';
import { ReputationService } from './domain/reputation-service.js';
import { DrizzleSnapshotRepository } from './domain/snapshot-repository.js';
import { buildGrpcServer } from './grpc/server.js';
import { buildApp } from './http/app.js';
import { buildReputationMcpRegistry } from './mcp/tools.js';
import { bootstrapNeo4jSchema, createNeo4jClient } from './neo4j/client.js';
import { createRedisScoreCache } from './redis/client.js';

const main = async (): Promise<void> => {
  const cfg = loadAppConfig();
  const logger = createLogger({
    serviceName: cfg.SERVICE_NAME,
    level: cfg.LOG_LEVEL,
    pretty: cfg.PRETTY_LOGS,
  });

  logger.info({ httpPort: cfg.HTTP_PORT, grpcPort: cfg.GRPC_PORT }, 'starting reputation service');

  const dbClient = createDbClient(cfg.DATABASE_URL);
  const neo4jClient = createNeo4jClient({
    url: cfg.NEO4J_BOLT_URL,
    username: cfg.NEO4J_USERNAME,
    password: cfg.NEO4J_PASSWORD,
    database: cfg.NEO4J_DATABASE,
  });
  const cache = createRedisScoreCache(cfg.REDIS_URL);

  // Best-effort schema bootstrap. If Neo4j is briefly unavailable at boot
  // we still bring up the HTTP server (readiness will fail until /readyz
  // can connect) — this matches how Postgres migrations are managed.
  try {
    await bootstrapNeo4jSchema(neo4jClient);
  } catch (err) {
    logger.warn({ err }, 'failed to bootstrap Neo4j schema; will retry on demand');
  }

  const snapshotRepo = new DrizzleSnapshotRepository(dbClient.db);
  const feedbackRepo = new DrizzleFeedbackRepository(dbClient.db);
  const identityResolver = new CompositeIdentityResolver(dbClient.db);

  const reputationService = new ReputationService(
    neo4jClient,
    snapshotRepo,
    feedbackRepo,
    cache,
    identityResolver,
    {
      scoring: {
        txDelta: cfg.REPUTATION_SCORE_TX_DELTA,
        negFeedbackPenalty: cfg.REPUTATION_SCORE_NEG_FEEDBACK_PENALTY,
        decayDays: cfg.REPUTATION_SCORE_DECAY_DAYS,
      },
      cacheTtlSeconds: cfg.REPUTATION_SCORE_CACHE_TTL_SECONDS,
      platformPrivateKeyB64: cfg.REPUTATION_PLATFORM_PRIVATE_KEY,
      platformPublicKeyB64: cfg.REPUTATION_PLATFORM_PUBLIC_KEY,
    },
  );
  await reputationService.init();

  const app = await buildApp({
    logger,
    dbClient,
    graphRepo: neo4jClient,
    cache,
    reputationService,
  });

  // MCP registry built but exposed lazily — there is no MCP transport in P0.
  const mcpRegistry = buildReputationMcpRegistry(reputationService);
  logger.info(
    { tools: mcpRegistry.list().map((t) => `${t.name}@${t.version}`) },
    'MCP tools registered',
  );

  const grpc = buildGrpcServer(reputationService, logger);

  await app.listen({ host: cfg.HTTP_HOST, port: cfg.HTTP_PORT });
  await grpc.start(cfg.GRPC_HOST, cfg.GRPC_PORT);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    try {
      await app.close();
      await grpc.stop();
      await neo4jClient.close();
      await cache.close();
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
