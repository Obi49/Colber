// TODO P3: claim arbitrator with external oracles + auto-decide rules.
// v1 MVP keeps claims in `open` until an admin decides via the gated
// admin endpoint. The on-chain version is a separate P3 ticket (étape 7b).
import { ERROR_CODES, ColberError } from '@colber/core-types';
import { v4 as uuidv4 } from 'uuid';

import type { PolicyStore, PolicyView, SubmitClaimResult } from './policy-store.js';
import type { PricingEngine } from './pricing.js';
import type { Claim, Policy, Quote, SlaTerms } from './types.js';

/**
 * Looser type accepted on the input side: `requirements` is allowed to be
 * literally absent OR explicitly `undefined`. Some zod outputs land with
 * `requirements: undefined` rather than the property being missing — we
 * accept both. Internally we normalise via `normaliseSlaTerms`.
 */
export type SlaTermsInput =
  | SlaTerms
  | {
      readonly deliveryWindowHours: number;
      readonly requirements?: readonly string[] | undefined;
    };

const normaliseSlaTerms = (raw: SlaTermsInput): SlaTerms => ({
  deliveryWindowHours: raw.deliveryWindowHours,
  ...(raw.requirements !== undefined ? { requirements: [...raw.requirements] } : {}),
});

/**
 * Composition root for the insurance domain.
 *
 * Responsibilities:
 *  - `quote`     — calculate a premium without committing.
 *  - `subscribe` — re-quote (don't trust client-supplied premium), enforce
 *                  exposure cap, lock the escrow, persist the policy.
 *  - `claim`     — record a claim against an existing policy. Stays in
 *                  `open` until the admin endpoint decides.
 *  - `getPolicy` — read the policy + escrow + claims.
 *  - `listPolicies` — paginated lookup by subscriberDid.
 *
 * Out of scope (deferred):
 *  - Real on-chain escrow (P3 — étape 7b).
 *  - Claim arbitrator with oracles + auto-decide rules.
 *  - Reinsurer adapter, dynamic circuit breaker.
 */

export interface InsuranceServiceConfig {
  readonly defaultPolicyDurationHours: number;
  readonly maxGlobalExposureUsdc: number;
}

export interface SubscribeInput {
  readonly subscriberDid: string;
  readonly beneficiaryDid: string;
  readonly dealSubject: string;
  readonly amountUsdc: number;
  readonly slaTerms: SlaTermsInput;
  readonly idempotencyKey: string;
}

export interface SubscribeResult {
  readonly view: PolicyView;
  readonly idempotent: boolean;
}

export interface FileClaimInput {
  readonly policyId: string;
  readonly claimantDid: string;
  readonly reason: string;
  readonly evidence: Record<string, unknown>;
  readonly idempotencyKey: string;
}

export interface FileClaimResult {
  readonly claim: Claim;
  readonly idempotent: boolean;
}

export interface QuoteInput {
  readonly subscriberDid: string;
  readonly beneficiaryDid: string;
  readonly dealSubject: string;
  readonly amountUsdc: number;
  readonly slaTerms: SlaTermsInput;
}

