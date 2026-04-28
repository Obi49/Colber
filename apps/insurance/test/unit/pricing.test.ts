import { describe, expect, it } from 'vitest';

import { PricingEngine, premium, riskMultiplierFromScore } from '../../src/domain/pricing.js';
import { InMemoryReputationClient } from '../fakes/in-memory-reputation-client.js';

describe('riskMultiplierFromScore', () => {
  it('returns 0.8 for score >= 700', () => {
    expect(riskMultiplierFromScore(700)).toBe(0.8);
    expect(riskMultiplierFromScore(900)).toBe(0.8);
    expect(riskMultiplierFromScore(1000)).toBe(0.8);
  });

  it('returns 1.0 for 500..699', () => {
    expect(riskMultiplierFromScore(500)).toBe(1.0);
    expect(riskMultiplierFromScore(600)).toBe(1.0);
    expect(riskMultiplierFromScore(699)).toBe(1.0);
  });

  it('returns 1.4 for 300..499', () => {
    expect(riskMultiplierFromScore(300)).toBe(1.4);
    expect(riskMultiplierFromScore(400)).toBe(1.4);
    expect(riskMultiplierFromScore(499)).toBe(1.4);
  });

  it('returns 2.0 for 0..299', () => {
    expect(riskMultiplierFromScore(0)).toBe(2.0);
    expect(riskMultiplierFromScore(150)).toBe(2.0);
    expect(riskMultiplierFromScore(299)).toBe(2.0);
  });

  it('clamps negative scores to 0 (high risk)', () => {
    expect(riskMultiplierFromScore(-10)).toBe(2.0);
  });

  it('clamps scores above 1000 to 1000 (low risk)', () => {
    expect(riskMultiplierFromScore(2000)).toBe(0.8);
  });

  it('treats NaN as neutral (500)', () => {
    expect(riskMultiplierFromScore(Number.NaN)).toBe(1.0);
  });
});

describe('premium math', () => {
  it('computes amount * baseRateBps/10000 * multiplier rounded to 6 decimals', () => {
    // 1000 USDC @ 200 bps (2%) * 1.0 = 20 USDC
    expect(premium(1000, 1.0, 200)).toBe(20);
    // 1000 USDC @ 200 bps * 0.8 = 16
    expect(premium(1000, 0.8, 200)).toBe(16);
    // 1000 USDC @ 200 bps * 2.0 = 40
    expect(premium(1000, 2.0, 200)).toBe(40);
  });

  it('rounds to 6 decimals (USDC precision)', () => {
    // 333.333333 * 200/10000 * 1.4 = 9.333333... ish — must round to 6dp
    const p = premium(333.333333, 1.4, 200);
    expect(p).toBeCloseTo(9.333333, 5);
    expect(Number.isFinite(p)).toBe(true);
    // No more than 6 decimal places.
    expect(p.toString()).toMatch(/^[0-9]+(\.[0-9]{1,6})?$/u);
  });

  it('rejects negative amount', () => {
    expect(() => premium(-1, 1.0, 200)).toThrow(/amountUsdc/u);
  });

  it('rejects baseRateBps out of range', () => {
    expect(() => premium(1000, 1.0, 0)).toThrow(/baseRateBps/u);
    expect(() => premium(1000, 1.0, 10_001)).toThrow(/baseRateBps/u);
  });

  it('rejects non-positive multiplier', () => {
    expect(() => premium(1000, 0, 200)).toThrow(/riskMultiplier/u);
    expect(() => premium(1000, -1, 200)).toThrow(/riskMultiplier/u);
  });
});

describe('PricingEngine.quote', () => {
  const fixedTime = new Date('2026-04-28T12:00:00.000Z');

  it('builds a Quote with riskMultiplier from the score, premium, and a bounded validUntil', async () => {
    const rep = new InMemoryReputationClient(new Map([['did:key:alice', 750]]));
    const engine = new PricingEngine(
      rep,
      { baseRateBps: 200, quoteValiditySeconds: 300 },
      () => fixedTime,
    );
    const q = await engine.quote({
      subscriberDid: 'did:key:alice',
      beneficiaryDid: 'did:key:bob',
      dealSubject: 'pdf-extraction',
      amountUsdc: 1_000,
      slaTerms: { deliveryWindowHours: 24 },
    });
    expect(q.reputationScore).toBe(750);
    expect(q.riskMultiplier).toBe(0.8);
    // 1000 * 200/10000 * 0.8 = 16
    expect(q.premiumUsdc).toBe(16);
    expect(q.amountUsdc).toBe(1_000);
    expect(q.computedAt).toBe('2026-04-28T12:00:00.000Z');
    expect(q.validUntil).toBe('2026-04-28T12:05:00.000Z');
  });

  it('falls back to score=500 (neutral) when reputation is unknown', async () => {
    const rep = new InMemoryReputationClient();
    const engine = new PricingEngine(
      rep,
      { baseRateBps: 200, quoteValiditySeconds: 300 },
      () => fixedTime,
    );
    const q = await engine.quote({
      subscriberDid: 'did:key:unknown',
      beneficiaryDid: 'did:key:bob',
      dealSubject: 'foo',
      amountUsdc: 5_000,
      slaTerms: { deliveryWindowHours: 24 },
    });
    expect(q.reputationScore).toBe(500);
    expect(q.riskMultiplier).toBe(1.0);
    // 5000 * 200/10000 * 1.0 = 100
    expect(q.premiumUsdc).toBe(100);
  });

  it('rejects amountUsdc <= 0', async () => {
    const rep = new InMemoryReputationClient();
    const engine = new PricingEngine(rep, {
      baseRateBps: 200,
      quoteValiditySeconds: 300,
    });
    await expect(
      engine.quote({
        subscriberDid: 'did:key:a',
        beneficiaryDid: 'did:key:b',
        dealSubject: 'x',
        amountUsdc: 0,
        slaTerms: { deliveryWindowHours: 24 },
      }),
    ).rejects.toThrow(/amountUsdc/u);
  });

  it('rejects deliveryWindowHours <= 0', async () => {
    const rep = new InMemoryReputationClient();
    const engine = new PricingEngine(rep, {
      baseRateBps: 200,
      quoteValiditySeconds: 300,
    });
    await expect(
      engine.quote({
        subscriberDid: 'did:key:a',
        beneficiaryDid: 'did:key:b',
        dealSubject: 'x',
        amountUsdc: 100,
        slaTerms: { deliveryWindowHours: 0 },
      }),
    ).rejects.toThrow(/deliveryWindowHours/u);
  });
});
