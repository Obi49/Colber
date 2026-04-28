/**
 * Reputation scoring engine — v1 (single-dimensional).
 *
 * # Formula
 *
 *   score = clamp(BASE + Σ tx_i − Σ neg_j, MIN, MAX)
 *
 *   where:
 *     BASE = 500                                   (fresh-agent baseline)
 *     MIN  = 0
 *     MAX  = 1000
 *     tx_i = + cfg.txDelta            for each "successful" transaction
 *     neg_j = + cfg.negFeedbackPenalty for each negative feedback (rating <= 2)
 *
 *   Decay: any *positive contribution* (successful tx) and any *penalty*
 *   (negative feedback) older than `cfg.decayDays` weighs at half its full
 *   value. Decay is binary, not continuous, in v1 — explicitly chosen for
 *   testability and ease of reasoning. v2 may introduce exponential decay.
 *
 * # Rationale
 *
 * Reputation v1 is intentionally trivial. The cahier des charges requires:
 *
 *   - lazy on-read computation,
 *   - reasonable defaults,
 *   - config-driven knobs so we can tune without redeploying business logic,
 *   - bounded outputs.
 *
 * v2 will include multi-dimensional sub-scores (delivery / quality /
 * communication), Sybil-resistance via graph clustering, and Bayesian
 * weighting by counterparty reputation. None of those belong in v1.
 *
 * # Determinism
 *
 * Pure function: same `(input, config, asOf)` triple → same score. Used by
 * the cache key (we hash inputs into the cache TTL). No I/O, no clock reads;
 * all timestamps come from `asOf` (defaults to current time at the call
 * boundary, not here).
 */

export const SCORE_VERSION = 'v1.0' as const;

export const SCORE_BASE = 500;
export const SCORE_MIN = 0;
export const SCORE_MAX = 1000;

export interface ScoringConfig {
  /** Score points awarded per successful, non-negatively-rated transaction. */
  readonly txDelta: number;
  /** Penalty subtracted per negative feedback (rating <= 2/5). */
  readonly negFeedbackPenalty: number;
  /** Half-life cutoff in days: events older than this contribute half-weight. */
  readonly decayDays: number;
}

/**
 * Single transaction the agent participated in (either as buyer or seller).
 * `completed` means the on-chain or domain-level state machine reached a
 * terminal "delivered + paid" status; the scorer trusts the caller on this.
 */
export interface TxRecord {
  /** Did the transaction reach a positive terminal state? */
  readonly completed: boolean;
  /** Did this transaction receive *any* feedback rated <= 2 by the counterparty? */
  readonly hasNegativeFeedback: boolean;
  /** Wall-clock time at which the transaction completed (ISO-8601). */
  readonly completedAt: Date;
}

/**
 * Single feedback that was issued *against* the agent (i.e. rating the agent's
 * own behaviour). Only ratings <= 2 count as negative.
 */
export interface FeedbackRecord {
  readonly rating: number; // 1..5
  readonly signedAt: Date;
}

export interface ScoringInput {
  /** Transactions the agent participated in. */
  readonly transactions: readonly TxRecord[];
  /** Feedbacks received by the agent. */
  readonly feedbacks: readonly FeedbackRecord[];
}

export interface ScoringBreakdown {
  readonly base: number;
  readonly txContribution: number;
  readonly feedbackPenalty: number;
  readonly raw: number; // before clamping
  readonly final: number; // after clamping
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const isOlderThan = (event: Date, asOf: Date, days: number): boolean =>
  asOf.getTime() - event.getTime() > days * ONE_DAY_MS;

/**
 * Compute the reputation score breakdown for an agent.
 *
 * Pure function. Decay is a binary half-weight discount past `cfg.decayDays`.
 *
 * @param input   Transactions + feedbacks observed for the agent.
 * @param cfg     Scoring weights.
 * @param asOf    Reference timestamp. Anything older than `cfg.decayDays`
 *                relative to this is discounted.
 */
export const computeScore = (
  input: ScoringInput,
  cfg: ScoringConfig,
  asOf: Date,
): ScoringBreakdown => {
  let txContribution = 0;
  for (const tx of input.transactions) {
    if (!tx.completed || tx.hasNegativeFeedback) {
      continue;
    }
    const weight = isOlderThan(tx.completedAt, asOf, cfg.decayDays) ? 0.5 : 1;
    txContribution += cfg.txDelta * weight;
  }

  let feedbackPenalty = 0;
  for (const fb of input.feedbacks) {
    if (fb.rating > 2) {
      continue;
    }
    const weight = isOlderThan(fb.signedAt, asOf, cfg.decayDays) ? 0.5 : 1;
    feedbackPenalty += cfg.negFeedbackPenalty * weight;
  }

  const raw = SCORE_BASE + txContribution - feedbackPenalty;
  const final = Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(raw)));

  return {
    base: SCORE_BASE,
    txContribution,
    feedbackPenalty,
    raw,
    final,
  };
};
