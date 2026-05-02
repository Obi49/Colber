import type { Config } from 'tailwindcss';

/**
 * Tailwind v4 config for the Colber landing site.
 *
 * Tokens (colors, fonts) live in `src/app/globals.css` under `@theme`. This
 * file only carries what still needs to be expressed in JS: the `content`
 * glob (autodetection works but pinning speeds up builds) and the `darkMode`
 * strategy. The brand-* color scale is exposed as utility classes via the
 * `@theme` declarations in globals.css, mirroring the operator-console.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}', './content/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
