/**
 * Composition root for the agent-identity service.
 * Wires config, logger, DB, domain service, REST + gRPC + MCP transports.
 *
 * Lifecycle:
 *   1. Load + validate config (fail-fast).
 *   2. Build logger.
 *   3. Open DB pool. (Migrations are NOT run here — they go in Docker entrypoint.)
 *   4. Construct domain service.
 *   5. Build Fastify (REST + /metrics + health).
 *   6. Build MCP registry.
 *   7. Build gRPC server.
 *   8. Listen on both transports + register graceful shutdown.
 */
import { createLogger } from '@colber/core-logger';

import { loadAppConfig } from './config.js';
import { createDbClient } from './db/client.js';
import { DrizzleAgentRepository } from './domain/agent-repository.js';
import { IdentityService } from './domain/identity-service.js';
import { buildGrpcServer } from './grpc/server.js';
import { buildApp } from './http/app.js';
import { buildIdentityMcpRegistry } from './mcp/tools.js';

const main = async (): Promise<void> => {
  const cfg = loadAppConfig();
  const logger = createLogger({
    serviceName: cfg.SERVICE_NAME,
    level: cfg.LOG_LEVEL,
    pretty: cfg.PRETTY_LOGS,
  });

  logger.info({ httpPort: cfg.HTTP_PORT, grpcPort: cfg.GRPC_PORT }, 'starting agent-identity');

  const dbClient = createDbClient(cfg.DATABASE_URL);
  const repo = new DrizzleAgentRepository(dbClient.db);
  const identityService = new IdentityService(repo);

  const app = await buildApp({ logger, dbClient, identityService });

  // MCP registry built but exposed lazily — there is no MCP transport in P0.
  // We still construct it so its tools register and their schemas are visible
  // in tests / future MCP server transport wiring.
  const mcpRegistry = buildIdentityMcpRegistry(identityService);
  logger.info(
    { tools: mcpRegistry.list().map((t) => `${t.name}@${t.version}`) },
    'MCP tools registered',
  );

  const grpc = buildGrpcServer(identityService, logger);

  await app.listen({ host: cfg.HTTP_HOST, port: cfg.HTTP_PORT });
  await grpc.start(cfg.GRPC_HOST, cfg.GRPC_PORT);

  // ---- graceful shutdown ----
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    try {
      await app.close();
      await grpc.stop();
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
