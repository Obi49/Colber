import type {
  NegotiationEvent,
  NegotiationState,
  StoredEvent,
} from '../domain/negotiation-types.js';

/**
 * Wire-shape projections for REST + gRPC + MCP responses.
 *
 * Materialises domain `NegotiationState` (which uses `readonly` arrays) to
 * mutable arrays so the inferred zod-output types line up. We do the copy
 * once at the boundary so the domain types stay strict.
 */

export interface NegotiationView {
  negotiationId: string;
  status: string;
  strategy: string;
  terms: NegotiationState['terms'];
  partyDids: string[];
  proposals: NegotiationState['proposals'][number][];
  currentBestProposalId?: string;
  winningProposalId?: string;
  settlementSignatures?: { did: string; signature: string }[];
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export const stateToView = (state: NegotiationState): NegotiationView => ({
  negotiationId: state.negotiationId,
  status: state.status,
  strategy: state.strategy,
  terms: state.terms,
  partyDids: [...state.partyDids],
  proposals: state.proposals.map((p) => ({ ...p })),
  ...(state.currentBestProposalId !== undefined
    ? { currentBestProposalId: state.currentBestProposalId }
    : {}),
  ...(state.winningProposalId !== undefined ? { winningProposalId: state.winningProposalId } : {}),
  ...(state.settlementSignatures !== undefined
    ? {
        settlementSignatures: state.settlementSignatures.map((s) => ({
          did: s.did,
          signature: s.signature,
        })),
      }
    : {}),
  createdAt: state.createdAt,
  updatedAt: state.updatedAt,
  expiresAt: state.expiresAt,
});

export interface HistoryEventView {
  seq: number;
  event: NegotiationEvent;
}

export const storedToView = (s: StoredEvent): HistoryEventView => ({
  seq: s.seq,
  event: s.event,
});
