import {
  assertPartyAllowed,
  findProposal,
  type NegotiationStrategy,
  type ProposalValidationResult,
} from './strategy.js';

import type { NegotiationState, Proposal, ProposalRecord } from '../negotiation-types.js';

/**
 * Multi-criteria strategy.
 *
 * Rules:
 *   1. Terms MUST declare `criteria` with weights summing to 1 (validated
 *      in the request schema, not here — the strategy assumes the terms
 *      are already shape-valid).
 *   2. Every proposal MUST include a `scores` map covering EVERY declared
 *      criterion. Missing criteria are rejected; extra criteria are
 *      rejected (signal of a stale client).
 *   3. Each score is in [0..100].
 *   4. Counter-proposals REPLACE the prior proposal from the same party
 *      (the previous proposal is filtered out of the projection).
 *   5. The current-best-proposal pointer is updated on every accepted
 *      proposal to the highest weighted-sum.
 *
 * Settlement: the proposal with the highest weighted-sum wins. Ties are
 * broken by earliest `proposedAt`.
 */
export class MultiCriteriaStrategy implements NegotiationStrategy {
  public readonly id = 'multi-criteria' as const;

  public validateProposal(
    state: NegotiationState,
    proposal: Proposal,
    counterTo?: string,
  ): ProposalValidationResult {
    assertPartyAllowed(state, proposal.fromDid);

    const criteria = state.terms.criteria;
    if (!criteria || criteria.length === 0) {
      return {
        ok: false,
        reason: 'multi-criteria negotiation requires terms.criteria to be declared',
      };
    }
    if (!proposal.scores) {
      return { ok: false, reason: 'proposal.scores is required for multi-criteria' };
    }

    const declared = new Set(criteria.map((c) => c.name));
    const provided = new Set(Object.keys(proposal.scores));
    for (const name of declared) {
      if (!provided.has(name)) {
        return { ok: false, reason: `proposal.scores is missing criterion "${name}"` };
      }
    }
    for (const name of provided) {
      if (!declared.has(name)) {
        return { ok: false, reason: `proposal.scores contains unknown criterion "${name}"` };
      }
    }
    for (const [name, raw] of Object.entries(proposal.scores)) {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        return {
          ok: false,
          reason: `proposal.scores["${name}"] must be a finite number`,
        };
      }
      if (raw < 0 || raw > 100) {
        return {
          ok: false,
          reason: `proposal.scores["${name}"] must be in [0..100], got ${raw}`,
        };
      }
    }

    if (counterTo) {
      const target = findProposal(state, counterTo);
      if (!target) {
        return { ok: false, reason: `counterTo ${counterTo} not found` };
      }
      // The party countering must be the original author OR a different
      // party countering somebody else. We forbid one party tampering with
      // another's prior proposal — the counter must be from the same party
      // (replacement) OR be a fresh proposal not tied to a counterTo.
      // Convention: counter.submitted from party X targets a proposal also
      // authored by X (replacement). Different-party counter = first-class
      // proposal (`propose` endpoint).
      if (target.fromDid !== proposal.fromDid) {
        return {
          ok: false,
          reason: 'multi-criteria counter must replace your own prior proposal',
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
    let proposals: ProposalRecord[];
    if (counterTo) {
      // Replace the prior proposal from the same party.
      proposals = state.proposals.filter((p) => p.proposalId !== counterTo);
    } else {
      proposals = [...state.proposals];
    }
    proposals.push(record);

    const ranked = rankByWeightedSum(proposals, state.terms.criteria ?? []);
    const top = ranked[0];

    return {
      ...state,
      proposals,
      ...(top !== undefined ? { currentBestProposalId: top.proposalId } : {}),
      status: 'negotiating',
      updatedAt: proposal.proposedAt,
    };
  }

  public pickWinner(state: NegotiationState): { proposalId: string } | { reason: string } {
    if (state.proposals.length === 0) {
      return { reason: 'no proposals submitted' };
    }
    const ranked = rankByWeightedSum(state.proposals, state.terms.criteria ?? []);
    const winner = ranked[0];
    if (!winner) {
      return { reason: 'no proposals submitted' };
    }
    return { proposalId: winner.proposalId };
  }
}

interface ScoredProposal extends ProposalRecord {
  readonly _weightedSum: number;
}

const rankByWeightedSum = (
  proposals: readonly ProposalRecord[],
  criteria: readonly { name: string; weight: number }[],
): ScoredProposal[] => {
  const scored: ScoredProposal[] = proposals.map((p) => ({
    ...p,
    _weightedSum: weightedSum(p, criteria),
  }));
  scored.sort((a, b) => {
    if (b._weightedSum !== a._weightedSum) {
      return b._weightedSum - a._weightedSum;
    }
    return Date.parse(a.proposedAt) - Date.parse(b.proposedAt);
  });
  return scored;
};

const weightedSum = (
  proposal: ProposalRecord,
  criteria: readonly { name: string; weight: number }[],
): number => {
  if (!proposal.scores) {
    return 0;
  }
  let acc = 0;
  for (const c of criteria) {
    const raw = proposal.scores[c.name] ?? 0;
    acc += raw * c.weight;
  }
  return acc;
};
