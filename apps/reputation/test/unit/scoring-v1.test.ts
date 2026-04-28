import { describe, expect, it } from 'vitest';

import {
  computeScore,
  SCORE_BASE,
  SCORE_MAX,
  SCORE_MIN,
  type FeedbackRecord,
  type ScoringConfig,
  type TxRecord,
} from '../../src/domain/scoring/v1.js';

const cfg: ScoringConfig = {
  txDelta: 10,
  negFeedbackPenalty: 40,
  decayDays: 90,
};

const NOW = new Date('2026-04-27T00:00:00.000Z');

const daysAgo = (n: number): Date => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

const tx = (overrides: Partial<TxRecord> = {}): TxRecord => ({
  completed: true,
  hasNegativeFeedback: false,
  completedAt: daysAgo(1),
  ...overrides,
});

const fb = (rating: number, signedAt: Date = daysAgo(1)): FeedbackRecord => ({
  rating,
  signedAt,
});

describe('scoring v1', () => {
  it('returns the base score for a fresh agent with no events', () => {
    const result = computeScore({ transactions: [], feedbacks: [] }, cfg, NOW);
    expect(result.final).toBe(SCORE_BASE);
    expect(result.txContribution).toBe(0);
    expect(result.feedbackPenalty).toBe(0);
  });

  it('rewards each successful, non-negatively-rated transaction', () => {
    const result = computeScore({ transactions: [tx(), tx(), tx()], feedbacks: [] }, cfg, NOW);
    expect(result.txContribution).toBe(30);
    expect(result.final).toBe(SCORE_BASE + 30);
  });

  it('does not reward incomplete transactions', () => {
    const result = computeScore(
      { transactions: [tx({ completed: false }), tx({ completed: false })], feedbacks: [] },
      cfg,
      NOW,
    );
    expect(result.txContribution).toBe(0);
    expect(result.final).toBe(SCORE_BASE);
  });

  it('does not reward transactions that received a negative feedback', () => {
    const result = computeScore(
      { transactions: [tx({ hasNegativeFeedback: true })], feedbacks: [] },
      cfg,
      NOW,
    );
    expect(result.txContribution).toBe(0);
  });

  it('penalises negative feedbacks (rating ≤ 2)', () => {
    const result = computeScore(
      { transactions: [], feedbacks: [fb(1), fb(2), fb(3), fb(5)] },
      cfg,
      NOW,
    );
    expect(result.feedbackPenalty).toBe(80);
    expect(result.final).toBe(SCORE_BASE - 80);
  });

  it('halves contributions older than the decay window', () => {
    const result = computeScore(
      {
        transactions: [tx({ completedAt: daysAgo(120) })],
        feedbacks: [fb(1, daysAgo(200))],
      },
      cfg,
      NOW,
    );
    expect(result.txContribution).toBe(5); // half of 10
    expect(result.feedbackPenalty).toBe(20); // half of 40
  });

  it('clamps the score to [0, 1000]', () => {
    const flood = Array.from({ length: 100 }, () => tx());
    const aboveMax = computeScore({ transactions: flood, feedbacks: [] }, cfg, NOW);
    expect(aboveMax.final).toBe(SCORE_MAX);

    const heavyPenalty = Array.from({ length: 50 }, () => fb(1));
    const belowMin = computeScore({ transactions: [], feedbacks: heavyPenalty }, cfg, NOW);
    expect(belowMin.final).toBe(SCORE_MIN);
  });

  it('produces deterministic output given the same input', () => {
    const input = {
      transactions: [tx(), tx({ hasNegativeFeedback: true })],
      feedbacks: [fb(1), fb(5)],
    };
    const a = computeScore(input, cfg, NOW);
    const b = computeScore(input, cfg, NOW);
    expect(a).toEqual(b);
  });

  it('respects custom config knobs', () => {
    const result = computeScore(
      { transactions: [tx()], feedbacks: [fb(1)] },
      { txDelta: 50, negFeedbackPenalty: 100, decayDays: 90 },
      NOW,
    );
    expect(result.txContribution).toBe(50);
    expect(result.feedbackPenalty).toBe(100);
    expect(result.final).toBe(SCORE_BASE + 50 - 100);
  });
});
