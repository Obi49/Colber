// @ts-check
import nodeConfig from '@praxis/eslint-config/node';

/** @type {import('eslint').Linter.Config[]} */
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
    ],
  },
  ...nodeConfig,
];
