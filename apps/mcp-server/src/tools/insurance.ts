/**
 * MCP tools for the `insurance` module.
 *
 * Mirrors `apps/insurance/src/mcp/tools.ts`:
 *   - colber_insurance_quote
 *   - colber_insurance_subscribe
 *   - colber_insurance_claim
 *   - colber_insurance_status   (extra over the base 4: read full policy state)
 */

import { z } from 'zod';

import { omitUndefined } from './_helpers.js';

import type { ToolRegistry } from './registry.js';
import type { ColberClient } from '@colber/sdk';

const Did = z.string().min(3).max(512);

const SlaTermsSchema = z.object({
  deliveryWindowHours: z.number().int().min(1).max(8_760),
  requirements: z.array(z.string().min(1).max(512)).max(64).optional(),
});

const QuoteRequestSchema = z.object({
  subscriberDid: Did,
  beneficiaryDid: Did,
  dealSubject: z.string().min(1).max(256),
  amountUsdc: z.number().finite().gt(0).max(10_000_000),
  slaTerms: SlaTermsSchema,
});

const EvidenceSchema = z.record(z.unknown()).refine((v) => Object.keys(v).length <= 64, {
  message: 'evidence supports at most 64 keys',
});

/**
 * Quote/subscribe payloads have a nested `slaTerms.requirements?` optional that
 * triggers `exactOptionalPropertyTypes`. We rebuild the body with `slaTerms`
 * passed through `omitUndefined` to drop the undefined key.
 */
const buildQuoteBody = (input: z.infer<typeof QuoteRequestSchema>) => ({
  subscriberDid: input.subscriberDid,
  beneficiaryDid: input.beneficiaryDid,
  dealSubject: input.dealSubject,
  amountUsdc: input.amountUsdc,
  slaTerms: omitUndefined(input.slaTerms),
});

export const registerInsuranceTools = (registry: ToolRegistry, sdk: ColberClient): void => {
  registry.register({
    name: 'colber_insurance_quote',
    description:
      '[Colber] Compute a premium quote for a delivery deal. Risk multiplier is derived from the reputation score of `subscriberDid`. No commitment is made; nothing is persisted.',
    inputSchema: QuoteRequestSchema,
    handler: (input) => sdk.insurance.quote(buildQuoteBody(input)),
  });

  registry.register({
    name: 'colber_insurance_subscribe',
    description:
      '[Colber] Create a policy and lock the simulated escrow. Re-quotes server-side so the client cannot inject a stale premium. Idempotent on `idempotencyKey`. Rejected if the global exposure cap would be exceeded.',
    inputSchema: QuoteRequestSchema.extend({
      idempotencyKey: z.string().min(1).max(128),
    }),
    handler: async (input) => {
      const { idempotencyKey } = input;
      return sdk.insurance.subscribe(buildQuoteBody(input), { idempotencyKey });
    },
  });

  registry.register({
    name: 'colber_insurance_claim',
    description:
      '[Colber] File a claim against an existing policy. The claim stays in `open` until the admin endpoint decides (v1 has no oracle-driven arbitrator). Idempotent on `(policyId, idempotencyKey)`.',
    inputSchema: z.object({
      policyId: z.string().uuid(),
      claimantDid: Did,
      reason: z.string().min(1).max(2_000),
      evidence: EvidenceSchema,
      idempotencyKey: z.string().min(1).max(128),
    }),
    handler: async (input) => {
      const { idempotencyKey, ...body } = input;
      return sdk.insurance.claim(body, { idempotencyKey });
    },
  });

  registry.register({
    name: 'colber_insurance_status',
    description:
      '[Colber] Read the full state of a policy: policy fields + simulated escrow holding + all claims filed against it.',
    inputSchema: z.object({
      policyId: z.string().uuid(),
    }),
    handler: (input) => sdk.insurance.status(input.policyId),
  });
};
