import { z } from 'zod';

/**
 * Zod schemas for the REST surface of the memory service.
 * Re-used by the MCP layer to share validation rules.
 */

const DidString = z.string().min(1).max(512);
const MemoryType = z.enum(['fact', 'event', 'preference', 'relation']);
const Visibility = z.enum(['private', 'operator', 'shared', 'public']);

export const PayloadSchema = z.record(z.string(), z.unknown());

export const PermissionsSchema = z
  .object({
    visibility: Visibility,
    sharedWith: z.array(DidString).max(256).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.visibility === 'shared' && (!val.sharedWith || val.sharedWith.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'sharedWith must be non-empty when visibility=shared',
        path: ['sharedWith'],
      });
    }
  });

export const EncryptionRequestSchema = z.object({
  enabled: z.boolean(),
});

export const EmbeddingMetaSchema = z.object({
  model: z.string().min(1),
  dim: z.number().int().min(1).max(8192),
});

// ---------- store ----------

export const StoreRequestSchema = z.object({
  ownerDid: DidString,
  type: MemoryType,
  text: z.string().min(1).max(64_000),
  payload: PayloadSchema.optional(),
  permissions: PermissionsSchema,
  encryption: EncryptionRequestSchema.optional(),
});
export type StoreRequest = z.infer<typeof StoreRequestSchema>;

export const StoreResponseSchema = z.object({
  id: z.string().uuid(),
  embedding: EmbeddingMetaSchema,
});
export type StoreResponse = z.infer<typeof StoreResponseSchema>;

// ---------- search ----------

export const SearchRequestSchema = z.object({
  queryDid: DidString,
  queryText: z.string().min(1).max(8_000),
  topK: z.number().int().min(1).max(50).default(10),
  filters: z
    .object({
      type: MemoryType.optional(),
      ownerDid: DidString.optional(),
      visibility: Visibility.optional(),
    })
    .optional(),
});
export type SearchRequest = z.infer<typeof SearchRequestSchema>;

export const SearchHitSchema = z.object({
  id: z.string().uuid(),
  score: z.number(),
  type: MemoryType,
  ownerDid: DidString,
  snippet: z.string(),
});

export const SearchResponseSchema = z.object({
  hits: z.array(SearchHitSchema),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

// ---------- get ----------

export const GetMemoryParamsSchema = z.object({
  id: z.string().uuid(),
});
export const GetMemoryQuerySchema = z.object({
  callerDid: DidString,
});

export const MemoryRecordSchema = z.object({
  id: z.string().uuid(),
  ownerDid: DidString,
  type: MemoryType,
  text: z.string(),
  payload: PayloadSchema,
  permissions: z.object({
    visibility: Visibility,
    sharedWith: z.array(DidString),
  }),
  encryption: z.object({
    enabled: z.boolean(),
    algorithm: z.string(),
    keyId: z.string(),
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().min(1),
  embedding: EmbeddingMetaSchema,
});
export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;

// ---------- update ----------

export const UpdateParamsSchema = z.object({
  id: z.string().uuid(),
});

export const UpdateRequestSchema = z
  .object({
    callerDid: DidString,
    text: z.string().min(1).max(64_000).optional(),
    payload: PayloadSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.text === undefined && val.payload === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'must change at least one of `text` or `payload`',
        path: ['text'],
      });
    }
  });
export type UpdateRequest = z.infer<typeof UpdateRequestSchema>;

export const UpdateResponseSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().min(1),
  embedding: EmbeddingMetaSchema,
});
export type UpdateResponse = z.infer<typeof UpdateResponseSchema>;

// ---------- share ----------

export const ShareParamsSchema = z.object({
  id: z.string().uuid(),
});

export const ShareRequestSchema = z.object({
  callerDid: DidString,
  shareWith: z.array(DidString).min(1).max(256),
  expiresAt: z.string().datetime().optional(),
});
export type ShareRequest = z.infer<typeof ShareRequestSchema>;

export const ShareResponseSchema = z.object({
  id: z.string().uuid(),
  sharedWith: z.array(DidString),
});
export type ShareResponse = z.infer<typeof ShareResponseSchema>;
