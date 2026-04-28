import { z } from 'zod';

/**
 * Zod schemas for the REST surface of the identity service.
 * Re-used by the MCP layer to share validation rules.
 */

const Base64String = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9+/=]+$/, 'must be base64-encoded');

const Base64UrlSafe = z.string().min(1);

export const RegisterRequestSchema = z.object({
  publicKey: Base64String.describe('Ed25519 public key, raw 32 bytes, base64-encoded'),
  ownerOperatorId: z.string().min(1).max(128).describe('Operator that owns this agent'),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const RegisterResponseSchema = z.object({
  did: z.string(),
  agentId: z.string().uuid(),
  registeredAt: z.string().datetime(),
});
export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;

export const ResolveResponseSchema = z.object({
  did: z.string(),
  agentId: z.string().uuid(),
  publicKey: z.string(),
  signatureScheme: z.string(),
  ownerOperatorId: z.string(),
  registeredAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
});
export type ResolveResponse = z.infer<typeof ResolveResponseSchema>;

export const VerifyRequestSchema = z.object({
  did: z.string().min(1),
  message: Base64UrlSafe.describe('base64-encoded message bytes'),
  signature: Base64UrlSafe.describe('base64-encoded signature bytes'),
});
export type VerifyRequest = z.infer<typeof VerifyRequestSchema>;

export const VerifyResponseSchema = z.object({
  valid: z.boolean(),
  reason: z.string().optional(),
});
export type VerifyResponse = z.infer<typeof VerifyResponseSchema>;
