import { QdrantClient } from '@qdrant/js-client-rest';

import type {
  VectorFilter,
  VectorFilterClause,
  VectorPayload,
  VectorPoint,
  VectorRepository,
  VectorSearchHit,
} from '../domain/vector-repository.js';

/**
 * Qdrant-backed `VectorRepository`. Talks REST via `@qdrant/js-client-rest`.
 * gRPC isn't worth the proto-loader pain at v1; the REST client is mature,
 * well-typed, and the latency budget (200ms p95 for `memory.retrieve`) leaves
 * plenty of headroom over HTTP/1.1.
 */

interface QdrantFilterCondition {
  key?: string;
  match?: {
    value?: string | number | boolean;
    any?: readonly (string | number)[];
  };
}

interface QdrantFilter {
  must?: QdrantFilterCondition[];
  should?: QdrantFilterCondition[];
  must_not?: QdrantFilterCondition[];
}

const clauseToConditions = (clause: VectorFilterClause): QdrantFilterCondition[] => {
  const out: QdrantFilterCondition[] = [];
  if (clause.ownerDid !== undefined) {
    out.push({ key: 'ownerDid', match: { value: clause.ownerDid } });
  }
  if (clause.visibility !== undefined) {
    out.push({ key: 'visibility', match: { value: clause.visibility } });
  }
  if (clause.visibilityIn !== undefined && clause.visibilityIn.length > 0) {
    out.push({ key: 'visibility', match: { any: [...clause.visibilityIn] } });
  }
  if (clause.sharedWithContains !== undefined) {
    out.push({ key: 'sharedWith', match: { value: clause.sharedWithContains } });
  }
  if (clause.operatorId !== undefined) {
    out.push({ key: 'operatorId', match: { value: clause.operatorId } });
  }
  return out;
};

/**
 * Convert our abstract `VectorFilter` to Qdrant's `Filter` JSON.
 *
 * - `must` carries unconditional clauses (type/ownerDid/visibility supplied
 *   directly by the caller).
 * - `should` carries the OR-of-AND ACL clauses; Qdrant treats `should` as
 *   "at least one must match", which is exactly what we want for permission
 *   composition.
 *
 * If a single clause is supplied as `should`, Qdrant requires that clause
 * to match (since "at least one of one"). To combine the two we wrap each
 * clause's conditions inside a nested filter via the `must` field, but the
 * REST API does not allow nested filters of arbitrary depth — instead, we
 * translate each ACL clause into a compound condition by ANDing its parts
 * inside a synthetic single-condition "must" filter and then putting them
 * all under a parent "should". Qdrant accepts this via the `Filter` type.
 */
const buildQdrantFilter = (filter: VectorFilter | undefined): QdrantFilter | undefined => {
  if (!filter) {
    return undefined;
  }
  const must: QdrantFilterCondition[] = [];
  if (filter.type !== undefined) {
    must.push({ key: 'type', match: { value: filter.type } });
  }
  if (filter.ownerDid !== undefined) {
    must.push({ key: 'ownerDid', match: { value: filter.ownerDid } });
  }
  if (filter.visibility !== undefined) {
    must.push({ key: 'visibility', match: { value: filter.visibility } });
  }

  // ACL clauses. Each entry in `anyOfClauses` is an AND of its fields, and
  // the entries OR together. We encode each as a nested Filter under
  // `should`. Qdrant supports nested filters here via the `filter` shape.
  const should: { filter: { must: QdrantFilterCondition[] } }[] = [];
  if (filter.anyOfClauses && filter.anyOfClauses.length > 0) {
    for (const clause of filter.anyOfClauses) {
      const conds = clauseToConditions(clause);
      if (conds.length > 0) {
        should.push({ filter: { must: conds } });
      }
    }
  }

  if (must.length === 0 && should.length === 0) {
    return undefined;
  }
  const result: QdrantFilter & { should?: unknown[] } = {};
  if (must.length > 0) {
    result.must = must;
  }
  if (should.length > 0) {
    result.should = should;
  }
  return result;
};

