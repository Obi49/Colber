import { ERROR_CODES, ColberError } from '@colber/core-types';
import { v4 as uuidv4 } from 'uuid';

import { applyEvent, rebuildProjection } from './projection.js';
import { verifyProposalSignature, verifySettlementSignatures } from './signing.js';
import { getStrategy } from './strategies/index.js';

import type { EventStore } from './event-store.js';
import type {
  NegotiationEvent,
  NegotiationState,
  Proposal,
  SettlementSignature,
  StoredEvent,
} from './negotiation-types.js';
import type { ProposalInput, NegotiationTermsInput } from './validation.js';

/**
 * Composition root for the negotiation domain.
 *
 * Responsibilities:
 *  - Create a negotiation (idempotent on `idempotencyKey`).
 *  - Submit proposals + counter-proposals (signature-verified, strategy-validated).
 *  - Settle: verify N party signatures over `{negotiationId, winningProposalId}`,
 *    record the settled event.
 *  - Rebuild projection from the event log on demand (repair tool).
 *
 * Out of scope (documented in `contract-signer.ts`):
 *  - On-chain anchoring (EIP-712 + Base Sepolia) — P3.
 *  - LLM mediation — v2.
 *  - Reputation / insurance bridges — v2.
 */

export interface NegotiationServiceConfig {
  readonly maxProposalsPerNegotiation: number;
  readonly maxParties: number;
  readonly defaultDeadlineHours: number;
}

/**
 * The terms input accepted by the service. Identical to
 * `NegotiationTermsInput` (the zod-inferred output) except that
 * `constraints` is allowed to be missing — the service applies the same
 * default zod does (`{}`). This loosens the type to match what callers
 * see from `z.infer<typeof NegotiationTermsSchema>` on the user-facing
 * INPUT side (zod's default fields are optional in the input type but
 * required in the output type).
 */
export interface StartNegotiationInputTerms extends Omit<NegotiationTermsInput, 'constraints'> {
  readonly constraints?: NegotiationTermsInput['constraints'] | undefined;
}

export interface StartNegotiationInput {
  readonly terms: StartNegotiationInputTerms;
  readonly createdBy: string;
  readonly idempotencyKey: string;
}

export interface ProposeInput {
  readonly negotiationId: string;
  readonly proposal: ProposalInput;
  readonly publicKey: string;
}

export interface CounterInput {
  readonly negotiationId: string;
  readonly counterTo: string;
  readonly proposal: ProposalInput;
  readonly publicKey: string;
}

export interface SettleInput {
  readonly negotiationId: string;
  readonly winningProposalId?: string;
  readonly signatures: readonly SettlementSignature[];
  readonly publicKeys: ReadonlyMap<string, string>;
}

export interface StartNegotiationResult {
  readonly state: NegotiationState;
  readonly idempotent: boolean;
}

export class NegotiationService {
  constructor(
    private readonly store: EventStore,
    private readonly cfg: NegotiationServiceConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // -------------------------------------------------------------------
  // negotiation.start
  // -------------------------------------------------------------------

  public async start(input: StartNegotiationInput): Promise<StartNegotiationResult> {
    if (input.terms.partyDids.length > this.cfg.maxParties) {
      throw new ColberError(
        ERROR_CODES.VALIDATION_FAILED,
        `partyDids must have at most ${this.cfg.maxParties} entries`,
        400,
      );
    }
    const deadlineMs = Date.parse(input.terms.deadline);
    if (deadlineMs <= this.now().getTime()) {
      throw new ColberError(
        ERROR_CODES.VALIDATION_FAILED,
        'terms.deadline must be in the future',
        400,
      );
    }

    // Idempotency: a `negotiation.started` event with this idempotencyKey
    // already exists → return its state. This works without needing to
    // re-generate the negotiationId.
    const existing = await this.store.findStartedByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      return { state: existing.projection, idempotent: true };
    }

    const negotiationId = uuidv4();
    const at = this.now().toISOString();
    const event: NegotiationEvent = {
      type: 'negotiation.started',
      negotiationId,
      // Materialise into a non-readonly record copy for storage. zod's
      // `.default({})` populates `constraints` on output but the inferred
      // INPUT type still marks it optional, so we coalesce defensively.
      terms: {
        subject: input.terms.subject,
        strategy: input.terms.strategy,
        constraints: { ...(input.terms.constraints ?? {}) },
        partyDids: [...input.terms.partyDids],
        deadline: input.terms.deadline,
        ...(input.terms.criteria !== undefined
          ? { criteria: input.terms.criteria.map((c) => ({ name: c.name, weight: c.weight })) }
          : {}),
        ...(input.terms.reservePrice !== undefined
          ? { reservePrice: input.terms.reservePrice }
          : {}),
        ...(input.terms.currency !== undefined ? { currency: input.terms.currency } : {}),
      },
      createdBy: input.createdBy,
      at,
    };
    const projection = rebuildProjection([event]);
    const result = await this.store.append({
      negotiationId,
      idempotencyKey: input.idempotencyKey,
      event,
      projection,
    });
    return { state: result.projection, idempotent: result.idempotent };
  }

