import {
  FeedbackRequestSchema,
  HistoryParamsSchema,
  HistoryQuerySchema,
  HistoryResponseSchema,
  ScoreParamsSchema,
  SignedScoreEnvelopeSchema,
  VerifyRequestSchema,
  VerifyResponseSchema,
  type FeedbackResponse,
  type HistoryResponse,
  type SignedScoreEnvelopeResponse,
  type VerifyResponse,
} from './schemas.js';

import type { ReputationService } from '../domain/reputation-service.js';
import type { FastifyInstance } from 'fastify';

/**
 * Wires the four REST endpoints under `/v1/reputation/*`:
 *
 *   GET  /v1/reputation/score/:agentDid
 *   GET  /v1/reputation/history/:agentDid
 *   POST /v1/reputation/verify
 *   POST /v1/reputation/feedback
 *
 * Schema validation uses Zod via the standard `body`/`params`/`query`
 * parsing. Response shapes mirror the Zod schemas in `./schemas.ts` so
 * OpenAPI generation (TODO) can use the same source of truth.
 */
export const registerReputationRoutes = (
  app: FastifyInstance,
  service: ReputationService,
): void => {
  // -----------------------------------------------------------------
  // GET /v1/reputation/score/:agentDid
  // -----------------------------------------------------------------
  app.get<{ Params: { agentDid: string } }>(
    '/v1/reputation/score/:agentDid',
    async (req, reply) => {
      const { agentDid } = ScoreParamsSchema.parse({
        agentDid: decodeURIComponent(req.params.agentDid),
      });
      const envelope = await service.getScore(agentDid);
      const response: SignedScoreEnvelopeResponse = SignedScoreEnvelopeSchema.parse(envelope);
      return reply.code(200).send({ ok: true, data: response });
    },
  );

  // -----------------------------------------------------------------
  // GET /v1/reputation/history/:agentDid
  // -----------------------------------------------------------------
  app.get<{
    Params: { agentDid: string };
    Querystring: { limit?: string; cursor?: string };
  }>('/v1/reputation/history/:agentDid', async (req, reply) => {
    const { agentDid } = HistoryParamsSchema.parse({
      agentDid: decodeURIComponent(req.params.agentDid),
    });
    const query = HistoryQuerySchema.parse(req.query);
    const page = await service.getHistory(agentDid, {
      limit: query.limit,
      cursor: query.cursor ?? null,
    });
    const response: HistoryResponse = HistoryResponseSchema.parse({
      did: agentDid,
      transactions: page.transactions.map((t) => ({
        ...t,
        completedAt: t.completedAt.toISOString(),
      })),
      feedbacksReceived: page.feedbacksReceived.map((f) => ({
        feedbackId: f.feedbackId,
        fromDid: f.fromDid,
        txId: f.txId,
        rating: f.rating,
        signedAt: f.signedAt.toISOString(),
        ...(f.comment !== undefined ? { comment: f.comment } : {}),
      })),
      feedbacksIssued: page.feedbacksIssued.map((f) => ({
        feedbackId: f.feedbackId,
        fromDid: f.fromDid,
        toDid: f.toDid,
        txId: f.txId,
        rating: f.rating,
        signedAt: f.signedAt.toISOString(),
        ...(f.comment !== undefined ? { comment: f.comment } : {}),
      })),
      nextCursor: page.nextCursor,
    });
    return reply.code(200).send({ ok: true, data: response });
  });

  // -----------------------------------------------------------------
  // POST /v1/reputation/verify
  // -----------------------------------------------------------------
  app.post('/v1/reputation/verify', async (req, reply) => {
    const body = VerifyRequestSchema.parse(req.body);
    const result = await service.verify({
      did: body.score.did,
      score: body.score.score,
      scoreVersion: body.score.scoreVersion,
      computedAt: body.score.computedAt,
      attestation: body.attestation,
    });
    const response: VerifyResponse = VerifyResponseSchema.parse(result);
    return reply.code(200).send({ ok: true, data: response });
  });

  // -----------------------------------------------------------------
  // POST /v1/reputation/feedback
  // -----------------------------------------------------------------
  app.post('/v1/reputation/feedback', async (req, reply) => {
    const body = FeedbackRequestSchema.parse(req.body);
    const result = await service.submitFeedback({
      feedbackId: body.feedbackId,
      fromDid: body.fromDid,
      toDid: body.toDid,
      txId: body.txId,
      rating: body.rating,
      dimensions: body.dimensions,
      ...(body.comment !== undefined ? { comment: body.comment } : {}),
      signedAt: body.signedAt,
      signature: body.signature,
    });
    const response: FeedbackResponse = result;
    // 201 on first acceptance, 200 on idempotent replay — keeps callers honest.
    return reply.code(result.idempotent ? 200 : 201).send({ ok: true, data: response });
  });
};
