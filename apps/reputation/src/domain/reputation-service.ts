import { fromBase64, getSignatureProvider } from '@praxis/core-crypto';
import { ERROR_CODES, PraxisError } from '@praxis/core-types';
import { v7 as uuidv7 } from 'uuid';

import {
  loadPlatformKey,
  signScore,
  verifyScore,
  type PlatformKeyMaterial,
  type SignedScoreEnvelope,
} from './attestation.js';
import { canonicalizeBytes } from './canonical-json.js';
import { computeScore, SCORE_BASE, SCORE_VERSION, type ScoringConfig } from './scoring/v1.js';

import type { FeedbackRepository } from './feedback-repository.js';
import type { GraphRepository, HistoryPage } from './graph-repository.js';
import type { IdentityResolver } from './identity-resolver.js';
import type { ScoreCache } from './score-cache.js';
import type { SnapshotRepository } from './snapshot-repository.js';

/** A 5-point sub-dimensional rating that breaks down a feedback. */
export interface FeedbackDimensions {
  readonly delivery: number;
  readonly quality: number;
  readonly communication: number;
}

export interface SubmitFeedbackInput {
  readonly feedbackId: string;
  readonly fromDid: string;
  readonly toDid: string;
  readonly txId: string;
  readonly rating: number;
  readonly dimensions: FeedbackDimensions;
  readonly comment?: string;
  readonly signedAt: string;
  /** Base64-encoded Ed25519 signature over the JCS canonical form. */
  readonly signature: string;
}

export interface SubmitFeedbackResult {
  readonly accepted: boolean;
  readonly idempotent: boolean;
  readonly feedbackId: string;
}

export interface HistoryQueryInput {
  readonly limit: number;
  readonly cursor: string | null;
}

export interface ReputationServiceConfig {
  readonly scoring: ScoringConfig;
  readonly cacheTtlSeconds: number;
  readonly platformPrivateKeyB64: string;
  readonly platformPublicKeyB64: string | undefined;
}

export class ReputationService {
  private platformKey: PlatformKeyMaterial | null = null;

  constructor(
    private readonly graphRepo: GraphRepository,
    private readonly snapshotRepo: SnapshotRepository,
    private readonly feedbackRepo: FeedbackRepository,
    private readonly cache: ScoreCache,
    private readonly identity: IdentityResolver,
    private readonly cfg: ReputationServiceConfig,
    /** Optional clock — overridable in tests for deterministic timestamps. */
    private readonly now: () => Date = () => new Date(),
  ) {}

  // ---------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------

  /** Loads (and validates) the platform attestation key. Idempotent. */
  public async init(): Promise<void> {
    this.platformKey ??= await loadPlatformKey(
      this.cfg.platformPrivateKeyB64,
      this.cfg.platformPublicKeyB64,
    );
  }

  /** Returns the platform Ed25519 public key (base64-decoded raw bytes). */
  public getPlatformPublicKey(): Uint8Array {
    if (!this.platformKey) {
      throw new PraxisError(
        ERROR_CODES.INTERNAL_ERROR,
        'ReputationService.init() must be called before getPlatformPublicKey()',
        500,
      );
    }
    return this.platformKey.publicKey;
  }

  // ---------------------------------------------------------------------
  // reputation.score
  // ---------------------------------------------------------------------

  /**
   * Compute (or fetch from cache) the agent's signed score envelope.
   *
   * Cache hit  → returns the stored envelope verbatim.
   * Cache miss → recomputes, signs, persists a snapshot, caches, returns.
   */
  public async getScore(did: string): Promise<SignedScoreEnvelope> {
    await this.init();

    const cached = await this.cache.get(did, SCORE_VERSION);
    if (cached) {
      return cached;
    }

    const snapshot = await this.graphRepo.loadScoringSnapshot(did);
    const computedAt = this.now();
    const breakdown = snapshot
      ? computeScore(
          { transactions: snapshot.transactions, feedbacks: snapshot.feedbacks },
          this.cfg.scoring,
          computedAt,
        )
      : {
          base: SCORE_BASE,
          txContribution: 0,
          feedbackPenalty: 0,
          raw: SCORE_BASE,
          final: SCORE_BASE,
        };

    const payload = {
      did,
      score: breakdown.final,
      scoreVersion: SCORE_VERSION,
      computedAt: computedAt.toISOString(),
    } as const;

    const envelope = await signScore(payload, this.platformKey!);

    // Persist the issuance + cache for fast subsequent reads. We do these
    // best-effort and in parallel to keep the read path snappy. A failure
    // here doesn't fail the request — the envelope is already valid for
    // the caller; we just lose the audit row / cache entry.
    await Promise.allSettled([
      this.snapshotRepo.insert({
        id: uuidv7(),
        did,
        score: breakdown.final,
        scoreVersion: SCORE_VERSION,
        computedAt,
        attestation: envelope.attestation,
      }),
      this.cache.set(envelope, this.cfg.cacheTtlSeconds),
    ]);

    return envelope;
  }

  // ---------------------------------------------------------------------
  // reputation.history
  // ---------------------------------------------------------------------

