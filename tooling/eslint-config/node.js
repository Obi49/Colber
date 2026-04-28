// @ts-check
import globals from 'globals';

import { baseConfig } from './index.js';

/**
 * Node.js-specific ESLint flat config.
 * Adds Node globals on top of the base config.
 *
 * @type {import('eslint').Linter.Config[]}
 */
export const nodeConfig = [
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];

export default nodeConfig;
