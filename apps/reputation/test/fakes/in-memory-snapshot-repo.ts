import type {
  SnapshotInsertParams,
  SnapshotRepository,
  StoredSnapshot,
} from '../../src/domain/snapshot-repository.js';

export class InMemorySnapshotRepository implements SnapshotRepository {
  public readonly snapshots: StoredSnapshot[] = [];

  public async insert(params: SnapshotInsertParams): Promise<void> {
    this.snapshots.push({ ...params });
    return Promise.resolve();
  }

  public async findLatestByDid(did: string): Promise<StoredSnapshot | null> {
    const matches = this.snapshots
      .filter((s) => s.did === did)
      .sort((a, b) => b.computedAt.getTime() - a.computedAt.getTime());
    return Promise.resolve(matches[0] ?? null);
  }
}
