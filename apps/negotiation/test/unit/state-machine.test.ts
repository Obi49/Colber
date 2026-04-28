import { describe, expect, it } from 'vitest';

import { applyEvent } from '../../src/domain/projection.js';

import type { NegotiationEvent, NegotiationState } from '../../src/domain/negotiation-types.js';

const baseState = (): NegotiationState => ({
  negotiationId: 'n-state-1',
  status: 'open',
  strategy: 'ascending-auction',
  terms: {
    subject: 'data-extraction-job',
    strategy: 'ascending-auction',
    constraints: {},
    partyDids: ['did:key:alice', 'did:key:bob'],
    deadline: '2099-01-01T00:00:00.000Z',
    reservePrice: 100,
  },
  partyDids: ['did:key:alice', 'did:key:bob'],
  proposals: [],
  createdAt: '2026-04-28T10:00:00.000Z',
  updatedAt: '2026-04-28T10:00:00.000Z',
  expiresAt: '2099-01-01T00:00:00.000Z',
});

describe('negotiation state machine (illegal transitions)', () => {
  it('rejects proposals after cancellation', () => {
    const cancelled: NegotiationState = { ...baseState(), status: 'cancelled' };
    const ev: NegotiationEvent = {
      type: 'proposal.submitted',
      negotiationId: cancelled.negotiationId,
      proposal: {
        proposalId: '11111111-1111-4111-8111-111111111111',
        fromDid: 'did:key:alice',
        amount: 200,
        signature: 'sig',
        proposedAt: '2026-04-28T10:01:00.000Z',
      },
      at: '2026-04-28T10:01:00.000Z',
    };
    expect(() => applyEvent(cancelled, ev)).toThrow(/terminal/);
  });

  it('rejects proposals after expiration', () => {
    const expired: NegotiationState = { ...baseState(), status: 'expired' };
    const ev: NegotiationEvent = {
      type: 'proposal.submitted',
      negotiationId: expired.negotiationId,
      proposal: {
        proposalId: '11111111-1111-4111-8111-111111111111',
        fromDid: 'did:key:alice',
        amount: 200,
        signature: 'sig',
        proposedAt: '2026-04-28T10:01:00.000Z',
      },
      at: '2026-04-28T10:01:00.000Z',
    };
    expect(() => applyEvent(expired, ev)).toThrow(/terminal/);
  });

  it('rejects settle on a state with no proposals', () => {
    const ev: NegotiationEvent = {
      type: 'negotiation.settled',
      negotiationId: 'n-state-1',
      winningProposalId: '11111111-1111-4111-8111-111111111111',
      signatures: [
        { did: 'did:key:alice', signature: 'a' },
        { did: 'did:key:bob', signature: 'b' },
      ],
      at: '2026-04-28T10:03:00.000Z',
    };
    expect(() => applyEvent(baseState(), ev)).toThrow(/winningProposalId/);
  });

  it('rejects a counter targeting an unknown proposalId', () => {
    const ev: NegotiationEvent = {
      type: 'counter.submitted',
      negotiationId: 'n-state-1',
      counterTo: '99999999-9999-4999-8999-999999999999',
      proposal: {
        proposalId: '11111111-1111-4111-8111-111111111111',
        fromDid: 'did:key:alice',
        amount: 200,
        signature: 'sig',
        proposedAt: '2026-04-28T10:01:00.000Z',
      },
      at: '2026-04-28T10:01:00.000Z',
    };
    expect(() => applyEvent(baseState(), ev)).toThrow(/counterTo/);
  });

  it('cancellation transitions any active state to cancelled', () => {
    const cancel: NegotiationEvent = {
      type: 'negotiation.cancelled',
      negotiationId: 'n-state-1',
      reason: 'no longer needed',
      by: 'did:key:alice',
      at: '2026-04-28T10:01:00.000Z',
    };
    const next = applyEvent(baseState(), cancel);
    expect(next.status).toBe('cancelled');
  });

  it('rejects cancellation after settle', () => {
    const settled: NegotiationState = { ...baseState(), status: 'settled' };
    const cancel: NegotiationEvent = {
      type: 'negotiation.cancelled',
      negotiationId: 'n-state-1',
      reason: 'oops',
      by: 'did:key:alice',
      at: '2026-04-28T10:05:00.000Z',
    };
    expect(() => applyEvent(settled, cancel)).toThrow(/terminal/);
  });
});
