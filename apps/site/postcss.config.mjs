/**
 * PostCSS config for Tailwind v4. The `@tailwindcss/postcss` plugin
 * replaces the v3 `tailwindcss` plugin and handles `@import "tailwindcss"`
 * + `@theme` directives natively. Kept identical to apps/operator-console.
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
