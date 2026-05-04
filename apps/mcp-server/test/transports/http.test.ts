/**
 * Integration test for the Streamable HTTP transport.
 *
 * Boots a real `startHttpTransport(...)` against an ephemeral port and drives
 * it with Node's built-in `fetch`. We let the SDK's
 * `StreamableHTTPServerTransport` run end-to-end — mocking it would force us
 * to reimplement most of the protocol the test is meant to cover.
 *
 * Coverage:
 *   - `/healthz`                                   → 200 + `{status, tools}`
 *   - POST `/mcp` `initialize`                     → 200 + `Mcp-Session-Id` header
 *   - POST `/mcp` `tools/list` w/ valid session    → returns the registered tools
 *   - POST `/mcp` non-init w/o session header      → 400
 *   - POST `/mcp` w/ unknown session header        → 404
 *   - GET  `/mcp` w/ valid session                 → 200 + `text/event-stream`
 *   - GET  `/unknown`                              → 404
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildToolRegistry } from '../../src/tools/index.js';
import { startHttpTransport, type HttpTransportHandle } from '../../src/transports/http.js';
import { FakeSdkClient } from '../fakes/fake-sdk-client.js';
import { silentLogger } from '../helpers.js';

// We send `2025-06-18` on the `initialize` body. The SDK negotiates and
// returns its own version in the response — for subsequent requests we omit
// the protocol header and let the SDK default to the negotiated value
// (the SDK's documented behaviour for that header's absence).
const CLIENT_PROTOCOL_VERSION = '2025-06-18';

interface JsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly id: number | string;
  readonly method: string;
  readonly params?: unknown;
}

const initFrame = (id: number): JsonRpcRequest => ({
  jsonrpc: '2.0',
  id,
  method: 'initialize',
  params: {
    protocolVersion: CLIENT_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'http-test', version: '0.0.0' },
  },
});

const listToolsFrame = (id: number): JsonRpcRequest => ({
  jsonrpc: '2.0',
  id,
  method: 'tools/list',
});

/**
 * Read a JSON-RPC response that the SDK delivered as an SSE-encoded body
 * (`event: message\ndata: <json>\n\n`). The SDK picks SSE over JSON when the
 * `Accept` header includes `text/event-stream`, which we always send.
 */
const readJsonRpcSse = async (
  res: Response,
): Promise<{ readonly result?: unknown; readonly error?: unknown }> => {
  const text = await res.text();
  const dataLine = text.split('\n').find((l) => l.startsWith('data:'));
  if (dataLine === undefined) {
    throw new Error(`no SSE data frame in response body: ${text.slice(0, 200)}`);
  }
  return JSON.parse(dataLine.slice('data:'.length).trim()) as { result?: unknown; error?: unknown };
};

// Using `Record<string, string>` (rather than `HeadersInit`) keeps the
// typescript-eslint `no-unsafe-assignment` rule happy when this object is
// passed to `fetch({ headers: ... })` — `HeadersInit`'s union with the
// `Headers` class confuses the type-aware ruleset into flagging spread
// objects as `error`-typed.
const mcpHeaders = (sessionId?: string): Record<string, string> => ({
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
  ...(sessionId !== undefined ? { 'mcp-session-id': sessionId } : {}),
});

