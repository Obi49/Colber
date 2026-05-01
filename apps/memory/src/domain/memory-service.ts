import { ERROR_CODES, ColberError } from '@colber/core-types';
import { v4 as uuidv4 } from 'uuid';

import {
  buildSearchFilter,
  canRead,
  canWrite,
  VISIBILITY_VALUES,
  type CallerContext,
  type MemoryAcl,
  type Visibility,
} from './permissions.js';

import type { EncryptionService } from './encryption.js';
import type { MemoryRepository, StoredMemory } from './memory-repository.js';
import type { OperatorResolver } from './operator-resolver.js';
import type { VectorRepository } from './vector-repository.js';
import type { EmbeddingProvider } from '../embeddings/provider.js';

/** Memory types accepted by `memory.store` (CDC §2.5 + ARCHITECTURE §3.2). */
export const MEMORY_TYPES = ['fact', 'event', 'preference', 'relation'] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export interface StoreInput {
  readonly ownerDid: string;
  readonly type: MemoryType;
  readonly text: string;
  readonly payload?: Record<string, unknown>;
  readonly permissions: {
    readonly visibility: Visibility;
    readonly sharedWith?: readonly string[];
  };
  readonly encryption?: { readonly enabled: boolean };
}

export interface StoreOutput {
  readonly id: string;
  readonly embedding: { readonly model: string; readonly dim: number };
}

export interface RetrieveInput {
  readonly queryDid: string;
  readonly queryText: string;
  readonly topK: number;
  readonly filters?: {
    readonly type?: MemoryType;
    readonly ownerDid?: string;
    readonly visibility?: Visibility;
  };
}

export interface RetrieveHit {
  readonly id: string;
  readonly score: number;
  readonly type: string;
  readonly ownerDid: string;
  readonly snippet: string;
}

export interface UpdateInput {
  readonly id: string;
  readonly callerDid: string;
  readonly text?: string;
  readonly payload?: Record<string, unknown>;
}

export interface UpdateOutput {
  readonly id: string;
  readonly version: number;
  readonly embedding: { readonly model: string; readonly dim: number };
}

export interface ShareInput {
  readonly id: string;
  readonly callerDid: string;
  readonly shareWith: readonly string[];
  readonly expiresAt?: string;
}

export interface ShareOutput {
  readonly id: string;
  readonly sharedWith: readonly string[];
}

export interface MemoryServiceConfig {
  readonly maxVersions: number;
  /** Soft cap on text length (bytes UTF-8). */
  readonly maxTextBytes?: number;
}

const DEFAULT_MAX_TEXT_BYTES = 64 * 1024; // 64 KB matches Fastify body limit.
const MAX_TOP_K = 50;
const SNIPPET_LEN = 240;

