import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * Observability service Postgres tables.
 *
 * Postgres holds ALERT CONFIGURATION ONLY. The bulk of the observability
 * data (logs + trace spans) lives in ClickHouse — see
 * `src/clickhouse/bootstrap.ts` for the ClickHouse DDL applied at app start.
 *
 * Tables:
 *  - `alert_rules` — declarative alert rule configurations.
 *
 * Alert rules are stored here because they're config (low write volume,
 * transactional, queryable from the operator console later) — not telemetry.
 *
 * Note: the alert evaluation engine is OUT OF SCOPE for this sprint
 * (planned for sprint 12). This service stores, retrieves, lists, updates,
 * and deletes rules — no engine.
 */

export const alertRules = pgTable(
  'alert_rules',
  {
    id: uuid('id').primaryKey(),
    /** The operator who owns this rule (multi-tenant scoping). */
    ownerOperatorId: text('owner_operator_id').notNull(),
    /** Human-friendly name. Unique per operator. */
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    enabled: boolean('enabled').notNull().default(true),
    /** "logs" | "spans" — which ClickHouse stream the rule observes. */
    scope: text('scope').notNull(),
    /**
     * Declarative DSL — see `src/domain/alert-types.ts` for the validated shape.
     * Stored as JSONB for queryability; the domain layer parses + validates it.
     */
    condition: jsonb('condition')
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Minimum seconds between two firings of the same rule. */
    cooldownSeconds: integer('cooldown_seconds').notNull().default(300),
    /**
     * Notification destination(s). Free-form for now (webhook URL, Slack
     * channel, email). Delivery is NOT implemented in this service — only
     * stored.
     */
    notification: jsonb('notification')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    ownerOperatorIdx: index('alert_rules_owner_operator_idx').on(table.ownerOperatorId),
    /** Names are unique per operator — same name across operators is fine. */
    ownerNameUq: uniqueIndex('alert_rules_owner_name_uq').on(table.ownerOperatorId, table.name),
    enabledIdx: index('alert_rules_enabled_idx').on(table.enabled),
    scopeIdx: index('alert_rules_scope_idx').on(table.scope),
  }),
);

export type AlertRuleRow = typeof alertRules.$inferSelect;
export type AlertRuleInsert = typeof alertRules.$inferInsert;
