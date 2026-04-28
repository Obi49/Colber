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
import { registerHealthRoutes } from './health.js';
import { registerIdentityRoutes } from './routes.js';

import type { DbClient } from '../db/client.js';
import type { IdentityService } from '../domain/identity-service.js';
import type { Logger } from '@praxis/core-logger';

export interface BuildAppDeps {
  readonly logger: Logger;
  readonly dbClient: DbClient;
  readonly identityService: IdentityService;
}

/**
 * Builds the Fastify instance with plugins, error handler, and routes wired.
 * Intentionally synchronous-ish: any plugin registration happens at
 * `app.ready()` time, called by `server.ts` (or by tests via `app.inject`).
 *
 * Notes on typing:
 *   - We pass the pino logger via `loggerInstance` (the Fastify v5 API for
 *     "I already have a configured logger"). Passing it via the `logger`
 *     option fails under `exactOptionalPropertyTypes` because pino's
 *     `Logger.msgPrefix` is `string` while `LoggerOptions.msgPrefix` is
 *     not declared at all.
 *   - We do NOT pass `http2`/`https`, so Fastify picks the default HTTP/1
 *     overload. This keeps plugin typings (cors, helmet, fastify-metrics,
 *     sensible) on `RawServerDefault`.
 *   - The function signature returns the default `FastifyInstance` (with
 *     `FastifyBaseLogger`). Pino's `Logger` is a structural superset of
 *     `FastifyBaseLogger`, so the runtime instance is fully compatible —
 *     but the inferred type parameter `Logger = pino.Logger` produces a
 *     plugin-signature mismatch (fastify-metrics is typed against
 *     `FastifyBaseLogger`). We collapse the generic parameter to the
 *     default `FastifyBaseLogger` at the boundary of this function so
 *     downstream callers and plugins line up.
 */
export const buildApp = async (deps: BuildAppDeps): Promise<FastifyInstance> => {
  // Fastify with a `loggerInstance` infers its `Logger` generic from the
  // instance type. Cast to the default-generic FastifyInstance (whose
  // `Logger` is `FastifyBaseLogger`) so plugins typed against the default
  // generic resolve correctly. This is a typing-only collapse — the
  // runtime logger is the pino instance unchanged.
  const app = Fastify({
    loggerInstance: deps.logger,
    disableRequestLogging: false,
    bodyLimit: 1024 * 64, // 64KB — identity payloads are small
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'traceId',
    genReqId: () =>
      // RFC 4122 v4 — Fastify is happy with any opaque string here.
      crypto.randomUUID(),
  }) as unknown as FastifyInstance;

  await app.register(sensible);
  await app.register(helmet, { global: true });
  await app.register(cors, { origin: true });

  // Resolve the plugin callback from either the ESM `default` interop slot or
  // the bare module namespace (depends on how the runtime synthesizes the
  // CJS->ESM bridge). Both shapes appear in real-world Node 22 + ts-node /
  // tsx / pure-tsc compiled output.
  //
  // `clearRegisterOnInit: true` resets prom-client's global registry before
  // collecting default metrics. This is benign at production boot (single
  // process, single buildApp call) but essential in tests, where vitest
  // re-instantiates the app per test inside one process — without this the
  // second build throws `A metric with the name <…> has already been
  // registered`.
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

  registerHealthRoutes(app, deps.dbClient);
  registerIdentityRoutes(app, deps.identityService);

  return app;
};
