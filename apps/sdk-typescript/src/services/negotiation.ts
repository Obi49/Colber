/**
 * `NegotiationService` — typed client for the `negotiation` service.
 *
 * Mirror of `apps/negotiation/src/http/routes.ts`:
 *   - POST /v1/negotiation                     (start)
 *   - GET  /v1/negotiation/:id                 (get)
 *   - GET  /v1/negotiation/:id/history         (history)
 *   - POST /v1/negotiation/:id/propose         (propose)
 *   - POST /v1/negotiation/:id/counter         (counter)
 *   - POST /v1/negotiation/:id/settle          (settle)
 *
 * `start` accepts an optional `{ idempotencyKey }` second arg per the brief.
 * The key is forwarded into the body verbatim — generation is the caller's
 * responsibility (the service treats `start` as idempotent on this key).
 */

import { request } from '../http.js';

import type { HttpClientOptions } from '../http.js';
import type { IdempotentOptions } from '../types.js';

export type Strategy = 'ascending-auction' | 'multi-criteria';

export type AttributeValue = string | number | boolean | readonly (string | number | boolean)[];

export interface CriterionWeight {
  readonly name: string;
  readonly weight: number;
}

export interface NegotiationTerms {
  readonly subject: string;
  readonly strategy: Strategy;
  readonly constraints?: Readonly<Record<string, AttributeValue>>;
  readonly criteria?: readonly CriterionWeight[];
  readonly partyDids: readonly string[];
  readonly deadline: string;
  readonly reservePrice?: number;
  readonly currency?: string;
}

export interface ProposalInput {
  readonly proposalId: string;
  readonly fromDid: string;
  readonly amount?: number;
  readonly scores?: Readonly<Record<string, number>>;
  readonly payload?: Readonly<Record<string, AttributeValue>>;
  /** base64-encoded Ed25519 signature over the JCS canonical proposal payload. */
  readonly signature: string;
  readonly proposedAt: string;
}

export interface StartRequest {
  readonly terms: NegotiationTerms;
  readonly createdBy: string;
}

export interface ProposeRequest {
  readonly negotiationId: string;
  readonly proposal: ProposalInput;
  /** base64-encoded Ed25519 public key of `proposal.fromDid`. */
  readonly publicKey: string;
}

export interface CounterRequest extends ProposeRequest {
  readonly counterTo: string;
}

export interface SettleSignature {
  readonly did: string;
  readonly signature: string;
}

export interface SettlePublicKey {
  readonly did: string;
  readonly publicKey: string;
}

export interface SettleRequest {
  readonly negotiationId: string;
  readonly winningProposalId?: string;
  readonly signatures: readonly SettleSignature[];
  readonly publicKeys: readonly SettlePublicKey[];
}

export interface NegotiationView {
  readonly negotiationId: string;
  readonly status: string;
  readonly strategy: string;
  readonly terms: {
    readonly subject: string;
    readonly strategy: string;
    readonly constraints: Readonly<Record<string, AttributeValue>>;
    readonly criteria?: readonly CriterionWeight[];
    readonly partyDids: readonly string[];
    readonly deadline: string;
    readonly reservePrice?: number;
    readonly currency?: string;
  };
  readonly partyDids: readonly string[];
  readonly proposals: readonly {
    readonly proposalId: string;
    readonly fromDid: string;
    readonly signature: string;
    readonly proposedAt: string;
    readonly amount?: number;
    readonly scores?: Readonly<Record<string, number>>;
    readonly payload?: Readonly<Record<string, AttributeValue>>;
  }[];
  readonly currentBestProposalId?: string;
  readonly winningProposalId?: string;
  readonly settlementSignatures?: readonly { readonly did: string; readonly signature: string }[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt: string;
}

export interface HistoryRequest {
  readonly negotiationId: string;
  readonly cursor?: number;
  readonly limit?: number;
}

export interface HistoryView {
  readonly events: readonly {
    readonly seq: number;
    readonly event: Readonly<Record<string, unknown>>;
  }[];
  readonly nextCursor: number | null;
}

export class NegotiationService {
  constructor(
    private readonly opts: HttpClientOptions,
    private readonly baseUrl: string,
  ) {}

  /**
   * POST /v1/negotiation — idempotent on `idempotencyKey`.
   *
   * @example
   *   await client.negotiation.start({ terms, createdBy }, { idempotencyKey: 'k-1' })
   */
  public async start(body: StartRequest, options: IdempotentOptions): Promise<NegotiationView> {
    const data = await request<NegotiationView>(this.opts, {
      method: 'POST',
      baseUrl: this.baseUrl,
      path: '/v1/negotiation',
      body: { ...body, idempotencyKey: options.idempotencyKey },
    });
    if (data === undefined) {
      throw new Error('negotiation.start: empty response body');
    }
    return data;
  }

  /** GET /v1/negotiation/:id */
  public async get(negotiationId: string): Promise<NegotiationView> {
    const data = await request<NegotiationView>(this.opts, {
      method: 'GET',
      baseUrl: this.baseUrl,
      path: `/v1/negotiation/${encodeURIComponent(negotiationId)}`,
    });
    if (data === undefined) {
      throw new Error('negotiation.get: empty response body');
    }
    return data;
  }

  /** GET /v1/negotiation/:id/history?cursor=...&limit=... */
  public async history({ negotiationId, cursor, limit }: HistoryRequest): Promise<HistoryView> {
    const data = await request<HistoryView>(this.opts, {
      method: 'GET',
      baseUrl: this.baseUrl,
      path: `/v1/negotiation/${encodeURIComponent(negotiationId)}/history`,
      query: {
        ...(cursor !== undefined ? { cursor } : {}),
        ...(limit !== undefined ? { limit } : {}),
      },
    });
    if (data === undefined) {
      throw new Error('negotiation.history: empty response body');
    }
    return data;
  }

  /** POST /v1/negotiation/:id/propose */
  public async propose({
    negotiationId,
    proposal,
    publicKey,
  }: ProposeRequest): Promise<NegotiationView> {
    const data = await request<NegotiationView>(this.opts, {
      method: 'POST',
      baseUrl: this.baseUrl,
      path: `/v1/negotiation/${encodeURIComponent(negotiationId)}/propose`,
      body: { proposal, publicKey },
    });
    if (data === undefined) {
      throw new Error('negotiation.propose: empty response body');
    }
    return data;
  }

  /** POST /v1/negotiation/:id/counter */
  public async counter({
    negotiationId,
    counterTo,
    proposal,
    publicKey,
  }: CounterRequest): Promise<NegotiationView> {
    const data = await request<NegotiationView>(this.opts, {
      method: 'POST',
      baseUrl: this.baseUrl,
      path: `/v1/negotiation/${encodeURIComponent(negotiationId)}/counter`,
      body: { counterTo, proposal, publicKey },
    });
    if (data === undefined) {
      throw new Error('negotiation.counter: empty response body');
    }
    return data;
  }

  /** POST /v1/negotiation/:id/settle */
  public async settle({
    negotiationId,
    winningProposalId,
    signatures,
    publicKeys,
  }: SettleRequest): Promise<NegotiationView> {
    const data = await request<NegotiationView>(this.opts, {
      method: 'POST',
      baseUrl: this.baseUrl,
      path: `/v1/negotiation/${encodeURIComponent(negotiationId)}/settle`,
      body: {
        ...(winningProposalId !== undefined ? { winningProposalId } : {}),
        signatures,
        publicKeys,
      },
    });
    if (data === undefined) {
      throw new Error('negotiation.settle: empty response body');
    }
    return data;
  }
}
