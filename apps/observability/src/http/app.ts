import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance, type FastifyPluginCallback } from 'fastify';
// `fastify-metrics` is published as CommonJS with a default export.
// Under `moduleResolution: NodeNext`, the default import of a CJS module
// resolves to the module namespace object (not the `default` property).
// Reach into the namespace explicitly to grab the actual plugin callback.
import * as metricsModule from 'fastify-metrics';

import { errorHandler } from './error-handler.js';
import { registerHealthRoutes, type HealthDeps } from './health.js';
import { registerObservabilityRoutes } from './routes.js';

import type { ObservabilityService } from '../domain/observability-service.js';
import type { Logger } from '@praxis/core-logger';

export interface BuildAppDeps extends HealthDeps {
  readonly logger: Logger;
  readonly observability: ObservabilityService;
}

/**
 * Builds the Fastify instance with plugins, error handler, and routes wired.
 *
 * Note: ingestion endpoints carry larger bodies than other services
 * (1000 events × ~512 B headroom). Body limit is bumped to 8 MB.
 */
export const buildApp = async (deps: BuildAppDeps): Promise<FastifyInstance> => {
  const app = Fastify({
    loggerInstance: deps.logger,
    disableRequestLogging: false,
    bodyLimit: 8 * 1024 * 1024,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'traceId',
    genReqId: () => crypto.randomUUID(),
  }) as unknown as FastifyInstance;

  await app.register(sensible);
  await app.register(helmet, { global: true });
  await app.register(cors, { origin: true });

  const metricsPlugin = ((metricsModule as { default?: unknown }).default ??
    metricsModule) as FastifyPluginCallback<{
    endpoint: string;
    clearRegisterOnInit: boolean;
    routeMetrics: { enabled: boolean; groupStatusCodes: boolean };
  }>;
  await app.register(metricsPlugin, {
    endpoint: '/metrics',
    clearRegisterOnInit: true,
    routeMetrics: {
      enabled: true,
      groupStatusCodes: true,
    },
  });

  app.setErrorHandler(errorHandler);

  registerHealthRoutes(app, {
    dbClient: deps.dbClient,
    telemetry: deps.telemetry,
  });
  registerObservabilityRoutes(app, deps.observability);

  return app;
};
