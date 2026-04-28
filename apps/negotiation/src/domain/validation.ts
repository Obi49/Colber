import { z } from 'zod';

import { STRATEGIES } from './negotiation-types.js';

/**
 * Zod validators shared between REST handlers, gRPC handlers, and MCP tools.
 *
 * Validation here covers SHAPE, not domain rules. Domain rules
 * (`overbid yourself`, `strategy.validateProposal`, etc.) live in the
 * strategy modules and the projection.
 */

const Iso8601 = z.string().datetime({ offset: true });

/**
 * Free-form attribute value: scalar or homogeneous array of scalars.
 * Mirrors `AttributeValue` from `negotiation-types.ts`.
 */
const AttributeValueSchema = z.union([
  z.string(),
  z.number().refine(Number.isFinite, 'must be finite'),
  z.boolean(),
  z.array(z.union([z.string(), z.number(), z.boolean()])).max(256),
]);

const ConstraintsSchema = z
  .record(AttributeValueSchema)
  .refine((v) => Object.keys(v).length <= 64, {
    message: 'constraints supports at most 64 keys',
  });

const PayloadSchema = z.record(AttributeValueSchema).refine((v) => Object.keys(v).length <= 64, {
  message: 'payload supports at most 64 keys',
});

const CriterionWeightSchema = z.object({
  name: z.string().min(1).max(128),
  weight: z.number().min(0).max(1),
});

const Base64Schema = z
  .string()
  .min(1)
  .max(2048)
  .regex(/^[A-Za-z0-9+/=]+$/, 'must be base64');

const Did = z.string().min(3).max(512);

const PartyDidsSchema = z
  .array(Did)
  .min(2)
  .max(16)
  .superRefine((arr, ctx) => {
    const seen = new Set<string>();
    for (const did of arr) {
      if (seen.has(did)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate party did: ${did}`,
        });
      }
      seen.add(did);
    }
  });

export const NegotiationTermsSchema = z
  .object({
    subject: z.string().min(1).max(256),
    strategy: z.enum(STRATEGIES),
    constraints: ConstraintsSchema.default({}),
    criteria: z.array(CriterionWeightSchema).min(1).max(16).optional(),
    partyDids: PartyDidsSchema,
    deadline: Iso8601,
    reservePrice: z.number().finite().optional(),
    currency: z.string().min(1).max(16).optional(),
  })
  .superRefine((val, ctx) => {
    const deadlineMs = Date.parse(val.deadline);
    if (Number.isNaN(deadlineMs)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deadline'],
        message: 'deadline must be ISO-8601',
      });
      return;
    }
    if (val.strategy === 'multi-criteria') {
      if (!val.criteria || val.criteria.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['criteria'],
          message: 'criteria are required for multi-criteria',
        });
      } else {
        const sum = val.criteria.reduce((acc, c) => acc + c.weight, 0);
        if (Math.abs(sum - 1) > 1e-6) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['criteria'],
            message: `criteria weights must sum to 1, got ${sum}`,
          });
        }
        const names = new Set<string>();
        val.criteria.forEach((c, i) => {
          if (names.has(c.name)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['criteria', i, 'name'],
              message: `duplicate criterion name: ${c.name}`,
            });
          }
          names.add(c.name);
        });
      }
    }
    if (val.strategy === 'ascending-auction' && val.criteria !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['criteria'],
        message: 'criteria must be omitted for ascending-auction',
      });
    }
  });

export type NegotiationTermsInput = z.infer<typeof NegotiationTermsSchema>;

export const ProposalSchema = z
  .object({
    proposalId: z.string().uuid(),
    fromDid: Did,
    amount: z.number().finite().optional(),
    scores: z.record(z.number().min(0).max(100)).optional(),
    payload: PayloadSchema.optional(),
    signature: Base64Schema,
    proposedAt: Iso8601,
  })
  .superRefine((val, ctx) => {
    if (val.amount === undefined && val.scores === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'proposal must carry either amount or scores',
      });
    }
  });

export type ProposalInput = z.infer<typeof ProposalSchema>;

export const StartNegotiationRequestSchema = z.object({
  terms: NegotiationTermsSchema,
  createdBy: Did,
  idempotencyKey: z.string().uuid(),
});
export type StartNegotiationRequestBody = z.infer<typeof StartNegotiationRequestSchema>;

export const ProposeRequestSchema = z.object({
  proposal: ProposalSchema,
  publicKey: Base64Schema,
});
export type ProposeRequestBody = z.infer<typeof ProposeRequestSchema>;

export const CounterRequestSchema = z.object({
  counterTo: z.string().uuid(),
  proposal: ProposalSchema,
  publicKey: Base64Schema,
});
export type CounterRequestBody = z.infer<typeof CounterRequestSchema>;

export const SettleRequestSchema = z
  .object({
    /**
     * Optional explicit winner. If omitted, the strategy's `pickWinner`
     * decides. Useful for ascending-auction where the initiator wants to
     * settle on the current best.
     */
    winningProposalId: z.string().uuid().optional(),
    signatures: z
      .array(
        z.object({
          did: Did,
          signature: Base64Schema,
        }),
      )
      .min(1)
      .max(16),
    publicKeys: z
      .array(
        z.object({
          did: Did,
          publicKey: Base64Schema,
        }),
      )
      .min(1)
      .max(16),
  })
  .superRefine((val, ctx) => {
    const sigDids = new Set(val.signatures.map((s) => s.did));
    if (sigDids.size !== val.signatures.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['signatures'],
        message: 'duplicate did in signatures',
      });
    }
    const pkDids = new Set(val.publicKeys.map((p) => p.did));
    if (pkDids.size !== val.publicKeys.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['publicKeys'],
        message: 'duplicate did in publicKeys',
      });
    }
    for (const sig of val.signatures) {
      if (!pkDids.has(sig.did)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['publicKeys'],
          message: `missing publicKey for did=${sig.did}`,
        });
      }
    }
  });
export type SettleRequestBody = z.infer<typeof SettleRequestSchema>;

export const NegotiationIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const HistoryQuerySchema = z.object({
  cursor: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
