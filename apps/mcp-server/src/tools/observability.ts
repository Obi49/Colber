/**
 * MCP tools for the `observability` module.
 *
 * The internal service exposes a SINGLE composite `observability.alert` tool
 * with a discriminated `action` field. For the external MCP server we
 * **expand** that into 5 distinct tools — LLM clients deal much better with
 * a flat tool list than with a polymorphic action union.
 *
 *   - colber_observability_log
 *   - colber_observability_trace
 *   - colber_observability_query
 *   - colber_observability_alert_create
 *   - colber_observability_alert_get
 *   - colber_observability_alert_patch
 *   - colber_observability_alert_list
 *   - colber_observability_alert_delete
 *
 * Total: 8 tools (3 ingest/query + 5 alert CRUD).
 */

import { z } from 'zod';

import type { ToolRegistry } from './registry.js';
import type { ColberClient } from '@colber/sdk';

const FilterOperatorSchema = z.enum([
  'eq',
  'neq',
  'in',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'matches',
]);

const FilterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.array(z.number()),
  z.array(z.union([z.string(), z.number()])),
]);

const QueryFilterSchema = z.object({
  field: z.string().min(1).max(128),
  op: FilterOperatorSchema,
  value: FilterValueSchema,
});

const AlertScopeSchema = z.enum(['logs', 'spans']);
const AlertCombinatorSchema = z.enum(['and', 'or']);

const AlertConditionSchema = z.object({
  operator: AlertCombinatorSchema,
  filters: z.array(QueryFilterSchema).min(1).max(64),
  windowSeconds: z.number().int().min(1).max(86_400),
  threshold: z.number().int().min(1).max(1_000_000),
});

const NotificationChannelSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('webhook'), url: z.string().url() }),
  z.object({ type: z.literal('slack'), channel: z.string().min(1) }),
  z.object({
    type: z.literal('email'),
    recipients: z.array(z.string().email()).min(1).max(64),
  }),
]);

const NotificationConfigSchema = z.object({
  channels: z.array(NotificationChannelSchema).max(16),
});

export const registerObservabilityTools = (registry: ToolRegistry, sdk: ColberClient): void => {
  // -----------------------------------------------------------------
  // Ingestion
  // -----------------------------------------------------------------
  registry.register({
    name: 'colber_observability_log',
    description:
      '[Colber] Ingest one or more log events. Batched for ClickHouse insertion. Returns the count of accepted events plus per-event rejection reasons for any that failed validation.',
    inputSchema: z.object({
      events: z.array(z.unknown()).min(1).max(10_000),
    }),
    handler: (input) => sdk.observability.ingestLogs({ events: input.events }),
  });

  registry.register({
    name: 'colber_observability_trace',
    description:
      '[Colber] Ingest one or more W3C-aligned trace spans. Batched for ClickHouse insertion. Returns the count of accepted spans plus per-span rejection reasons.',
    inputSchema: z.object({
      spans: z.array(z.unknown()).min(1).max(10_000),
    }),
    handler: (input) => sdk.observability.ingestSpans({ spans: input.spans }),
  });

  // -----------------------------------------------------------------
  // Query
  // -----------------------------------------------------------------
  registry.register({
    name: 'colber_observability_query',
    description:
      '[Colber] Structured search over logs or trace spans within a time range. Returns matching rows ordered by timestamp descending, paginated by limit + offset.',
    inputSchema: z.object({
      scope: AlertScopeSchema,
      filters: z.array(QueryFilterSchema).max(32).optional(),
      timeRange: z.object({
        from: z.string().datetime(),
        to: z.string().datetime(),
      }),
      limit: z.number().int().min(1).max(10_000).optional(),
      offset: z.number().int().min(0).optional(),
    }),
    handler: (input) =>
      sdk.observability.query({
        scope: input.scope,
        ...(input.filters !== undefined ? { filters: input.filters } : {}),
        timeRange: input.timeRange,
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.offset !== undefined ? { offset: input.offset } : {}),
      }),
  });

  // -----------------------------------------------------------------
  // Alert CRUD
  // -----------------------------------------------------------------
  registry.register({
    name: 'colber_observability_alert_create',
    description:
      '[Colber] Create a declarative alert rule. Storage only — the evaluation engine is not implemented in this service yet.',
    inputSchema: z.object({
      ownerOperatorId: z.string().min(1).max(256),
      name: z.string().min(1).max(256),
      description: z.string().max(2_000).optional(),
      enabled: z.boolean().optional(),
      scope: AlertScopeSchema,
      condition: AlertConditionSchema,
      cooldownSeconds: z.number().int().min(0).max(86_400).optional(),
      notification: NotificationConfigSchema.optional(),
    }),
    handler: (input) =>
      sdk.observability.createAlert({
        ownerOperatorId: input.ownerOperatorId,
        name: input.name,
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        scope: input.scope,
        condition: input.condition,
        ...(input.cooldownSeconds !== undefined ? { cooldownSeconds: input.cooldownSeconds } : {}),
        ...(input.notification !== undefined ? { notification: input.notification } : {}),
      }),
  });

  registry.register({
    name: 'colber_observability_alert_get',
    description: '[Colber] Read a single alert rule by id.',
    inputSchema: z.object({
      id: z.string().uuid(),
    }),
    handler: (input) => sdk.observability.getAlert(input.id),
  });

  registry.register({
    name: 'colber_observability_alert_patch',
    description:
      '[Colber] Partially update an existing alert rule. Provide only the fields you want changed.',
    inputSchema: z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(256).optional(),
      description: z.string().max(2_000).optional(),
      enabled: z.boolean().optional(),
      scope: AlertScopeSchema.optional(),
      condition: AlertConditionSchema.optional(),
      cooldownSeconds: z.number().int().min(0).max(86_400).optional(),
      notification: NotificationConfigSchema.optional(),
    }),
    handler: async (input) => {
      const { id, ...rest } = input;
      const patch = {
        ...(rest.name !== undefined ? { name: rest.name } : {}),
        ...(rest.description !== undefined ? { description: rest.description } : {}),
        ...(rest.enabled !== undefined ? { enabled: rest.enabled } : {}),
        ...(rest.scope !== undefined ? { scope: rest.scope } : {}),
        ...(rest.condition !== undefined ? { condition: rest.condition } : {}),
        ...(rest.cooldownSeconds !== undefined ? { cooldownSeconds: rest.cooldownSeconds } : {}),
        ...(rest.notification !== undefined ? { notification: rest.notification } : {}),
      };
      return sdk.observability.patchAlert(id, patch);
    },
  });

  registry.register({
    name: 'colber_observability_alert_list',
    description: '[Colber] List alert rules owned by an operator.',
    inputSchema: z.object({
      operatorId: z.string().min(1).max(256),
    }),
    handler: (input) => sdk.observability.listAlerts(input.operatorId),
  });

  registry.register({
    name: 'colber_observability_alert_delete',
    description: '[Colber] Delete an alert rule. Returns `{ deleted: true, id }`.',
    inputSchema: z.object({
      id: z.string().uuid(),
    }),
    handler: async (input) => {
      await sdk.observability.deleteAlert(input.id);
      return { deleted: true as const, id: input.id };
    },
  });
};
