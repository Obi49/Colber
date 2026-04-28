import { and, desc, eq } from 'drizzle-orm';

import { alertRules, type AlertRuleInsert, type AlertRuleRow } from '../db/schema.js';

import type {
  AlertCondition,
  AlertRule,
  AlertScope,
  NotificationConfig,
} from './alert-types.js';
import type { Database } from '../db/client.js';

/**
 * Postgres-backed source of truth for alert rule configuration.
 *
 * Used by `AlertService` to CRUD declarative alert rules. The evaluation
 * engine that fires alerts based on these rules is OUT OF SCOPE for this
 * sprint (planned for sprint 12).
 */

export interface AlertRepository {
  insert(params: InsertAlertParams): Promise<AlertRule>;
  findById(id: string): Promise<AlertRule | null>;
  listByOwner(ownerOperatorId: string): Promise<readonly AlertRule[]>;
  update(id: string, patch: UpdateAlertPatch): Promise<AlertRule | null>;
  delete(id: string): Promise<boolean>;
}

export interface InsertAlertParams {
  readonly id: string;
  readonly ownerOperatorId: string;
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly scope: AlertScope;
  readonly condition: AlertCondition;
  readonly cooldownSeconds: number;
  readonly notification: NotificationConfig;
  readonly createdAt: Date;
}

export interface UpdateAlertPatch {
  readonly name?: string;
  readonly description?: string;
  readonly enabled?: boolean;
  readonly scope?: AlertScope;
  readonly condition?: AlertCondition;
  readonly cooldownSeconds?: number;
  readonly notification?: NotificationConfig;
  readonly updatedAt: Date;
}

const isAlertScope = (raw: string): raw is AlertScope => raw === 'logs' || raw === 'spans';

const decodeCondition = (raw: unknown): AlertCondition => {
  if (raw && typeof raw === 'object') {
    return raw as AlertCondition;
  }
  // Defensive default — should never trigger because the writer always
  // serialises a valid condition. Keep the read path total.
  return { operator: 'and', filters: [], windowSeconds: 60, threshold: 1 };
};

const decodeNotification = (raw: unknown): NotificationConfig => {
  if (raw && typeof raw === 'object' && Array.isArray((raw as { channels?: unknown }).channels)) {
    return raw as NotificationConfig;
  }
  return { channels: [] };
};

const rowToAlert = (row: AlertRuleRow): AlertRule => ({
  id: row.id,
  ownerOperatorId: row.ownerOperatorId,
  name: row.name,
  description: row.description,
  enabled: row.enabled,
  scope: isAlertScope(row.scope) ? row.scope : 'logs',
  condition: decodeCondition(row.condition),
  cooldownSeconds: row.cooldownSeconds,
  notification: decodeNotification(row.notification),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export class DrizzleAlertRepository implements AlertRepository {
  constructor(private readonly db: Database) {}

  public async insert(params: InsertAlertParams): Promise<AlertRule> {
    const insert: AlertRuleInsert = {
      id: params.id,
      ownerOperatorId: params.ownerOperatorId,
      name: params.name,
      description: params.description,
      enabled: params.enabled,
      scope: params.scope,
      condition: params.condition,
      cooldownSeconds: params.cooldownSeconds,
      notification: params.notification,
      createdAt: params.createdAt,
      updatedAt: params.createdAt,
    };
    const [row] = await this.db.insert(alertRules).values(insert).returning();
    if (!row) {
      throw new Error('alert insert returned no rows');
    }
    return rowToAlert(row);
  }

  public async findById(id: string): Promise<AlertRule | null> {
    const rows = await this.db.select().from(alertRules).where(eq(alertRules.id, id)).limit(1);
    const row = rows[0];
    return row ? rowToAlert(row) : null;
  }

  public async listByOwner(ownerOperatorId: string): Promise<readonly AlertRule[]> {
    const rows = await this.db
      .select()
      .from(alertRules)
      .where(eq(alertRules.ownerOperatorId, ownerOperatorId))
      .orderBy(desc(alertRules.createdAt));
    return rows.map(rowToAlert);
  }

  public async update(id: string, patch: UpdateAlertPatch): Promise<AlertRule | null> {
    const set: Partial<AlertRuleInsert> = {
      updatedAt: patch.updatedAt,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.scope !== undefined ? { scope: patch.scope } : {}),
      ...(patch.condition !== undefined ? { condition: patch.condition } : {}),
      ...(patch.cooldownSeconds !== undefined ? { cooldownSeconds: patch.cooldownSeconds } : {}),
      ...(patch.notification !== undefined ? { notification: patch.notification } : {}),
    };
    const [row] = await this.db
      .update(alertRules)
      .set(set)
      .where(eq(alertRules.id, id))
      .returning();
    return row ? rowToAlert(row) : null;
  }

  public async delete(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(alertRules)
      .where(and(eq(alertRules.id, id)))
      .returning({ id: alertRules.id });
    return rows.length > 0;
  }
}
