import createMDX from '@next/mdx';

import type { NextConfig } from 'next';

const withMDX = createMDX({
  // MDX is wired in early so /docs and /blog can ship later without a config
  // change. No remark/rehype plugins are loaded yet — keep the build fast.
});

/**
 * Next.js 15 config for the Colber landing site.
 *
 * - `output: 'export'` makes the build emit a fully static `out/` directory
 *   that nginx-alpine serves (cf. Dockerfile + nginx.conf). No `server.js`
 *   ever runs — the bundle is CDN/static-friendly out of the box.
 * - `images.unoptimized: true` is required by the static export (no Image
 *   Optimization runtime). All images we ship are already optimized at source.
 * - `pageExtensions` lets us drop `.mdx` files into `src/app/**` once /docs
 *   and /blog land in later waves.
 */
const nextConfig: NextConfig = {
  output: 'export',
  reactStrictMode: true,
  poweredByHeader: false,
  pageExtensions: ['ts', 'tsx', 'mdx'],
  images: { unoptimized: true },
  trailingSlash: false,
  outputFileTracingRoot: __dirname,
};

export default withMDX(nextConfig);