export class InsuranceService {
  constructor(
    private readonly pricing: PricingEngine,
    private readonly store: PolicyStore,
    private readonly cfg: InsuranceServiceConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // -------------------------------------------------------------------
  // insurance.quote
  // -------------------------------------------------------------------

  public async quote(input: QuoteInput): Promise<Quote> {
    return this.pricing.quote({
      subscriberDid: input.subscriberDid,
      beneficiaryDid: input.beneficiaryDid,
      dealSubject: input.dealSubject,
      amountUsdc: input.amountUsdc,
      slaTerms: normaliseSlaTerms(input.slaTerms),
    });
  }

  // -------------------------------------------------------------------
  // insurance.subscribe
  // -------------------------------------------------------------------

  public async subscribe(input: SubscribeInput): Promise<SubscribeResult> {
    const slaTerms = normaliseSlaTerms(input.slaTerms);
    const fresh = await this.pricing.quote({
      subscriberDid: input.subscriberDid,
      beneficiaryDid: input.beneficiaryDid,
      dealSubject: input.dealSubject,
      amountUsdc: input.amountUsdc,
      slaTerms,
    });

    const policyId = uuidv4();
    const escrowId = uuidv4();
    const createdAt = this.now();
    const expiresAt = new Date(
      createdAt.getTime() + this.cfg.defaultPolicyDurationHours * 60 * 60 * 1_000,
    );

    const policy: Policy = {
      id: policyId,
      subscriberDid: input.subscriberDid,
      beneficiaryDid: input.beneficiaryDid,
      dealSubject: input.dealSubject,
      amountUsdc: fresh.amountUsdc,
      premiumUsdc: fresh.premiumUsdc,
      riskMultiplier: fresh.riskMultiplier,
      reputationScore: fresh.reputationScore,
      slaTerms,
      status: 'active',
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    const result = await this.store.subscribe({
      policy,
      escrowId,
      idempotencyKey: input.idempotencyKey,
      maxGlobalExposureUsdc: this.cfg.maxGlobalExposureUsdc,
    });
    return { view: result.view, idempotent: result.idempotent };
  }

  // -------------------------------------------------------------------
  // insurance.claim
  // -------------------------------------------------------------------

  public async fileClaim(input: FileClaimInput): Promise<FileClaimResult> {
    const view = await this.store.getPolicy(input.policyId);
    if (!view) {
      throw new ColberError(ERROR_CODES.NOT_FOUND, `policy ${input.policyId} not found`, 404);
    }
    if (view.policy.status !== 'active' && view.policy.status !== 'pending') {
      throw new ColberError(
        ERROR_CODES.VALIDATION_FAILED,
        `policy is ${view.policy.status}; cannot file a new claim`,
        400,
      );
    }

    const claim: Claim = {
      id: uuidv4(),
      policyId: input.policyId,
      claimantDid: input.claimantDid,
      reason: input.reason,
      evidence: { ...input.evidence },
      status: 'open',
      createdAt: this.now().toISOString(),
    };
    const persisted: SubmitClaimResult = await this.store.submitClaim({
      claim,
      idempotencyKey: input.idempotencyKey,
    });
    return { claim: persisted.claim, idempotent: persisted.idempotent };
  }

  // -------------------------------------------------------------------
  // queries
  // -------------------------------------------------------------------

  public async getPolicy(policyId: string): Promise<PolicyView> {
    const view = await this.store.getPolicy(policyId);
    if (!view) {
      throw new ColberError(ERROR_CODES.NOT_FOUND, `policy ${policyId} not found`, 404);
    }
    return view;
  }

  public async listPolicies(input: {
    subscriberDid: string;
    limit: number;
    offset: number;
  }): Promise<{ policies: readonly PolicyView[]; total: number }> {
    return this.store.listPolicies(input);
  }

  // -------------------------------------------------------------------
  // admin (gated by INSURANCE_ADMIN_ENABLED)
  // -------------------------------------------------------------------

  public async forceEscrowTransition(input: {
    holdingId: string;
    to: 'released' | 'claimed' | 'refunded';
    reason?: string;
    claimId?: string;
  }): Promise<PolicyView> {
    const result = await this.store.forceEscrowTransition({
      holdingId: input.holdingId,
      to: input.to,
      at: this.now(),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.claimId !== undefined ? { claimId: input.claimId } : {}),
    });
    const view = await this.store.getPolicy(result.holding.policyId);
    if (!view) {
      // Should never happen — the holding has a policy_id FK.
      throw new ColberError(ERROR_CODES.INTERNAL_ERROR, 'policy missing after transition', 500);
    }
    return view;
  }

  public async ping(): Promise<void> {
    await this.store.ping();
  }

  public async shutdown(): Promise<void> {
    await this.store.close();
  }
}
