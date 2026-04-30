/**
 * `InsuranceService` — typed client for the `insurance` service.
 *
 * Mirror of `apps/insurance/src/http/routes.ts`:
 *   - POST /v1/insurance/quote                                  (quote)
 *   - POST /v1/insurance/subscribe                              (subscribe — idempotent)
 *   - POST /v1/insurance/claims                                 (claim — idempotent)
 *   - GET  /v1/insurance/policies/:id                           (status)
 *   - GET  /v1/insurance/policies?subscriberDid=...             (list)
 *
 * The admin endpoint
 * `POST /v1/insurance/admin/escrow/:holdingId/transition` is
 * intentionally NOT exposed by the SDK — it is gated server-side by
 * `INSURANCE_ADMIN_ENABLED=true` and is only used by the e2e harness.
 *
 * `subscribe` and `claim` accept an `IdempotentOptions` second argument per
 * the brief — the key is forwarded into the body verbatim.
 */

import { request } from '../http.js';

import type { HttpClientOptions } from '../http.js';
import type { IdempotentOptions } from '../types.js';

export interface SlaTerms {
  readonly deliveryWindowHours: number;
  readonly requirements?: readonly string[];
}

export interface QuoteRequest {
  readonly subscriberDid: string;
  readonly beneficiaryDid: string;
  readonly dealSubject: string;
  readonly amountUsdc: number;
  readonly slaTerms: SlaTerms;
}

export interface QuoteView {
  readonly subscriberDid: string;
  readonly beneficiaryDid: string;
  readonly dealSubject: string;
  readonly amountUsdc: number;
  readonly premiumUsdc: number;
  readonly riskMultiplier: number;
  readonly reputationScore: number;
  readonly computedAt: string;
  readonly validUntil: string;
}

export type SubscribeRequest = QuoteRequest;

export interface PolicyView {
  readonly id: string;
  readonly subscriberDid: string;
  readonly beneficiaryDid: string;
  readonly dealSubject: string;
  readonly amountUsdc: number;
  readonly premiumUsdc: number;
  readonly riskMultiplier: number;
  readonly reputationScore: number;
  readonly slaTerms: SlaTerms;
  readonly status: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface EscrowView {
  readonly id: string;
  readonly policyId: string;
  readonly amountUsdc: number;
  readonly status: string;
  readonly lockedAt: string;
  readonly releasedAt?: string;
  readonly claimedAt?: string;
  readonly refundedAt?: string;
}

export interface ClaimView {
  readonly id: string;
  readonly policyId: string;
  readonly claimantDid: string;
  readonly reason: string;
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly status: string;
  readonly createdAt: string;
  readonly decidedAt?: string;
  readonly payoutUsdc?: number;
}

export interface PolicyDetailView {
  readonly policy: PolicyView;
  readonly escrow: EscrowView;
  readonly claims: readonly ClaimView[];
}

export interface ClaimRequest {
  readonly policyId: string;
  readonly claimantDid: string;
  readonly reason: string;
  readonly evidence: Readonly<Record<string, unknown>>;
}

export interface PolicyListRequest {
  readonly subscriberDid: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface PolicyListView {
  readonly policies: readonly PolicyDetailView[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export class InsuranceService {
  constructor(
    private readonly opts: HttpClientOptions,
    private readonly baseUrl: string,
  ) {}

  /** POST /v1/insurance/quote */
  public async quote(body: QuoteRequest): Promise<QuoteView> {
    const data = await request<QuoteView>(this.opts, {
      method: 'POST',
      baseUrl: this.baseUrl,
      path: '/v1/insurance/quote',
      body,
    });
    if (data === undefined) {
      throw new Error('insurance.quote: empty response body');
    }
    return data;
  }

  /** POST /v1/insurance/subscribe — idempotent on `idempotencyKey`. */
  public async subscribe(
    body: SubscribeRequest,
    options: IdempotentOptions,
  ): Promise<PolicyDetailView> {
    const data = await request<PolicyDetailView>(this.opts, {
      method: 'POST',
      baseUrl: this.baseUrl,
      path: '/v1/insurance/subscribe',
      body: { ...body, idempotencyKey: options.idempotencyKey },
    });
    if (data === undefined) {
      throw new Error('insurance.subscribe: empty response body');
    }
    return data;
  }

  /** POST /v1/insurance/claims — idempotent on `(policyId, idempotencyKey)`. */
  public async claim(body: ClaimRequest, options: IdempotentOptions): Promise<ClaimView> {
    const data = await request<ClaimView>(this.opts, {
      method: 'POST',
      baseUrl: this.baseUrl,
      path: '/v1/insurance/claims',
      body: { ...body, idempotencyKey: options.idempotencyKey },
    });
    if (data === undefined) {
      throw new Error('insurance.claim: empty response body');
    }
    return data;
  }

  /** GET /v1/insurance/policies/:id */
  public async status(policyId: string): Promise<PolicyDetailView> {
    const data = await request<PolicyDetailView>(this.opts, {
      method: 'GET',
      baseUrl: this.baseUrl,
      path: `/v1/insurance/policies/${encodeURIComponent(policyId)}`,
    });
    if (data === undefined) {
      throw new Error('insurance.status: empty response body');
    }
    return data;
  }

  /** GET /v1/insurance/policies?subscriberDid=...&limit=...&offset=... */
  public async list({ subscriberDid, limit, offset }: PolicyListRequest): Promise<PolicyListView> {
    const data = await request<PolicyListView>(this.opts, {
      method: 'GET',
      baseUrl: this.baseUrl,
      path: '/v1/insurance/policies',
      query: {
        subscriberDid,
        ...(limit !== undefined ? { limit } : {}),
        ...(offset !== undefined ? { offset } : {}),
      },
    });
    if (data === undefined) {
      throw new Error('insurance.list: empty response body');
    }
    return data;
  }
}
