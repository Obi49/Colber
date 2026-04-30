/**
 * Vitest setup — boots an MSW node server with no handlers; per-test files
 * register their own handlers via `server.use(...)`.
 *
 * The server intercepts both `globalThis.fetch` (used by the default
 * `PraxisClient`) and any custom fetch the tests pass in (since msw/node
 * patches the `undici`/`node:http` dispatch under the hood). Tests that need
 * to assert request shape capture the request via the handler closure.
 */

import { afterAll, afterEach, beforeAll } from 'vitest';

import { server } from './msw-server.js';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
