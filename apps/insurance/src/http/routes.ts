import { ERROR_CODES, ColberError } from '@colber/core-types';

import { policyViewToWire, quoteToView, claimToWire } from './views.js';
import {
  AdminEscrowTransitionSchema,
  FileClaimRequestSchema,
  HoldingIdParamsSchema,
  ListPoliciesQuerySchema,
  PolicyIdParamsSchema,
  QuoteRequestSchema,
  SubscribeRequestSchema,
} from '../domain/validation.js';

import type { InsuranceService } from '../domain/insurance-service.js';
import type { FastifyInstance } from 'fastify';

/**
 * Wires the REST endpoints under `/v1/insurance*`:
 *
 *   POST /v1/insurance/quote
 *   POST /v1/insurance/subscribe
 *   POST /v1/insurance/claims
 *   GET  /v1/insurance/policies/:id
 *   GET  /v1/insurance/policies?subscriberDid=...&limit=...&offset=...
 *   POST /v1/insurance/admin/escrow/:holdingId/transition  (gated)
 *
 * All responses follow the `{ ok, data | error }` envelope from
 * `@colber/core-types`.
 */
export interface InsuranceRoutesDeps {
  readonly service: InsuranceService;
  readonly adminEnabled: boolean;
}

export const registerInsuranceRoutes = (app: FastifyInstance, deps: InsuranceRoutesDeps): void => {
  const { service, adminEnabled } = deps;

  // -----------------------------------------------------------------
  // POST /v1/insurance/quote
  // -----------------------------------------------------------------
  app.post('/v1/insurance/quote', async (req, reply) => {
    const body = QuoteRequestSchema.parse(req.body);
    const quote = await service.quote(body);
    return reply.code(200).send({ ok: true, data: quoteToView(quote) });
  });

  // -----------------------------------------------------------------
  // POST /v1/insurance/subscribe
  // -----------------------------------------------------------------
  app.post('/v1/insurance/subscribe', async (req, reply) => {
    const body = SubscribeRequestSchema.parse(req.body);
    const result = await service.subscribe(body);
    const status = result.idempotent ? 200 : 201;
    return reply.code(status).send({ ok: true, data: policyViewToWire(result.view) });
  });

  // -----------------------------------------------------------------
  // POST /v1/insurance/claims
  // -----------------------------------------------------------------
  app.post('/v1/insurance/claims', async (req, reply) => {
    const body = FileClaimRequestSchema.parse(req.body);
    const result = await service.fileClaim(body);
    const status = result.idempotent ? 200 : 201;
    return reply.code(status).send({ ok: true, data: claimToWire(result.claim) });
  });

  // -----------------------------------------------------------------
  // GET /v1/insurance/policies/:id
  // -----------------------------------------------------------------
  app.get<{ Params: { id: string } }>('/v1/insurance/policies/:id', async (req, reply) => {
    const { id } = PolicyIdParamsSchema.parse(req.params);
    const view = await service.getPolicy(id);
    return reply.code(200).send({ ok: true, data: policyViewToWire(view) });
  });

  // -----------------------------------------------------------------
  // GET /v1/insurance/policies?subscriberDid=...&limit=...&offset=...
  // -----------------------------------------------------------------
  app.get('/v1/insurance/policies', async (req, reply) => {
    const query = ListPoliciesQuerySchema.parse(req.query);
    const page = await service.listPolicies(query);
    return reply.code(200).send({
      ok: true,
      data: {
        policies: page.policies.map(policyViewToWire),
        total: page.total,
        limit: query.limit,
        offset: query.offset,
      },
    });
  });

  // -----------------------------------------------------------------
  // POST /v1/insurance/admin/escrow/:holdingId/transition
  //   gated by INSURANCE_ADMIN_ENABLED — returns 403 when disabled.
  // -----------------------------------------------------------------
  app.post<{ Params: { holdingId: string } }>(
    '/v1/insurance/admin/escrow/:holdingId/transition',
    async (req, reply) => {
      if (!adminEnabled) {
        throw new ColberError(
          ERROR_CODES.UNAUTHORIZED,
          'admin endpoints are disabled (set INSURANCE_ADMIN_ENABLED=true to enable)',
          403,
        );
      }
      const { holdingId } = HoldingIdParamsSchema.parse(req.params);
      const body = AdminEscrowTransitionSchema.parse(req.body);
      const view = await service.forceEscrowTransition({
        holdingId,
        to: body.to,
        ...(body.reason !== undefined ? { reason: body.reason } : {}),
        ...(body.claimId !== undefined ? { claimId: body.claimId } : {}),
      });
      return reply.code(200).send({ ok: true, data: policyViewToWire(view) });
    },
  );
};
