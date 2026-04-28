/**
 * Composition root for the observability service.
 *
 * Wires config, logger, Postgres (alert configs), ClickHouse (telemetry),
 * domain service, REST + gRPC + MCP.
 *
 * Lifecycle:
 *   1. Load + validate config (fail-fast).
 *   2. Build logger.
 *   3. Open Postgres pool. (Migrations are NOT run here — they go in Docker entrypoint.)
 *   4. Build ClickHouse client + bootstrap DDL.
 *   5. Construct domain service.
 *   6. Build Fastify (REST + /metrics + health).
 *   7. Build MCP registry.
 *   8. Build gRPC server.
 *   9. Listen on both transports + register graceful shutdown.
 */
import { createLogger } from '@praxis/core-logger';

import { ClickHouseTelemetryRepository } from './clickhouse/client.js';
import { loadAppConfig } from './config.js';
import { createDbClient } from './db/client.js';
import { DrizzleAlertRepository } from './domain/alert-repository.js';
import { ObservabilityService } from './domain/observability-service.js';
import { buildGrpcServer } from './grpc/server.js';
import { buildApp } from './http/app.js';
import { buildObservabilityMcpRegistry } from './mcp/tools.js';

const main = async (): Promise<void> => {
  const cfg = loadAppConfig();
  const logger = createLogger({
    serviceName: cfg.SERVICE_NAME,
    level: cfg.LOG_LEVEL,
    pretty: cfg.PRETTY_LOGS,
  });

  logger.info(
    { httpPort: cfg.HTTP_PORT, grpcPort: cfg.GRPC_PORT },
    'starting observability service',
  );

  const dbClient = createDbClient(cfg.DATABASE_URL);
  const telemetry = new ClickHouseTelemetryRepository({
    url: cfg.CLICKHOUSE_URL,
    username: cfg.CLICKHOUSE_USER,
    password: cfg.CLICKHOUSE_PASSWORD,
    database: cfg.CLICKHOUSE_DATABASE,
    logTtlDays: cfg.OBSERVABILITY_LOG_TTL_DAYS,
    spanTtlDays: cfg.OBSERVABILITY_SPAN_TTL_DAYS,
  });
  const alerts = new DrizzleAlertRepository(dbClient.db);

  const observability = new ObservabilityService(telemetry, alerts, {
    flushIntervalMs: cfg.OBSERVABILITY_FLUSH_INTERVAL_MS,
    flushBatchSize: cfg.OBSERVABILITY_FLUSH_BATCH,
    maxEventsPerRequest: cfg.OBSERVABILITY_MAX_EVENTS_PER_REQUEST,
    maxQueryLimit: cfg.OBSERVABILITY_MAX_QUERY_LIMIT,
  });

  // Best-effort ClickHouse DDL bootstrap. If ClickHouse is briefly unavailable
  // at boot we still bring up the HTTP server (readiness will fail until the
  // first /readyz call retries).
  try {
    await observability.init();
  } catch (err) {
    logger.warn({ err }, 'failed to bootstrap ClickHouse schema; will retry on demand');
  }

  const app = await buildApp({
    logger,
    dbClient,
    telemetry,
    observability,
  });

  // MCP registry built but exposed lazily — there is no MCP transport in P2.
  const mcpRegistry = buildObservabilityMcpRegistry(observability);
  logger.info(
    { tools: mcpRegistry.list().map((t) => `${t.name}@${t.version}`) },
    'MCP tools registered',
  );

  const grpc = buildGrpcServer(observability, logger);

  await app.listen({ host: cfg.HTTP_HOST, port: cfg.HTTP_PORT });
  await grpc.start(cfg.GRPC_HOST, cfg.GRPC_PORT);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    try {
      await app.close();
      await grpc.stop();
      await observability.shutdown();
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
