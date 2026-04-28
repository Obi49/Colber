import { z } from 'zod';

import { ALERT_SCOPES, FILTER_OPERATORS } from './alert-types.js';

/**
 * Zod schemas for alert rule configuration.
 *
 * Used by:
 *   - REST handlers (validate POST/PATCH bodies)
 *   - MCP handlers (validate tool input)
 *   - The Postgres adapter (decode `condition`/`notification` JSONB on read)
 */

const FilterValueSchema: z.ZodType<string | number | boolean | (string | number)[]> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number()])).min(1).max(256),
]);

export const AlertFilterSchema = z.object({
  /**
   * Allowed: a small allowlist plus the `attributes.<key>` prefix. The
   * actual list is enforced in the query/alert pipeline rather than here so
   * the DSL is forward-compatible (adding a new field is a code change, not
   * a schema migration).
   */
  field: z.string().min(1).max(256),
  op: z.enum(FILTER_OPERATORS),
  value: FilterValueSchema,
});

export const AlertConditionSchema = z
  .object({
    operator: z.enum(['and', 'or']),
    filters: z.array(AlertFilterSchema).min(1).max(64),
    windowSeconds: z.number().int().min(1).max(86_400),
    threshold: z.number().int().min(1).max(1_000_000),
  })
  .superRefine((val, ctx) => {
    // Cross-check operator-specific value shapes
    for (let i = 0; i < val.filters.length; i++) {
      const f = val.filters[i]!;
      if (f.op === 'in' && !Array.isArray(f.value)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'value must be an array when op=in',
          path: ['filters', i, 'value'],
        });
      }
      if (
        (f.op === 'gt' || f.op === 'gte' || f.op === 'lt' || f.op === 'lte') &&
        typeof f.value !== 'number'
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `value must be a number when op=${f.op}`,
          path: ['filters', i, 'value'],
        });
      }
      if ((f.op === 'contains' || f.op === 'matches') && typeof f.value !== 'string') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `value must be a string when op=${f.op}`,
          path: ['filters', i, 'value'],
        });
      }
    }
  });

const NotificationChannelSchema = z.union([
  z.object({ type: z.literal('webhook'), url: z.string().url() }),
  z.object({ type: z.literal('slack'), channel: z.string().min(1).max(256) }),
  z.object({
    type: z.literal('email'),
    recipients: z.array(z.string().email()).min(1).max(64),
  }),
]);

export const NotificationConfigSchema = z.object({
  channels: z.array(NotificationChannelSchema).max(16).default([]),
});

export const AlertRuleCreateSchema = z.object({
  ownerOperatorId: z.string().min(1).max(256),
  name: z.string().min(1).max(256),
  description: z.string().max(2048).default(''),
  enabled: z.boolean().default(true),
  scope: z.enum(ALERT_SCOPES),
  condition: AlertConditionSchema,
  cooldownSeconds: z.number().int().min(0).max(86_400).default(300),
  notification: NotificationConfigSchema.default({ channels: [] }),
});
export type AlertRuleCreateInput = z.infer<typeof AlertRuleCreateSchema>;

export const AlertRuleUpdateSchema = z
  .object({
    name: z.string().min(1).max(256).optional(),
    description: z.string().max(2048).optional(),
    enabled: z.boolean().optional(),
    scope: z.enum(ALERT_SCOPES).optional(),
    condition: AlertConditionSchema.optional(),
    cooldownSeconds: z.number().int().min(0).max(86_400).optional(),
    notification: NotificationConfigSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (Object.values(val).every((v) => v === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'patch must change at least one field',
      });
    }
  });
export type AlertRuleUpdateInput = z.infer<typeof AlertRuleUpdateSchema>;
