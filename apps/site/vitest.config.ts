import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vitest + RTL config for the landing site.
 *
 * Three smoke tests live under `test/unit/`:
 *   - Quickstart.test.tsx   — renders + tab switch + copy button presence
 *   - i18n.test.ts          — EN/FR keys parity
 *   - modules.test.ts       — 5 modules, each with EN+FR title+description
 *
 * jsdom is enabled because Quickstart is a client component. The site has no
 * server-side data fetching, so node-only suites would be sufficient — but
 * keeping a single environment keeps DX simple.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['test/unit/**/*.test.{ts,tsx}'],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    setupFiles: ['./test/unit/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@content': path.resolve(__dirname, 'content'),
    },
  },
});
