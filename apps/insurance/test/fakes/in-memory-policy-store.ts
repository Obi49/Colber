import { ERROR_CODES, ColberError } from '@colber/core-types';
import { v4 as uuidv4 } from 'uuid';

import { validateTransition } from '../../src/domain/escrow.js';

import type {
  ListPoliciesQuery,
  PolicyStore,
  PolicyView,
  SubmitClaimInput,
  SubmitClaimResult,
  SubscribeInput,
  SubscribeResult,
} from '../../src/domain/policy-store.js';
import type { Claim, EscrowEvent, EscrowHolding, Policy } from '../../src/domain/types.js';

interface StoredEscrow {
  holding: EscrowHolding;
  events: EscrowEvent[];
}

/**
 * In-memory `PolicyStore` for unit + integration tests. No Postgres.
 *
 * Honours the same idempotency + exposure-cap semantics as the Postgres
 * adapter so the integration suite can exercise them without a database.
 */
export class InMemoryPolicyStore implements PolicyStore {
  public closed = false;
  /** When set, the next call throws this error (then resets to null). */
  public throwNext: Error | null = null;

  private readonly policies = new Map<string, Policy>();
  private readonly policyByIdempotencyKey = new Map<string, string>();
  private readonly escrows = new Map<string, StoredEscrow>(); // holding.id -> StoredEscrow
  private readonly escrowByPolicy = new Map<string, string>(); // policyId -> holding.id
  private readonly claims = new Map<string, Claim>(); // claim.id -> Claim
  private readonly claimByPolicyIdem = new Map<string, string>(); // `${policyId}:${idem}` -> claim.id
  private nextEventSeq = 1;

  public subscribe(input: SubscribeInput): Promise<SubscribeResult> {
    this.maybeThrow();
    const existingPolicyId = this.policyByIdempotencyKey.get(input.idempotencyKey);
    if (existingPolicyId) {
      const view = this.buildPolicyView(existingPolicyId);
      if (!view) {
        return Promise.reject(new Error('idempotency hit but view missing'));
      }
      return Promise.resolve({ view, idempotent: true });
    }

    const totalLocked = this.sumLockedExposureSync();
    if (totalLocked + input.policy.amountUsdc > input.maxGlobalExposureUsdc) {
      return Promise.reject(
        new ColberError(
          ERROR_CODES.VALIDATION_FAILED,
          `global exposure cap reached (${totalLocked} + ${input.policy.amountUsdc} > ${input.maxGlobalExposureUsdc})`,
          400,
        ),
      );
    }

    this.policies.set(input.policy.id, input.policy);
    this.policyByIdempotencyKey.set(input.idempotencyKey, input.policy.id);

    const holding: EscrowHolding = {
      id: input.escrowId,
      policyId: input.policy.id,
      amountUsdc: input.policy.amountUsdc,
      status: 'locked',
      lockedAt: input.policy.createdAt,
    };
    const lockedEvent: EscrowEvent = {
      seq: this.nextEventSeq++,
      holdingId: input.escrowId,
      eventType: 'escrow.locked',
      payload: { policyId: input.policy.id, amountUsdc: input.policy.amountUsdc },
      occurredAt: input.policy.createdAt,
    };
    this.escrows.set(input.escrowId, { holding, events: [lockedEvent] });
    this.escrowByPolicy.set(input.policy.id, input.escrowId);

    const view = this.buildPolicyView(input.policy.id);
    if (!view) {
      return Promise.reject(new Error('view rebuild failed'));
    }
    return Promise.resolve({ view, idempotent: false });
  }

  public submitClaim(input: SubmitClaimInput): Promise<SubmitClaimResult> {
    this.maybeThrow();
    const key = `${input.claim.policyId}:${input.idempotencyKey}`;
    const existingId = this.claimByPolicyIdem.get(key);
    if (existingId) {
      const existing = this.claims.get(existingId);
      if (!existing) {
        return Promise.reject(new Error('idempotency hit but claim missing'));
      }
      return Promise.resolve({ claim: existing, idempotent: true });
    }
    this.claims.set(input.claim.id, input.claim);
    this.claimByPolicyIdem.set(key, input.claim.id);
    return Promise.resolve({ claim: input.claim, idempotent: false });
  }

  public getPolicy(policyId: string): Promise<PolicyView | null> {
    this.maybeThrow();
    return Promise.resolve(this.buildPolicyView(policyId));
  }

  public listPolicies(
    query: ListPoliciesQuery,
  ): Promise<{ policies: readonly PolicyView[]; total: number }> {
    this.maybeThrow();
    const matching = [...this.policies.values()]
      .filter((p) => p.subscriberDid === query.subscriberDid)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const slice = matching.slice(query.offset, query.offset + query.limit);
    const views: PolicyView[] = [];
    for (const policy of slice) {
      const view = this.buildPolicyView(policy.id);
      if (view) {
        views.push(view);
      }
    }
    return Promise.resolve({ policies: views, total: matching.length });
  }

