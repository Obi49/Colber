// @ts-check
import { buildNodeConfig } from '@praxis/eslint-config/node';

/**
 * Root ESLint flat config. Pins `tsconfigRootDir` to this file's directory so
 * the per-package `tsconfig.eslint.json` globs in the shared base config
 * resolve correctly whether eslint is invoked from the repo root
 * (`lint-staged`) or from inside a package (`turbo run lint`).
 *
 * @type {import('eslint').Linter.Config[]}
 */
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/drizzle/meta/**',
      'tooling/eslint-config/**',
      // Root config files don't belong to any tsconfig.eslint.json — skip them.
      'eslint.config.js',
      'drizzle.config.ts',
      '**/drizzle.config.ts',
      'tooling/tsconfig/**',
    ],
  },
  ...buildNodeConfig({ tsconfigRootDir: import.meta.dirname }),
];
