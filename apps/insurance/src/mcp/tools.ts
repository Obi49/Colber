import { defineMcpTool, McpToolRegistry } from '@praxis/core-mcp';
import { z } from 'zod';

import {
  FileClaimRequestSchema,
  PolicyIdParamsSchema,
  QuoteRequestSchema,
  SubscribeRequestSchema,
} from '../domain/validation.js';
import { claimToWire, policyViewToWire, quoteToView } from '../http/views.js';

import type { InsuranceService } from '../domain/insurance-service.js';
import type { ClaimWire, PolicyViewWire, QuoteWire } from '../http/views.js';

/**
 * MCP tools exposed by the insurance service.
 * Names follow the Praxis convention `<module>.<verb>` (CDC §2.3).
 *
 * Tools:
 *   - insurance.quote     : compute a premium without committing.
 *   - insurance.subscribe : create a policy + lock the simulated escrow.
 *   - insurance.claim     : file a claim against a policy.
 *   - insurance.status    : read the full state of a policy.
 *
 * Output schemas are intentionally permissive (`z.unknown()` for nested
 * domain shapes). The handler-side data is built via the same `*ToWire`
 * helpers as the REST layer; pinning every nested field would mean
 * re-stating the entire domain model.
 */

const QuoteWireSchema = z.object({
  subscriberDid: z.string(),
  beneficiaryDid: z.string(),
  dealSubject: z.string(),
  amountUsdc: z.number(),
  premiumUsdc: z.number(),
  riskMultiplier: z.number(),
  reputationScore: z.number(),
  computedAt: z.string(),
  validUntil: z.string(),
}) as unknown as z.ZodType<QuoteWire>;

const PolicyViewWireSchema = z.object({
  policy: z.unknown(),
  escrow: z.unknown(),
  claims: z.array(z.unknown()),
}) as unknown as z.ZodType<PolicyViewWire>;

const ClaimWireSchema = z.object({
  id: z.string(),
  policyId: z.string(),
  claimantDid: z.string(),
  reason: z.string(),
  evidence: z.record(z.unknown()),
  status: z.string(),
  createdAt: z.string(),
  decidedAt: z.string().optional(),
  payoutUsdc: z.number().optional(),
}) as unknown as z.ZodType<ClaimWire>;

const StatusInputSchema = z.object({
  policyId: z.string().uuid(),
});

export const buildInsuranceMcpRegistry = (service: InsuranceService): McpToolRegistry => {
  const registry = new McpToolRegistry();

  registry.register(
    defineMcpTool({
      name: 'insurance.quote',
      version: '1.0.0',
      description:
        'Compute a premium quote for a delivery deal. Risk multiplier is derived from the reputation score of `subscriberDid`. No commitment is made; nothing is persisted.',
      inputSchema: QuoteRequestSchema,
      outputSchema: QuoteWireSchema,
      handler: async (input) => quoteToView(await service.quote(input)),
    }),
  );

  registry.register(
    defineMcpTool({
      name: 'insurance.subscribe',
      version: '1.0.0',
      description:
        'Create a policy and lock the simulated escrow. Re-quotes server-side so the client cannot inject a stale premium. Idempotent on `idempotencyKey`. Rejected if the global exposure cap would be exceeded.',
      inputSchema: SubscribeRequestSchema,
      outputSchema: PolicyViewWireSchema,
      handler: async (input) => {
        const result = await service.subscribe(input);
        return policyViewToWire(result.view);
      },
    }),
  );

  registry.register(
    defineMcpTool({
      name: 'insurance.claim',
      version: '1.0.0',
      description:
        'File a claim against an existing policy. The claim stays in `open` until the admin endpoint decides (v1 has no oracle-driven arbitrator). Idempotent on `(policyId, idempotencyKey)`.',
      inputSchema: FileClaimRequestSchema,
      outputSchema: ClaimWireSchema,
      handler: async (input) => {
        const result = await service.fileClaim(input);
        return claimToWire(result.claim);
      },
    }),
  );

  registry.register(
    defineMcpTool({
      name: 'insurance.status',
      version: '1.0.0',
      description:
        'Read the full state of a policy: policy fields + simulated escrow holding + all claims filed against it.',
      inputSchema: StatusInputSchema,
      outputSchema: PolicyViewWireSchema,
      handler: async (input) => {
        const view = await service.getPolicy(input.policyId);
        // PolicyIdParamsSchema validates the same uuid shape; reused for symmetry.
        void PolicyIdParamsSchema;
        return policyViewToWire(view);
      },
    }),
  );

  return registry;
};