  public forceEscrowTransition(input: {
    holdingId: string;
    to: 'released' | 'claimed' | 'refunded';
    at: Date;
    reason?: string;
    claimId?: string;
  }): Promise<{ holding: EscrowHolding; events: readonly EscrowEvent[] }> {
    this.maybeThrow();
    const stored = this.escrows.get(input.holdingId);
    if (!stored) {
      return Promise.reject(
        new ColberError(ERROR_CODES.NOT_FOUND, `escrow holding ${input.holdingId} not found`, 404),
      );
    }

    const verdict = validateTransition(stored.holding.status, input.to);
    if (verdict.kind === 'reject') {
      return Promise.reject(new ColberError(ERROR_CODES.VALIDATION_FAILED, verdict.reason, 400));
    }
    if (verdict.kind === 'noop') {
      return Promise.resolve({ holding: stored.holding, events: [...stored.events] });
    }

    const updated: EscrowHolding = {
      ...stored.holding,
      status: input.to,
      ...(input.to === 'released' ? { releasedAt: input.at.toISOString() } : {}),
      ...(input.to === 'claimed' ? { claimedAt: input.at.toISOString() } : {}),
      ...(input.to === 'refunded' ? { refundedAt: input.at.toISOString() } : {}),
    };
    const payload: Record<string, unknown> = {};
    if (input.reason !== undefined) {
      payload.reason = input.reason;
    }
    if (input.claimId !== undefined) {
      payload.claimId = input.claimId;
    }
    const event: EscrowEvent = {
      seq: this.nextEventSeq++,
      holdingId: input.holdingId,
      eventType: `escrow.${input.to}`,
      payload,
      occurredAt: input.at.toISOString(),
    };
    stored.holding = updated;
    stored.events.push(event);

    if (input.to === 'claimed' && input.claimId !== undefined) {
      const claim = this.claims.get(input.claimId);
      if (claim?.policyId === updated.policyId) {
        const decided: Claim = {
          ...claim,
          status: 'paid',
          decidedAt: input.at.toISOString(),
          payoutUsdc: updated.amountUsdc,
        };
        this.claims.set(claim.id, decided);
      }
      const policy = this.policies.get(updated.policyId);
      if (policy) {
        this.policies.set(policy.id, { ...policy, status: 'claimed' });
      }
    }

    return Promise.resolve({ holding: updated, events: [...stored.events] });
  }

  public ping(): Promise<void> {
    this.maybeThrow();
    return Promise.resolve();
  }

  public close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }

  /** Test-only: returns the current sum of locked exposure. */
  public sumLockedExposure(): Promise<number> {
    return Promise.resolve(this.sumLockedExposureSync());
  }

  /** Test-only: snapshot all stored entities. */
  public dump(): {
    policies: Policy[];
    escrows: { holding: EscrowHolding; events: EscrowEvent[] }[];
    claims: Claim[];
  } {
    return {
      policies: [...this.policies.values()],
      escrows: [...this.escrows.values()].map((e) => ({
        holding: e.holding,
        events: [...e.events],
      })),
      claims: [...this.claims.values()],
    };
  }

  /** Test-only: pre-seed an arbitrary holding (e.g. to push exposure to the cap). */
  public seedLocked(input: { policyId: string; amountUsdc: number }): EscrowHolding {
    const id = uuidv4();
    const holding: EscrowHolding = {
      id,
      policyId: input.policyId,
      amountUsdc: input.amountUsdc,
      status: 'locked',
      lockedAt: new Date().toISOString(),
    };
    this.escrows.set(id, {
      holding,
      events: [
        {
          seq: this.nextEventSeq++,
          holdingId: id,
          eventType: 'escrow.locked',
          payload: { policyId: input.policyId, amountUsdc: input.amountUsdc },
          occurredAt: holding.lockedAt,
        },
      ],
    });
    this.escrowByPolicy.set(input.policyId, id);
    return holding;
  }

  private buildPolicyView(policyId: string): PolicyView | null {
    const policy = this.policies.get(policyId);
    if (!policy) {
      return null;
    }
    const escrowId = this.escrowByPolicy.get(policyId);
    if (!escrowId) {
      return null;
    }
    const stored = this.escrows.get(escrowId);
    if (!stored) {
      return null;
    }
    const policyClaims = [...this.claims.values()]
      .filter((c) => c.policyId === policyId)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    return { policy, escrow: stored.holding, claims: policyClaims };
  }

  private sumLockedExposureSync(): number {
    let total = 0;
    for (const stored of this.escrows.values()) {
      if (stored.holding.status === 'locked') {
        total += stored.holding.amountUsdc;
      }
    }
    return total;
  }

  private maybeThrow(): void {
    if (this.throwNext) {
      const err = this.throwNext;
      this.throwNext = null;
      throw err;
    }
  }
}
