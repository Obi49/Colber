/**
 * HTTP / SSE transport for `@colber/mcp`.
 *
 * Wires the MCP `Server` to the SDK's `SSEServerTransport` over a Node
 * `http.Server`. Two paths:
 *   - `GET  /mcp/sse`     opens an SSE stream for server → client messages.
 *   - `POST /mcp/messages` carries client → server JSON-RPC frames.
 *
 * Used when running `@colber/mcp` as a remote (shared) MCP server inside
 * a Docker / k8s cluster. For local clients (Claude Desktop), prefer the
 * stdio transport — it's lighter and avoids HTTP framing overhead.
 *
 * NOTE on SDK API: the `SSEServerTransport` constructor in
 * `@modelcontextprotocol/sdk` v1.x takes `(messagePath, response)` and
 * exposes a `.handlePostMessage(req, res)` method for the client → server
 * direction. We implement a minimal router around that.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import type { Logger } from '../logger.js';
import type { ToolRegistry } from '../tools/index.js';

export interface HttpTransportOptions {
  readonly registry: ToolRegistry;
  readonly logger: Logger;
  readonly host: string;
  readonly port: number;
  readonly serverName?: string;
  readonly serverVersion?: string;
}

const SSE_PATH = '/mcp/sse';
const MESSAGES_PATH = '/mcp/messages';

const buildHttpServer = (opts: HttpTransportOptions): Server => {
  const server = new Server(
    {
      name: opts.serverName ?? 'colber',
      version: opts.serverVersion ?? '0.1.0',
    },
    {
      capabilities: { tools: {} },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => {
    const tools = opts.registry.list();
    return { tools };
  });

  // SDK 1.29.0 widened the result type — see stdio.ts for the rationale on `as never`.
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = request.params.arguments ?? {};
    const result = await opts.registry.call(name, args, { logger: opts.logger });
    return result as never;
  });

  return server;
};

interface ConnectionState {
  readonly transport: SSEServerTransport;
  readonly server: Server;
}

export const startHttpTransport = async (opts: HttpTransportOptions): Promise<void> => {
  // We track active SSE sessions by sessionId so the POST /messages handler
  // can route to the right transport instance.
  const sessions = new Map<string, ConnectionState>();

  const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    // Health endpoint — useful for Docker HEALTHCHECK + k8s probes.
    if (req.method === 'GET' && url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', tools: opts.registry.size() }));
      return;
    }

    if (req.method === 'GET' && url.pathname === SSE_PATH) {
      const transport = new SSEServerTransport(MESSAGES_PATH, res);
      const server = buildHttpServer(opts);
      sessions.set(transport.sessionId, { transport, server });

      // Tear down when the client disconnects.
      res.on('close', () => {
        sessions.delete(transport.sessionId);
        opts.logger.debug({ sessionId: transport.sessionId }, 'sse session closed');
      });

      // `connect()` is fire-and-forget here — it resolves when the underlying
      // transport's `start()` resolves, which for SSE is immediate.
      void server.connect(transport).catch((err: unknown) => {
        opts.logger.error({ err }, 'sse connect failed');
      });
      opts.logger.info({ sessionId: transport.sessionId }, 'sse session opened');
      return;
    }

    if (req.method === 'POST' && url.pathname === MESSAGES_PATH) {
      const sessionId = url.searchParams.get('sessionId');
      if (sessionId === null) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'missing sessionId query parameter' }));
        return;
      }
      const session = sessions.get(sessionId);
      if (session === undefined) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'unknown sessionId' }));
        return;
      }
      void session.transport.handlePostMessage(req, res).catch((err: unknown) => {
        opts.logger.error({ err, sessionId }, 'handlePostMessage failed');
      });
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found', path: url.pathname }));
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(opts.port, opts.host, () => resolve());
  });

  opts.logger.info(
    {
      host: opts.host,
      port: opts.port,
      tools: opts.registry.size(),
      transport: 'http',
      sse: SSE_PATH,
      messages: MESSAGES_PATH,
    },
    'colber-mcp ready (http)',
  );
};