  // -------------------------------------------------------------------
  // negotiation.propose
  // -------------------------------------------------------------------

  public async propose(input: ProposeInput): Promise<NegotiationState> {
    const state = await this.requireState(input.negotiationId);
    this.assertNotExpired(state);
    this.assertActive(state);
    this.assertProposalCap(state);

    const proposal: Proposal = inputToProposal(input.proposal);
    await verifyProposalSignature(proposal, input.publicKey);

    const strat = getStrategy(state.strategy);
    const validation = strat.validateProposal(state, proposal);
    if (!validation.ok) {
      throw new ColberError(ERROR_CODES.VALIDATION_FAILED, validation.reason, 400);
    }

    const at = this.now().toISOString();
    const event: NegotiationEvent = {
      type: 'proposal.submitted',
      negotiationId: state.negotiationId,
      proposal,
      at,
    };
    const projection = applyEvent(state, event);
    const result = await this.store.append({
      negotiationId: state.negotiationId,
      idempotencyKey: proposal.proposalId,
      event,
      projection,
    });
    return result.projection;
  }

  // -------------------------------------------------------------------
  // negotiation.counter
  // -------------------------------------------------------------------

  public async counter(input: CounterInput): Promise<NegotiationState> {
    const state = await this.requireState(input.negotiationId);
    this.assertNotExpired(state);
    this.assertActive(state);
    this.assertProposalCap(state);

    const proposal: Proposal = inputToProposal(input.proposal);
    await verifyProposalSignature(proposal, input.publicKey);

    const strat = getStrategy(state.strategy);
    const validation = strat.validateProposal(state, proposal, input.counterTo);
    if (!validation.ok) {
      throw new ColberError(ERROR_CODES.VALIDATION_FAILED, validation.reason, 400);
    }

    const at = this.now().toISOString();
    const event: NegotiationEvent = {
      type: 'counter.submitted',
      negotiationId: state.negotiationId,
      counterTo: input.counterTo,
      proposal,
      at,
    };
    const projection = applyEvent(state, event);
    const result = await this.store.append({
      negotiationId: state.negotiationId,
      idempotencyKey: proposal.proposalId,
      event,
      projection,
    });
    return result.projection;
  }

  // -------------------------------------------------------------------
  // negotiation.settle
  // -------------------------------------------------------------------

