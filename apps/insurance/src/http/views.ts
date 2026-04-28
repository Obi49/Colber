import type { PolicyView } from '../domain/policy-store.js';
import type { Claim, EscrowHolding, Policy, Quote } from '../domain/types.js';

/**
 * Wire-shape projections for REST + gRPC + MCP responses.
 *
 * These types intentionally mirror `domain/types.ts` but are mutable —
 * REST clients that re-serialise them shouldn't have to fight `readonly`.
 */

export interface SlaTermsWire {
  deliveryWindowHours: number;
  requirements?: string[];
}

export interface QuoteWire {
  subscriberDid: string;
  beneficiaryDid: string;
  dealSubject: string;
  amountUsdc: number;
  premiumUsdc: number;
  riskMultiplier: number;
  reputationScore: number;
  computedAt: string;
  validUntil: string;
}

export interface PolicyWire {
  id: string;
  subscriberDid: string;
  beneficiaryDid: string;
  dealSubject: string;
  amountUsdc: number;
  premiumUsdc: number;
  riskMultiplier: number;
  reputationScore: number;
  slaTerms: SlaTermsWire;
  status: string;
  createdAt: string;
  expiresAt: string;
}

export interface EscrowWire {
  id: string;
  policyId: string;
  amountUsdc: number;
  status: string;
  lockedAt: string;
  releasedAt?: string;
  claimedAt?: string;
  refundedAt?: string;
}

export interface ClaimWire {
  id: string;
  policyId: string;
  claimantDid: string;
  reason: string;
  evidence: Record<string, unknown>;
  status: string;
  createdAt: string;
  decidedAt?: string;
  payoutUsdc?: number;
}

export interface PolicyViewWire {
  policy: PolicyWire;
  escrow: EscrowWire;
  claims: ClaimWire[];
}

export const quoteToView = (q: Quote): QuoteWire => ({
  subscriberDid: q.subscriberDid,
  beneficiaryDid: q.beneficiaryDid,
  dealSubject: q.dealSubject,
  amountUsdc: q.amountUsdc,
  premiumUsdc: q.premiumUsdc,
  riskMultiplier: q.riskMultiplier,
  reputationScore: q.reputationScore,
  computedAt: q.computedAt,
  validUntil: q.validUntil,
});

const policyToWire = (p: Policy): PolicyWire => ({
  id: p.id,
  subscriberDid: p.subscriberDid,
  beneficiaryDid: p.beneficiaryDid,
  dealSubject: p.dealSubject,
  amountUsdc: p.amountUsdc,
  premiumUsdc: p.premiumUsdc,
  riskMultiplier: p.riskMultiplier,
  reputationScore: p.reputationScore,
  slaTerms: {
    deliveryWindowHours: p.slaTerms.deliveryWindowHours,
    ...(p.slaTerms.requirements !== undefined
      ? { requirements: [...p.slaTerms.requirements] }
      : {}),
  },
  status: p.status,
  createdAt: p.createdAt,
  expiresAt: p.expiresAt,
});

const escrowToWire = (e: EscrowHolding): EscrowWire => ({
  id: e.id,
  policyId: e.policyId,
  amountUsdc: e.amountUsdc,
  status: e.status,
  lockedAt: e.lockedAt,
  ...(e.releasedAt !== undefined ? { releasedAt: e.releasedAt } : {}),
  ...(e.claimedAt !== undefined ? { claimedAt: e.claimedAt } : {}),
  ...(e.refundedAt !== undefined ? { refundedAt: e.refundedAt } : {}),
});

export const claimToWire = (c: Claim): ClaimWire => ({
  id: c.id,
  policyId: c.policyId,
  claimantDid: c.claimantDid,
  reason: c.reason,
  evidence: { ...c.evidence },
  status: c.status,
  createdAt: c.createdAt,
  ...(c.decidedAt !== undefined ? { decidedAt: c.decidedAt } : {}),
  ...(c.payoutUsdc !== undefined ? { payoutUsdc: c.payoutUsdc } : {}),
});

export const policyViewToWire = (v: PolicyView): PolicyViewWire => ({
  policy: policyToWire(v.policy),
  escrow: escrowToWire(v.escrow),
  claims: v.claims.map(claimToWire),
});

export { policyToWire, escrowToWire };
