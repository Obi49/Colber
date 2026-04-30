/**
 * `MemoryService` — typed client for the `memory` service.
 *
 * Mirror of `apps/memory/src/http/routes.ts`:
 *   - POST  /v1/memory                  (store)
 *   - POST  /v1/memory/search           (retrieve)
 *   - GET   /v1/memory/:id              (get)
 *   - PATCH /v1/memory/:id              (update)
 *   - POST  /v1/memory/:id/share        (share)
 */

import { request } from '../http.js';

import type { HttpClientOptions } from '../http.js';

export type MemoryType = 'fact' | 'event' | 'preference' | 'relation';
export type Visibility = 'private' | 'operator' | 'shared' | 'public';

export interface Permissions {
  readonly visibility: Visibility;
  readonly sharedWith?: readonly string[];
}

export interface EmbeddingMeta {
  readonly model: string;
  readonly dim: number;
}

export interface StoreRequest {
  readonly ownerDid: string;
  readonly type: MemoryType;
  readonly text: string;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly permissions: Permissions;
  readonly encryption?: { readonly enabled: boolean };
}

export interface StoreResponse {
  readonly id: string;
  readonly embedding: EmbeddingMeta;
}

export interface SearchFilters {
  readonly type?: MemoryType;
  readonly ownerDid?: string;
  readonly visibility?: Visibility;
}

export interface SearchRequest {
  readonly queryDid: string;
  readonly queryText: string;
  readonly topK?: number;
  readonly filters?: SearchFilters;
}

export interface SearchHit {
  readonly id: string;
  readonly score: number;
  readonly type: MemoryType;
  readonly ownerDid: string;
  readonly snippet: string;
}

export interface SearchResponse {
  readonly hits: readonly SearchHit[];
}

export interface MemoryRecord {
  readonly id: string;
  readonly ownerDid: string;
  readonly type: MemoryType;
  readonly text: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly permissions: { readonly visibility: Visibility; readonly sharedWith: readonly string[] };
  readonly encryption: {
    readonly enabled: boolean;
    readonly algorithm: string;
    readonly keyId: string;
  };
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
  readonly embedding: EmbeddingMeta;
}

export interface RetrieveRequest {
  readonly id: string;
  readonly callerDid: string;
}

export interface UpdateRequest {
  readonly id: string;
  readonly callerDid: string;
  readonly text?: string;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export interface UpdateResponse {
  readonly id: string;
  readonly version: number;
  readonly embedding: EmbeddingMeta;
}

export interface ShareRequest {
  readonly id: string;
  readonly callerDid: string;
  readonly shareWith: readonly string[];
  readonly expiresAt?: string;
}

export interface ShareResponse {
  readonly id: string;
  readonly sharedWith: readonly string[];
}

export class MemoryService {
  constructor(
    private readonly opts: HttpClientOptions,
    private readonly baseUrl: string,
  ) {}

  /** POST /v1/memory */
  public async store(body: StoreRequest): Promise<StoreResponse> {
    const data = await request<StoreResponse>(this.opts, {
      method: 'POST',
      baseUrl: this.baseUrl,
      path: '/v1/memory',
      body,
    });
    if (data === undefined) {
      throw new Error('memory.store: empty response body');
    }
    return data;
  }

  /** POST /v1/memory/search */
  public async search(body: SearchRequest): Promise<SearchResponse> {
    const data = await request<SearchResponse>(this.opts, {
      method: 'POST',
      baseUrl: this.baseUrl,
      path: '/v1/memory/search',
      body,
    });
    if (data === undefined) {
      throw new Error('memory.search: empty response body');
    }
    return data;
  }

  /** GET /v1/memory/:id?callerDid=... */
  public async retrieve({ id, callerDid }: RetrieveRequest): Promise<MemoryRecord> {
    const data = await request<MemoryRecord>(this.opts, {
      method: 'GET',
      baseUrl: this.baseUrl,
      path: `/v1/memory/${encodeURIComponent(id)}`,
      query: { callerDid },
    });
    if (data === undefined) {
      throw new Error('memory.retrieve: empty response body');
    }
    return data;
  }

  /** PATCH /v1/memory/:id */
  public async update({ id, ...rest }: UpdateRequest): Promise<UpdateResponse> {
    const data = await request<UpdateResponse>(this.opts, {
      method: 'PATCH',
      baseUrl: this.baseUrl,
      path: `/v1/memory/${encodeURIComponent(id)}`,
      body: rest,
    });
    if (data === undefined) {
      throw new Error('memory.update: empty response body');
    }
    return data;
  }

  /** POST /v1/memory/:id/share */
  public async share({ id, ...rest }: ShareRequest): Promise<ShareResponse> {
    const data = await request<ShareResponse>(this.opts, {
      method: 'POST',
      baseUrl: this.baseUrl,
      path: `/v1/memory/${encodeURIComponent(id)}/share`,
      body: rest,
    });
    if (data === undefined) {
      throw new Error('memory.share: empty response body');
    }
    return data;
  }
}
