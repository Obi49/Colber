import { ERROR_CODES, ColberError } from '@colber/core-types';

import type { Quote, SlaTerms } from './types.js';
import type { ReputationClient } from '../integrations/reputation-client.js';

/**
 * Pricing engine for insurance policies.
 *
 *   premium = amount * (baseRateBps / 10_000) * riskMultiplier
 *
 * Risk multiplier brackets (from the reputation score, 0..1000):
 *   - 700+      → 0.8 (low risk discount)
 *   - 500..699  → 1.0 (neutral)
 *   - 300..499  → 1.4 (penalty)
 *   - 0..299    → 2.0 (high risk)
 *
 * Scores outside [0, 1000] are clamped before bracketing.
 *
 * The pricing engine queries the reputation service via `ReputationClient`,
 * which falls back to score=500 (neutral) if the upstream is unreachable.
 * Premiums are rounded to 6 decimal places (USDC precision).
 */

export const USDC_DECIMALS = 6;

const MAX_AMOUNT_USDC = 10_000_000;

const round6 = (n: number): number => {
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.round(n * 1_000_000) / 1_000_000;
};

const clampScore = (score: number): number => {
  if (!Number.isFinite(score)) {
    return 500;
  }
  if (score < 0) {
    return 0;
  }
  if (score > 1_000) {
    return 1_000;
  }
  return Math.floor(score);
};

/**
 * Maps a reputation score to a risk multiplier.
 * Brackets are inclusive on the low end of each range.
 */
export const riskMultiplierFromScore = (score: number): number => {
  const s = clampScore(score);
  if (s >= 700) {
    return 0.8;
  }
  if (s >= 500) {
    return 1.0;
  }
  if (s >= 300) {
    return 1.4;
  }
  return 2.0;
};

/** Pure premium math — exposed for unit testing. */
export const premium = (
  amountUsdc: number,
  riskMultiplier: number,
  baseRateBps: number,
): number => {
  if (!Number.isFinite(amountUsdc) || amountUsdc < 0) {
    throw new ColberError(ERROR_CODES.VALIDATION_FAILED, 'amountUsdc must be ≥ 0', 400);
  }
  if (!Number.isFinite(riskMultiplier) || riskMultiplier <= 0) {
    throw new ColberError(ERROR_CODES.VALIDATION_FAILED, 'riskMultiplier must be > 0', 400);
  }
  if (!Number.isInteger(baseRateBps) || baseRateBps < 1 || baseRateBps > 10_000) {
    throw new ColberError(ERROR_CODES.VALIDATION_FAILED, 'baseRateBps must be in 1..10000', 400);
  }
  const base = (amountUsdc * baseRateBps) / 10_000;
  return round6(base * riskMultiplier);
};

export interface PricingEngineConfig {
  readonly baseRateBps: number;
  readonly quoteValiditySeconds: number;
}

export interface QuoteRequest {
  readonly subscriberDid: string;
  readonly beneficiaryDid: string;
  readonly dealSubject: string;
  readonly amountUsdc: number;
  readonly slaTerms:
    | SlaTerms
    | {
        readonly deliveryWindowHours: number;
        readonly requirements?: readonly string[] | undefined;
      };
}

export class PricingEngine {
  constructor(
    private readonly reputation: ReputationClient,
    private readonly cfg: PricingEngineConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async quote(req: QuoteRequest): Promise<Quote> {
    if (!Number.isFinite(req.amountUsdc) || req.amountUsdc <= 0) {
      throw new ColberError(ERROR_CODES.VALIDATION_FAILED, 'amountUsdc must be > 0', 400);
    }
    if (req.amountUsdc > MAX_AMOUNT_USDC) {
      throw new ColberError(
        ERROR_CODES.VALIDATION_FAILED,
        `amountUsdc must be ≤ ${MAX_AMOUNT_USDC}`,
        400,
      );
    }
    if (req.slaTerms.deliveryWindowHours <= 0) {
      throw new ColberError(
        ERROR_CODES.VALIDATION_FAILED,
        'slaTerms.deliveryWindowHours must be > 0',
        400,
      );
    }

    const lookup = await this.reputation.getScore(req.subscriberDid);
    const reputationScore = clampScore(lookup.score);
    const riskMultiplier = riskMultiplierFromScore(reputationScore);
    const premiumUsdc = premium(req.amountUsdc, riskMultiplier, this.cfg.baseRateBps);

    const computedAt = this.now();
    const validUntil = new Date(computedAt.getTime() + this.cfg.quoteValiditySeconds * 1_000);

    return {
      subscriberDid: req.subscriberDid,
      beneficiaryDid: req.beneficiaryDid,
      dealSubject: req.dealSubject,
      amountUsdc: round6(req.amountUsdc),
      premiumUsdc,
      riskMultiplier,
      reputationScore,
      computedAt: computedAt.toISOString(),
      validUntil: validUntil.toISOString(),
    };
  }
}
