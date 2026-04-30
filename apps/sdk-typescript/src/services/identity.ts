/**
 * `IdentityService` — typed client for the `agent-identity` service.
 *
 * Mirror of `apps/agent-identity/src/http/routes.ts`:
 *   - POST /v1/identity/register
 *   - GET  /v1/identity/:did
 *   - POST /v1/identity/verify
 */

import { request } from '../http.js';

import type { HttpClientOptions } from '../http.js';

export interface RegisterRequest {
  /** Ed25519 public key, raw 32 bytes, base64-encoded. */
  readonly publicKey: string;
  /** Operator that owns this agent (1..128 chars). */
  readonly ownerOperatorId: string;
}

export interface RegisterResponse {
  readonly did: string;
  readonly agentId: string;
  readonly registeredAt: string;
}

export interface ResolveResponse {
  readonly did: string;
  readonly agentId: string;
  readonly publicKey: string;
  readonly signatureScheme: string;
  readonly ownerOperatorId: string;
  readonly registeredAt: string;
  readonly revokedAt: string | null;
}

export interface VerifyRequest {
  readonly did: string;
  /** base64-encoded message bytes. */
  readonly message: string;
  /** base64-encoded signature bytes. */
  readonly signature: string;
}

export interface VerifyResponse {
  readonly valid: boolean;
  readonly reason?: string;
}

export class IdentityService {
  constructor(
    private readonly opts: HttpClientOptions,
    private readonly baseUrl: string,
  ) {}

  /** POST /v1/identity/register */
  public async register(body: RegisterRequest): Promise<RegisterResponse> {
    const data = await request<RegisterResponse>(this.opts, {
      method: 'POST',
      baseUrl: this.baseUrl,
      path: '/v1/identity/register',
      body,
    });
    if (data === undefined) {
      throw new Error('identity.register: empty response body');
    }
    return data;
  }

  /** GET /v1/identity/:did */
  public async resolve(did: string): Promise<ResolveResponse> {
    const data = await request<ResolveResponse>(this.opts, {
      method: 'GET',
      baseUrl: this.baseUrl,
      path: `/v1/identity/${encodeURIComponent(did)}`,
    });
    if (data === undefined) {
      throw new Error('identity.resolve: empty response body');
    }
    return data;
  }

  /** POST /v1/identity/verify */
  public async verify(body: VerifyRequest): Promise<VerifyResponse> {
    const data = await request<VerifyResponse>(this.opts, {
      method: 'POST',
      baseUrl: this.baseUrl,
      path: '/v1/identity/verify',
      body,
    });
    if (data === undefined) {
      throw new Error('identity.verify: empty response body');
    }
    return data;
  }
}
