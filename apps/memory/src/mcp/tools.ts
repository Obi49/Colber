import { defineMcpTool, McpToolRegistry } from '@colber/core-mcp';
import { z } from 'zod';

import {
  PayloadSchema,
  PermissionsSchema,
  SearchHitSchema,
  ShareResponseSchema,
  StoreResponseSchema,
  UpdateResponseSchema,
} from '../http/schemas.js';

import type { MemoryService } from '../domain/memory-service.js';

/**
 * MCP tools exposed by the memory service.
 * Names follow the Colber convention `<module>.<verb>` (cf. ADR §0.2.3 / CDC §2.5).
 */
export const buildMemoryMcpRegistry = (service: MemoryService): McpToolRegistry => {
  const registry = new McpToolRegistry();

  // ---------------------------------------------------------------------
  // memory.store
  // ---------------------------------------------------------------------
  registry.register(
    defineMcpTool({
      name: 'memory.store',
      version: '1.0.0',
      description:
        'Persist a new memory (text + structured payload). Generates an embedding via the configured provider. Returns the new memory id.',
      inputSchema: z.object({
        ownerDid: z.string().min(1).max(512),
        type: z.enum(['fact', 'event', 'preference', 'relation']),
        text: z.string().min(1).max(64_000),
        payload: PayloadSchema.optional(),
        permissions: PermissionsSchema,
        encryption: z.object({ enabled: z.boolean() }).optional(),
      }),
      outputSchema: StoreResponseSchema,
      handler: async (input) =>
        service.store({
          ownerDid: input.ownerDid,
          type: input.type,
          text: input.text,
          ...(input.payload !== undefined ? { payload: input.payload } : {}),
          permissions: {
            visibility: input.permissions.visibility,
            ...(input.permissions.sharedWith !== undefined
              ? { sharedWith: input.permissions.sharedWith }
              : {}),
          },
          ...(input.encryption !== undefined ? { encryption: input.encryption } : {}),
        }),
    }),
  );

  // ---------------------------------------------------------------------
  // memory.retrieve
  // ---------------------------------------------------------------------
  registry.register(
    defineMcpTool({
      name: 'memory.retrieve',
      version: '1.0.0',
      description:
        'Semantic search across memories visible to the caller (top-k by cosine similarity). Permission-aware: only memories the caller is allowed to see can be returned.',
      inputSchema: z.object({
        queryDid: z.string().min(1).max(512),
        queryText: z.string().min(1).max(8_000),
        topK: z.number().int().min(1).max(50).default(10),
        filters: z
          .object({
            type: z.enum(['fact', 'event', 'preference', 'relation']).optional(),
            ownerDid: z.string().min(1).max(512).optional(),
            visibility: z.enum(['private', 'operator', 'shared', 'public']).optional(),
          })
          .optional(),
      }),
      outputSchema: z.object({ hits: z.array(SearchHitSchema) }),
      handler: async (input) => {
        const filters =
          input.filters !== undefined
            ? {
                ...(input.filters.type !== undefined ? { type: input.filters.type } : {}),
                ...(input.filters.ownerDid !== undefined
                  ? { ownerDid: input.filters.ownerDid }
                  : {}),
                ...(input.filters.visibility !== undefined
                  ? { visibility: input.filters.visibility }
                  : {}),
              }
            : undefined;
        const hits = await service.retrieve({
          queryDid: input.queryDid,
          queryText: input.queryText,
          topK: input.topK ?? 10,
          ...(filters !== undefined ? { filters } : {}),
        });
        return { hits };
      },
    }),
  );

  // ---------------------------------------------------------------------
  // memory.update
  // ---------------------------------------------------------------------
  registry.register(
    defineMcpTool({
      name: 'memory.update',
      version: '1.0.0',
      description:
        "Update a memory's text and/or payload. Versioned (audit trail in memory_versions). Re-embeds when text changes. Owner-only.",
      inputSchema: z
        .object({
          id: z.string().uuid(),
          callerDid: z.string().min(1).max(512),
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
        }),
      outputSchema: UpdateResponseSchema,
      handler: async (input) =>
        service.update({
          id: input.id,
          callerDid: input.callerDid,
          ...(input.text !== undefined ? { text: input.text } : {}),
          ...(input.payload !== undefined ? { payload: input.payload } : {}),
        }),
    }),
  );

  // ---------------------------------------------------------------------
  // memory.share
  // ---------------------------------------------------------------------
  registry.register(
    defineMcpTool({
      name: 'memory.share',
      version: '1.0.0',
      description:
        'Grant additional agents read access to a memory. Owner-only. Optional `expiresAt` is recorded for future expiry enforcement.',
      inputSchema: z.object({
        id: z.string().uuid(),
        callerDid: z.string().min(1).max(512),
        shareWith: z.array(z.string().min(1).max(512)).min(1).max(256),
        expiresAt: z.string().datetime().optional(),
      }),
      outputSchema: ShareResponseSchema,
      handler: async (input) =>
        service.share({
          id: input.id,
          callerDid: input.callerDid,
          shareWith: input.shareWith,
          ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
        }),
    }),
  );

  return registry;
};