export class MemoryService {
  constructor(
    private readonly repo: MemoryRepository,
    private readonly vectors: VectorRepository,
    private readonly embeddings: EmbeddingProvider,
    private readonly encryption: EncryptionService,
    private readonly operators: OperatorResolver,
    private readonly cfg: MemoryServiceConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // ---------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------

  /** Ensures the Qdrant collection exists with the right vector dim. */
  public async init(): Promise<void> {
    await this.vectors.ensureCollection(this.embeddings.dim);
  }

  // ---------------------------------------------------------------------
  // memory.store
  // ---------------------------------------------------------------------

  public async store(input: StoreInput): Promise<StoreOutput> {
    this.validateText(input.text);
    this.validateVisibility(input.permissions.visibility, input.permissions.sharedWith);

    const id = uuidv4();
    const createdAt = this.now();

    // Embedding is generated from the *cleartext* — semantic search needs
    // the plain text. Only the at-rest representation in Postgres may be
    // encrypted, never the vector.
    const vector = await this.embeddings.embed(input.text);

    let storedText = input.text;
    let encMeta = { enabled: false, algorithm: '', keyId: '' };
    if (input.encryption?.enabled) {
      if (!this.encryption.available) {
        throw new ColberError(
          ERROR_CODES.VALIDATION_FAILED,
          'encryption.enabled requested but no encryption key is configured',
          400,
        );
      }
      const enc = this.encryption.encrypt(input.text);
      storedText = enc.ciphertext;
      encMeta = { enabled: true, algorithm: enc.algorithm, keyId: enc.keyId };
    }

    const sharedWith = input.permissions.sharedWith ?? [];
    const operatorId = await this.operators.resolveOperatorId(input.ownerDid);

    await this.repo.insert({
      id,
      ownerDid: input.ownerDid,
      type: input.type,
      text: storedText,
      payload: input.payload ?? {},
      visibility: input.permissions.visibility,
      sharedWith,
      encryption: encMeta,
      embeddingModel: this.embeddings.model,
      embeddingDim: this.embeddings.dim,
      createdAt,
    });

    await this.vectors.upsert({
      id,
      vector,
      payload: {
        memoryId: id,
        ownerDid: input.ownerDid,
        type: input.type,
        visibility: input.permissions.visibility,
        sharedWith,
        ...(operatorId !== null ? { operatorId } : {}),
      },
    });

    return {
      id,
      embedding: { model: this.embeddings.model, dim: this.embeddings.dim },
    };
  }

  // ---------------------------------------------------------------------
  // memory.retrieve
  // ---------------------------------------------------------------------

  public async retrieve(input: RetrieveInput): Promise<RetrieveHit[]> {
    if (input.queryText.length === 0) {
      throw new ColberError(ERROR_CODES.VALIDATION_FAILED, 'queryText must be non-empty', 400);
    }
    const topK = Math.min(Math.max(1, input.topK | 0), MAX_TOP_K);

    const callerOperatorId = await this.operators.resolveOperatorId(input.queryDid);
    const caller: CallerContext = {
      callerDid: input.queryDid,
      operatorId: callerOperatorId,
    };

    const filter = buildSearchFilter({
      caller,
      ...(input.filters?.type !== undefined ? { type: input.filters.type } : {}),
      ...(input.filters?.ownerDid !== undefined ? { ownerDid: input.filters.ownerDid } : {}),
      ...(input.filters?.visibility !== undefined ? { visibility: input.filters.visibility } : {}),
    });

    const queryVector = await this.embeddings.embed(input.queryText);
    const rawHits = await this.vectors.search(queryVector, topK, filter);

    // Hydrate each hit from Postgres so the snippet is the cleartext (and so
    // we can re-check ACLs in case Qdrant payloads have drifted from
    // Postgres ground truth).
    const out: RetrieveHit[] = [];
    for (const hit of rawHits) {
      const stored = await this.repo.findById(hit.id);
      if (!stored) {
        continue;
      }
      const acl = await this.toAcl(stored);
      if (!canRead(acl, caller)) {
        continue;
      }
      out.push({
        id: stored.id,
        score: hit.score,
        type: stored.type,
        ownerDid: stored.ownerDid,
        snippet: this.snippetFor(stored),
      });
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // memory.get (REST: GET /v1/memory/:id)
  // ---------------------------------------------------------------------

  /**
   * Fetch the full record. `callerDid` is used to enforce the ACL; only
   * authorised callers see the cleartext.
   */
  public async get(
    id: string,
    callerDid: string,
  ): Promise<{
    id: string;
    ownerDid: string;
    type: string;
    text: string;
    payload: Record<string, unknown>;
    permissions: { visibility: Visibility; sharedWith: readonly string[] };
    encryption: { enabled: boolean; algorithm: string; keyId: string };
    createdAt: Date;
    updatedAt: Date;
    version: number;
    embedding: { model: string; dim: number };
  }> {
    const stored = await this.requireMemory(id);
    const callerOperatorId = await this.operators.resolveOperatorId(callerDid);
    const acl = await this.toAcl(stored);
    if (!canRead(acl, { callerDid, operatorId: callerOperatorId })) {
      throw new ColberError(
        ERROR_CODES.UNAUTHORIZED,
        `Caller ${callerDid} is not authorised to read memory ${id}`,
        403,
      );
    }
    const text = stored.encryption.enabled ? this.encryption.decrypt(stored.text) : stored.text;
    return {
      id: stored.id,
      ownerDid: stored.ownerDid,
      type: stored.type,
      text,
      payload: stored.payload,
      permissions: { visibility: stored.visibility, sharedWith: stored.sharedWith },
      encryption: stored.encryption,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
      version: stored.version,
      embedding: stored.embedding,
    };
  }

  // ---------------------------------------------------------------------
  // memory.update
  // ---------------------------------------------------------------------

  public async update(input: UpdateInput): Promise<UpdateOutput> {
    if (input.text === undefined && input.payload === undefined) {
      throw new ColberError(
        ERROR_CODES.VALIDATION_FAILED,
        'update must change at least one of `text` or `payload`',
        400,
      );
    }
    if (input.text !== undefined) {
      this.validateText(input.text);
    }

    const stored = await this.requireMemory(input.id);
    const callerOperatorId = await this.operators.resolveOperatorId(input.callerDid);
    const acl = await this.toAcl(stored);
    if (!canWrite(acl, { callerDid: input.callerDid, operatorId: callerOperatorId })) {
      throw new ColberError(
        ERROR_CODES.UNAUTHORIZED,
        `Only the owner can update memory ${input.id}`,
        403,
      );
    }

    // Capture the *previous* state into the version log first so an update
    // failure can never leave us with a missing audit row.
    const updatedAt = this.now();
    await this.repo.captureVersion({
      memoryId: stored.id,
      version: stored.version,
      text: stored.text,
      payload: stored.payload,
      authorDid: input.callerDid,
      encryptionEnabled: stored.encryption.enabled,
      capturedAt: updatedAt,
    });

    const newVersion = stored.version + 1;
    const newPayload = input.payload ?? stored.payload;

    let newStoredText: string;
    let textChanged = false;
    if (input.text !== undefined) {
      textChanged = true;
      if (stored.encryption.enabled) {
        const enc = this.encryption.encrypt(input.text);
        newStoredText = enc.ciphertext;
      } else {
        newStoredText = input.text;
      }
    } else {
      newStoredText = stored.text;
    }

    await this.repo.update({
      id: stored.id,
      text: newStoredText,
      payload: newPayload,
      version: newVersion,
      updatedAt,
    });

    // If text changed, regenerate the embedding from the new cleartext.
    if (textChanged && input.text !== undefined) {
      const newVector = await this.embeddings.embed(input.text);
      const ownerOperatorId = await this.operators.resolveOperatorId(stored.ownerDid);
      await this.vectors.upsert({
        id: stored.id,
        vector: newVector,
        payload: {
          memoryId: stored.id,
          ownerDid: stored.ownerDid,
          type: stored.type,
          visibility: stored.visibility,
          sharedWith: stored.sharedWith,
          ...(ownerOperatorId !== null ? { operatorId: ownerOperatorId } : {}),
        },
      });
    }

    // Best-effort prune of the version table.
    if (this.cfg.maxVersions > 0) {
      try {
        await this.repo.pruneVersions(stored.id, this.cfg.maxVersions);
      } catch {
        // Pruning is opportunistic — never fails the request.
      }
    }

    return {
      id: stored.id,
      version: newVersion,
      embedding: { model: this.embeddings.model, dim: this.embeddings.dim },
    };
  }

  // ---------------------------------------------------------------------
  // memory.share
  // ---------------------------------------------------------------------

  public async share(input: ShareInput): Promise<ShareOutput> {
    if (input.shareWith.length === 0) {
      throw new ColberError(
        ERROR_CODES.VALIDATION_FAILED,
        'shareWith must contain at least one DID',
        400,
      );
    }
    const expiresAt = this.parseOptionalIso8601(input.expiresAt, 'expiresAt');

    const stored = await this.requireMemory(input.id);
    const callerOperatorId = await this.operators.resolveOperatorId(input.callerDid);
    const acl = await this.toAcl(stored);
    if (!canWrite(acl, { callerDid: input.callerDid, operatorId: callerOperatorId })) {
      throw new ColberError(
        ERROR_CODES.UNAUTHORIZED,
        `Only the owner can share memory ${input.id}`,
        403,
      );
    }

    // Compute the new union (deduped, owner is implicit and excluded).
    const newSet = new Set(stored.sharedWith);
    for (const did of input.shareWith) {
      if (did !== stored.ownerDid) {
        newSet.add(did);
      }
    }
    const newSharedWith = Array.from(newSet).sort();

    // Promote visibility to "shared" if it wasn't already so the new grants
    // actually take effect at the Qdrant layer. If the memory was public,
    // sharing is a no-op security-wise but we still record the audit row.
    const newVisibility: Visibility =
      stored.visibility === 'private' ? 'shared' : stored.visibility;

    const grantedAt = this.now();
    await this.repo.addShares({
      memoryId: stored.id,
      grantedByDid: input.callerDid,
      grantedAt,
      grants: input.shareWith.map((did) => ({
        grantedToDid: did,
        expiresAt: expiresAt ?? null,
      })),
      newSharedWith,
      ...(newVisibility !== stored.visibility ? { newVisibility } : {}),
    });

    const ownerOperatorId = await this.operators.resolveOperatorId(stored.ownerDid);
    await this.vectors.setPayload(stored.id, {
      memoryId: stored.id,
      ownerDid: stored.ownerDid,
      type: stored.type,
      visibility: newVisibility,
      sharedWith: newSharedWith,
      ...(ownerOperatorId !== null ? { operatorId: ownerOperatorId } : {}),
    });

    return { id: stored.id, sharedWith: newSharedWith };
  }

  // ---------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------

  private async requireMemory(id: string): Promise<StoredMemory> {
    const stored = await this.repo.findById(id);
    if (!stored) {
      throw new ColberError(ERROR_CODES.NOT_FOUND, `Memory not found: ${id}`, 404);
    }
    return stored;
  }

  private async toAcl(stored: StoredMemory): Promise<MemoryAcl> {
    const operatorId = await this.operators.resolveOperatorId(stored.ownerDid);
    return {
      ownerDid: stored.ownerDid,
      visibility: stored.visibility,
      sharedWith: stored.sharedWith,
      operatorId,
    };
  }

  private validateText(text: string): void {
    if (text.length === 0) {
      throw new ColberError(ERROR_CODES.VALIDATION_FAILED, 'text must be non-empty', 400);
    }
    const max = this.cfg.maxTextBytes ?? DEFAULT_MAX_TEXT_BYTES;
    const byteLen = Buffer.byteLength(text, 'utf8');
    if (byteLen > max) {
      throw new ColberError(
        ERROR_CODES.VALIDATION_FAILED,
        `text exceeds maximum size of ${max} bytes (got ${byteLen})`,
        400,
      );
    }
  }

  private validateVisibility(
    visibility: Visibility,
    sharedWith: readonly string[] | undefined,
  ): void {
    if (!VISIBILITY_VALUES.includes(visibility)) {
      throw new ColberError(
        ERROR_CODES.VALIDATION_FAILED,
        `unknown visibility: ${String(visibility)}`,
        400,
      );
    }
    if (visibility === 'shared' && (!sharedWith || sharedWith.length === 0)) {
      throw new ColberError(
        ERROR_CODES.VALIDATION_FAILED,
        'permissions.sharedWith must be non-empty when visibility=shared',
        400,
      );
    }
  }

  private parseOptionalIso8601(raw: string | undefined, name: string): Date | null {
    if (raw === undefined) {
      return null;
    }
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
      throw new ColberError(ERROR_CODES.VALIDATION_FAILED, `${name} must be ISO-8601`, 400);
    }
    return d;
  }

  private snippetFor(stored: StoredMemory): string {
    const text = stored.encryption.enabled ? this.encryption.decrypt(stored.text) : stored.text;
    return text.length <= SNIPPET_LEN ? text : `${text.slice(0, SNIPPET_LEN)}…`;
  }
}