  public async getHistory(did: string, query: HistoryQueryInput): Promise<HistoryPage> {
    return this.graphRepo.loadHistory(did, {
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  // ---------------------------------------------------------------------
  // reputation.verify
  // ---------------------------------------------------------------------

  /**
   * Verifies an attestation against the *current* platform public key.
   * Returns `{ valid, reason? }` — never throws on bad signatures.
   *
   * Note: this verifies cryptographic integrity only. A malicious caller
   * can still replay an old signed score; future work will cross-check
   * `(did, computedAt)` against the snapshot log.
   */
  public async verify(envelope: SignedScoreEnvelope): Promise<{ valid: boolean; reason?: string }> {
    await this.init();
    return verifyScore(envelope, this.platformKey!.publicKey);
  }

  // ---------------------------------------------------------------------
  // reputation.feedback
  // ---------------------------------------------------------------------

  public async submitFeedback(input: SubmitFeedbackInput): Promise<SubmitFeedbackResult> {
    // Validation — shape errors here mean the HTTP/MCP layer let something
    // through that should have been caught at the edge. Map to 400.
    if (input.rating < 1 || input.rating > 5 || !Number.isInteger(input.rating)) {
      throw new PraxisError(
        ERROR_CODES.VALIDATION_FAILED,
        `rating must be an integer in 1..5 (got ${input.rating})`,
        400,
      );
    }
    for (const dim of ['delivery', 'quality', 'communication'] as const) {
      const v = input.dimensions[dim];
      if (!Number.isInteger(v) || v < 1 || v > 5) {
        throw new PraxisError(
          ERROR_CODES.VALIDATION_FAILED,
          `dimensions.${dim} must be an integer in 1..5 (got ${v})`,
          400,
        );
      }
    }
    const signedAt = new Date(input.signedAt);
    if (Number.isNaN(signedAt.getTime())) {
      throw new PraxisError(ERROR_CODES.VALIDATION_FAILED, 'signedAt must be ISO-8601', 400);
    }

    // Idempotency: same feedbackId → return existing record as a 200.
    const existingById = await this.feedbackRepo.findById(input.feedbackId);
    if (existingById) {
      // Same idempotency key, but does the body match what we already accepted?
      if (
        existingById.fromDid !== input.fromDid ||
        existingById.toDid !== input.toDid ||
        existingById.txId !== input.txId ||
        existingById.rating !== input.rating
      ) {
        throw new PraxisError(
          ERROR_CODES.CONFLICT,
          `feedbackId ${input.feedbackId} was previously submitted with a different payload`,
          409,
        );
      }
      return { accepted: true, idempotent: true, feedbackId: input.feedbackId };
    }

    // Anti-spam: only one feedback per (from, to, tx) triple.
    const existingByTriple = await this.feedbackRepo.findByTriple(
      input.fromDid,
      input.toDid,
      input.txId,
    );
    if (existingByTriple) {
      throw new PraxisError(
        ERROR_CODES.CONFLICT,
        `Feedback for (fromDid, toDid, txId) already exists with feedbackId ${existingByTriple.feedbackId}`,
        409,
        {
          existingFeedbackId: existingByTriple.feedbackId,
        },
      );
    }

    // Resolve the issuer's public key.
    const issuer = await this.identity.resolve(input.fromDid);
    if (!issuer) {
      throw new PraxisError(ERROR_CODES.DID_NOT_FOUND, `fromDid not found: ${input.fromDid}`, 404);
    }
    if (issuer.revoked) {
      throw new PraxisError(ERROR_CODES.DID_REVOKED, `fromDid is revoked: ${input.fromDid}`, 410);
    }
    if (issuer.signatureScheme !== 'Ed25519') {
      throw new PraxisError(
        ERROR_CODES.VALIDATION_FAILED,
        `Unsupported signature scheme for issuer: ${issuer.signatureScheme}`,
        400,
      );
    }

    // Verify the issuer's signature over the canonical payload.
    const canonicalPayload = canonicalizeBytes({
      feedbackId: input.feedbackId,
      fromDid: input.fromDid,
      toDid: input.toDid,
      txId: input.txId,
      rating: input.rating,
      dimensions: input.dimensions,
      signedAt: input.signedAt,
    });
    let signature: Uint8Array;
    try {
      signature = fromBase64(input.signature);
    } catch {
      throw new PraxisError(ERROR_CODES.INVALID_SIGNATURE, 'signature must be valid base64', 400);
    }
    const provider = getSignatureProvider('Ed25519');
    const result = await provider.verify(canonicalPayload, signature, issuer.publicKey);
    if (!result.valid) {
      throw new PraxisError(
        ERROR_CODES.INVALID_SIGNATURE,
        `Feedback signature verification failed: ${result.reason ?? 'unknown'}`,
        400,
      );
    }

    // Record idempotency row first; if the graph write fails, the next
    // attempt will hit the idempotency branch and return a 200 instead of
    // double-writing the edge.
    await this.feedbackRepo.insert({
      feedbackId: input.feedbackId,
      fromDid: input.fromDid,
      toDid: input.toDid,
      txId: input.txId,
      rating: input.rating,
      signedAt,
      signature: input.signature,
    });

    await this.graphRepo.recordFeedbackEdge({
      feedbackId: input.feedbackId,
      fromDid: input.fromDid,
      toDid: input.toDid,
      txId: input.txId,
      rating: input.rating,
      dimensions: input.dimensions,
      ...(input.comment !== undefined ? { comment: input.comment } : {}),
      signedAt,
      signature: input.signature,
    });

    return { accepted: true, idempotent: false, feedbackId: input.feedbackId };
  }
}
