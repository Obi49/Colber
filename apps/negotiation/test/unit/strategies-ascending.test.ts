import { describe, expect, it } from 'vitest';

import { AscendingAuctionStrategy } from '../../src/domain/strategies/ascending-auction.js';

import type { NegotiationState, Proposal } from '../../src/domain/negotiation-types.js';

const baseState = (): NegotiationState => ({
  negotiationId: 'n-1',
  status: 'open',
  strategy: 'ascending-auction',
  terms: {
    subject: 'data-extraction-job',
    strategy: 'ascending-auction',
    constraints: {},
    partyDids: ['did:key:alice', 'did:key:bob'],
    deadline: '2099-01-01T00:00:00.000Z',
    reservePrice: 100,
    currency: 'USDC',
  },
  partyDids: ['did:key:alice', 'did:key:bob'],
  proposals: [],
  createdAt: '2026-04-28T10:00:00.000Z',
  updatedAt: '2026-04-28T10:00:00.000Z',
  expiresAt: '2099-01-01T00:00:00.000Z',
});

const buildProposal = (overrides: Partial<Proposal>): Proposal => ({
  proposalId: '11111111-1111-4111-8111-111111111111',
  fromDid: 'did:key:alice',
  amount: 200,
  signature: 'sig',
  proposedAt: '2026-04-28T10:01:00.000Z',
  ...overrides,
});

describe('AscendingAuctionStrategy', () => {
  const strat = new AscendingAuctionStrategy();

  it('accepts the first proposal at or above reserve price', () => {
    const result = strat.validateProposal(baseState(), buildProposal({ amount: 100 }));
    expect(result.ok).toBe(true);
  });

  it('rejects a proposal below the reserve price', () => {
    const result = strat.validateProposal(baseState(), buildProposal({ amount: 50 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/reservePrice/);
    }
  });

  it('rejects an amount that does not strictly beat the current best', () => {
    let state = baseState();
    state = strat.applyProposal(state, buildProposal({ amount: 200 }));
    const result = strat.validateProposal(
      state,
      buildProposal({
        amount: 200,
        fromDid: 'did:key:bob',
        proposalId: '22222222-2222-4222-8222-222222222222',
      }),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects an overbid from the same party (cannot overbid yourself)', () => {
    let state = baseState();
    state = strat.applyProposal(state, buildProposal({ amount: 200 }));
    const result = strat.validateProposal(
      state,
      buildProposal({
        amount: 250,
        proposalId: '33333333-3333-4333-8333-333333333333',
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/overbid yourself/);
    }
  });

  it('rejects a proposal from a non-party did', () => {
    expect(() =>
      strat.validateProposal(baseState(), buildProposal({ fromDid: 'did:key:eve', amount: 200 })),
    ).toThrow(/not a party/);
  });

  it('rejects a non-finite amount', () => {
    const result = strat.validateProposal(baseState(), buildProposal({ amount: Number.NaN }));
    expect(result.ok).toBe(false);
  });

  it('rejects a missing amount', () => {
    const result = strat.validateProposal(baseState(), buildProposal({ amount: undefined }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/amount/);
    }
  });

  it('accepts a proposal that strictly beats the current best from a different party', () => {
    let state = baseState();
    state = strat.applyProposal(state, buildProposal({ amount: 200 }));
    const result = strat.validateProposal(
      state,
      buildProposal({
        amount: 201,
        fromDid: 'did:key:bob',
        proposalId: '44444444-4444-4444-8444-444444444444',
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('updates currentBestProposalId after applying a proposal', () => {
    const state = baseState();
    const next = strat.applyProposal(state, buildProposal({ amount: 200 }));
    expect(next.currentBestProposalId).toBe('11111111-1111-4111-8111-111111111111');
    expect(next.proposals).toHaveLength(1);
    expect(next.status).toBe('negotiating');
  });

  it('pickWinner returns the highest amount, breaking ties by earliest proposedAt', () => {
    let state = baseState();
    state = strat.applyProposal(
      state,
      buildProposal({
        amount: 300,
        proposedAt: '2026-04-28T10:01:00.000Z',
      }),
    );
    state = strat.applyProposal(
      state,
      buildProposal({
        amount: 350,
        fromDid: 'did:key:bob',
        proposalId: '22222222-2222-4222-8222-222222222222',
        proposedAt: '2026-04-28T10:02:00.000Z',
      }),
    );
    const winner = strat.pickWinner(state);
    expect(winner).toEqual({ proposalId: '22222222-2222-4222-8222-222222222222' });
  });

  it('pickWinner returns reason when there are no proposals', () => {
    const result = strat.pickWinner(baseState());
    expect('reason' in result).toBe(true);
  });

  it('rejects a counter-proposal that targets a non-best proposal', () => {
    let state = baseState();
    state = strat.applyProposal(
      state,
      buildProposal({
        amount: 200,
        proposalId: '11111111-1111-4111-8111-111111111111',
      }),
    );
    state = strat.applyProposal(
      state,
      buildProposal({
        amount: 210,
        fromDid: 'did:key:bob',
        proposalId: '22222222-2222-4222-8222-222222222222',
      }),
    );
    const result = strat.validateProposal(
      state,
      buildProposal({
        amount: 220,
        proposalId: '33333333-3333-4333-8333-333333333333',
      }),
      // Try to counter the older proposal, not the current best.
      '11111111-1111-4111-8111-111111111111',
    );
    expect(result.ok).toBe(false);
  });
});