const payloadToPlain = (payload: VectorPayload): Record<string, unknown> => ({
  memoryId: payload.memoryId,
  ownerDid: payload.ownerDid,
  type: payload.type,
  visibility: payload.visibility,
  sharedWith: [...payload.sharedWith],
  ...(payload.operatorId !== undefined ? { operatorId: payload.operatorId } : {}),
});

const stringField = (obj: Record<string, unknown>, key: string): string => {
  const v = obj[key];
  return typeof v === 'string' ? v : '';
};

const plainToPayload = (raw: unknown): VectorPayload => {
  const obj: Record<string, unknown> =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const sharedWithRaw = obj.sharedWith;
  const sharedWith: string[] =
    Array.isArray(sharedWithRaw) && sharedWithRaw.every((v) => typeof v === 'string')
      ? sharedWithRaw
      : [];
  const operatorIdRaw = obj.operatorId;
  const operatorId = typeof operatorIdRaw === 'string' ? operatorIdRaw : undefined;
  return {
    memoryId: stringField(obj, 'memoryId'),
    ownerDid: stringField(obj, 'ownerDid'),
    type: stringField(obj, 'type'),
    visibility: stringField(obj, 'visibility'),
    sharedWith,
    ...(operatorId !== undefined ? { operatorId } : {}),
  };
};

export interface CreateQdrantOptions {
  readonly url: string;
  readonly apiKey?: string;
  readonly collection: string;
}

export const createQdrantVectorRepository = (opts: CreateQdrantOptions): VectorRepository => {
  const client = new QdrantClient({
    url: opts.url,
    ...(opts.apiKey !== undefined ? { apiKey: opts.apiKey } : {}),
  });
  const collection = opts.collection;

  return {
    async ensureCollection(dim: number) {
      const existing = await client.getCollections();
      const has = existing.collections.some((c) => c.name === collection);
      if (has) {
        return;
      }
      await client.createCollection(collection, {
        vectors: { size: dim, distance: 'Cosine' },
      });
    },

    async upsert(point: VectorPoint) {
      await client.upsert(collection, {
        wait: true,
        points: [
          {
            id: point.id,
            vector: Array.from(point.vector),
            payload: payloadToPlain(point.payload),
          },
        ],
      });
    },

    async delete(id: string) {
      await client.delete(collection, { wait: true, points: [id] });
    },

    async setPayload(id: string, payload: VectorPayload) {
      await client.setPayload(collection, {
        wait: true,
        points: [id],
        payload: payloadToPlain(payload),
      });
    },

    async search(queryVector, topK, filter) {
      const qdrantFilter = buildQdrantFilter(filter);
      // `client.search` is strongly typed against the auto-generated Qdrant
      // OpenAPI surface, which models filter conditions as a deeply nested
      // discriminated union. Our hand-rolled `QdrantFilter` is intentionally
      // narrower (only the shape we actually emit). Bypass the Parameters<>
      // type via `unknown` — the payload is structurally what the server
      // expects.
      const searchArgs = {
        vector: Array.from(queryVector),
        limit: topK,
        with_payload: true,
        ...(qdrantFilter !== undefined ? { filter: qdrantFilter } : {}),
      } as unknown as Parameters<typeof client.search>[1];
      const result = await client.search(collection, searchArgs);
      const hits: VectorSearchHit[] = [];
      for (const r of result) {
        hits.push({
          id: String(r.id),
          score: r.score,
          payload: plainToPayload(r.payload),
        });
      }
      return hits;
    },

    async ping() {
      // Qdrant exposes /readyz; the client doesn't surface a dedicated method
      // but `getCollections` is a cheap, authenticated round-trip that fails
      // fast when the server isn't reachable.
      await client.getCollections();
    },

    close() {
      // The REST client holds no persistent connection. Nothing to release.
      return Promise.resolve();
    },
  };
};
