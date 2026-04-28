import type {
  VectorFilter,
  VectorFilterClause,
  VectorPayload,
  VectorPoint,
  VectorRepository,
  VectorSearchHit,
} from '../../src/domain/vector-repository.js';

interface InMemoryPoint {
  id: string;
  vector: Float32Array;
  payload: VectorPayload;
}

const cosine = (a: Float32Array, b: Float32Array): number => {
  if (a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
};

const matchesClause = (payload: VectorPayload, clause: VectorFilterClause): boolean => {
  if (clause.ownerDid !== undefined && payload.ownerDid !== clause.ownerDid) {
    return false;
  }
  if (clause.visibility !== undefined && payload.visibility !== clause.visibility) {
    return false;
  }
  if (clause.visibilityIn !== undefined && !clause.visibilityIn.includes(payload.visibility)) {
    return false;
  }
  if (
    clause.sharedWithContains !== undefined &&
    !payload.sharedWith.includes(clause.sharedWithContains)
  ) {
    return false;
  }
  if (clause.operatorId !== undefined && payload.operatorId !== clause.operatorId) {
    return false;
  }
  return true;
};

const matchesFilter = (payload: VectorPayload, filter: VectorFilter | undefined): boolean => {
  if (!filter) {
    return true;
  }
  if (filter.type !== undefined && payload.type !== filter.type) {
    return false;
  }
  if (filter.ownerDid !== undefined && payload.ownerDid !== filter.ownerDid) {
    return false;
  }
  if (filter.visibility !== undefined && payload.visibility !== filter.visibility) {
    return false;
  }
  if (filter.anyOfClauses !== undefined && filter.anyOfClauses.length > 0) {
    const anyMatch = filter.anyOfClauses.some((c) => matchesClause(payload, c));
    if (!anyMatch) {
      return false;
    }
  }
  return true;
};

/**
 * In-memory `VectorRepository` for unit/integration tests. Implements cosine
 * similarity scoring and the same filter semantics the Qdrant adapter targets.
 */
export class InMemoryVectorRepository implements VectorRepository {
  public readonly points = new Map<string, InMemoryPoint>();
  public collectionInitialised = false;
  public collectionDim = 0;

  public async ensureCollection(dim: number): Promise<void> {
    this.collectionInitialised = true;
    this.collectionDim = dim;
    return Promise.resolve();
  }

  public async upsert(point: VectorPoint): Promise<void> {
    this.points.set(point.id, {
      id: point.id,
      vector: Float32Array.from(point.vector),
      payload: {
        ...point.payload,
        sharedWith: [...point.payload.sharedWith],
      },
    });
    return Promise.resolve();
  }

  public async delete(id: string): Promise<void> {
    this.points.delete(id);
    return Promise.resolve();
  }

  public async setPayload(id: string, payload: VectorPayload): Promise<void> {
    const existing = this.points.get(id);
    if (!existing) {
      return Promise.resolve();
    }
    this.points.set(id, {
      ...existing,
      payload: { ...payload, sharedWith: [...payload.sharedWith] },
    });
    return Promise.resolve();
  }

  public async search(
    queryVector: Float32Array,
    topK: number,
    filter: VectorFilter | undefined,
  ): Promise<VectorSearchHit[]> {
    const all: VectorSearchHit[] = [];
    for (const point of this.points.values()) {
      if (!matchesFilter(point.payload, filter)) {
        continue;
      }
      all.push({
        id: point.id,
        score: cosine(queryVector, point.vector),
        payload: { ...point.payload, sharedWith: [...point.payload.sharedWith] },
      });
    }
    all.sort((a, b) => b.score - a.score);
    return Promise.resolve(all.slice(0, topK));
  }

  public async ping(): Promise<void> {
    return Promise.resolve();
  }

  public async close(): Promise<void> {
    return Promise.resolve();
  }
}
