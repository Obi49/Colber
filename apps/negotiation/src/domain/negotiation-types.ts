/**
 * Domain types for the negotiation broker.
 *
 * The service is event-sourced: `NegotiationEvent` is the append-only source
 * of truth, `NegotiationState` is the materialised projection. Strategies
 * (`ascending-auction`, `multi-criteria`) operate on the projection.
 *
 * State machine: `open → negotiating → settled | cancelled | expired`.
 */

export const NEGOTIATION_STATUSES = [
  'open',
  'negotiating',
  'settled',
  'cancelled',
  'expired',
] as const;
export type NegotiationStatus = (typeof NEGOTIATION_STATUSES)[number];

export const STRATEGIES = ['ascending-auction', 'multi-criteria'] as const;
export type Strategy = (typeof STRATEGIES)[number];

/**
 * Constraint / payload values: string / number / boolean / homogeneous array.
 * Mirrors the JCS-canonicalisable scalar set so the bytes we sign round-trip.
 */
export type AttributeValue = string | number | boolean | readonly (string | number | boolean)[];

export interface CriterionWeight {
  readonly name: string;
  /** 0..1; the sum across all criteria must be 1 (±1e-6). */
  readonly weight: number;
}

export interface NegotiationTerms {
  readonly subject: string;
  readonly strategy: Strategy;
  readonly constraints: Readonly<Record<string, AttributeValue>>;
  readonly criteria?: readonly CriterionWeight[];
  /** 2..NEGOTIATION_MAX_PARTIES distinct DIDs of allowed participants. */
  readonly partyDids: readonly string[];
  /** ISO-8601 UTC. */
  readonly deadline: string;
  readonly reservePrice?: number;
  readonly currency?: string;
}

export interface Proposal {
  readonly proposalId: string;
  readonly fromDid: string;
  readonly amount?: number;
  readonly scores?: Readonly<Record<string, number>>;
  readonly payload?: Readonly<Record<string, AttributeValue>>;
  /** Base64 Ed25519 signature over the JCS canonicalisation of the proposal payload. */
  readonly signature: string;
  /** ISO-8601 UTC. */
  readonly proposedAt: string;
}

export interface SettlementSignature {
  readonly did: string;
  /** Base64 Ed25519 signature over `{negotiationId, winningProposalId}` (JCS). */
  readonly signature: string;
}

// ---------------------------------------------------------------------------
// Projected state (read model)
// ---------------------------------------------------------------------------

export interface ProposalRecord extends Proposal {
  /** Set on counter-proposals. */
  readonly counterTo?: string;
}

export interface NegotiationState {
  readonly negotiationId: string;
  readonly status: NegotiationStatus;
  readonly strategy: Strategy;
  readonly terms: NegotiationTerms;
  readonly partyDids: readonly string[];
  readonly proposals: readonly ProposalRecord[];
  readonly currentBestProposalId?: string;
  readonly winningProposalId?: string;
  readonly settlementSignatures?: readonly SettlementSignature[];
  /** ISO-8601 UTC. */
  readonly createdAt: string;
  /** ISO-8601 UTC. */
  readonly updatedAt: string;
  /** ISO-8601 UTC. */
  readonly expiresAt: string;
}

// ---------------------------------------------------------------------------
// Domain events (append-only event log)
// ---------------------------------------------------------------------------

export type NegotiationEvent =
  | {
      readonly type: 'negotiation.started';
      readonly negotiationId: string;
      readonly terms: NegotiationTerms;
      readonly createdBy: string;
      readonly at: string;
    }
  | {
      readonly type: 'proposal.submitted';
      readonly negotiationId: string;
      readonly proposal: Proposal;
      readonly at: string;
    }
  | {
      readonly type: 'counter.submitted';
      readonly negotiationId: string;
      readonly counterTo: string;
      readonly proposal: Proposal;
      readonly at: string;
    }
  | {
      readonly type: 'negotiation.settled';
      readonly negotiationId: string;
      readonly winningProposalId: string;
      readonly signatures: readonly SettlementSignature[];
      readonly at: string;
    }
  | {
      readonly type: 'negotiation.cancelled';
      readonly negotiationId: string;
      readonly reason: string;
      readonly by: string;
      readonly at: string;
    }
  | {
      readonly type: 'negotiation.expired';
      readonly negotiationId: string;
      readonly at: string;
    };

export type NegotiationEventType = NegotiationEvent['type'];

export const NEGOTIATION_EVENT_TYPES: readonly NegotiationEventType[] = [
  'negotiation.started',
  'proposal.submitted',
  'counter.submitted',
  'negotiation.settled',
  'negotiation.cancelled',
  'negotiation.expired',
];

/** Stored event with its monotonic sequence number. */
export interface StoredEvent {
  readonly seq: number;
  readonly event: NegotiationEvent;
}
