import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildToolRegistry } from '../../src/tools/index.js';
import { ToolRegistry, zodToJsonSchema } from '../../src/tools/registry.js';
import { FakeSdkClient } from '../fakes/fake-sdk-client.js';
import { newCtx } from '../helpers.js';

import type { ColberClient } from '@colber/sdk';

describe('ToolRegistry', () => {
  it('rejects duplicate registrations', () => {
    const r = new ToolRegistry();
    r.register({
      name: 't',
      description: 'd',
      inputSchema: z.object({}),
      handler: () => Promise.resolve({}),
    });
    expect(() =>
      r.register({
        name: 't',
        description: 'd',
        inputSchema: z.object({}),
        handler: () => Promise.resolve({}),
      }),
    ).toThrow(/already registered/);
  });

  it('returns a NOT_FOUND-style error for unknown tools', async () => {
    const r = new ToolRegistry();
    const result = await r.call('missing', {}, newCtx());
    expect(result.isError).toBe(true);
  });

  it('lists tools with their JSON schemas', () => {
    const r = new ToolRegistry();
    r.register({
      name: 'colber_x',
      description: 'desc',
      inputSchema: z.object({ a: z.string() }),
      handler: () => Promise.resolve({}),
    });
    const list = r.list();
    expect(list[0]?.name).toBe('colber_x');
    expect(list[0]?.description).toBe('desc');
    expect(list[0]?.inputSchema).toMatchObject({ type: 'object' });
  });
});

describe('buildToolRegistry', () => {
  it('registers exactly 27 tools across all 6 modules', () => {
    const sdk = new FakeSdkClient();
    const registry = buildToolRegistry(sdk as unknown as ColberClient);
    // 3 identity + 4 reputation + 4 memory + 8 observability + 4 negotiation + 4 insurance = 27
    expect(registry.size()).toBe(27);
  });

  it('every tool name has the colber_<module>_<verb> prefix', () => {
    const sdk = new FakeSdkClient();
    const registry = buildToolRegistry(sdk as unknown as ColberClient);
    for (const name of registry.names()) {
      expect(name).toMatch(
        /^colber_(identity|reputation|memory|observability|negotiation|insurance)_/,
      );
    }
  });
});

describe('zodToJsonSchema', () => {
  it('emits object/properties/required', () => {
    const s = zodToJsonSchema(z.object({ a: z.string(), b: z.number().optional() })) as {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(s.type).toBe('object');
    expect(Object.keys(s.properties)).toEqual(['a', 'b']);
    expect(s.required).toEqual(['a']);
  });

  it('handles enums', () => {
    const s = zodToJsonSchema(z.enum(['x', 'y'])) as { enum: string[] };
    expect(s.enum).toEqual(['x', 'y']);
  });

  it('handles arrays', () => {
    const s = zodToJsonSchema(z.array(z.number())) as {
      type: string;
      items: { type: string };
    };
    expect(s.type).toBe('array');
    expect(s.items.type).toBe('number');
  });
});
