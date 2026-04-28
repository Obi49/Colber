import type {
  AlertRepository,
  InsertAlertParams,
  UpdateAlertPatch,
} from '../../src/domain/alert-repository.js';
import type { AlertRule } from '../../src/domain/alert-types.js';

/**
 * In-memory `AlertRepository` for unit + integration tests. No Postgres.
 *
 * The `entries` map is intentionally surfaced so tests can inspect state
 * without round-tripping through the domain.
 */
export class InMemoryAlertRepository implements AlertRepository {
  public readonly entries = new Map<string, AlertRule>();

  public async insert(params: InsertAlertParams): Promise<AlertRule> {
    if (this.entries.has(params.id)) {
      throw new Error(`Duplicate alert id: ${params.id}`);
    }
    // Enforce the (ownerOperatorId, name) unique constraint.
    for (const existing of this.entries.values()) {
      if (existing.ownerOperatorId === params.ownerOperatorId && existing.name === params.name) {
        const err = new Error(
          `duplicate alert name "${params.name}" for operator ${params.ownerOperatorId}`,
        );
        Object.assign(err, { code: '23505' });
        throw err;
      }
    }
    const alert: AlertRule = {
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
    this.entries.set(params.id, alert);
    return Promise.resolve(alert);
  }

  public async findById(id: string): Promise<AlertRule | null> {
    const entry = this.entries.get(id);
    return Promise.resolve(entry ?? null);
  }

  public async listByOwner(ownerOperatorId: string): Promise<readonly AlertRule[]> {
    const out = Array.from(this.entries.values())
      .filter((a) => a.ownerOperatorId === ownerOperatorId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return Promise.resolve(out);
  }

  public async update(id: string, patch: UpdateAlertPatch): Promise<AlertRule | null> {
    const existing = this.entries.get(id);
    if (!existing) {
      return Promise.resolve(null);
    }
    const updated: AlertRule = {
      ...existing,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.scope !== undefined ? { scope: patch.scope } : {}),
      ...(patch.condition !== undefined ? { condition: patch.condition } : {}),
      ...(patch.cooldownSeconds !== undefined ? { cooldownSeconds: patch.cooldownSeconds } : {}),
      ...(patch.notification !== undefined ? { notification: patch.notification } : {}),
      updatedAt: patch.updatedAt,
    };
    this.entries.set(id, updated);
    return Promise.resolve(updated);
  }

  public async delete(id: string): Promise<boolean> {
    return Promise.resolve(this.entries.delete(id));
  }
}
