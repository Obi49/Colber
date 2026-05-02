#!/usr/bin/env node
// @ts-check
/**
 * Prebuild step: copies the canonical Mermaid diagrams from `docs/diagrams/`
 * to `public/diagrams/` so the static export can fetch them at runtime
 * (the <ArchitectureDiagram /> client component does `fetch('/diagrams/colber-functional.md')`).
 *
 * Why a script instead of a symlink: the Docker build context only includes
 * `apps/site/` and `docs/diagrams/`. A symlink would dangle inside the image,
 * a script gives us a portable, deterministic copy.
 *
 * Run automatically via the `prebuild` npm script. Safe to re-run.
 */
import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..', '..', '..', 'docs', 'diagrams');
const DEST = path.resolve(__dirname, '..', 'public', 'diagrams');

async function main() {
  if (!existsSync(SRC)) {
    console.warn(
      `[copy-diagrams] WARNING: source ${SRC} not found, skipping. ` +
        'Architecture section will fall back to inline content.',
    );
    return;
  }

  await mkdir(DEST, { recursive: true });

  const entries = await readdir(SRC, { withFileTypes: true });
  const mds = entries.filter((e) => e.isFile() && e.name.endsWith('.md'));

  for (const entry of mds) {
    const src = path.join(SRC, entry.name);
    const dst = path.join(DEST, entry.name);
    await copyFile(src, dst);
    console.log(`[copy-diagrams] ${entry.name}`);
  }

  console.log(`[copy-diagrams] copied ${mds.length} file(s) → ${DEST}`);
}

main().catch((err) => {
  console.error('[copy-diagrams] FAILED:', err);
  process.exit(1);
});
