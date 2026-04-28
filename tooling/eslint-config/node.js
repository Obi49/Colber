// @ts-check
import globals from 'globals';

import { buildBaseConfig } from './index.js';

/**
 * Node.js-specific ESLint flat config builder.
 * Adds Node globals on top of the base config.
 *
 * @param {object} options
 * @param {string} options.tsconfigRootDir Absolute path to the repo root.
 *   See {@link buildBaseConfig} for why this is required.
 * @returns {import('eslint').Linter.Config[]}
 */
export const buildNodeConfig = ({ tsconfigRootDir }) => [
  ...buildBaseConfig({ tsconfigRootDir }),
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];

export default buildNodeConfig;
