import { describe, expect, it } from 'vitest';

import { applyEvent, rebuildProjection } from '../../src/domain/projection.js';

import type {
  NegotiationEvent,
  NegotiationState,
  NegotiationTerms,
} from '../../src/domain/negotiation-types.js';

const makeStartEvent = (terms: NegotiationTerms): NegotiationEvent => ({
  type: 'negotiation.started',
  negotiationId: '11111111-1111-4111-8111-111111111111',
  terms,
  createdBy: 'did:key:alice',
  at: '2026-04-28T10:00:00.000Z',
});

const ascendingTerms = (): NegotiationTerms => ({
  subject: 'data-extraction-job',
  strategy: 'ascending-auction',
  constraints: {},
  partyDids: ['did:key:alice', 'did:key:bob'],
  deadline: '2099-01-01T00:00:00.000Z',
  reservePrice: 100,
  currency: 'USDC',
});

const proposalEvent = (overrides: {
  proposalId: string;
  fromDid: string;
  amount: number;
  proposedAt: string;
}): NegotiationEvent => ({
  type: 'proposal.submitted',
  negotiationId: '11111111-1111-4111-8111-111111111111',
  proposal: {
    proposalId: overrides.proposalId,
    fromDid: overrides.fromDid,
    amount: overrides.amount,
    signature: 'sig',
    proposedAt: overrides.proposedAt,
  },
  at: overrides.proposedAt,
});

describe('rebuildProjection', () => {
  it('throws on an empty event log', () => {
    expect(() => rebuildProjection([])).toThrow();
  });

  it('throws when the head event is not negotiation.started', () => {
    expect(() =>
      rebuildProjection([
        proposalEvent({
          proposalId: '11111111-1111-4111-8111-111111111111',
          fromDid: 'did:key:alice',
          amount: 200,
          proposedAt: '2026-04-28T10:01:00.000Z',
        }),
      ]),
    ).toThrow(/negotiation.started/);
  });

  it('produces a deterministic state snapshot from a started + 2 proposals + settle log', () => {
    const events: NegotiationEvent[] = [
      makeStartEvent(ascendingTerms()),
      proposalEvent({
        proposalId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        fromDid: 'did:key:alice',
        amount: 200,
        proposedAt: '2026-04-28T10:01:00.000Z',
      }),
      proposalEvent({
        proposalId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        fromDid: 'did:key:bob',
        amount: 250,
        proposedAt: '2026-04-28T10:02:00.000Z',
      }),
      {
        type: 'negotiation.settled',
        negotiationId: '11111111-1111-4111-8111-111111111111',
        winningProposalId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        signatures: [
          { did: 'did:key:alice', signature: 'a' },
          { did: 'did:key:bob', signature: 'b' },
        ],
        at: '2026-04-28T10:03:00.000Z',
      },
    ];

    const state = rebuildProjection(events);
    expect(state.status).toBe('settled');
    expect(state.proposals).toHaveLength(2);
    expect(state.winningProposalId).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(state.settlementSignatures).toHaveLength(2);

    // Determinism: re-running produces the exact same shape.
    const again = rebuildProjection(events);
    expect(again).toEqual(state);
  });

  it('throws on illegal transitions: applying any event after settle', () => {
    const settled = rebuildProjection([
      makeStartEvent(ascendingTerms()),
      proposalEvent({
        proposalId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        fromDid: 'did:key:alice',
        amount: 200,
        proposedAt: '2026-04-28T10:01:00.000Z',
      }),
      {
        type: 'negotiation.settled',
        negotiationId: '11111111-1111-4111-8111-111111111111',
        winningProposalId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        signatures: [
          { did: 'did:key:alice', signature: 'a' },
          { did: 'did:key:bob', signature: 'b' },
        ],
        at: '2026-04-28T10:03:00.000Z',
      },
    ]);
    expect(() =>
      applyEvent(
        settled,
        proposalEvent({
          proposalId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          fromDid: 'did:key:alice',
          amount: 999,
          proposedAt: '2026-04-28T10:05:00.000Z',
        }),
      ),
    ).toThrow(/terminal/);
  });

  it('throws on duplicate negotiation.started in the log', () => {
    expect(() =>
      rebuildProjection([makeStartEvent(ascendingTerms()), makeStartEvent(ascendingTerms())]),
    ).toThrow(/duplicate/);
  });

  it('throws when settle is missing a party signature', () => {
    expect(() =>
      rebuildProjection([
        makeStartEvent(ascendingTerms()),
        proposalEvent({
          proposalId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          fromDid: 'did:key:alice',
          amount: 200,
          proposedAt: '2026-04-28T10:01:00.000Z',
        }),
        {
          type: 'negotiation.settled',
          negotiationId: '11111111-1111-4111-8111-111111111111',
          winningProposalId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          signatures: [{ did: 'did:key:alice', signature: 'a' }],
          at: '2026-04-28T10:03:00.000Z',
        },
      ]),
    ).toThrow(/missing signature/);
  });

  it('cancellation is terminal', () => {
    const events: NegotiationEvent[] = [
      makeStartEvent(ascendingTerms()),
      {
        type: 'negotiation.cancelled',
        negotiationId: '11111111-1111-4111-8111-111111111111',
        reason: 'no longer needed',
        by: 'did:key:alice',
        at: '2026-04-28T10:01:00.000Z',
      },
    ];
    const state: NegotiationState = rebuildProjection(events);
    expect(state.status).toBe('cancelled');
  });

  it('expiration is terminal', () => {
    const events: NegotiationEvent[] = [
      makeStartEvent(ascendingTerms()),
      {
        type: 'negotiation.expired',
        negotiationId: '11111111-1111-4111-8111-111111111111',
        at: '2026-04-28T11:00:00.000Z',
      },
    ];
    const state: NegotiationState = rebuildProjection(events);
    expect(state.status).toBe('expired');
  });
});
