import {
  assertPartyAllowed,
  findProposal,
  type NegotiationStrategy,
  type ProposalValidationResult,
} from './strategy.js';

import type { NegotiationState, Proposal, ProposalRecord } from '../negotiation-types.js';

/**
 * Ascending-auction strategy.
 *
 * Rules:
 *   1. Every proposal MUST carry a finite `amount`.
 *   2. The first proposal must be `>= reservePrice` (if a reserve is set).
 *   3. Subsequent proposals must STRICTLY beat the current best.
 *   4. The same party cannot overbid themselves: if you already hold the
 *      current best bid, you must wait for someone else to bid before
 *      bidding again.
 *   5. Counter-proposals are admitted only if the bid being countered is
 *      the current best (otherwise the counter is meaningless).
 *
 * Settlement: the initiator triggers `negotiation.settle`; the winner is
 * the proposal with the highest amount. Ties (same amount, different
 * parties) are broken by **earliest `proposedAt`** — the first to reach the
 * leading amount wins.
 */
export class AscendingAuctionStrategy implements NegotiationStrategy {
  public readonly id = 'ascending-auction' as const;

  public validateProposal(
    state: NegotiationState,
    proposal: Proposal,
    counterTo?: string,
  ): ProposalValidationResult {
    assertPartyAllowed(state, proposal.fromDid);

    if (typeof proposal.amount !== 'number' || !Number.isFinite(proposal.amount)) {
      return { ok: false, reason: 'amount is required and must be a finite number' };
    }

    const reserve = state.terms.reservePrice;
    if (typeof reserve === 'number' && proposal.amount < reserve) {
      return {
        ok: false,
        reason: `amount ${proposal.amount} is below reservePrice ${reserve}`,
      };
    }

    const currentBest = currentBestProposal(state);
    if (currentBest) {
      const bestAmount = currentBest.amount ?? Number.NEGATIVE_INFINITY;
      if (proposal.amount <= bestAmount) {
        return {
          ok: false,
          reason: `amount ${proposal.amount} must strictly exceed current best ${bestAmount}`,
        };
      }
      if (currentBest.fromDid === proposal.fromDid) {
        return { ok: false, reason: 'cannot overbid yourself' };
      }
    }

    if (counterTo) {
      const target = findProposal(state, counterTo);
      if (!target) {
        return { ok: false, reason: `counterTo ${counterTo} not found` };
      }
      if (currentBest && target.proposalId !== currentBest.proposalId) {
        return {
          ok: false,
          reason: 'in ascending-auction, counter is admissible only against the current best',
        };
      }
    }

    return { ok: true };
  }

  public applyProposal(
    state: NegotiationState,
    proposal: Proposal,
    counterTo?: string,
  ): NegotiationState {
    const record: ProposalRecord = counterTo ? { ...proposal, counterTo } : { ...proposal };
    const proposals = [...state.proposals, record];
    return {
      ...state,
      proposals,
      currentBestProposalId: proposal.proposalId,
      status: state.proposals.length === 0 ? 'negotiating' : 'negotiating',
      updatedAt: proposal.proposedAt,
    };
  }

  public pickWinner(state: NegotiationState): { proposalId: string } | { reason: string } {
    if (state.proposals.length === 0) {
      return { reason: 'no proposals submitted' };
    }
    const sorted = [...state.proposals].sort((a, b) => {
      const ax = a.amount ?? Number.NEGATIVE_INFINITY;
      const bx = b.amount ?? Number.NEGATIVE_INFINITY;
      if (bx !== ax) {
        return bx - ax;
      }
      // Tie-break: earliest proposedAt wins.
      return Date.parse(a.proposedAt) - Date.parse(b.proposedAt);
    });
    const winner = sorted[0];
    if (!winner) {
      return { reason: 'no proposals submitted' };
    }
    return { proposalId: winner.proposalId };
  }
}

const currentBestProposal = (state: NegotiationState): ProposalRecord | undefined => {
  if (!state.currentBestProposalId) {
    return undefined;
  }
  return state.proposals.find((p) => p.proposalId === state.currentBestProposalId);
};
