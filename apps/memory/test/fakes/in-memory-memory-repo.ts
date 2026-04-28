import type {
  AddSharesParams,
  CaptureVersionParams,
  InsertMemoryParams,
  MemoryRepository,
  StoredMemory,
  UpdateMemoryParams,
} from '../../src/domain/memory-repository.js';
import type { Visibility } from '../../src/domain/permissions.js';

interface InMemoryShare {
  grantedToDid: string;
  grantedByDid: string;
  grantedAt: Date;
  expiresAt: Date | null;
}

interface InMemoryVersion {
  memoryId: string;
  version: number;
  text: string;
  payload: Record<string, unknown>;
  authorDid: string;
  encryptionEnabled: boolean;
  capturedAt: Date;
}

/**
 * In-memory `MemoryRepository` for unit/integration tests. No Postgres.
 *
 * Public `entries`, `versions`, `shares` accessors are intentionally
 * surfaced so tests can read state without round-tripping through the
 * domain service. Production code never reaches for them.
 */
export class InMemoryMemoryRepository implements MemoryRepository {
  public readonly entries = new Map<string, StoredMemory>();
  public readonly versions: InMemoryVersion[] = [];
  public readonly shares: InMemoryShare[] = [];

  public async insert(params: InsertMemoryParams): Promise<void> {
    if (this.entries.has(params.id)) {
      throw new Error(`Duplicate memory id: ${params.id}`);
    }
    const stored: StoredMemory = {
      id: params.id,
      ownerDid: params.ownerDid,
      type: params.type,
      text: params.text,
      payload: params.payload,
      visibility: params.visibility,
      sharedWith: [...params.sharedWith],
      encryption: { ...params.encryption },
      embedding: { model: params.embeddingModel, dim: params.embeddingDim },
      version: 1,
      createdAt: params.createdAt,
      updatedAt: params.createdAt,
    };
    this.entries.set(params.id, stored);
    return Promise.resolve();
  }

  public async findById(id: string): Promise<StoredMemory | null> {
    const entry = this.entries.get(id);
    return Promise.resolve(entry ? cloneStored(entry) : null);
  }

  public async update(params: UpdateMemoryParams): Promise<void> {
    const entry = this.entries.get(params.id);
    if (!entry) {
      throw new Error(`Cannot update unknown memory ${params.id}`);
    }
    this.entries.set(params.id, {
      ...entry,
      text: params.text,
      payload: params.payload,
      version: params.version,
      updatedAt: params.updatedAt,
    });
    return Promise.resolve();
  }

  public async captureVersion(params: CaptureVersionParams): Promise<void> {
    this.versions.push({ ...params });
    return Promise.resolve();
  }

  public async pruneVersions(memoryId: string, keep: number): Promise<number> {
    const own = this.versions
      .filter((v) => v.memoryId === memoryId)
      .sort((a, b) => a.version - b.version);
    if (own.length <= keep) {
      return Promise.resolve(0);
    }
    const drop = own.slice(0, own.length - keep);
    const dropSet = new Set(drop.map((v) => v.version));
    for (let i = this.versions.length - 1; i >= 0; i--) {
      const v = this.versions[i];
      if (!v) {
        continue;
      }
      if (v.memoryId === memoryId && dropSet.has(v.version)) {
        this.versions.splice(i, 1);
      }
    }
    return Promise.resolve(drop.length);
  }

  public async addShares(params: AddSharesParams): Promise<void> {
    const entry = this.entries.get(params.memoryId);
    if (!entry) {
      throw new Error(`Cannot share unknown memory ${params.memoryId}`);
    }
    this.entries.set(params.memoryId, {
      ...entry,
      sharedWith: [...params.newSharedWith],
      ...(params.newVisibility !== undefined ? { visibility: params.newVisibility } : {}),
      updatedAt: params.grantedAt,
    });
    for (const grant of params.grants) {
      const exists = this.shares.some(
        (s) => s.grantedToDid === grant.grantedToDid && s.grantedByDid === params.grantedByDid,
      );
      if (!exists) {
        this.shares.push({
          grantedToDid: grant.grantedToDid,
          grantedByDid: params.grantedByDid,
          grantedAt: params.grantedAt,
          expiresAt: grant.expiresAt,
        });
      }
    }
    return Promise.resolve();
  }

  public async listShares(memoryId: string): Promise<
    readonly {
      grantedToDid: string;
      grantedByDid: string;
      grantedAt: Date;
      expiresAt: Date | null;
    }[]
  > {
    void memoryId;
    return Promise.resolve(
      this.shares.map((s) => ({
        grantedToDid: s.grantedToDid,
        grantedByDid: s.grantedByDid,
        grantedAt: s.grantedAt,
        expiresAt: s.expiresAt,
      })),
    );
  }

  public size(): number {
    return this.entries.size;
  }

  public manualUpdateVisibility(id: string, visibility: Visibility): void {
    const entry = this.entries.get(id);
    if (entry) {
      this.entries.set(id, { ...entry, visibility });
    }
  }
}

const cloneStored = (s: StoredMemory): StoredMemory => ({
  ...s,
  payload: { ...s.payload },
  sharedWith: [...s.sharedWith],
  encryption: { ...s.encryption },
  embedding: { ...s.embedding },
});
