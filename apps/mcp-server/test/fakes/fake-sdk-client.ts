/* eslint-disable @typescript-eslint/require-await */
/**
 * In-memory fake of `ColberClient` used by tool tests.
 *
 * Only implements the methods our MCP tools actually call. Each method:
 *   - Records the last call (`lastCall`) for assertion.
 *   - Returns a default fixture, or a rejection if the corresponding error
 *     flag is set.
 *
 * The shape mirrors the real SDK closely enough that `as unknown as
 * ColberClient` is a safe cast at the call site (we only consume the
 * methods we override here).
 */

import { ColberApiError, ColberNetworkError, ColberValidationError } from '@colber/sdk';

export type FakeError =
  | {
      readonly kind: 'api';
      readonly status: number;
      readonly code: string;
      readonly message?: string;
    }
  | {
      readonly kind: 'network';
      readonly code: 'TIMEOUT' | 'FETCH_FAILED' | 'INVALID_RESPONSE' | 'INVALID_JSON';
    }
  | { readonly kind: 'validation'; readonly path?: string; readonly message?: string }
  | { readonly kind: 'plain'; readonly message: string };

export interface FakeServiceState {
  /** If set, the next call rejects with this error. */
  nextError?: FakeError;
  /** If set, the next call resolves with this fixture instead of the default. */
  nextResult?: unknown;
  /** Last call arguments, captured for assertions. */
  lastCall?: { readonly method: string; readonly args: readonly unknown[] };
}

const throwIfQueued = (state: FakeServiceState, _method: string): void => {
  // Note: methods set `state.lastCall` themselves *before* calling this helper.
  // We only check for a queued error here; we must NOT clobber `lastCall`.
  const err = state.nextError;
  if (err === undefined) {
    return;
  }
  delete state.nextError;
  switch (err.kind) {
    case 'api':
      throw new ColberApiError({
        code: err.code,
        message: err.message ?? `fake api error: ${err.code}`,
        status: err.status,
      });
    case 'network':
      throw new ColberNetworkError({ code: err.code, message: `fake network: ${err.code}` });
    case 'validation':
      throw new ColberValidationError(err.message ?? 'fake validation', err.path);
    case 'plain':
      throw new Error(err.message);
  }
};

export class FakeSdkClient {
  public readonly identity: FakeIdentity;
  public readonly reputation: FakeReputation;
  public readonly memory: FakeMemory;
  public readonly observability: FakeObservability;
  public readonly negotiation: FakeNegotiation;
  public readonly insurance: FakeInsurance;

  constructor() {
    this.identity = new FakeIdentity();
    this.reputation = new FakeReputation();
    this.memory = new FakeMemory();
    this.observability = new FakeObservability();
    this.negotiation = new FakeNegotiation();
    this.insurance = new FakeInsurance();
  }
}

// -------------------------------------------------------------------------
// Identity
// -------------------------------------------------------------------------
class FakeIdentity {
  public readonly state: FakeServiceState = {};

  public async register(args: unknown): Promise<unknown> {
    this.state.lastCall = { method: 'register', args: [args] };
    throwIfQueued(this.state, 'register');
    return (
      this.state.nextResult ?? {
        did: 'did:key:z6Mkfake-register',
        agentId: '11111111-1111-4111-8111-111111111111',
        registeredAt: '2026-05-01T00:00:00.000Z',
      }
    );
  }

  public async resolve(did: string): Promise<unknown> {
    this.state.lastCall = { method: 'resolve', args: [did] };
    throwIfQueued(this.state, 'resolve');
    return (
      this.state.nextResult ?? {
        did,
        agentId: '11111111-1111-4111-8111-111111111111',
        publicKey: 'fakekey',
        signatureScheme: 'Ed25519',
        ownerOperatorId: 'op-1',
        registeredAt: '2026-05-01T00:00:00.000Z',
        revokedAt: null,
      }
    );
  }

  public async verify(args: unknown): Promise<unknown> {
    this.state.lastCall = { method: 'verify', args: [args] };
    throwIfQueued(this.state, 'verify');
    return this.state.nextResult ?? { valid: true };
  }
}

// -------------------------------------------------------------------------
// Reputation
// -------------------------------------------------------------------------
class FakeReputation {
  public readonly state: FakeServiceState = {};

  public async score(args: unknown): Promise<unknown> {
    this.state.lastCall = { method: 'score', args: [args] };
    throwIfQueued(this.state, 'score');
    return (
      this.state.nextResult ?? {
        did: 'did:key:zReputation',
        score: 750,
        scoreVersion: 'v1',
        computedAt: '2026-05-01T00:00:00.000Z',
        attestation: 'AAAA',
      }
    );
  }

