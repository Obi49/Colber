import { defineMcpTool, McpToolRegistry } from '@colber/core-mcp';
import { z } from 'zod';

import {
  FeedbackDimensionsSchema,
  FeedbackResponseSchema,
  HistoryResponseSchema,
  SignedScoreEnvelopeSchema,
  SignedScoreSchema,
  VerifyResponseSchema,
} from '../http/schemas.js';

import type { ReputationService } from '../domain/reputation-service.js';

/**
 * MCP tools exposed by the reputation service.
 * Names follow the Colber convention `<module>.<verb>` (cf. ADR §0.2.3).
 */
export const buildReputationMcpRegistry = (service: ReputationService): McpToolRegistry => {
  const registry = new McpToolRegistry();

  // ---------------------------------------------------------------------
  // reputation.score
  // ---------------------------------------------------------------------
  registry.register(
    defineMcpTool({
      name: 'reputation.score',
      version: '1.0.0',
      description:
        "Return the agent's signed reputation score envelope (did, score 0..1000, scoreVersion, computedAt, ed25519 attestation).",
      inputSchema: z.object({
        agentDid: z.string().min(1).max(512),
      }),
      outputSchema: SignedScoreEnvelopeSchema,
      handler: async (input) => service.getScore(input.agentDid),
    }),
  );

  // ---------------------------------------------------------------------
  // reputation.history
  // ---------------------------------------------------------------------
  registry.register(
    defineMcpTool({
      name: 'reputation.history',
      version: '1.0.0',
      description:
        "Paginated history of the agent's transactions and feedbacks. Cursor-based: pass `nextCursor` from the previous page on the next call.",
      inputSchema: z.object({
        agentDid: z.string().min(1).max(512),
        limit: z.number().int().min(1).max(200).optional(),
        cursor: z.string().min(1).max(64).optional(),
      }),
      outputSchema: HistoryResponseSchema,
      handler: async (input) => {
        const page = await service.getHistory(input.agentDid, {
          limit: input.limit ?? 50,
          cursor: input.cursor ?? null,
        });
        return {
          did: input.agentDid,
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
        };
      },
    }),
  );

  // ---------------------------------------------------------------------
  // reputation.verify
  // ---------------------------------------------------------------------
  registry.register(
    defineMcpTool({
      name: 'reputation.verify',
      version: '1.0.0',
      description:
        'Verify a signed reputation attestation against the platform public key. Crypto-only; no DB lookup.',
      inputSchema: z.object({
        score: SignedScoreSchema,
        attestation: z
          .string()
          .min(1)
          .regex(/^[A-Za-z0-9+/=]+$/, 'must be base64-encoded'),
      }),
      outputSchema: VerifyResponseSchema,
      handler: async (input) =>
        service.verify({
          did: input.score.did,
          score: input.score.score,
          scoreVersion: input.score.scoreVersion,
          computedAt: input.score.computedAt,
          attestation: input.attestation,
        }),
    }),
  );

  // ---------------------------------------------------------------------
  // reputation.feedback
  // ---------------------------------------------------------------------
  registry.register(
    defineMcpTool({
      name: 'reputation.feedback',
      version: '1.0.0',
      description:
        "Submit a signed feedback after a transaction. Validates the issuer's signature against their DID and enforces (feedbackId, [from,to,tx]) idempotency.",
      inputSchema: z.object({
        feedbackId: z.string().uuid(),
        fromDid: z.string().min(1).max(512),
        toDid: z.string().min(1).max(512),
        txId: z.string().min(1).max(128),
        rating: z.number().int().min(1).max(5),
        dimensions: FeedbackDimensionsSchema,
        comment: z.string().max(2_000).optional(),
        signedAt: z.string().datetime(),
        signature: z
          .string()
          .min(1)
          .regex(/^[A-Za-z0-9+/=]+$/, 'must be base64-encoded'),
      }),
      outputSchema: FeedbackResponseSchema,
      handler: async (input) =>
        service.submitFeedback({
          feedbackId: input.feedbackId,
          fromDid: input.fromDid,
          toDid: input.toDid,
          txId: input.txId,
          rating: input.rating,
          dimensions: input.dimensions,
          ...(input.comment !== undefined ? { comment: input.comment } : {}),
          signedAt: input.signedAt,
          signature: input.signature,
        }),
    }),
  );

  return registry;
};
