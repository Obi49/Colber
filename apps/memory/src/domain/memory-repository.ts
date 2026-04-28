import { and, asc, desc, eq, lt } from 'drizzle-orm';

import {
  memories,
  memoryShares,
  memoryVersions,
  type MemoryInsert,
  type MemoryShareInsert,
  type MemoryVersionInsert,
} from '../db/schema.js';

import type { Visibility } from './permissions.js';
import type { Database } from '../db/client.js';

/**
 * Postgres-backed source of truth for memory metadata + audit history.
 * The vector itself lives in Qdrant (see `vector-repository.ts`); this
 * repository is the canonical store for the cleartext + structured payload.
 */

export interface StoredMemory {
  readonly id: string;
  readonly ownerDid: string;
  readonly type: string;
  readonly text: string;
  readonly payload: Record<string, unknown>;
  readonly visibility: Visibility;
  readonly sharedWith: readonly string[];
  readonly encryption: {
    readonly enabled: boolean;
    readonly algorithm: string;
    readonly keyId: string;
  };
  readonly embedding: { readonly model: string; readonly dim: number };
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface InsertMemoryParams {
  readonly id: string;
  readonly ownerDid: string;
  readonly type: string;
  readonly text: string;
  readonly payload: Record<string, unknown>;
  readonly visibility: Visibility;
  readonly sharedWith: readonly string[];
  readonly encryption: { enabled: boolean; algorithm: string; keyId: string };
  readonly embeddingModel: string;
  readonly embeddingDim: number;
  readonly createdAt: Date;
}

export interface UpdateMemoryParams {
  readonly id: string;
  readonly text: string;
  readonly payload: Record<string, unknown>;
  readonly version: number;
  readonly updatedAt: Date;
}

export interface CaptureVersionParams {
  readonly memoryId: string;
  readonly version: number;
  readonly text: string;
  readonly payload: Record<string, unknown>;
  readonly authorDid: string;
  readonly encryptionEnabled: boolean;
  readonly capturedAt: Date;
}

export interface AddSharesParams {
  readonly memoryId: string;
  readonly grantedByDid: string;
  readonly grantedAt: Date;
  readonly grants: readonly { grantedToDid: string; expiresAt: Date | null }[];
  readonly newSharedWith: readonly string[];
  /**
   * Optional visibility upgrade applied atomically with the grants.
   * `share` uses this to promote `private → shared` when the first grant lands.
   */
  readonly newVisibility?: Visibility;
}

export interface MemoryRepository {
  insert(params: InsertMemoryParams): Promise<void>;
  findById(id: string): Promise<StoredMemory | null>;
  update(params: UpdateMemoryParams): Promise<void>;
  captureVersion(params: CaptureVersionParams): Promise<void>;
  /** Removes the oldest versions when the count exceeds `keep`. */
  pruneVersions(memoryId: string, keep: number): Promise<number>;
  addShares(params: AddSharesParams): Promise<void>;
  /** Returns the recorded shares (for audit / future expiry enforcement). */
  listShares(memoryId: string): Promise<
    readonly {
      grantedToDid: string;
      grantedByDid: string;
      grantedAt: Date;
      expiresAt: Date | null;
    }[]
  >;
}

const visibilityFromString = (raw: string): Visibility => {
  switch (raw) {
    case 'private':
    case 'operator':
    case 'shared':
    case 'public':
      return raw;
    default:
      // Stored value is corrupt — fall back to the most restrictive setting.
      return 'private';
  }
};

const sharedWithFromJson = (raw: unknown): readonly string[] => {
  if (Array.isArray(raw) && raw.every((v) => typeof v === 'string')) {
    return raw;
  }
  return [];
};

const payloadFromJson = (raw: unknown): Record<string, unknown> => {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
};

const rowToMemory = (row: typeof memories.$inferSelect): StoredMemory => ({
  id: row.id,
  ownerDid: row.ownerDid,
  type: row.type,
  text: row.text,
  payload: payloadFromJson(row.payload),
  visibility: visibilityFromString(row.visibility),
  sharedWith: sharedWithFromJson(row.sharedWith),
  encryption: {
    enabled: row.encryptionEnabled === 'true',
    algorithm: row.encryptionAlgorithm,
    keyId: row.encryptionKeyId,
  },
  embedding: { model: row.embeddingModel, dim: row.embeddingDim },
  version: row.version,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export class DrizzleMemoryRepository implements MemoryRepository {
  constructor(private readonly db: Database) {}

  public async insert(params: InsertMemoryParams): Promise<void> {
    const insert: MemoryInsert = {
      id: params.id,
      ownerDid: params.ownerDid,
      type: params.type,
      text: params.text,
      payload: params.payload,
      visibility: params.visibility,
      sharedWith: [...params.sharedWith],
      encryptionEnabled: params.encryption.enabled ? 'true' : 'false',
      encryptionAlgorithm: params.encryption.algorithm,
      encryptionKeyId: params.encryption.keyId,
      embeddingModel: params.embeddingModel,
      embeddingDim: params.embeddingDim,
      version: 1,
      createdAt: params.createdAt,
      updatedAt: params.createdAt,
    };
    await this.db.insert(memories).values(insert);
  }

  public async findById(id: string): Promise<StoredMemory | null> {
    const rows = await this.db.select().from(memories).where(eq(memories.id, id)).limit(1);
    const row = rows[0];
    return row ? rowToMemory(row) : null;
  }

  public async update(params: UpdateMemoryParams): Promise<void> {
    await this.db
      .update(memories)
      .set({
        text: params.text,
        payload: params.payload,
        version: params.version,
        updatedAt: params.updatedAt,
      })
      .where(eq(memories.id, params.id));
  }

  public async captureVersion(params: CaptureVersionParams): Promise<void> {
    const insert: MemoryVersionInsert = {
      id: crypto.randomUUID(),
      memoryId: params.memoryId,
      version: params.version,
      text: params.text,
      payload: params.payload,
      authorDid: params.authorDid,
      encryptionEnabled: params.encryptionEnabled ? 'true' : 'false',
      capturedAt: params.capturedAt,
    };
    await this.db.insert(memoryVersions).values(insert);
  }

  public async pruneVersions(memoryId: string, keep: number): Promise<number> {
    // Find the version *cutoff*: anything strictly less than the
    // (count - keep)-th version (ordered ascending) is droppable. We do
    // this with two simple queries to avoid relying on Postgres-specific
    // window-function support that drizzle-orm doesn't surface ergonomically.
    const all = await this.db
      .select({ version: memoryVersions.version })
      .from(memoryVersions)
      .where(eq(memoryVersions.memoryId, memoryId))
      .orderBy(asc(memoryVersions.version));
    if (all.length <= keep) {
      return 0;
    }
    const cutoffIdx = all.length - keep;
    const cutoff = all[cutoffIdx]?.version;
    if (cutoff === undefined) {
      return 0;
    }
    await this.db
      .delete(memoryVersions)
      .where(and(eq(memoryVersions.memoryId, memoryId), lt(memoryVersions.version, cutoff)));
    // postgres-js's `.delete()` doesn't surface a row count uniformly; we
    // recompute from the slice we already counted, which is exact.
    return cutoffIdx;
  }

  public async addShares(params: AddSharesParams): Promise<void> {
    // 1. Update the canonical `sharedWith` array on the memory (and the
    //    visibility, if a promotion was requested).
    await this.db
      .update(memories)
      .set({
        sharedWith: [...params.newSharedWith],
        ...(params.newVisibility !== undefined ? { visibility: params.newVisibility } : {}),
        updatedAt: params.grantedAt,
      })
      .where(eq(memories.id, params.memoryId));

    // 2. Append per-grantee rows to the share log.
    if (params.grants.length === 0) {
      return;
    }
    const inserts: MemoryShareInsert[] = params.grants.map((g) => ({
      id: crypto.randomUUID(),
      memoryId: params.memoryId,
      grantedToDid: g.grantedToDid,
      grantedByDid: params.grantedByDid,
      grantedAt: params.grantedAt,
      expiresAt: g.expiresAt,
    }));
    // `onConflictDoNothing` so re-issuing a grant for an existing grantee
    // is a no-op (idempotent share).
    await this.db.insert(memoryShares).values(inserts).onConflictDoNothing();
  }

  public async listShares(memoryId: string): Promise<
    readonly {
      grantedToDid: string;
      grantedByDid: string;
      grantedAt: Date;
      expiresAt: Date | null;
    }[]
  > {
    const rows = await this.db
      .select({
        grantedToDid: memoryShares.grantedToDid,
        grantedByDid: memoryShares.grantedByDid,
        grantedAt: memoryShares.grantedAt,
        expiresAt: memoryShares.expiresAt,
      })
      .from(memoryShares)
      .where(eq(memoryShares.memoryId, memoryId))
      .orderBy(desc(memoryShares.grantedAt));
    return rows.map((r) => ({
      grantedToDid: r.grantedToDid,
      grantedByDid: r.grantedByDid,
      grantedAt: r.grantedAt,
      expiresAt: r.expiresAt,
    }));
  }
}
