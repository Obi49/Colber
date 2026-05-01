import { defineConfig } from 'tsup';

/**
 * Build config for `@colber/sdk`.
 *
 * Emits both ESM and CJS in one shot, plus `.d.ts` for each entry point.
 * Two entry points correspond to the package's two `exports`:
 *   - `.`        → src/index.ts          (ColberClient + service surface)
 *   - `./crypto` → src/crypto/index.ts   (DID:key, signing, JCS)
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'crypto/index': 'src/crypto/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  splitting: false,
  treeshake: true,
  minify: false,
});
