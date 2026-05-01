import { getSignatureProvider, toBase64 } from '@colber/core-crypto';
import { describe, expect, it } from 'vitest';

import { IdentityService } from '../../src/domain/identity-service.js';
import { buildIdentityMcpRegistry } from '../../src/mcp/tools.js';
import { InMemoryAgentRepository } from '../fakes/in-memory-repo.js';

describe('MCP tools (identity)', () => {
  it('exposes the three required tools', () => {
    const repo = new InMemoryAgentRepository();
    const reg = buildIdentityMcpRegistry(new IdentityService(repo));
    const names = reg.list().map((t) => t.name);
    expect(names).toContain('identity.register');
    expect(names).toContain('identity.resolve');
    expect(names).toContain('identity.verify');
  });

  it('round-trips register → resolve → verify via the registry', async () => {
    const repo = new InMemoryAgentRepository();
    const svc = new IdentityService(repo);
    const reg = buildIdentityMcpRegistry(svc);

    const ed = getSignatureProvider('Ed25519');
    const kp = await ed.generateKeyPair();

    const registered = (await reg.invoke(
      'identity.register',
      { publicKey: toBase64(kp.publicKey), ownerOperatorId: 'op-mcp' },
      { traceId: 'trace-1' },
    )) as { did: string; agentId: string };
    expect(registered.did).toMatch(/^did:key:z6Mk/);

    const resolved = (await reg.invoke(
      'identity.resolve',
      { did: registered.did },
      { traceId: 'trace-2' },
    )) as { signatureScheme: string };
    expect(resolved.signatureScheme).toBe('Ed25519');

    const message = new TextEncoder().encode('mcp-roundtrip');
    const signature = await ed.sign(message, kp.privateKey);
    const verified = (await reg.invoke(
      'identity.verify',
      {
        did: registered.did,
        message: toBase64(message),
        signature: toBase64(signature),
      },
      { traceId: 'trace-3' },
    )) as { valid: boolean };
    expect(verified.valid).toBe(true);
  });
});
