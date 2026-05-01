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
import { registerReputationRoutes } from './routes.js';

import type { ReputationService } from '../domain/reputation-service.js';
import type { Logger } from '@colber/core-logger';

export interface BuildAppDeps extends HealthDeps {
  readonly logger: Logger;
  readonly reputationService: ReputationService;
}

/**
 * Builds the Fastify instance with plugins, error handler, and routes wired.
 *
 * Notes on typing — see agent-identity/src/http/app.ts. We mirror the same
 * approach: pass the pino logger via `loggerInstance`, collapse the generic
 * back to `FastifyBaseLogger` at the boundary so plugins typed against the
 * default generic resolve correctly.
 */
export const buildApp = async (deps: BuildAppDeps): Promise<FastifyInstance> => {
  const app = Fastify({
    loggerInstance: deps.logger,
    disableRequestLogging: false,
    bodyLimit: 1024 * 64, // 64 KB — reputation payloads are small
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
    graphRepo: deps.graphRepo,
    cache: deps.cache,
  });
  registerReputationRoutes(app, deps.reputationService);

  return app;
};