describe('streamable HTTP transport', () => {
  let handle: HttpTransportHandle;
  let baseUrl: string;

  beforeEach(async () => {
    const sdk = new FakeSdkClient();
    const registry = buildToolRegistry(sdk);
    handle = await startHttpTransport({
      registry,
      logger: silentLogger(),
      host: '127.0.0.1',
      // Port 0 → kernel picks a free port; we read the bound value from the handle.
      port: 0,
    });
    baseUrl = `http://127.0.0.1:${handle.port}`;
  });

  afterEach(async () => {
    await handle.close();
  });

  it('GET /healthz returns 200 with status + tool count', async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    const body = (await res.json()) as { readonly status: string; readonly tools: number };
    expect(body.status).toBe('ok');
    expect(body.tools).toBe(27);
  });

  it('POST /mcp `initialize` returns 200 with Mcp-Session-Id header', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: mcpHeaders(),
      body: JSON.stringify(initFrame(1)),
    });

    expect(res.status).toBe(200);
    const sessionId = res.headers.get('mcp-session-id');
    expect(sessionId).toMatch(/^[0-9a-f-]{36}$/i);

    const body = await readJsonRpcSse(res);
    const result = body.result as {
      readonly protocolVersion?: string;
      readonly capabilities?: unknown;
    };
    expect(typeof result.protocolVersion).toBe('string');
    expect(result.capabilities).toBeDefined();
  });

  it('POST /mcp `tools/list` with a valid session header returns the 27 registered tools', async () => {
    // 1. Initialize to capture a session id.
    const initRes = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: mcpHeaders(),
      body: JSON.stringify(initFrame(1)),
    });
    expect(initRes.status).toBe(200);
    // Drain the body so the connection is fully released before the next call.
    await initRes.text();
    const sessionId = initRes.headers.get('mcp-session-id');
    expect(sessionId).not.toBeNull();

    // 2. The SDK requires the `notifications/initialized` notification before
    //    handling further requests on the session.
    const notifyRes = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: mcpHeaders(sessionId ?? undefined),
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });
    expect(notifyRes.status).toBe(202);
    await notifyRes.text();

    // 3. List tools.
    const listRes = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: mcpHeaders(sessionId ?? undefined),
      body: JSON.stringify(listToolsFrame(2)),
    });
    expect(listRes.status).toBe(200);
    const body = await readJsonRpcSse(listRes);
    const result = body.result as { readonly tools: readonly { readonly name: string }[] };
    expect(result.tools.length).toBe(27);
    expect(result.tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(['colber_identity_register', 'colber_insurance_quote']),
    );
  });

  it('POST /mcp without Mcp-Session-Id for a non-init method is rejected', async () => {
    // The transport accepts the POST (no session header → assumes initialize),
    // but the SDK responds with a JSON-RPC error since the body is `tools/list`.
    // The HTTP status reflects "bad request" (400 in stateful mode).
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: mcpHeaders(),
      body: JSON.stringify(listToolsFrame(99)),
    });
    expect(res.status).toBe(400);
    await res.body?.cancel();
  });

  it('POST /mcp with an unknown Mcp-Session-Id returns 404', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: mcpHeaders('00000000-0000-0000-0000-000000000000'),
      body: JSON.stringify(listToolsFrame(99)),
    });
    expect(res.status).toBe(404);
    await res.body?.cancel();
  });

  it('GET /mcp with a valid session opens an SSE stream', async () => {
    // Establish a session first.
    const initRes = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: mcpHeaders(),
      body: JSON.stringify(initFrame(1)),
    });
    expect(initRes.status).toBe(200);
    await initRes.text();
    const sessionId = initRes.headers.get('mcp-session-id');
    expect(sessionId).not.toBeNull();

    // GET /mcp opens the standalone notifications stream.
    const controller = new AbortController();
    const sseRes = await fetch(`${baseUrl}/mcp`, {
      method: 'GET',
      headers: {
        accept: 'text/event-stream',
        'mcp-session-id': sessionId ?? '',
      },
      signal: controller.signal,
    });
    expect(sseRes.status).toBe(200);
    expect(sseRes.headers.get('content-type')).toMatch(/text\/event-stream/);
    // Don't drain — the stream stays open. Abort to free the socket so the
    // afterEach `handle.close()` returns promptly.
    controller.abort();
    await sseRes.body?.cancel().catch(() => undefined);
  });

  it('GET /unknown returns 404', async () => {
    const res = await fetch(`${baseUrl}/unknown`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { readonly error: string };
    expect(body.error).toBe('not found');
  });
});