  public async history(args: unknown): Promise<unknown> {
    this.state.lastCall = { method: 'history', args: [args] };
    throwIfQueued(this.state, 'history');
    return (
      this.state.nextResult ?? {
        did: 'did:key:zReputation',
        transactions: [],
        feedbacksReceived: [],
        feedbacksIssued: [],
        nextCursor: null,
      }
    );
  }

  public async verify(args: unknown): Promise<unknown> {
    this.state.lastCall = { method: 'verify', args: [args] };
    throwIfQueued(this.state, 'verify');
    return this.state.nextResult ?? { valid: true };
  }

  public async submitFeedback(args: unknown): Promise<unknown> {
    this.state.lastCall = { method: 'submitFeedback', args: [args] };
    throwIfQueued(this.state, 'submitFeedback');
    return (
      this.state.nextResult ?? {
        accepted: true,
        idempotent: false,
        feedbackId: '22222222-2222-4222-8222-222222222222',
      }
    );
  }
}

// -------------------------------------------------------------------------
// Memory
// -------------------------------------------------------------------------
class FakeMemory {
  public readonly state: FakeServiceState = {};

  public async store(args: unknown): Promise<unknown> {
    this.state.lastCall = { method: 'store', args: [args] };
    throwIfQueued(this.state, 'store');
    return (
      this.state.nextResult ?? {
        id: '33333333-3333-4333-8333-333333333333',
        embedding: { model: 'fake', dim: 8 },
      }
    );
  }

  public async search(args: unknown): Promise<unknown> {
    this.state.lastCall = { method: 'search', args: [args] };
    throwIfQueued(this.state, 'search');
    return this.state.nextResult ?? { hits: [] };
  }

  public async update(args: unknown): Promise<unknown> {
    this.state.lastCall = { method: 'update', args: [args] };
    throwIfQueued(this.state, 'update');
    return (
      this.state.nextResult ?? {
        id: '33333333-3333-4333-8333-333333333333',
        version: 2,
        embedding: { model: 'fake', dim: 8 },
      }
    );
  }

  public async share(args: unknown): Promise<unknown> {
    this.state.lastCall = { method: 'share', args: [args] };
    throwIfQueued(this.state, 'share');
    return (
      this.state.nextResult ?? {
        id: '33333333-3333-4333-8333-333333333333',
        sharedWith: ['did:key:zPeer'],
      }
    );
  }
}

// -------------------------------------------------------------------------
// Observability
// -------------------------------------------------------------------------
class FakeObservability {
  public readonly state: FakeServiceState = {};

  public async ingestLogs(args: unknown): Promise<unknown> {
    this.state.lastCall = { method: 'ingestLogs', args: [args] };
    throwIfQueued(this.state, 'ingestLogs');
    return this.state.nextResult ?? { accepted: 1, rejected: [] };
  }

  public async ingestSpans(args: unknown): Promise<unknown> {
    this.state.lastCall = { method: 'ingestSpans', args: [args] };
    throwIfQueued(this.state, 'ingestSpans');
    return this.state.nextResult ?? { accepted: 1, rejected: [] };
  }

  public async query(args: unknown): Promise<unknown> {
    this.state.lastCall = { method: 'query', args: [args] };
    throwIfQueued(this.state, 'query');
    return this.state.nextResult ?? { rows: [], total: 0 };
  }

  public async createAlert(args: unknown): Promise<unknown> {
    this.state.lastCall = { method: 'createAlert', args: [args] };
    throwIfQueued(this.state, 'createAlert');
    return this.state.nextResult ?? mkAlert('44444444-4444-4444-8444-444444444444');
  }

  public async getAlert(id: string): Promise<unknown> {
    this.state.lastCall = { method: 'getAlert', args: [id] };
    throwIfQueued(this.state, 'getAlert');
    return this.state.nextResult ?? mkAlert(id);
  }

  public async patchAlert(id: string, body: unknown): Promise<unknown> {
    this.state.lastCall = { method: 'patchAlert', args: [id, body] };
    throwIfQueued(this.state, 'patchAlert');
    return this.state.nextResult ?? mkAlert(id);
  }

  public async listAlerts(operatorId: string): Promise<unknown> {
    this.state.lastCall = { method: 'listAlerts', args: [operatorId] };
    throwIfQueued(this.state, 'listAlerts');
    return this.state.nextResult ?? { alerts: [] };
  }

  public async deleteAlert(id: string): Promise<void> {
    this.state.lastCall = { method: 'deleteAlert', args: [id] };
    throwIfQueued(this.state, 'deleteAlert');
  }
}

