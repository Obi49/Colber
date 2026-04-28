import { createHash } from 'node:crypto';

import type { EmbeddingProvider } from './provider.js';

/**
 * Deterministic, dependency-free embedding provider used in unit + integration
 * tests. Each text maps to the same vector across runs (so cosine similarity
 * is reproducible without spinning up Ollama).
 *
 * Algorithm:
 *   - SHA-256 the text → 32 bytes of seed material.
 *   - Stretch the seed across `dim` floats by re-hashing with a counter, and
 *     reinterpret the resulting bytes as `int32`s normalised into `[-1, 1]`.
 *   - L2-normalise so two stub embeddings are directly comparable via cosine
 *     similarity (which is what Qdrant computes when configured with `Cosine`).
 *
 * Two semantically related texts will NOT cluster the way a real model would.
 * The stub is for plumbing tests — never for retrieval-quality assertions.
 */
export class DeterministicStubProvider implements EmbeddingProvider {
  public readonly model: string;
  public readonly dim: number;

  constructor(dim = 768, model = 'praxis-stub-v1') {
    this.dim = dim;
    this.model = model;
  }

  public async embed(text: string): Promise<Float32Array> {
    const out = new Float32Array(this.dim);
    let counter = 0;
    let cursor = 0;
    while (cursor < this.dim) {
      const hash = createHash('sha256').update(`${text}|${counter}`, 'utf8').digest();
      // Reinterpret 32 bytes as 8 × int32 little-endian → 8 floats.
      for (let i = 0; i < hash.length / 4 && cursor < this.dim; i++) {
        const v = hash.readInt32LE(i * 4);
        // Map int32 to roughly [-1, 1].
        out[cursor++] = v / 2_147_483_648;
      }
      counter++;
    }
    // L2-normalise — keeps cosine similarity well-behaved for tests that
    // assert on score ordering.
    let norm = 0;
    for (const v of out) {
      norm += v * v;
    }
    const denom = Math.sqrt(norm) || 1;
    for (let i = 0; i < out.length; i++) {
      out[i] = (out[i] ?? 0) / denom;
    }
    return Promise.resolve(out);
  }

  public async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}
