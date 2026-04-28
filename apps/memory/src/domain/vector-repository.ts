/**
 * Vector store abstraction.
 *
 * Backed by Qdrant in production (`src/qdrant/client.ts`) and by an in-memory
 * fake in tests (`test/fakes/in-memory-vector-repo.ts`). The domain service
 * only ever sees this interface, so swapping providers later (e.g. Pinecone,
 * pgvector) is a constructor change.
 *
 * Payload semantics — exactly what we keep in the vector store, no more:
 *   - `memoryId`     : UUID, also the Qdrant point id.
 *   - `ownerDid`     : creator agent (used for owner-only filters).
 *   - `type`         : `fact | event | preference | relation`.
 *   - `visibility`   : `private | operator | shared | public`.
 *   - `sharedWith`   : array of grantee DIDs (when visibility=shared).
 *   - `operatorId`   : optional, populated for `visibility=operator` so an
 *                      operator-scoped query can filter server-side.
 *
 * The cleartext + structured payload stay in Postgres. Defense in depth
 * (filters at Qdrant, re-checked at Postgres on hydrate).
 */

export interface VectorPayload {
  readonly memoryId: string;
  readonly ownerDid: string;
  readonly type: string;
  readonly visibility: string;
  readonly sharedWith: readonly string[];
  readonly operatorId?: string;
}

export interface VectorPoint {
  readonly id: string;
  readonly vector: Float32Array;
  readonly payload: VectorPayload;
}

export interface VectorSearchHit {
  readonly id: string;
  readonly score: number;
  readonly payload: VectorPayload;
}

/**
 * Server-side filter shape. The repository translates this to Qdrant's
 * `Filter` JSON. We keep the surface intentionally narrow so swapping the
 * vector store later doesn't require leaking Qdrant-specific constructs.
 */
export interface VectorFilter {
  readonly type?: string;
  readonly ownerDid?: string;
  readonly visibility?: string;
  /**
   * Set when the caller is asking for memories they (or someone) shared
   * with them — implementations OR this with the other clauses to encode
   * "visibility=public OR (visibility=shared AND sharedWith CONTAINS callerDid)
   *  OR (visibility=operator AND operatorId=...) OR (ownerDid=callerDid)".
   * The full ACL composition lives in `permission-resolver.ts`.
   */
  readonly anyOfClauses?: readonly VectorFilterClause[];
}

export interface VectorFilterClause {
  readonly ownerDid?: string;
  readonly visibility?: string;
  readonly visibilityIn?: readonly string[];
  readonly sharedWithContains?: string;
  readonly operatorId?: string;
}

export interface VectorRepository {
  /**
   * Ensures the underlying collection exists with the right vector dim +
   * cosine distance. Idempotent — safe to call at boot.
   */
  ensureCollection(dim: number): Promise<void>;
  /** Upsert a single point (insert or full replace). */
  upsert(point: VectorPoint): Promise<void>;
  /** Delete a point by id. Idempotent. */
  delete(id: string): Promise<void>;
  /** Replace just the payload of a point — used by `memory.share`. */
  setPayload(id: string, payload: VectorPayload): Promise<void>;
  /** Top-k semantic search with optional filter. */
  search(
    queryVector: Float32Array,
    topK: number,
    filter: VectorFilter | undefined,
  ): Promise<VectorSearchHit[]>;
  /** Lightweight readiness check. */
  ping(): Promise<void>;
  /** Closes the underlying transport. Idempotent. */
  close(): Promise<void>;
}
