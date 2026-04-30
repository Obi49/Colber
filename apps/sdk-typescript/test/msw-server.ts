/**
 * Singleton MSW server shared by all tests. Handlers are registered per-file
 * via `server.use(...)`; `setup.ts` resets the handler list after each test.
 */

import { setupServer } from 'msw/node';

export const server = setupServer();
