import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance } from 'fastify';
import metricsPlugin from 'fastify-metrics';

import type { Logger } from '@praxis/core-logger';

import type { DbClient } from '../db/client.js';
import type { IdentityService } from '../domain/identity-service.js';
import { errorHandler } from './error-handler.js';
import { registerHealthRoutes } from './health.js';
import { registerIdentityRoutes } from './routes.js';

export interface BuildAppDeps {
  readonly logger: Logger;
  readonly dbClient: DbClient;
  readonly identityService: IdentityService;
}

/**
 * Builds the Fastify instance with plugins, error handler, and routes wired.
 * Intentionally synchronous-ish: any plugin registration happens at
 * `app.ready()` time, called by `server.ts` (or by tests via `app.inject`).
 */
export const buildApp = async (deps: BuildAppDeps): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: deps.logger,
    disableRequestLogging: false,
    bodyLimit: 1024 * 64, // 64KB — identity payloads are small
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'traceId',
    genReqId: () =>
      // RFC 4122 v4 — Fastify is happy with any opaque string here.
      crypto.randomUUID(),
  });

  await app.register(sensible);
  await app.register(helmet, { global: true });
  await app.register(cors, { origin: true });
  await app.register(metricsPlugin, {
    endpoint: '/metrics',
    routeMetrics: {
      enabled: true,
      groupStatusCodes: true,
    },
  });

  app.setErrorHandler(errorHandler);

  registerHealthRoutes(app, deps.dbClient);
  registerIdentityRoutes(app, deps.identityService);

  return app;
};
