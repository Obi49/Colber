/**
 * MCP tools for the `reputation` module.
 *
 * Mirrors `apps/reputation/src/mcp/tools.ts`:
 *   - colber_reputation_score
 *   - colber_reputation_history
 *   - colber_reputation_verify
 *   - colber_reputation_feedback
 */

import { z } from 'zod';

import type { ToolRegistry } from './registry.js';
import type { ColberClient } from '@colber/sdk';

const FeedbackDimensionsSchema = z.object({
  delivery: z.number().int().min(1).max(5),
  quality: z.number().int().min(1).max(5),
  communication: z.number().int().min(1).max(5),
});

const SignedScoreSchema = z.object({
  did: z.string().min(1).max(512),
  score: z.number().int().min(0).max(1000),
  scoreVersion: z.string().min(1),
  computedAt: z.string().datetime(),
});

export const registerReputationTools = (registry: ToolRegistry, sdk: ColberClient): void => {
  registry.register({
    name: 'colber_reputation_score',
    description:
      "[Colber] Return the agent's signed reputation score envelope (did, score 0..1000, scoreVersion, computedAt, ed25519 attestation).",
    inputSchema: z.object({
      did: z.string().min(1).max(512),
    }),
    handler: (input) => sdk.reputation.score({ did: input.did }),
  });

  registry.register({
    name: 'colber_reputation_history',
    description:
      "[Colber] Paginated history of the agent's transactions and feedbacks. Cursor-based: pass `nextCursor` from the previous page on the next call.",
    inputSchema: z.object({
      did: z.string().min(1).max(512),
      limit: z.number().int().min(1).max(200).optional(),
      cursor: z.string().min(1).max(64).optional(),
    }),
    handler: (input) =>
      sdk.reputation.history({
        did: input.did,
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
      }),
  });

  registry.register({
    name: 'colber_reputation_verify',
    description:
      '[Colber] Verify a signed reputation attestation against the platform public key. Crypto-only; no DB lookup.',
    inputSchema: z.object({
      score: SignedScoreSchema,
      attestation: z
        .string()
        .min(1)
        .regex(/^[A-Za-z0-9+/=]+$/, 'must be base64-encoded'),
    }),
    handler: (input) =>
      sdk.reputation.verify({
        score: input.score,
        attestation: input.attestation,
      }),
  });

  registry.register({
    name: 'colber_reputation_feedback',
    description:
      "[Colber] Submit a signed feedback after a transaction. Validates the issuer's signature against their DID and enforces (feedbackId, [from,to,tx]) idempotency.",
    inputSchema: z.object({
      feedbackId: z.string().uuid(),
      fromDid: z.string().min(1).max(512),
      toDid: z.string().min(1).max(512),
      txId: z.string().min(1).max(128),
      rating: z.number().int().min(1).max(5),
      dimensions: FeedbackDimensionsSchema,
      comment: z.string().max(2000).optional(),
      signedAt: z.string().datetime(),
      signature: z
        .string()
        .min(1)
        .regex(/^[A-Za-z0-9+/=]+$/, 'must be base64-encoded'),
    }),
    handler: (input) =>
      sdk.reputation.submitFeedback({
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
  });
};
