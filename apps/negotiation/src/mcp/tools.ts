import { defineMcpTool, McpToolRegistry } from '@praxis/core-mcp';
import { z } from 'zod';

import {
  CounterRequestSchema,
  NegotiationTermsSchema,
  ProposeRequestSchema,
  SettleRequestSchema,
} from '../domain/validation.js';
import { stateToView } from '../http/views.js';

import type { NegotiationService } from '../domain/negotiation-service.js';
import type { NegotiationView } from '../http/views.js';

/**
 * MCP tools exposed by the negotiation service.
 * Names follow the Praxis convention `<module>.<verb>` (CDC §2.3).
 *
 * Tools:
 *   - negotiation.start    : create a new negotiation.
 *   - negotiation.propose  : submit a proposal.
 *   - negotiation.counter  : submit a counter-proposal.
 *   - negotiation.settle   : finalize the deal with multi-party signatures.
 *
 * The output schema is intentionally permissive (`z.unknown()` for the
 * complex nested fields). The handler-side data is built via `stateToView`
 * which provides the typed shape; the MCP wire schema is a JSON envelope
 * around that, and pinning every nested field to a Zod type would require
 * re-stating the entire domain model here. Validators on the input side
 * are strict; the output side is the same data we already serialise to
 * REST clients.
 */

// The MCP wire schema validates only the envelope shape — the nested
// domain objects (terms, proposals, settlementSignatures) round-trip as-is.
// Casting to `z.ZodType<NegotiationView>` keeps `defineMcpTool`'s `O` type
// aligned with what the handler returns.
const NegotiationViewSchema = z.object({
  negotiationId: z.string(),
  status: z.string(),
  strategy: z.string(),
  terms: z.unknown(),
  partyDids: z.array(z.string()),
  proposals: z.array(z.unknown()),
  currentBestProposalId: z.string().optional(),
  winningProposalId: z.string().optional(),
  settlementSignatures: z.array(z.object({ did: z.string(), signature: z.string() })).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  expiresAt: z.string(),
}) as unknown as z.ZodType<NegotiationView>;

// `negotiation.start` mirrors the REST body but spelled with MCP-style naming.
const StartToolInputSchema = z.object({
  terms: NegotiationTermsSchema,
  createdBy: z.string().min(3).max(512),
  idempotencyKey: z.string().uuid(),
});

const NegotiationIdInput = z.object({
  negotiationId: z.string().uuid(),
});

// `SettleRequestSchema` is a ZodEffects because of its `superRefine`, and
// ZodEffects can't be `.merge()`-d. Use `z.intersection` to combine with
// the negotiation-id wrapper.
const ProposeToolInputSchema = z.intersection(NegotiationIdInput, ProposeRequestSchema);
const CounterToolInputSchema = z.intersection(NegotiationIdInput, CounterRequestSchema);
const SettleToolInputSchema = z.intersection(NegotiationIdInput, SettleRequestSchema);

export const buildNegotiationMcpRegistry = (service: NegotiationService): McpToolRegistry => {
  const registry = new McpToolRegistry();

  // ---------------------------------------------------------------------
  // negotiation.start
  // ---------------------------------------------------------------------
  registry.register(
    defineMcpTool({
      name: 'negotiation.start',
      version: '1.0.0',
      description:
        'Create a new negotiation with terms (subject, strategy, constraints, deadline, parties). Returns the freshly-created NegotiationView. Idempotent on `idempotencyKey`.',
      inputSchema: StartToolInputSchema,
      outputSchema: NegotiationViewSchema,
      handler: async (input) => {
        const result = await service.start({
          terms: input.terms,
          createdBy: input.createdBy,
          idempotencyKey: input.idempotencyKey,
        });
        return stateToView(result.state);
      },
    }),
  );

  // ---------------------------------------------------------------------
  // negotiation.propose
  // ---------------------------------------------------------------------
  registry.register(
    defineMcpTool({
      name: 'negotiation.propose',
      version: '1.0.0',
      description:
        'Submit a signed proposal (bid or scored offer) to a negotiation. Validates the Ed25519 signature against the supplied public key + the strategy rules. Returns the updated NegotiationView.',
      inputSchema: ProposeToolInputSchema,
      outputSchema: NegotiationViewSchema,
      handler: async (input) => {
        const state = await service.propose({
          negotiationId: input.negotiationId,
          proposal: input.proposal,
          publicKey: input.publicKey,
        });
        return stateToView(state);
      },
    }),
  );

  // ---------------------------------------------------------------------
  // negotiation.counter
  // ---------------------------------------------------------------------
  registry.register(
    defineMcpTool({
      name: 'negotiation.counter',
      version: '1.0.0',
      description:
        'Submit a counter-proposal in response to an existing proposal. Strategy decides whether the counter replaces the prior proposal (multi-criteria) or competes as a fresh bid (ascending-auction).',
      inputSchema: CounterToolInputSchema,
      outputSchema: NegotiationViewSchema,
      handler: async (input) => {
        const state = await service.counter({
          negotiationId: input.negotiationId,
          counterTo: input.counterTo,
          proposal: input.proposal,
          publicKey: input.publicKey,
        });
        return stateToView(state);
      },
    }),
  );

  // ---------------------------------------------------------------------
  // negotiation.settle
  // ---------------------------------------------------------------------
  registry.register(
    defineMcpTool({
      name: 'negotiation.settle',
      version: '1.0.0',
      description:
        'Finalize the deal: verifies a signature from EVERY partyDid over `{negotiationId, winningProposalId}` (JCS canonical form). Records `negotiation.settled`. Idempotent on subsequent calls (returns the settled state).',
      inputSchema: SettleToolInputSchema,
      outputSchema: NegotiationViewSchema,
      handler: async (input) => {
        const publicKeys = new Map<string, string>();
        for (const entry of input.publicKeys) {
          publicKeys.set(entry.did, entry.publicKey);
        }
        const state = await service.settle({
          negotiationId: input.negotiationId,
          ...(input.winningProposalId !== undefined
            ? { winningProposalId: input.winningProposalId }
            : {}),
          signatures: input.signatures.map((s) => ({ did: s.did, signature: s.signature })),
          publicKeys,
        });
        return stateToView(state);
      },
    }),
  );

  return registry;
};
