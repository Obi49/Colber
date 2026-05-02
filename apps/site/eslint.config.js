// @ts-check
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildBaseConfig } from '@colber/eslint-config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

/**
 * Landing site ESLint config — mirrors apps/operator-console exactly so the
 * monorepo-wide `pnpm lint` produces a coherent result. Loosens the same
 * rules around React/Next idioms (default exports, untyped FormData).
 *
 * @type {import('eslint').Linter.Config[]}
 */
export default [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'dist/**',
      'coverage/**',
      '.turbo/**',
      'public/diagrams/**',
      'next-env.d.ts',
      'next.config.ts',
      'tailwind.config.ts',
      'postcss.config.mjs',
      'vitest.config.ts',
      'eslint.config.js',
      'scripts/**',
    ],
  },
  ...buildBaseConfig({ tsconfigRootDir: repoRoot }),
  {
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
];
