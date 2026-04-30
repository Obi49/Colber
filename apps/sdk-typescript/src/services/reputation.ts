/**
 * `ReputationService` — typed client for the `reputation` service.
 *
 * Mirror of `apps/reputation/src/http/routes.ts`:
 *   - GET  /v1/reputation/score/:did
 *   - GET  /v1/reputation/history/:did
 *   - POST /v1/reputation/verify
 *   - POST /v1/reputation/feedback
 */

import { request } from '../http.js';

import type { HttpClientOptions } from '../http.js';

export interface ScoreRequest {
  readonly did: string;
}

export interface SignedScoreEnvelope {
  readonly did: string;
  readonly score: number;
  readonly scoreVersion: string;
  readonly computedAt: string;
  /** Ed25519 signature over the JCS canonical payload. */
  readonly attestation: string;
}

export interface HistoryRequest {
  readonly did: string;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface HistoryTransaction {
  readonly txId: string;
  readonly counterpartyDid: string;
  readonly role: 'buyer' | 'seller';
  readonly amount: string;
  readonly currency: string;
  readonly status: string;
  readonly completedAt: string;
}

export interface HistoryReceivedFeedback {
  readonly feedbackId: string;
  readonly fromDid: string;
  readonly txId: string;
  readonly rating: number;
  readonly signedAt: string;
  readonly comment?: string;
}

export interface HistoryIssuedFeedback extends HistoryReceivedFeedback {
  readonly toDid: string;
}

export interface HistoryResponse {
  readonly did: string;
  readonly transactions: readonly HistoryTransaction[];
  readonly feedbacksReceived: readonly HistoryReceivedFeedback[];
  readonly feedbacksIssued: readonly HistoryIssuedFeedback[];
  readonly nextCursor: string | null;
}

export interface VerifyRequest {
  readonly score: {
    readonly did: string;
    readonly score: number;
    readonly scoreVersion: string;
    readonly computedAt: string;
  };
  readonly attestation: string;
}

export interface VerifyResponse {
  readonly valid: boolean;
  readonly reason?: string;
}

export interface FeedbackDimensions {
  readonly delivery: number;
  readonly quality: number;
  readonly communication: number;
}

export interface FeedbackRequest {
  readonly feedbackId: string;
  readonly fromDid: string;
  readonly toDid: string;
  readonly txId: string;
  readonly rating: number;
  readonly dimensions: FeedbackDimensions;
  readonly comment?: string;
  readonly signedAt: string;
  readonly signature: string;
}

export interface FeedbackResponse {
  readonly accepted: boolean;
  readonly idempotent: boolean;
  readonly feedbackId: string;
}

export class ReputationService {
  constructor(
    private readonly opts: HttpClientOptions,
    private readonly baseUrl: string,
  ) {}

  /** GET /v1/reputation/score/:did */
  public async score({ did }: ScoreRequest): Promise<SignedScoreEnvelope> {
    const data = await request<SignedScoreEnvelope>(this.opts, {
      method: 'GET',
      baseUrl: this.baseUrl,
      path: `/v1/reputation/score/${encodeURIComponent(did)}`,
    });
    if (data === undefined) {
      throw new Error('reputation.score: empty response body');
    }
    return data;
  }

  /** GET /v1/reputation/history/:did */
  public async history({ did, limit, cursor }: HistoryRequest): Promise<HistoryResponse> {
    const data = await request<HistoryResponse>(this.opts, {
      method: 'GET',
      baseUrl: this.baseUrl,
      path: `/v1/reputation/history/${encodeURIComponent(did)}`,
      query: {
        ...(limit !== undefined ? { limit } : {}),
        ...(cursor !== undefined ? { cursor } : {}),
      },
    });
    if (data === undefined) {
      throw new Error('reputation.history: empty response body');
    }
    return data;
  }

  /** POST /v1/reputation/verify */
  public async verify(body: VerifyRequest): Promise<VerifyResponse> {
    const data = await request<VerifyResponse>(this.opts, {
      method: 'POST',
      baseUrl: this.baseUrl,
      path: '/v1/reputation/verify',
      body,
    });
    if (data === undefined) {
      throw new Error('reputation.verify: empty response body');
    }
    return data;
  }

  /** POST /v1/reputation/feedback */
  public async submitFeedback(body: FeedbackRequest): Promise<FeedbackResponse> {
    const data = await request<FeedbackResponse>(this.opts, {
      method: 'POST',
      baseUrl: this.baseUrl,
      path: '/v1/reputation/feedback',
      body,
    });
    if (data === undefined) {
      throw new Error('reputation.submitFeedback: empty response body');
    }
    return data;
  }
}
