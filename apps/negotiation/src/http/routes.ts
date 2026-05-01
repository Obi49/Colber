import { stateToView, storedToView } from './views.js';
import {
  CounterRequestSchema,
  HistoryQuerySchema,
  NegotiationIdParamsSchema,
  ProposeRequestSchema,
  SettleRequestSchema,
  StartNegotiationRequestSchema,
} from '../domain/validation.js';

import type { NegotiationService } from '../domain/negotiation-service.js';
import type { FastifyInstance } from 'fastify';

/**
 * Wires the REST endpoints under `/v1/negotiation*`:
 *
 *   POST /v1/negotiation                        → negotiation.start
 *   GET  /v1/negotiation/:id                    → projection
 *   GET  /v1/negotiation/:id/history            → paginated event log
 *   POST /v1/negotiation/:id/propose            → negotiation.propose
 *   POST /v1/negotiation/:id/counter            → negotiation.counter
 *   POST /v1/negotiation/:id/settle             → negotiation.settle
 *
 * All responses follow the `{ ok, data | error }` envelope from
 * `@colber/core-types`.
 */
export const registerNegotiationRoutes = (
  app: FastifyInstance,
  service: NegotiationService,
): void => {
  // -----------------------------------------------------------------
  // POST /v1/negotiation
  // -----------------------------------------------------------------
  app.post('/v1/negotiation', async (req, reply) => {
    const body = StartNegotiationRequestSchema.parse(req.body);
    const result = await service.start({
      terms: body.terms,
      createdBy: body.createdBy,
      idempotencyKey: body.idempotencyKey,
    });
    const status = result.idempotent ? 200 : 201;
    return reply.code(status).send({ ok: true, data: stateToView(result.state) });
  });

  // -----------------------------------------------------------------
  // GET /v1/negotiation/:id
  // -----------------------------------------------------------------
  app.get<{ Params: { id: string } }>('/v1/negotiation/:id', async (req, reply) => {
    const { id } = NegotiationIdParamsSchema.parse(req.params);
    const state = await service.getState(id);
    return reply.code(200).send({ ok: true, data: stateToView(state) });
  });

  // -----------------------------------------------------------------
  // GET /v1/negotiation/:id/history?cursor=...&limit=...
  // -----------------------------------------------------------------
  app.get<{
    Params: { id: string };
    Querystring: { cursor?: string; limit?: string };
  }>('/v1/negotiation/:id/history', async (req, reply) => {
    const { id } = NegotiationIdParamsSchema.parse(req.params);
    const { cursor, limit } = HistoryQuerySchema.parse(req.query);
    const page = await service.history(id, cursor ?? null, limit);
    return reply.code(200).send({
      ok: true,
      data: {
        events: page.events.map(storedToView),
        nextCursor: page.nextCursor,
      },
    });
  });

  // -----------------------------------------------------------------
  // POST /v1/negotiation/:id/propose
  // -----------------------------------------------------------------
  app.post<{ Params: { id: string } }>('/v1/negotiation/:id/propose', async (req, reply) => {
    const { id } = NegotiationIdParamsSchema.parse(req.params);
    const body = ProposeRequestSchema.parse(req.body);
    const state = await service.propose({
      negotiationId: id,
      proposal: body.proposal,
      publicKey: body.publicKey,
    });
    return reply.code(200).send({ ok: true, data: stateToView(state) });
  });

  // -----------------------------------------------------------------
  // POST /v1/negotiation/:id/counter
  // -----------------------------------------------------------------
  app.post<{ Params: { id: string } }>('/v1/negotiation/:id/counter', async (req, reply) => {
    const { id } = NegotiationIdParamsSchema.parse(req.params);
    const body = CounterRequestSchema.parse(req.body);
    const state = await service.counter({
      negotiationId: id,
      counterTo: body.counterTo,
      proposal: body.proposal,
      publicKey: body.publicKey,
    });
    return reply.code(200).send({ ok: true, data: stateToView(state) });
  });

  // -----------------------------------------------------------------
  // POST /v1/negotiation/:id/settle
  // -----------------------------------------------------------------
  app.post<{ Params: { id: string } }>('/v1/negotiation/:id/settle', async (req, reply) => {
    const { id } = NegotiationIdParamsSchema.parse(req.params);
    const body = SettleRequestSchema.parse(req.body);
    const publicKeys = new Map<string, string>();
    for (const entry of body.publicKeys) {
      publicKeys.set(entry.did, entry.publicKey);
    }
    const state = await service.settle({
      negotiationId: id,
      ...(body.winningProposalId !== undefined
        ? { winningProposalId: body.winningProposalId }
        : {}),
      signatures: body.signatures.map((s) => ({ did: s.did, signature: s.signature })),
      publicKeys,
    });
    return reply.code(200).send({ ok: true, data: stateToView(state) });
  });
};
