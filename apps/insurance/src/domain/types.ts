/**
 * Domain types for the insurance broker.
 *
 * The wire shape (REST + gRPC + MCP responses) is built from these by
 * `http/views.ts`. Numbers are kept as JS numbers — the database persists
 * them as `numeric(18,6)` (USDC precision: 6 decimal places).
 *
 * Currency: USDC throughout. v1 supports a single currency.
 */

export type PolicyStatus = 'pending' | 'active' | 'expired' | 'cancelled' | 'claimed';
export type EscrowStatus = 'locked' | 'released' | 'claimed' | 'refunded';
export type ClaimStatus = 'open' | 'approved' | 'rejected' | 'paid';

export const POLICY_STATUSES: readonly PolicyStatus[] = [
  'pending',
  'active',
  'expired',
  'cancelled',
  'claimed',
];

export const ESCROW_STATUSES: readonly EscrowStatus[] = [
  'locked',
  'released',
  'claimed',
  'refunded',
];

export const CLAIM_STATUSES: readonly ClaimStatus[] = ['open', 'approved', 'rejected', 'paid'];

/** Service-level expectations recorded on a policy. */
export interface SlaTerms {
  /** Max delivery time in hours from policy.createdAt to expected delivery. */
  readonly deliveryWindowHours: number;
  /** Free-form quality requirements as a list of human-readable bullets. */
  readonly requirements?: readonly string[];
}

/** Output of the pricing engine. */
export interface Quote {
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

/** A simulated escrow holding tied to a policy. */
export interface EscrowHolding {
  readonly id: string;
  readonly policyId: string;
  readonly amountUsdc: number;
  readonly status: EscrowStatus;
  readonly lockedAt: string;
  readonly releasedAt?: string;
  readonly claimedAt?: string;
  readonly refundedAt?: string;
}

export interface EscrowEvent {
  readonly seq: number;
  readonly holdingId: string;
  readonly eventType: 'escrow.locked' | 'escrow.released' | 'escrow.claimed' | 'escrow.refunded';
  readonly payload: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
}

export interface Claim {
  readonly id: string;
  readonly policyId: string;
  readonly claimantDid: string;
  readonly reason: string;
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly status: ClaimStatus;
  readonly createdAt: string;
  readonly decidedAt?: string;
  readonly payoutUsdc?: number;
}

export interface Policy {
  readonly id: string;
  readonly subscriberDid: string;
  readonly beneficiaryDid: string;
  readonly dealSubject: string;
  readonly amountUsdc: number;
  readonly premiumUsdc: number;
  readonly riskMultiplier: number;
  readonly reputationScore: number;
  readonly slaTerms: SlaTerms;
  readonly status: PolicyStatus;
  readonly createdAt: string;
  readonly expiresAt: string;
}
