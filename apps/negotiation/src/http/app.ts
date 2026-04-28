import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance, type FastifyPluginCallback } from 'fastify';
// `fastify-metrics` is published as CommonJS with a default export. Under
// `moduleResolution: NodeNext` the default import resolves to the module
// namespace object, so reach into it explicitly to pick up the plugin.
import * as metricsModule from 'fastify-metrics';

import { errorHandler } from './error-handler.js';
import { registerHealthRoutes, type HealthDeps } from './health.js';
import { registerNegotiationRoutes } from './routes.js';

import type { NegotiationService } from '../domain/negotiation-service.js';
import type { Logger } from '@praxis/core-logger';

export interface BuildAppDeps extends HealthDeps {
  readonly logger: Logger;
  readonly negotiation: NegotiationService;
}

/**
 * Builds the Fastify instance with plugins, error handler, and routes wired.
 */
export const buildApp = async (deps: BuildAppDeps): Promise<FastifyInstance> => {
  const app = Fastify({
    loggerInstance: deps.logger,
    disableRequestLogging: false,
    bodyLimit: 4 * 1024 * 1024,
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

  registerHealthRoutes(app, { dbClient: deps.dbClient });
  registerNegotiationRoutes(app, deps.negotiation);

  return app;
};
