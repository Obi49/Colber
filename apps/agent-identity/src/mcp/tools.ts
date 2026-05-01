import { defineMcpTool, McpToolRegistry } from '@colber/core-mcp';
import { z } from 'zod';

import type { IdentityService } from '../domain/identity-service.js';

/**
 * MCP tools exposed by the agent-identity service.
 * Names follow the Colber convention `<module>.<verb>` (cf. ADR §0.2.3).
 */
export const buildIdentityMcpRegistry = (service: IdentityService): McpToolRegistry => {
  const registry = new McpToolRegistry();

  registry.register(
    defineMcpTool({
      name: 'identity.register',
      version: '1.0.0',
      description:
        'Register a new agent identity from an Ed25519 public key. Returns the derived did:key, the internal agent UUID, and the registration timestamp.',
      inputSchema: z.object({
        publicKey: z.string().min(1).describe('Ed25519 public key, base64 (32 raw bytes)'),
        ownerOperatorId: z.string().min(1).max(128),
      }),
      outputSchema: z.object({
        did: z.string(),
        agentId: z.string().uuid(),
        registeredAt: z.string().datetime(),
      }),
      handler: async (input) => {
        const identity = await service.register({
          publicKeyBase64: input.publicKey,
          ownerOperatorId: input.ownerOperatorId,
        });
        return {
          did: identity.did,
          agentId: identity.agentId,
          registeredAt: identity.registeredAt,
        };
      },
    }),
  );

  registry.register(
    defineMcpTool({
      name: 'identity.resolve',
      version: '1.0.0',
      description: 'Resolve a DID to its agent record.',
      inputSchema: z.object({ did: z.string().min(1) }),
      outputSchema: z.object({
        did: z.string(),
        agentId: z.string().uuid(),
        publicKey: z.string(),
        signatureScheme: z.string(),
        ownerOperatorId: z.string(),
        registeredAt: z.string().datetime(),
        revokedAt: z.string().datetime().nullable(),
      }),
      handler: async (input) => service.resolve(input.did),
    }),
  );

  registry.register(
    defineMcpTool({
      name: 'identity.verify',
      version: '1.0.0',
      description:
        'Verify a signature against the public key bound to a DID. Returns { valid: true|false }.',
      inputSchema: z.object({
        did: z.string().min(1),
        message: z.string().min(1).describe('base64-encoded message bytes'),
        signature: z.string().min(1).describe('base64-encoded signature bytes'),
      }),
      outputSchema: z.object({
        valid: z.boolean(),
        reason: z.string().optional(),
      }),
      handler: async (input) =>
        service.verify({
          did: input.did,
          messageBase64: input.message,
          signatureBase64: input.signature,
        }),
    }),
  );

  return registry;
};
