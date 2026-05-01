/**
 * Stdio transport for `@colber/mcp`.
 *
 * Uses the official `@modelcontextprotocol/sdk` to wire a low-level `Server`
 * to a `StdioServerTransport`. The transport reads JSON-RPC frames from
 * stdin and writes responses to stdout — this is the canonical mode for
 * local MCP clients (Claude Desktop, Claude Code, Cline, Continue).
 *
 * Why call `setRequestHandler` instead of `server.tool()` ? The high-level
 * helper isn't stable across `@modelcontextprotocol/sdk` minor versions
 * (v1.0 vs v1.x added/renamed it). The low-level `setRequestHandler` API
 * has been stable since v0.5 and gives us full control over the response
 * shape — exactly what we want.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import type { Logger } from '../logger.js';
import type { ToolRegistry } from '../tools/index.js';

export interface StdioTransportOptions {
  readonly registry: ToolRegistry;
  readonly logger: Logger;
  /** Name advertised in the MCP `initialize` handshake. Default: `colber`. */
  readonly serverName?: string;
  /** Version advertised in the handshake. Default: package version. */
  readonly serverVersion?: string;
}

export const buildStdioServer = (opts: StdioTransportOptions): Server => {
  const server = new Server(
    {
      name: opts.serverName ?? 'colber',
      version: opts.serverVersion ?? '0.1.0',
    },
    {
      capabilities: { tools: {} },
    },
  );

  // --- tools/list ---
  server.setRequestHandler(ListToolsRequestSchema, () => {
    const tools = opts.registry.list();
    return { tools };
  });

  // --- tools/call ---
  // SDK 1.29.0 widened the result type with optional task fields for async-task
  // results. Our registry only emits the standard `{ content, isError? }` shape,
  // which is structurally compatible. The cast bridges TS's exhaustiveness check.
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = request.params.arguments ?? {};
    const result = await opts.registry.call(name, args, { logger: opts.logger });
    return result as never;
  });

  return server;
};

export const startStdioTransport = async (opts: StdioTransportOptions): Promise<void> => {
  const server = buildStdioServer(opts);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  opts.logger.info({ tools: opts.registry.size(), transport: 'stdio' }, 'colber-mcp ready (stdio)');
};
