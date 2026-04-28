import { PraxisError } from '@praxis/core-types';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { McpToolRegistry } from './registry.js';
import { defineMcpTool } from './tool.js';

const echoTool = defineMcpTool({
  name: 'test.echo',
  version: '1.0.0',
  description: 'echo input back',
  inputSchema: z.object({ text: z.string().min(1) }),
  outputSchema: z.object({ text: z.string() }),
  handler: async (input) => Promise.resolve({ text: input.text }),
});

describe('McpToolRegistry', () => {
  it('registers and lists tools', () => {
    const reg = new McpToolRegistry();
    reg.register(echoTool);
    expect(reg.has('test.echo')).toBe(true);
    expect(reg.list()).toHaveLength(1);
  });

  it('rejects double registration', () => {
    const reg = new McpToolRegistry();
    reg.register(echoTool);
    expect(() => reg.register(echoTool)).toThrow(/already registered/);
  });

  it('invokes a tool with valid input', async () => {
    const reg = new McpToolRegistry();
    reg.register(echoTool);
    const out = await reg.invoke('test.echo', { text: 'hi' }, { traceId: 't1' });
    expect(out).toEqual({ text: 'hi' });
  });

  it('throws PraxisError on invalid input', async () => {
    const reg = new McpToolRegistry();
    reg.register(echoTool);
    await expect(reg.invoke('test.echo', { text: '' }, { traceId: 't1' })).rejects.toBeInstanceOf(
      PraxisError,
    );
  });

  it('throws PraxisError on unknown tool', async () => {
    const reg = new McpToolRegistry();
    await expect(reg.invoke('test.missing', {}, { traceId: 't1' })).rejects.toBeInstanceOf(
      PraxisError,
    );
  });
});
