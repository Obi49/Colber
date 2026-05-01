/**
 * MCP tools for the `negotiation` module.
 *
 * Mirrors `apps/negotiation/src/mcp/tools.ts`:
 *   - colber_negotiation_start
 *   - colber_negotiation_propose
 *   - colber_negotiation_counter
 *   - colber_negotiation_settle
 */

import { z } from 'zod';

import { omitUndefined } from './_helpers.js';

import type { ToolRegistry } from './registry.js';
import type { ColberClient } from '@colber/sdk';

const StrategySchema = z.enum(['ascending-auction', 'multi-criteria']);

const AttributeValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number(), z.boolean()])),
]);

const CriterionWeightSchema = z.object({
  name: z.string().min(1).max(128),
  weight: z.number().min(0).max(1),
});

const NegotiationTermsSchema = z.object({
  subject: z.string().min(1).max(256),
  strategy: StrategySchema,
  constraints: z.record(AttributeValueSchema).optional(),
  criteria: z.array(CriterionWeightSchema).max(32).optional(),
  partyDids: z.array(z.string().min(1).max(512)).min(2).max(16),
  deadline: z.string().datetime(),
  reservePrice: z.number().nonnegative().optional(),
  currency: z.string().min(1).max(8).optional(),
});

const ProposalInputSchema = z.object({
  proposalId: z.string().uuid(),
  fromDid: z.string().min(1).max(512),
  amount: z.number().optional(),
  scores: z.record(z.number()).optional(),
  payload: z.record(AttributeValueSchema).optional(),
  signature: z
    .string()
    .min(1)
    .regex(/^[A-Za-z0-9+/=]+$/, 'must be base64-encoded'),
  proposedAt: z.string().datetime(),
});

const SettleSignatureSchema = z.object({
  did: z.string().min(1).max(512),
  signature: z
    .string()
    .min(1)
    .regex(/^[A-Za-z0-9+/=]+$/, 'must be base64-encoded'),
});

const SettlePublicKeySchema = z.object({
  did: z.string().min(1).max(512),
  publicKey: z.string().min(1),
});

export const registerNegotiationTools = (registry: ToolRegistry, sdk: ColberClient): void => {
  registry.register({
    name: 'colber_negotiation_start',
    description:
      '[Colber] Create a new negotiation with terms (subject, strategy, constraints, deadline, parties). Returns the freshly-created NegotiationView. Idempotent on `idempotencyKey`.',
    inputSchema: z.object({
      terms: NegotiationTermsSchema,
      createdBy: z.string().min(3).max(512),
      idempotencyKey: z.string().uuid(),
    }),
    handler: (input) =>
      sdk.negotiation.start(
        { terms: omitUndefined(input.terms), createdBy: input.createdBy },
        { idempotencyKey: input.idempotencyKey },
      ),
  });

  registry.register({
    name: 'colber_negotiation_propose',
    description:
      '[Colber] Submit a signed proposal (bid or scored offer) to a negotiation. Validates the Ed25519 signature against the supplied public key + the strategy rules. Returns the updated NegotiationView.',
    inputSchema: z.object({
      negotiationId: z.string().uuid(),
      proposal: ProposalInputSchema,
      publicKey: z.string().min(1),
    }),
    handler: (input) =>
      sdk.negotiation.propose({
        negotiationId: input.negotiationId,
        proposal: omitUndefined(input.proposal),
        publicKey: input.publicKey,
      }),
  });

  registry.register({
    name: 'colber_negotiation_counter',
    description:
      '[Colber] Submit a counter-proposal in response to an existing proposal. Strategy decides whether the counter replaces the prior proposal (multi-criteria) or competes as a fresh bid (ascending-auction).',
    inputSchema: z.object({
      negotiationId: z.string().uuid(),
      counterTo: z.string().uuid(),
      proposal: ProposalInputSchema,
      publicKey: z.string().min(1),
    }),
    handler: (input) =>
      sdk.negotiation.counter({
        negotiationId: input.negotiationId,
        counterTo: input.counterTo,
        proposal: omitUndefined(input.proposal),
        publicKey: input.publicKey,
      }),
  });

  registry.register({
    name: 'colber_negotiation_settle',
    description:
      '[Colber] Finalize the deal: verifies a signature from EVERY partyDid over `{negotiationId, winningProposalId}` (JCS canonical form). Records `negotiation.settled`. Idempotent on subsequent calls (returns the settled state).',
    inputSchema: z.object({
      negotiationId: z.string().uuid(),
      winningProposalId: z.string().uuid().optional(),
      signatures: z.array(SettleSignatureSchema).min(1).max(16),
      publicKeys: z.array(SettlePublicKeySchema).min(1).max(16),
    }),
    handler: (input) =>
      sdk.negotiation.settle({
        negotiationId: input.negotiationId,
        ...(input.winningProposalId !== undefined
          ? { winningProposalId: input.winningProposalId }
          : {}),
        signatures: input.signatures,
        publicKeys: input.publicKeys,
      }),
  });
};
