/**
 * MCP tools for the `memory` module.
 *
 * Mirrors `apps/memory/src/mcp/tools.ts`:
 *   - colber_memory_store
 *   - colber_memory_retrieve   (semantic search via `sdk.memory.search`)
 *   - colber_memory_update
 *   - colber_memory_share
 */

import { z } from 'zod';

import type { ToolRegistry } from './registry.js';
import type { ColberClient } from '@colber/sdk';

const MemoryTypeSchema = z.enum(['fact', 'event', 'preference', 'relation']);
const VisibilitySchema = z.enum(['private', 'operator', 'shared', 'public']);

const PermissionsSchema = z.object({
  visibility: VisibilitySchema,
  sharedWith: z.array(z.string().min(1).max(512)).max(256).optional(),
});

const PayloadSchema = z.record(z.unknown());

export const registerMemoryTools = (registry: ToolRegistry, sdk: ColberClient): void => {
  registry.register({
    name: 'colber_memory_store',
    description:
      '[Colber] Persist a new memory (text + structured payload). Generates an embedding via the configured provider. Returns the new memory id.',
    inputSchema: z.object({
      ownerDid: z.string().min(1).max(512),
      type: MemoryTypeSchema,
      text: z.string().min(1).max(64_000),
      payload: PayloadSchema.optional(),
      permissions: PermissionsSchema,
      encryption: z.object({ enabled: z.boolean() }).optional(),
    }),
    handler: (input) =>
      sdk.memory.store({
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
  });

  registry.register({
    name: 'colber_memory_retrieve',
    description:
      '[Colber] Semantic search across memories visible to the caller (top-k by cosine similarity). Permission-aware: only memories the caller is allowed to see can be returned.',
    inputSchema: z.object({
      queryDid: z.string().min(1).max(512),
      queryText: z.string().min(1).max(8_000),
      topK: z.number().int().min(1).max(50).optional(),
      filters: z
        .object({
          type: MemoryTypeSchema.optional(),
          ownerDid: z.string().min(1).max(512).optional(),
          visibility: VisibilitySchema.optional(),
        })
        .optional(),
    }),
    handler: async (input) => {
      const filters =
        input.filters !== undefined
          ? {
              ...(input.filters.type !== undefined ? { type: input.filters.type } : {}),
              ...(input.filters.ownerDid !== undefined ? { ownerDid: input.filters.ownerDid } : {}),
              ...(input.filters.visibility !== undefined
                ? { visibility: input.filters.visibility }
                : {}),
            }
          : undefined;
      return sdk.memory.search({
        queryDid: input.queryDid,
        queryText: input.queryText,
        ...(input.topK !== undefined ? { topK: input.topK } : {}),
        ...(filters !== undefined ? { filters } : {}),
      });
    },
  });

  registry.register({
    name: 'colber_memory_update',
    description:
      "[Colber] Update a memory's text and/or payload. Versioned (audit trail in memory_versions). Re-embeds when text changes. Owner-only.",
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
    handler: (input) =>
      sdk.memory.update({
        id: input.id,
        callerDid: input.callerDid,
        ...(input.text !== undefined ? { text: input.text } : {}),
        ...(input.payload !== undefined ? { payload: input.payload } : {}),
      }),
  });

  registry.register({
    name: 'colber_memory_share',
    description:
      '[Colber] Grant additional agents read access to a memory. Owner-only. Optional `expiresAt` is recorded for future expiry enforcement.',
    inputSchema: z.object({
      id: z.string().uuid(),
      callerDid: z.string().min(1).max(512),
      shareWith: z.array(z.string().min(1).max(512)).min(1).max(256),
      expiresAt: z.string().datetime().optional(),
    }),
    handler: (input) =>
      sdk.memory.share({
        id: input.id,
        callerDid: input.callerDid,
        shareWith: input.shareWith,
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      }),
  });
};
