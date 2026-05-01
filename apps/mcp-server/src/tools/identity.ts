/**
 * MCP tools for the `agent-identity` module.
 *
 * Mirrors `apps/agent-identity/src/mcp/tools.ts`:
 *   - colber_identity_register
 *   - colber_identity_resolve
 *   - colber_identity_verify
 *
 * Tool names use the `colber_<module>_<verb>` convention (snake-case verb,
 * underscore-separated) to avoid collisions with other MCP servers a user
 * might have installed.
 */

import { z } from 'zod';

import type { ToolRegistry } from './registry.js';
import type { ColberClient } from '@colber/sdk';

export const registerIdentityTools = (registry: ToolRegistry, sdk: ColberClient): void => {
  registry.register({
    name: 'colber_identity_register',
    description:
      '[Colber] Register a new agent identity from an Ed25519 public key. Returns the derived did:key, the internal agent UUID, and the registration timestamp.',
    inputSchema: z.object({
      publicKey: z.string().min(1).describe('Ed25519 public key, base64 (32 raw bytes)'),
      ownerOperatorId: z.string().min(1).max(128),
    }),
    handler: (input) =>
      sdk.identity.register({
        publicKey: input.publicKey,
        ownerOperatorId: input.ownerOperatorId,
      }),
  });

  registry.register({
    name: 'colber_identity_resolve',
    description: '[Colber] Resolve a DID to its agent record.',
    inputSchema: z.object({
      did: z.string().min(1),
    }),
    handler: (input) => sdk.identity.resolve(input.did),
  });

  registry.register({
    name: 'colber_identity_verify',
    description:
      '[Colber] Verify a signature against the public key bound to a DID. Returns { valid: true|false }.',
    inputSchema: z.object({
      did: z.string().min(1),
      message: z.string().min(1).describe('base64-encoded message bytes'),
      signature: z.string().min(1).describe('base64-encoded signature bytes'),
    }),
    handler: (input) =>
      sdk.identity.verify({
        did: input.did,
        message: input.message,
        signature: input.signature,
      }),
  });
};
