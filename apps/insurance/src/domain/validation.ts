import { z } from 'zod';

/**
 * Zod validators shared between REST handlers, gRPC handlers, and MCP tools.
 *
 * Validation here covers SHAPE only. Domain rules (exposure cap, lifecycle
 * preconditions) live in `InsuranceService` / the `EscrowService`.
 */

const Did = z.string().min(3).max(512);

const SubjectSchema = z.string().min(1).max(256);

const AmountUsdcSchema = z
  .number()
  .finite()
  .gt(0)
  .max(10_000_000)
  .refine((n) => Number.isFinite(n), 'must be finite');

export const SlaTermsSchema = z
  .object({
    deliveryWindowHours: z.coerce.number().int().min(1).max(8_760),
    requirements: z.array(z.string().min(1).max(512)).max(64).optional(),
  })
  .strict();

export type SlaTermsInput = z.infer<typeof SlaTermsSchema>;

export const QuoteRequestSchema = z.object({
  subscriberDid: Did,
  beneficiaryDid: Did,
  dealSubject: SubjectSchema,
  amountUsdc: AmountUsdcSchema,
  slaTerms: SlaTermsSchema,
});
export type QuoteRequestBody = z.infer<typeof QuoteRequestSchema>;

export const SubscribeRequestSchema = QuoteRequestSchema.extend({
  idempotencyKey: z.string().min(1).max(128),
});
export type SubscribeRequestBody = z.infer<typeof SubscribeRequestSchema>;

const EvidenceSchema = z.record(z.unknown()).refine((v) => Object.keys(v).length <= 64, {
  message: 'evidence supports at most 64 keys',
});

export const FileClaimRequestSchema = z.object({
  policyId: z.string().uuid(),
  claimantDid: Did,
  reason: z.string().min(1).max(2_000),
  evidence: EvidenceSchema,
  idempotencyKey: z.string().min(1).max(128),
});
export type FileClaimRequestBody = z.infer<typeof FileClaimRequestSchema>;

export const PolicyIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const HoldingIdParamsSchema = z.object({
  holdingId: z.string().uuid(),
});

export const ListPoliciesQuerySchema = z.object({
  subscriberDid: Did,
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListPoliciesQueryInput = z.infer<typeof ListPoliciesQuerySchema>;

export const AdminEscrowTransitionSchema = z
  .object({
    to: z.enum(['released', 'claimed', 'refunded']),
    reason: z.string().min(1).max(2_000).optional(),
    claimId: z.string().uuid().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.to === 'claimed' && val.claimId === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['claimId'],
        message: 'claimId is required when transitioning to claimed',
      });
    }
  });
export type AdminEscrowTransitionBody = z.infer<typeof AdminEscrowTransitionSchema>;
