import { defineMcpTool, McpToolRegistry } from '@praxis/core-mcp';
import { z } from 'zod';

import {
  AlertCreateRequestSchema,
  AlertResponseSchema,
  AlertListResponseSchema,
  AlertUpdateRequestSchema,
  IngestLogsRequestSchema,
  IngestResponseSchema,
  IngestSpansRequestSchema,
  QueryRequestSchema,
  QueryResponseSchema,
} from '../http/schemas.js';

import type { AlertRule } from '../domain/alert-types.js';
import type { ObservabilityService } from '../domain/observability-service.js';

/**
 * MCP tools exposed by the observability service.
 * Names follow the Praxis convention `<module>.<verb>` (CDC §2.3).
 *
 * Tools:
 *   - observability.log    : ingest one or more log events.
 *   - observability.trace  : ingest one or more trace spans.
 *   - observability.query  : structured search of logs/spans.
 *   - observability.alert  : CRUD for declarative alert rules
 *                            (action: create|read|list|update|delete).
 */

const alertToWire = (a: AlertRule): z.infer<typeof AlertResponseSchema> => ({
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

const AlertActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), data: AlertCreateRequestSchema }),
  z.object({ action: z.literal('read'), id: z.string().uuid() }),
  z.object({ action: z.literal('list'), operatorId: z.string().min(1).max(256) }),
  z.object({ action: z.literal('update'), id: z.string().uuid(), data: AlertUpdateRequestSchema }),
  z.object({ action: z.literal('delete'), id: z.string().uuid() }),
]);

const AlertActionResponseSchema = z.union([
  AlertResponseSchema,
  AlertListResponseSchema,
  z.object({ deleted: z.literal(true), id: z.string().uuid() }),
]);

export const buildObservabilityMcpRegistry = (
  service: ObservabilityService,
): McpToolRegistry => {
  const registry = new McpToolRegistry();

  // ---------------------------------------------------------------------
  // observability.log
  // ---------------------------------------------------------------------
  registry.register(
    defineMcpTool({
      name: 'observability.log',
      version: '1.0.0',
      description:
        'Ingest one or more log events. Batched for ClickHouse insertion. Returns the count of accepted events plus per-event rejection reasons for any that failed validation.',
      inputSchema: IngestLogsRequestSchema,
      outputSchema: IngestResponseSchema,
      handler: async (input) => service.ingestLogs(input.events),
    }),
  );

  // ---------------------------------------------------------------------
  // observability.trace
  // ---------------------------------------------------------------------
  registry.register(
    defineMcpTool({
      name: 'observability.trace',
      version: '1.0.0',
      description:
        'Ingest one or more W3C-aligned trace spans. Batched for ClickHouse insertion. Returns the count of accepted spans plus per-span rejection reasons.',
      inputSchema: IngestSpansRequestSchema,
      outputSchema: IngestResponseSchema,
      handler: async (input) => service.ingestSpans(input.spans),
    }),
  );

  // ---------------------------------------------------------------------
  // observability.query
  // ---------------------------------------------------------------------
  registry.register(
    defineMcpTool({
      name: 'observability.query',
      version: '1.0.0',
      description:
        'Structured search over logs or trace spans within a time range. Returns matching rows ordered by timestamp descending, paginated by limit + offset.',
      inputSchema: QueryRequestSchema,
      outputSchema: QueryResponseSchema,
      handler: async (input) => {
        const rows = await service.query({
          scope: input.scope,
          filters: input.filters,
          timeRange: input.timeRange,
          limit: input.limit,
          offset: input.offset,
        });
        return { rows, total: rows.length };
      },
    }),
  );

  // ---------------------------------------------------------------------
  // observability.alert (CRUD)
  // ---------------------------------------------------------------------
  registry.register(
    defineMcpTool({
      name: 'observability.alert',
      version: '1.0.0',
      description:
        'Manage declarative alert rules. Action discriminator selects between create/read/list/update/delete. Storage only — the evaluation engine is not implemented in this service yet.',
      inputSchema: AlertActionSchema,
      outputSchema: AlertActionResponseSchema,
      handler: async (input) => {
        switch (input.action) {
          case 'create': {
            const alert = await service.createAlert({
              ownerOperatorId: input.data.ownerOperatorId,
              name: input.data.name,
              description: input.data.description,
              enabled: input.data.enabled,
              scope: input.data.scope,
              condition: input.data.condition,
              cooldownSeconds: input.data.cooldownSeconds,
              notification: input.data.notification,
            });
            return alertToWire(alert);
          }
          case 'read': {
            const alert = await service.getAlert(input.id);
            return alertToWire(alert);
          }
          case 'list': {
            const alerts = await service.listAlerts(input.operatorId);
            return { alerts: alerts.map(alertToWire) };
          }
          case 'update': {
            const alert = await service.updateAlert(input.id, {
              ...(input.data.name !== undefined ? { name: input.data.name } : {}),
              ...(input.data.description !== undefined
                ? { description: input.data.description }
                : {}),
              ...(input.data.enabled !== undefined ? { enabled: input.data.enabled } : {}),
              ...(input.data.scope !== undefined ? { scope: input.data.scope } : {}),
              ...(input.data.condition !== undefined ? { condition: input.data.condition } : {}),
              ...(input.data.cooldownSeconds !== undefined
                ? { cooldownSeconds: input.data.cooldownSeconds }
                : {}),
              ...(input.data.notification !== undefined
                ? { notification: input.data.notification }
                : {}),
            });
            return alertToWire(alert);
          }
          case 'delete': {
            await service.deleteAlert(input.id);
            return { deleted: true as const, id: input.id };
          }
        }
      },
    }),
  );

  return registry;
};
