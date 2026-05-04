/**
 * Streamable HTTP transport for `@colber/mcp`.
 *
 * Wires the MCP `Server` to the SDK's `StreamableHTTPServerTransport` over a
 * Node `http.Server`. A single endpoint, `POST | GET /mcp`, serves both
 * directions of the JSON-RPC channel:
 *   - `POST /mcp` carries client → server frames (`initialize`, `tools/list`,
 *     `tools/call`, …). The SDK responds inline (JSON or SSE depending on
 *     content negotiation).
 *   - `GET  /mcp` opens the standalone server → client SSE stream used for
 *     out-of-band notifications.
 *
 * Replaces the legacy SSE transport pair (`/mcp/sse` + `/mcp/messages`).
 * Modern MCP clients (Smithery scanner, Anthropic hosted Apps, mcp-remote)
 * speak Streamable HTTP only.
 *
 * Stateful mode: each successful `initialize` POST gets a fresh sessionId
 * (UUID), returned via the `Mcp-Session-Id` response header. The SDK
 * enforces presence + validity of that header on subsequent requests.
 */

import { randomUUID } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from 'node:http';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
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

export interface HttpTransportHandle {
  /** Close the underlying HTTP server. Resolves once existing sockets are drained. */
  readonly close: () => Promise<void>;
  /** Bound port — useful for tests that listen on port 0. */
  readonly port: number;
}

const MCP_PATH = '/mcp';
const HEALTH_PATH = '/healthz';
const SESSION_HEADER = 'mcp-session-id';

const buildMcpServer = (opts: HttpTransportOptions): Server => {
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

interface SessionState {
  readonly transport: StreamableHTTPServerTransport;
  readonly server: Server;
}

const writeJson = (res: ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readSessionId = (req: IncomingMessage): string | undefined => {
  const raw = req.headers[SESSION_HEADER];
  if (typeof raw === 'string' && raw.length > 0) {
    return raw;
  }
  // Node lower-cases header names; we read via the lowercase key above. The
  // array form only happens for set-cookie-like headers, which `mcp-session-id`
  // is not — but guard defensively to keep TS happy.
  if (Array.isArray(raw) && raw.length > 0 && raw[0] !== undefined) {
    return raw[0];
  }
  return undefined;
};

export const startHttpTransport = async (
  opts: HttpTransportOptions,
): Promise<HttpTransportHandle> => {
  // One transport + Server per active MCP session, keyed by `Mcp-Session-Id`.
  const sessions = new Map<string, SessionState>();

  const handleMcp = (req: IncomingMessage, res: ServerResponse): void => {
    const sessionId = readSessionId(req);

    if (sessionId !== undefined) {
      const session = sessions.get(sessionId);
      if (session === undefined) {
        // The SDK would also return 404 here, but it requires constructing a
        // throwaway transport first. Short-circuiting saves the allocation.
        writeJson(res, 404, { error: 'unknown session', sessionId });
        return;
      }
      void session.transport.handleRequest(req, res).catch((err: unknown) => {
        opts.logger.error({ err, sessionId }, 'streamable handleRequest failed');
      });
      return;
    }

    // No session header. For an `initialize` POST this is expected — we mint
    // a new transport. For any other call the SDK will reject with 400.
    if (req.method !== 'POST' && req.method !== 'GET') {
      writeJson(res, 405, { error: 'method not allowed' });
      return;
    }

    // `transport` and `server` are bound below; the SDK's `onsessioninitialized`
    // / `onclose` callbacks are invoked asynchronously after `handleRequest`
    // begins, so the closures over them are safe (the bindings exist by then).
    const state: { transport?: StreamableHTTPServerTransport; server?: Server } = {};

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id: string) => {
        if (state.transport !== undefined && state.server !== undefined) {
          sessions.set(id, { transport: state.transport, server: state.server });
          opts.logger.info({ sessionId: id }, 'mcp session opened');
        }
      },
      onsessionclosed: (id: string) => {
        sessions.delete(id);
        opts.logger.info({ sessionId: id }, 'mcp session closed (DELETE)');
      },
    });

    transport.onclose = () => {
      const id = transport.sessionId;
      if (id !== undefined && sessions.delete(id)) {
        opts.logger.info({ sessionId: id }, 'mcp session closed');
      }
    };
    transport.onerror = (err: Error) => {
      opts.logger.error({ err, sessionId: transport.sessionId }, 'mcp transport error');
    };

    const server = buildMcpServer(opts);
    state.transport = transport;
    state.server = server;

    // SDK 1.29.0: the `Transport` interface declares `onclose?: () => void`,
    // but `StreamableHTTPServerTransport.onclose` is typed `(() => void) |
    // undefined`. Under our tsconfig's `exactOptionalPropertyTypes: true`
    // the two are not assignable (the optional form forbids an explicit
    // `undefined`). Cast bridges this — runtime shape is identical, same
    // pattern as the `result as never` cast in stdio.ts.
    void server
      .connect(transport as never)
      .then(() => transport.handleRequest(req, res))
      .catch((err: unknown) => {
        opts.logger.error({ err }, 'streamable initialize failed');
      });
  };

  const httpServer: HttpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (url.pathname === HEALTH_PATH) {
      if (req.method !== 'GET') {
        writeJson(res, 405, { error: 'method not allowed' });
        return;
      }
      writeJson(res, 200, { status: 'ok', tools: opts.registry.size() });
      return;
    }

    if (url.pathname === MCP_PATH) {
      handleMcp(req, res);
      return;
    }

    writeJson(res, 404, { error: 'not found', path: url.pathname });
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(opts.port, opts.host, () => resolve());
  });

  const address = httpServer.address();
  const boundPort = typeof address === 'object' && address !== null ? address.port : opts.port;

  opts.logger.info(
    {
      host: opts.host,
      port: boundPort,
      tools: opts.registry.size(),
      transport: 'http',
      mcp: MCP_PATH,
    },
    'colber-mcp ready (http)',
  );

  const close = async (): Promise<void> => {
    // Close every active MCP session first so in-flight SSE streams shut down
    // cleanly, then close the listening server.
    await Promise.allSettled(Array.from(sessions.values()).map((s) => s.transport.close()));
    sessions.clear();
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  };

  return { close, port: boundPort };
};
