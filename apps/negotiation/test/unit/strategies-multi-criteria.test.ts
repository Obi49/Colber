import { describe, expect, it } from 'vitest';

import { MultiCriteriaStrategy } from '../../src/domain/strategies/multi-criteria.js';

import type { NegotiationState, Proposal } from '../../src/domain/negotiation-types.js';

const baseState = (): NegotiationState => ({
  negotiationId: 'n-mc-1',
  status: 'open',
  strategy: 'multi-criteria',
  terms: {
    subject: 'data-extraction-job',
    strategy: 'multi-criteria',
    constraints: {},
    partyDids: ['did:key:alice', 'did:key:bob'],
    deadline: '2099-01-01T00:00:00.000Z',
    criteria: [
      { name: 'price', weight: 0.6 },
      { name: 'quality', weight: 0.4 },
    ],
  },
  partyDids: ['did:key:alice', 'did:key:bob'],
  proposals: [],
  createdAt: '2026-04-28T10:00:00.000Z',
  updatedAt: '2026-04-28T10:00:00.000Z',
  expiresAt: '2099-01-01T00:00:00.000Z',
});

const buildProposal = (overrides: Partial<Proposal>): Proposal => ({
  proposalId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  fromDid: 'did:key:alice',
  scores: { price: 80, quality: 70 },
  signature: 'sig',
  proposedAt: '2026-04-28T10:01:00.000Z',
  ...overrides,
});

describe('MultiCriteriaStrategy', () => {
  const strat = new MultiCriteriaStrategy();

  it('accepts a proposal with full scores', () => {
    const result = strat.validateProposal(baseState(), buildProposal({}));
    expect(result.ok).toBe(true);
  });

  it('rejects a proposal missing a declared criterion', () => {
    const result = strat.validateProposal(baseState(), buildProposal({ scores: { price: 80 } }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/quality/);
    }
  });

  it('rejects a proposal with an extra unknown criterion', () => {
    const result = strat.validateProposal(
      baseState(),
      buildProposal({ scores: { price: 80, quality: 70, throughput: 90 } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/throughput/);
    }
  });

  it('rejects a score outside [0..100]', () => {
    const result = strat.validateProposal(
      baseState(),
      buildProposal({ scores: { price: 80, quality: 150 } }),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects when criteria are not declared on terms', () => {
    const state = baseState();
    const stateNoCriteria: NegotiationState = {
      ...state,
      terms: { ...state.terms, criteria: [] },
    };
    const result = strat.validateProposal(stateNoCriteria, buildProposal({}));
    expect(result.ok).toBe(false);
  });

  it('rejects a proposal without scores', () => {
    const result = strat.validateProposal(baseState(), buildProposal({ scores: undefined }));
    expect(result.ok).toBe(false);
  });

  it('applies a proposal and selects it as the current best', () => {
    const state = baseState();
    const next = strat.applyProposal(state, buildProposal({}));
    expect(next.currentBestProposalId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(next.proposals).toHaveLength(1);
  });

  it('weighted-sum picks the highest-scoring proposal', () => {
    let state = baseState();
    // Alice: 0.6*80 + 0.4*70 = 76
    state = strat.applyProposal(state, buildProposal({}));
    // Bob:   0.6*60 + 0.4*100 = 76 (tie — earlier proposedAt wins → alice)
    state = strat.applyProposal(
      state,
      buildProposal({
        proposalId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        fromDid: 'did:key:bob',
        scores: { price: 60, quality: 100 },
        proposedAt: '2026-04-28T10:02:00.000Z',
      }),
    );
    const winner = strat.pickWinner(state);
    expect(winner).toEqual({ proposalId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  });

  it('weighted-sum strictly higher wins', () => {
    let state = baseState();
    // Alice: 76
    state = strat.applyProposal(state, buildProposal({}));
    // Bob: 0.6*100 + 0.4*100 = 100
    state = strat.applyProposal(
      state,
      buildProposal({
        proposalId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        fromDid: 'did:key:bob',
        scores: { price: 100, quality: 100 },
      }),
    );
    expect(state.currentBestProposalId).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  });

  it('counter replaces the prior proposal from the same party', () => {
    let state = baseState();
    state = strat.applyProposal(state, buildProposal({}));
    expect(state.proposals).toHaveLength(1);
    state = strat.applyProposal(
      state,
      buildProposal({
        proposalId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        scores: { price: 95, quality: 95 },
      }),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    expect(state.proposals).toHaveLength(1);
    expect(state.proposals[0]?.proposalId).toBe('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  });

  it('rejects a counter on a different party prior proposal', () => {
    let state = baseState();
    state = strat.applyProposal(
      state,
      buildProposal({
        proposalId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        fromDid: 'did:key:alice',
      }),
    );
    const result = strat.validateProposal(
      state,
      buildProposal({
        proposalId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        fromDid: 'did:key:bob',
      }),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    expect(result.ok).toBe(false);
  });

  it('pickWinner returns reason when there are no proposals', () => {
    const result = strat.pickWinner(baseState());
    expect('reason' in result).toBe(true);
  });

  it('rejects a counter targeting an unknown proposalId', () => {
    const result = strat.validateProposal(
      baseState(),
      buildProposal({}),
      '99999999-9999-4999-8999-999999999999',
    );
    expect(result.ok).toBe(false);
  });
});