const mkAlert = (id: string): Record<string, unknown> => ({
  id,
  ownerOperatorId: 'op-1',
  name: 'fake-alert',
  description: '',
  enabled: true,
  scope: 'logs',
  condition: {
    operator: 'and',
    filters: [{ field: 'level', op: 'eq', value: 'error' }],
    windowSeconds: 60,
    threshold: 5,
  },
  cooldownSeconds: 300,
  notification: { channels: [] },
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
});

// -------------------------------------------------------------------------
// Negotiation
// -------------------------------------------------------------------------
class FakeNegotiation {
  public readonly state: FakeServiceState = {};

  public async start(args: unknown, opts: unknown): Promise<unknown> {
    this.state.lastCall = { method: 'start', args: [args, opts] };
    throwIfQueued(this.state, 'start');
    return this.state.nextResult ?? mkNegotiationView();
  }

  public async propose(args: unknown): Promise<unknown> {
    this.state.lastCall = { method: 'propose', args: [args] };
    throwIfQueued(this.state, 'propose');
    return this.state.nextResult ?? mkNegotiationView();
  }

  public async counter(args: unknown): Promise<unknown> {
    this.state.lastCall = { method: 'counter', args: [args] };
    throwIfQueued(this.state, 'counter');
    return this.state.nextResult ?? mkNegotiationView();
  }

  public async settle(args: unknown): Promise<unknown> {
    this.state.lastCall = { method: 'settle', args: [args] };
    throwIfQueued(this.state, 'settle');
    return this.state.nextResult ?? mkNegotiationView();
  }
}

const mkNegotiationView = (): Record<string, unknown> => ({
  negotiationId: '55555555-5555-4555-8555-555555555555',
  status: 'open',
  strategy: 'ascending-auction',
  terms: {
    subject: 'fake-subject',
    strategy: 'ascending-auction',
    constraints: {},
    partyDids: ['did:key:zA', 'did:key:zB'],
    deadline: '2026-06-01T00:00:00.000Z',
  },
  partyDids: ['did:key:zA', 'did:key:zB'],
  proposals: [],
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
  expiresAt: '2026-06-01T00:00:00.000Z',
});

// -------------------------------------------------------------------------
// Insurance
// -------------------------------------------------------------------------
class FakeInsurance {
  public readonly state: FakeServiceState = {};

  public async quote(args: unknown): Promise<unknown> {
    this.state.lastCall = { method: 'quote', args: [args] };
    throwIfQueued(this.state, 'quote');
    return (
      this.state.nextResult ?? {
        subscriberDid: 'did:key:zSub',
        beneficiaryDid: 'did:key:zBen',
        dealSubject: 'shipment-x',
        amountUsdc: 100,
        premiumUsdc: 2,
        riskMultiplier: 1.0,
        reputationScore: 750,
        computedAt: '2026-05-01T00:00:00.000Z',
        validUntil: '2026-05-01T00:05:00.000Z',
      }
    );
  }

  public async subscribe(args: unknown, opts: unknown): Promise<unknown> {
    this.state.lastCall = { method: 'subscribe', args: [args, opts] };
    throwIfQueued(this.state, 'subscribe');
    return this.state.nextResult ?? mkPolicyDetail();
  }

  public async claim(args: unknown, opts: unknown): Promise<unknown> {
    this.state.lastCall = { method: 'claim', args: [args, opts] };
    throwIfQueued(this.state, 'claim');
    return (
      this.state.nextResult ?? {
        id: '66666666-6666-4666-8666-666666666666',
        policyId: '77777777-7777-4777-8777-777777777777',
        claimantDid: 'did:key:zSub',
        reason: 'late delivery',
        evidence: {},
        status: 'open',
        createdAt: '2026-05-01T00:00:00.000Z',
      }
    );
  }

  public async status(policyId: string): Promise<unknown> {
    this.state.lastCall = { method: 'status', args: [policyId] };
    throwIfQueued(this.state, 'status');
    return this.state.nextResult ?? mkPolicyDetail();
  }
}

const mkPolicyDetail = (): Record<string, unknown> => ({
  policy: {
    id: '77777777-7777-4777-8777-777777777777',
    subscriberDid: 'did:key:zSub',
    beneficiaryDid: 'did:key:zBen',
    dealSubject: 'shipment-x',
    amountUsdc: 100,
    premiumUsdc: 2,
    riskMultiplier: 1.0,
    reputationScore: 750,
    slaTerms: { deliveryWindowHours: 24 },
    status: 'active',
    createdAt: '2026-05-01T00:00:00.000Z',
    expiresAt: '2026-06-01T00:00:00.000Z',
  },
  escrow: {
    id: '88888888-8888-4888-8888-888888888888',
    policyId: '77777777-7777-4777-8777-777777777777',
    amountUsdc: 100,
    status: 'locked',
    lockedAt: '2026-05-01T00:00:00.000Z',
  },
  claims: [],
});
