import { ERROR_CODES, ColberError } from '@colber/core-types';

import type { NegotiationState, Proposal, ProposalRecord, Strategy } from '../negotiation-types.js';

/**
 * Pure strategy contract.
 *
 * A `NegotiationStrategy` is the source of truth for which proposals are
 * accepted, how counter-proposals replace prior ones, and which proposal
 * wins at settlement time. Strategies are pure: they take state in, return
 * new state, and never touch storage.
 *
 * Two strategies for v1:
 *   - `ascending-auction`: each new amount must beat the current best and
 *     meet the reserve price.
 *   - `multi-criteria`: weighted-sum scoring across declared criteria.
 *
 * The strategy is selected at `negotiation.start` time via `terms.strategy`.
 */

export interface ProposalValidation {
  readonly ok: true;
}

export interface ProposalRejection {
  readonly ok: false;
  readonly reason: string;
}

export type ProposalValidationResult = ProposalValidation | ProposalRejection;

export interface NegotiationStrategy {
  readonly id: Strategy;
  /**
   * Validate a proposal against current state. Returns `{ok:true}` if it
   * should be accepted, or `{ok:false, reason}` otherwise. Pure — does
   * NOT mutate state.
   *
   * Counter-proposals pass `counterTo`. Strategies decide whether the
   * counter is admissible (e.g. multi-criteria allows replacing the same
   * party's prior proposal; ascending-auction treats it as a fresh bid).
   */
  validateProposal(
    state: NegotiationState,
    proposal: Proposal,
    counterTo?: string,
  ): ProposalValidationResult;
  /**
   * Apply a proposal to state, returning the new state. Pure. Caller is
   * responsible for persisting the underlying event log + projection.
   */
  applyProposal(state: NegotiationState, proposal: Proposal, counterTo?: string): NegotiationState;
  /** Pick the winner. Either `{proposalId}` or `{reason}` if no winner exists. */
  pickWinner(state: NegotiationState): { proposalId: string } | { reason: string };
}

export const findProposal = (
  state: NegotiationState,
  proposalId: string,
): ProposalRecord | undefined => state.proposals.find((p) => p.proposalId === proposalId);

/**
 * Common precondition: proposal author must be a registered party.
 * Throws `ColberError(VALIDATION_FAILED)` so the HTTP layer maps to 400.
 */
export const assertPartyAllowed = (state: NegotiationState, fromDid: string): void => {
  if (!state.partyDids.includes(fromDid)) {
    throw new ColberError(
      ERROR_CODES.VALIDATION_FAILED,
      `fromDid ${fromDid} is not a party of negotiation ${state.negotiationId}`,
      400,
    );
  }
};