  public async settle(input: SettleInput): Promise<NegotiationState> {
    const state = await this.requireState(input.negotiationId);
    if (state.status === 'settled') {
      // Idempotent — return current state.
      return state;
    }
    this.assertActive(state);

    if (state.proposals.length === 0) {
      throw new ColberError(
        ERROR_CODES.VALIDATION_FAILED,
        'cannot settle a negotiation with no proposals',
        400,
      );
    }

    let winningProposalId: string;
    if (input.winningProposalId) {
      const found = state.proposals.find((p) => p.proposalId === input.winningProposalId);
      if (!found) {
        throw new ColberError(
          ERROR_CODES.VALIDATION_FAILED,
          `winningProposalId ${input.winningProposalId} not found`,
          400,
        );
      }
      winningProposalId = found.proposalId;
    } else {
      const strat = getStrategy(state.strategy);
      const pick = strat.pickWinner(state);
      if ('reason' in pick) {
        throw new ColberError(ERROR_CODES.VALIDATION_FAILED, pick.reason, 400);
      }
      winningProposalId = pick.proposalId;
    }

    // Multi-party signature check: ALL partyDids must have signed.
    const sigDids = new Set(input.signatures.map((s) => s.did));
    for (const did of state.partyDids) {
      if (!sigDids.has(did)) {
        throw new ColberError(
          ERROR_CODES.VALIDATION_FAILED,
          `missing settlement signature from did=${did}`,
          400,
        );
      }
    }
    for (const sig of input.signatures) {
      if (!state.partyDids.includes(sig.did)) {
        throw new ColberError(
          ERROR_CODES.VALIDATION_FAILED,
          `signature from non-party did=${sig.did}`,
          400,
        );
      }
    }

    await verifySettlementSignatures(
      { negotiationId: state.negotiationId, winningProposalId },
      input.signatures,
      input.publicKeys,
    );

    const at = this.now().toISOString();
    const event: NegotiationEvent = {
      type: 'negotiation.settled',
      negotiationId: state.negotiationId,
      winningProposalId,
      signatures: [...input.signatures],
      at,
    };
    const projection = applyEvent(state, event);
    const result = await this.store.append({
      negotiationId: state.negotiationId,
      idempotencyKey: `settle:${winningProposalId}`,
      event,
      projection,
    });
    return result.projection;
  }

  // -------------------------------------------------------------------
  // queries
  // -------------------------------------------------------------------

  public async getState(negotiationId: string): Promise<NegotiationState> {
    return this.requireState(negotiationId);
  }

  public async history(
    negotiationId: string,
    cursor: number | null,
    limit: number,
  ): Promise<{ readonly events: readonly StoredEvent[]; readonly nextCursor: number | null }> {
    const state = await this.store.getState(negotiationId);
    if (!state) {
      throw new ColberError(ERROR_CODES.NOT_FOUND, `negotiation ${negotiationId} not found`, 404);
    }
    return this.store.history(negotiationId, cursor, limit);
  }

  /**
   * Rebuild the projection from the full event log. Useful when the
   * `negotiation_state` row drifts from the truth (e.g. after a manual
   * recovery).
   */
  public async rebuildProjection(negotiationId: string): Promise<NegotiationState> {
    const events = await this.store.listEvents(negotiationId);
    if (events.length === 0) {
      throw new ColberError(ERROR_CODES.NOT_FOUND, `negotiation ${negotiationId} not found`, 404);
    }
    return rebuildProjection(events.map((e) => e.event));
  }

  public async ping(): Promise<void> {
    await this.store.ping();
  }

  public async shutdown(): Promise<void> {
    await this.store.close();
  }

  // -------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------

  private async requireState(id: string): Promise<NegotiationState> {
    const state = await this.store.getState(id);
    if (!state) {
      throw new ColberError(ERROR_CODES.NOT_FOUND, `negotiation ${id} not found`, 404);
    }
    return state;
  }

  private assertActive(state: NegotiationState): void {
    if (state.status === 'cancelled' || state.status === 'expired') {
      throw new ColberError(ERROR_CODES.VALIDATION_FAILED, `negotiation is ${state.status}`, 400);
    }
    if (state.status === 'settled') {
      throw new ColberError(ERROR_CODES.VALIDATION_FAILED, 'negotiation is already settled', 400);
    }
  }

  private assertNotExpired(state: NegotiationState): void {
    if (Date.parse(state.expiresAt) <= this.now().getTime()) {
      throw new ColberError(ERROR_CODES.VALIDATION_FAILED, 'negotiation deadline has passed', 400);
    }
  }

  private assertProposalCap(state: NegotiationState): void {
    if (state.proposals.length >= this.cfg.maxProposalsPerNegotiation) {
      throw new ColberError(
        ERROR_CODES.VALIDATION_FAILED,
        `max proposals (${this.cfg.maxProposalsPerNegotiation}) reached`,
        400,
      );
    }
  }
}

const inputToProposal = (input: ProposalInput): Proposal => ({
  proposalId: input.proposalId,
  fromDid: input.fromDid,
  signature: input.signature,
  proposedAt: input.proposedAt,
  ...(input.amount !== undefined ? { amount: input.amount } : {}),
  ...(input.scores !== undefined ? { scores: { ...input.scores } } : {}),
  ...(input.payload !== undefined ? { payload: { ...input.payload } } : {}),
});
