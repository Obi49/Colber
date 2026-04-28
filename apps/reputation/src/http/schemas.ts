import { z } from 'zod';

/**
 * Zod schemas for the REST surface of the reputation service.
 * Re-used by the MCP layer to share validation rules.
 */

const Base64String = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9+/=]+$/, 'must be base64-encoded');

const DidString = z.string().min(1).max(512);
const Rating = z.number().int().min(1).max(5);
const FiveScore = z.number().int().min(1).max(5);

export const FeedbackDimensionsSchema = z.object({
  delivery: FiveScore,
  quality: FiveScore,
  communication: FiveScore,
});
export type FeedbackDimensionsRequest = z.infer<typeof FeedbackDimensionsSchema>;

// ---------- score ----------

export const ScoreParamsSchema = z.object({
  agentDid: DidString,
});

export const SignedScoreSchema = z.object({
  did: DidString,
  score: z.number().int().min(0).max(1000),
  scoreVersion: z.string().min(1),
  computedAt: z.string().datetime(),
});

export const SignedScoreEnvelopeSchema = SignedScoreSchema.extend({
  attestation: Base64String.describe('Ed25519 signature over the JCS canonical payload'),
});
export type SignedScoreEnvelopeResponse = z.infer<typeof SignedScoreEnvelopeSchema>;

// ---------- history ----------

export const HistoryParamsSchema = z.object({
  agentDid: DidString,
});

export const HistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().min(1).max(64).optional(),
});

export const HistoryTransactionSchema = z.object({
  txId: z.string(),
  counterpartyDid: z.string(),
  role: z.enum(['buyer', 'seller']),
  amount: z.string(),
  currency: z.string(),
  status: z.string(),
  completedAt: z.string().datetime(),
});

export const HistoryReceivedFeedbackSchema = z.object({
  feedbackId: z.string(),
  fromDid: z.string(),
  txId: z.string(),
  rating: Rating,
  signedAt: z.string().datetime(),
  comment: z.string().optional(),
});

export const HistoryIssuedFeedbackSchema = HistoryReceivedFeedbackSchema.extend({
  toDid: z.string(),
});

export const HistoryResponseSchema = z.object({
  did: DidString,
  transactions: z.array(HistoryTransactionSchema),
  feedbacksReceived: z.array(HistoryReceivedFeedbackSchema),
  feedbacksIssued: z.array(HistoryIssuedFeedbackSchema),
  nextCursor: z.string().nullable(),
});
export type HistoryResponse = z.infer<typeof HistoryResponseSchema>;

// ---------- verify ----------

export const VerifyRequestSchema = z.object({
  score: SignedScoreSchema,
  attestation: Base64String,
});
export type VerifyRequest = z.infer<typeof VerifyRequestSchema>;

export const VerifyResponseSchema = z.object({
  valid: z.boolean(),
  reason: z.string().optional(),
});
export type VerifyResponse = z.infer<typeof VerifyResponseSchema>;

// ---------- feedback ----------

export const FeedbackRequestSchema = z.object({
  feedbackId: z.string().uuid(),
  fromDid: DidString,
  toDid: DidString,
  txId: z.string().min(1).max(128),
  rating: Rating,
  dimensions: FeedbackDimensionsSchema,
  comment: z.string().max(2_000).optional(),
  signedAt: z.string().datetime(),
  signature: Base64String,
});
export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;

export const FeedbackResponseSchema = z.object({
  accepted: z.boolean(),
  idempotent: z.boolean(),
  feedbackId: z.string().uuid(),
});
export type FeedbackResponse = z.infer<typeof FeedbackResponseSchema>;
