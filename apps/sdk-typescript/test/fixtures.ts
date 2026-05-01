/**
 * Test fixtures — fixed base URLs and a `makeClient()` helper used across
 * service tests. Keeping URLs stable lets MSW handlers be defined ergonomically.
 */

import { ColberClient } from '../src/client.js';

import type { ColberClientOptions } from '../src/client.js';
import type { BaseUrls } from '../src/types.js';

export const TEST_BASE_URLS: BaseUrls = {
  identity: 'http://identity.test',
  reputation: 'http://reputation.test',
  memory: 'http://memory.test',
  observability: 'http://observability.test',
  negotiation: 'http://negotiation.test',
  insurance: 'http://insurance.test',
};

/**
 * Creates a client wired to the test base URLs. Default retry config is
 * `{ count: 0 }` so most tests fail fast without waiting on backoff. Tests
 * that exercise retry logic override this explicitly.
 *
 * `sleep` is a no-op so retry-tests don't pause the suite.
 */
export const makeClient = (overrides: Partial<ColberClientOptions> = {}): ColberClient =>
  new ColberClient({
    baseUrls: TEST_BASE_URLS,
    timeoutMs: 1_000,
    retries: { count: 0, backoffMs: 1 },
    sleep: () => Promise.resolve(),
    ...overrides,
  });
