/**
 * Build-time constants derived from `package.json` and the public env.
 *
 * Inlined at compile time. The static export (`output: 'export'`) means there
 * is no Node runtime to read the package on demand — we read it once during
 * module initialization, while the bundler is still on the build host.
 */

// `resolveJsonModule` (set in `@colber/tsconfig/base.json`) lets us import
// the package manifest directly. Next.js's bundler inlines the value at
// build time, so this stays safe inside the static export.
import pkg from '../../package.json';

export const VERSION: string = pkg.version;

export const REPO_URL: string =
  process.env.NEXT_PUBLIC_REPO_URL ?? 'https://github.com/Obi49/Colber';

export const SITE_URL: string = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://colber.dev';

export const DISCUSSIONS_URL: string =
  process.env.NEXT_PUBLIC_DISCUSSIONS_URL ?? `${REPO_URL}/discussions`;

export const CONTACT_EMAIL: string =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'dof1502.mwm27@gmail.com';

export const NPM_URL = 'https://www.npmjs.com/package/@colber/sdk';
export const PYPI_URL = 'https://pypi.org/project/colber-sdk/';
export const MCP_URL = 'https://www.npmjs.com/package/@colber/mcp';
export const SPEC_URL = `${REPO_URL}#-vision-et-architecture`;
export const ARCHITECTURE_DOC_URL = `${REPO_URL}/blob/main/docs/ARCHITECTURE_BREAKDOWN.md`;
