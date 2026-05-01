import {
  AlertCreateRequestSchema,
  AlertListQuerySchema,
  AlertListResponseSchema,
  AlertParamsSchema,
  AlertResponseSchema,
  AlertUpdateRequestSchema,
  IngestLogsRequestSchema,
  IngestResponseSchema,
  IngestSpansRequestSchema,
  QueryRequestSchema,
  QueryResponseSchema,
  type AlertListResponse,
  type AlertResponse,
  type IngestResponse,
  type QueryResponse,
} from './schemas.js';

import type { AlertRule } from '../domain/alert-types.js';
import type { ObservabilityService } from '../domain/observability-service.js';
import type { FastifyInstance } from 'fastify';

/**
 * Wires the REST endpoints under `/v1/observability*`:
 *
 *   POST   /v1/observability/logs                → observability.log
 *   POST   /v1/observability/traces              → observability.trace
 *   POST   /v1/observability/query               → observability.query
 *   GET    /v1/observability/alerts              → list alerts
 *   POST   /v1/observability/alerts              → create alert
 *   GET    /v1/observability/alerts/:id          → read alert
 *   PATCH  /v1/observability/alerts/:id          → update alert
 *   DELETE /v1/observability/alerts/:id          → delete alert
 *
 * All responses follow the `{ ok, data | error }` envelope from
 * `@colber/core-types`.
 */

const alertToResponse = (a: AlertRule): AlertResponse =>
  AlertResponseSchema.parse({
    id: a.id,
    ownerOperatorId: a.ownerOperatorId,
    name: a.name,
    description: a.description,
    enabled: a.enabled,
    scope: a.scope,
    condition: a.condition,
    cooldownSeconds: a.cooldownSeconds,
    notification: a.notification,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  });

export const registerObservabilityRoutes = (
  app: FastifyInstance,
  service: ObservabilityService,
): void => {
  // -----------------------------------------------------------------
  // POST /v1/observability/logs
  // -----------------------------------------------------------------
  app.post('/v1/observability/logs', async (req, reply) => {
    const body = IngestLogsRequestSchema.parse(req.body);
    const result = await service.ingestLogs(body.events);
    const response: IngestResponse = IngestResponseSchema.parse(result);
    return reply.code(202).send({ ok: true, data: response });
  });

  // -----------------------------------------------------------------
  // POST /v1/observability/traces
  // -----------------------------------------------------------------
  app.post('/v1/observability/traces', async (req, reply) => {
    const body = IngestSpansRequestSchema.parse(req.body);
    const result = await service.ingestSpans(body.spans);
    const response: IngestResponse = IngestResponseSchema.parse(result);
    return reply.code(202).send({ ok: true, data: response });
  });

  // -----------------------------------------------------------------
  // POST /v1/observability/query
  // -----------------------------------------------------------------
  app.post('/v1/observability/query', async (req, reply) => {
    const body = QueryRequestSchema.parse(req.body);
    const rows = await service.query({
      scope: body.scope,
      filters: body.filters,
      timeRange: body.timeRange,
      limit: body.limit,
      offset: body.offset,
    });
    const response: QueryResponse = QueryResponseSchema.parse({
      rows,
      total: rows.length,
    });
    return reply.code(200).send({ ok: true, data: response });
  });

  // -----------------------------------------------------------------
  // GET /v1/observability/alerts?operatorId=...
  // -----------------------------------------------------------------
  app.get<{ Querystring: { operatorId?: string } }>(
    '/v1/observability/alerts',
    async (req, reply) => {
      const { operatorId } = AlertListQuerySchema.parse(req.query);
      const alerts = await service.listAlerts(operatorId);
      const response: AlertListResponse = AlertListResponseSchema.parse({
        alerts: alerts.map(alertToResponse),
      });
      return reply.code(200).send({ ok: true, data: response });
    },
  );

  // -----------------------------------------------------------------
  // POST /v1/observability/alerts
  // -----------------------------------------------------------------
  app.post('/v1/observability/alerts', async (req, reply) => {
    const body = AlertCreateRequestSchema.parse(req.body);
    const alert = await service.createAlert({
      ownerOperatorId: body.ownerOperatorId,
      name: body.name,
      description: body.description,
      enabled: body.enabled,
      scope: body.scope,
      condition: body.condition,
      cooldownSeconds: body.cooldownSeconds,
      notification: body.notification,
    });
    return reply.code(201).send({ ok: true, data: alertToResponse(alert) });
  });

  // -----------------------------------------------------------------
  // GET /v1/observability/alerts/:id
  // -----------------------------------------------------------------
  app.get<{ Params: { id: string } }>('/v1/observability/alerts/:id', async (req, reply) => {
    const { id } = AlertParamsSchema.parse(req.params);
    const alert = await service.getAlert(id);
    return reply.code(200).send({ ok: true, data: alertToResponse(alert) });
  });

  // -----------------------------------------------------------------
  // PATCH /v1/observability/alerts/:id
  // -----------------------------------------------------------------
  app.patch<{ Params: { id: string } }>('/v1/observability/alerts/:id', async (req, reply) => {
    const { id } = AlertParamsSchema.parse(req.params);
    const body = AlertUpdateRequestSchema.parse(req.body);
    const alert = await service.updateAlert(id, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.scope !== undefined ? { scope: body.scope } : {}),
      ...(body.condition !== undefined ? { condition: body.condition } : {}),
      ...(body.cooldownSeconds !== undefined ? { cooldownSeconds: body.cooldownSeconds } : {}),
      ...(body.notification !== undefined ? { notification: body.notification } : {}),
    });
    return reply.code(200).send({ ok: true, data: alertToResponse(alert) });
  });

  // -----------------------------------------------------------------
  // DELETE /v1/observability/alerts/:id
  // -----------------------------------------------------------------
  app.delete<{ Params: { id: string } }>('/v1/observability/alerts/:id', async (req, reply) => {
    const { id } = AlertParamsSchema.parse(req.params);
    await service.deleteAlert(id);
    return reply.code(204).send();
  });
};
