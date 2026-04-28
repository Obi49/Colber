// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';

/**
 * Build the base Praxis ESLint flat config.
 *
 * @param {object} options
 * @param {string} options.tsconfigRootDir Absolute path to the repo root,
 *   typically `import.meta.dirname` from the consuming `eslint.config.js`.
 *   Required so eslint resolves the per-package `tsconfig.eslint.json`
 *   files relative to a stable anchor (not `process.cwd()`), letting both
 *   `pnpm lint` (per-package cwd) and `lint-staged` (repo-root cwd) work.
 * @returns {import('eslint').Linter.Config[]}
 */
export const buildBaseConfig = ({ tsconfigRootDir }) => [
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    plugins: {
      import: importPlugin,
    },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: {
        // Each workspace package ships a `tsconfig.eslint.json` that
        // re-includes test files & tooling configs which the build
        // `tsconfig.json` excludes (`*.test.ts`, `vitest.config.ts`,
        // `drizzle.config.ts`). The glob list below + `tsconfigRootDir`
        // pin the resolution to absolute paths so eslint works from any
        // cwd (turbo runs each package, lint-staged runs from repo root).
        project: ['./packages/*/tsconfig.eslint.json', './apps/*/tsconfig.eslint.json'],
        tsconfigRootDir,
      },
    },
    rules: {
      // TypeScript hygiene
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true, allowNullish: false },
      ],

      // Imports
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'type'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import/no-duplicates': 'error',

      // General hygiene
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      curly: ['error', 'all'],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
    },
  },
  prettierConfig,
];

export default buildBaseConfig;
