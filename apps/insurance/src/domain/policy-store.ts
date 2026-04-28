import type { Claim, EscrowEvent, EscrowHolding, Policy } from './types.js';

/**
 * Persistence boundary for policies + claims + escrow.
 *
 * The Postgres adapter (`db/policy-store.ts`) implements this in a
 * transactional way. The in-memory fake
 * (`test/fakes/in-memory-policy-store.ts`) implements it for tests.
 *
 * Subscribe is the only operation that touches `policies` +
 * `escrow_holdings` + `escrow_events` together — it MUST be transactional
 * to keep the global exposure cap consistent under concurrent calls.
 */

export interface PolicyView {
  readonly policy: Policy;
  readonly escrow: EscrowHolding;
  readonly claims: readonly Claim[];
}

export interface SubscribeInput {
  readonly policy: Policy;
  readonly escrowId: string;
  readonly idempotencyKey: string;
  readonly maxGlobalExposureUsdc: number;
}

export interface SubscribeResult {
  readonly view: PolicyView;
  readonly idempotent: boolean;
}

export interface SubmitClaimInput {
  readonly claim: Claim;
  readonly idempotencyKey: string;
}

export interface SubmitClaimResult {
  readonly claim: Claim;
  readonly idempotent: boolean;
}

export interface ListPoliciesQuery {
  readonly subscriberDid: string;
  readonly limit: number;
  readonly offset: number;
}

export interface PolicyStore {
  /**
   * Insert the policy + lock the escrow + append `escrow.locked`, all in
   * one transaction. Enforces the exposure cap on `escrow_holdings.status =
   * 'locked'` inside the same transaction.
   *
   * Idempotent on `idempotencyKey` (a `policies.idempotency_key` UNIQUE
   * collision returns the existing view with `idempotent: true`).
   */
  subscribe(input: SubscribeInput): Promise<SubscribeResult>;

  /**
   * Insert the claim. Idempotent on `(policy_id, idempotency_key)` (a
   * UNIQUE collision returns the existing claim with `idempotent: true`).
   */
  submitClaim(input: SubmitClaimInput): Promise<SubmitClaimResult>;

  getPolicy(policyId: string): Promise<PolicyView | null>;

  listPolicies(query: ListPoliciesQuery): Promise<{
    policies: readonly PolicyView[];
    total: number;
  }>;

  /**
   * Force an escrow + claim transition (admin endpoint). Returns the
   * updated holding, optionally with the matching claim.
   *
   * If `to === 'claimed'` and `claimId` is provided, the claim is updated
   * to status `paid` and the policy status to `claimed` in the same
   * transaction.
   *
   * Throws `VALIDATION_FAILED` for an illegal transition.
   */
  forceEscrowTransition(input: {
    holdingId: string;
    to: 'released' | 'claimed' | 'refunded';
    at: Date;
    reason?: string;
    claimId?: string;
  }): Promise<{
    holding: EscrowHolding;
    events: readonly EscrowEvent[];
  }>;

  /** Lightweight readiness check — runs `SELECT 1` on the underlying pool. */
  ping(): Promise<void>;

  /** Idempotent close. */
  close(): Promise<void>;
}
