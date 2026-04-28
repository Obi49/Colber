import { ERROR_CODES, PraxisError } from '@praxis/core-types';

import { getStrategy } from './strategies/index.js';

import type { NegotiationEvent, NegotiationState, NegotiationTerms } from './negotiation-types.js';

/**
 * Projection rebuilder.
 *
 * Given the full ordered event log for one negotiation, fold it into a
 * deterministic `NegotiationState` snapshot. Idempotent: the same input
 * always produces the same output, regardless of prior in-memory state.
 *
 * Used by:
 *   - `NegotiationService.rebuildProjection(id)` — repair tool when the
 *     `negotiation_state` row drifts from the event log.
 *   - Tests (no DB needed) to verify state transitions end-to-end.
 *
 * Invariants enforced here (illegal transitions throw `PraxisError(VALIDATION_FAILED)`):
 *   - The first event MUST be `negotiation.started`.
 *   - No events accepted after a terminal event (`settled`, `cancelled`,
 *     `expired`).
 *   - `proposal.submitted` / `counter.submitted` must be from a registered
 *     party and must satisfy the strategy's `validateProposal`.
 *   - `counter.submitted` must reference an existing proposal.
 *   - `negotiation.settled` must include all `partyDids` in the signatures
 *     and the `winningProposalId` must exist.
 */

export const rebuildProjection = (events: readonly NegotiationEvent[]): NegotiationState => {
  if (events.length === 0) {
    throw new PraxisError(
      ERROR_CODES.NOT_FOUND,
      'cannot rebuild projection from empty event log',
      404,
    );
  }

  const head = events[0];
  if (head?.type !== 'negotiation.started') {
    throw new PraxisError(
      ERROR_CODES.VALIDATION_FAILED,
      `first event must be negotiation.started, got ${head?.type ?? 'undefined'}`,
      500,
    );
  }

  const initial = startedToState(head.negotiationId, head.terms, head.at);
  let state: NegotiationState = initial;

  for (let i = 1; i < events.length; i++) {
    const ev = events[i];
    if (!ev) {
      continue;
    }
    state = applyEvent(state, ev);
  }
  return state;
};

const TERMINAL_STATUSES = new Set<NegotiationState['status']>(['settled', 'cancelled', 'expired']);

/**
 * Pure event applier. Used both during rebuild and during live event
 * append (the in-memory state is updated alongside the DB row in the same
 * transaction).
 */
export const applyEvent = (state: NegotiationState, ev: NegotiationEvent): NegotiationState => {
  if (TERMINAL_STATUSES.has(state.status)) {
    throw new PraxisError(
      ERROR_CODES.VALIDATION_FAILED,
      `cannot apply event ${ev.type} to terminal status ${state.status}`,
      400,
    );
  }

  switch (ev.type) {
    case 'negotiation.started':
      throw new PraxisError(
        ERROR_CODES.VALIDATION_FAILED,
        'duplicate negotiation.started in event log',
        500,
      );

    case 'proposal.submitted': {
      const strat = getStrategy(state.strategy);
      const validation = strat.validateProposal(state, ev.proposal);
      if (!validation.ok) {
        throw new PraxisError(
          ERROR_CODES.VALIDATION_FAILED,
          `proposal rejected: ${validation.reason}`,
          400,
        );
      }
      return strat.applyProposal(state, ev.proposal);
    }

    case 'counter.submitted': {
      const strat = getStrategy(state.strategy);
      const validation = strat.validateProposal(state, ev.proposal, ev.counterTo);
      if (!validation.ok) {
        throw new PraxisError(
          ERROR_CODES.VALIDATION_FAILED,
          `counter rejected: ${validation.reason}`,
          400,
        );
      }
      return strat.applyProposal(state, ev.proposal, ev.counterTo);
    }

    case 'negotiation.settled': {
      const winning = state.proposals.find((p) => p.proposalId === ev.winningProposalId);
      if (!winning) {
        throw new PraxisError(
          ERROR_CODES.VALIDATION_FAILED,
          `winningProposalId ${ev.winningProposalId} not in proposals`,
          400,
        );
      }
      const expected = new Set(state.partyDids);
      const actual = new Set(ev.signatures.map((s) => s.did));
      for (const did of expected) {
        if (!actual.has(did)) {
          throw new PraxisError(
            ERROR_CODES.VALIDATION_FAILED,
            `settlement is missing signature from did=${did}`,
            400,
          );
        }
      }
      return {
        ...state,
        status: 'settled',
        currentBestProposalId: ev.winningProposalId,
        winningProposalId: ev.winningProposalId,
        settlementSignatures: [...ev.signatures],
        updatedAt: ev.at,
      };
    }

    case 'negotiation.cancelled':
      return {
        ...state,
        status: 'cancelled',
        updatedAt: ev.at,
      };

    case 'negotiation.expired':
      return {
        ...state,
        status: 'expired',
        updatedAt: ev.at,
      };

    default: {
      const _exhaustive: never = ev;
      throw new PraxisError(
        ERROR_CODES.INTERNAL_ERROR,
        `unknown event type: ${JSON.stringify(_exhaustive)}`,
        500,
      );
    }
  }
};

const startedToState = (
  negotiationId: string,
  terms: NegotiationTerms,
  at: string,
): NegotiationState => ({
  negotiationId,
  status: 'open',
  strategy: terms.strategy,
  terms,
  partyDids: [...terms.partyDids],
  proposals: [],
  createdAt: at,
  updatedAt: at,
  expiresAt: terms.deadline,
});
