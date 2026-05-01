/**
 * Composition root for the insurance broker service.
 *
 * Wires config, logger, Postgres store, reputation client, pricing engine,
 * REST + gRPC + MCP.
 *
 * Lifecycle:
 *   1. Load + validate config (fail-fast).
 *   2. Build logger.
 *   3. Open Postgres pool. (Migrations run separately via `db:migrate`.)
 *   4. Construct ReputationClient + PricingEngine + DrizzlePolicyStore +
 *      InsuranceService.
 *   5. Build Fastify (REST + /metrics + health).
 *   6. Build MCP registry.
 *   7. Build gRPC server.
 *   8. Listen + register graceful shutdown.
 */
import { createLogger } from '@colber/core-logger';

import { loadAppConfig } from './config.js';
import { createDbClient } from './db/client.js';
import { DrizzlePolicyStore } from './db/policy-store.js';
import { InsuranceService } from './domain/insurance-service.js';
import { PricingEngine } from './domain/pricing.js';
import { buildGrpcServer } from './grpc/server.js';
import { buildApp } from './http/app.js';
import { HttpReputationClient } from './integrations/reputation-client.js';
import { buildInsuranceMcpRegistry } from './mcp/tools.js';

const main = async (): Promise<void> => {
  const cfg = loadAppConfig();
  const logger = createLogger({
    serviceName: cfg.SERVICE_NAME,
    level: cfg.LOG_LEVEL,
    pretty: cfg.PRETTY_LOGS,
  });

  logger.info(
    { httpPort: cfg.HTTP_PORT, grpcPort: cfg.GRPC_PORT, adminEnabled: cfg.INSURANCE_ADMIN_ENABLED },
    'starting insurance service',
  );

  const dbClient = createDbClient(cfg.DATABASE_URL);
  const reputation = new HttpReputationClient({
    baseUrl: cfg.REPUTATION_URL,
    cacheTtlSeconds: cfg.INSURANCE_REPUTATION_CACHE_TTL_SECONDS,
    logger,
  });
  const pricing = new PricingEngine(reputation, {
    baseRateBps: cfg.INSURANCE_BASE_RATE_BPS,
    quoteValiditySeconds: cfg.INSURANCE_QUOTE_VALIDITY_SECONDS,
  });
  const store = new DrizzlePolicyStore(dbClient);
  const insurance = new InsuranceService(pricing, store, {
    defaultPolicyDurationHours: cfg.INSURANCE_DEFAULT_POLICY_DURATION_HOURS,
    maxGlobalExposureUsdc: cfg.INSURANCE_MAX_GLOBAL_EXPOSURE_USDC,
  });

  const app = await buildApp({
    logger,
    dbClient,
    reputation,
    insurance,
    adminEnabled: cfg.INSURANCE_ADMIN_ENABLED,
  });

  const mcpRegistry = buildInsuranceMcpRegistry(insurance);
  logger.info(
    { tools: mcpRegistry.list().map((t) => `${t.name}@${t.version}`) },
    'MCP tools registered',
  );

  const grpc = buildGrpcServer(insurance, logger);

  await app.listen({ host: cfg.HTTP_HOST, port: cfg.HTTP_PORT });
  await grpc.start(cfg.GRPC_HOST, cfg.GRPC_PORT);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    try {
      await app.close();
      await grpc.stop();
      await insurance.shutdown();
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
