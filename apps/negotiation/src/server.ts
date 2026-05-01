/**
 * Composition root for the negotiation broker service.
 *
 * Wires config, logger, Postgres event store, domain service, REST + gRPC + MCP.
 *
 * Lifecycle:
 *   1. Load + validate config (fail-fast).
 *   2. Build logger.
 *   3. Open Postgres pool. (Migrations run separately via `db:migrate`.)
 *   4. Construct DrizzlePostgresEventStore + NegotiationService.
 *   5. Build Fastify (REST + /metrics + health).
 *   6. Build MCP registry.
 *   7. Build gRPC server.
 *   8. Listen + register graceful shutdown.
 */
import { createLogger } from '@colber/core-logger';

import { loadAppConfig } from './config.js';
import { createDbClient } from './db/client.js';
import { DrizzlePostgresEventStore } from './db/event-store.js';
import { NegotiationService } from './domain/negotiation-service.js';
import { buildGrpcServer } from './grpc/server.js';
import { buildApp } from './http/app.js';
import { buildNegotiationMcpRegistry } from './mcp/tools.js';

const main = async (): Promise<void> => {
  const cfg = loadAppConfig();
  const logger = createLogger({
    serviceName: cfg.SERVICE_NAME,
    level: cfg.LOG_LEVEL,
    pretty: cfg.PRETTY_LOGS,
  });

  logger.info({ httpPort: cfg.HTTP_PORT, grpcPort: cfg.GRPC_PORT }, 'starting negotiation service');

  const dbClient = createDbClient(cfg.DATABASE_URL);
  const store = new DrizzlePostgresEventStore(dbClient);
  const negotiation = new NegotiationService(store, {
    maxProposalsPerNegotiation: cfg.NEGOTIATION_MAX_PROPOSALS_PER_NEGOTIATION,
    maxParties: cfg.NEGOTIATION_MAX_PARTIES,
    defaultDeadlineHours: cfg.NEGOTIATION_DEFAULT_DEADLINE_HOURS,
  });

  const app = await buildApp({
    logger,
    dbClient,
    negotiation,
  });

  const mcpRegistry = buildNegotiationMcpRegistry(negotiation);
  logger.info(
    { tools: mcpRegistry.list().map((t) => `${t.name}@${t.version}`) },
    'MCP tools registered',
  );

  const grpc = buildGrpcServer(negotiation, logger);

  await app.listen({ host: cfg.HTTP_HOST, port: cfg.HTTP_PORT });
  await grpc.start(cfg.GRPC_HOST, cfg.GRPC_PORT);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    try {
      await app.close();
      await grpc.stop();
      await negotiation.shutdown();
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
