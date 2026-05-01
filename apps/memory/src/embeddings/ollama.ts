import { ERROR_CODES, ColberError } from '@colber/core-types';

import type { EmbeddingProvider } from './provider.js';

/**
 * Ollama-backed embedding provider.
 *
 * Calls `POST {OLLAMA_URL}/api/embeddings` with `{ model, prompt }`.
 * The default model is `nomic-embed-text` which emits 768-dim vectors. Other
 * models (e.g. `mxbai-embed-large` at 1024 dims) only require updating
 * `MEMORY_EMBEDDING_DIM` and redeploying — no code changes.
 *
 * The endpoint shape is documented at:
 *   https://github.com/ollama/ollama/blob/main/docs/api.md#generate-embeddings
 *
 * Two implementation notes:
 *  1. We reject responses whose vector length disagrees with the configured
 *     `dim` — silent dimension drift would corrupt the Qdrant collection.
 *  2. We accept either `embedding: number[]` (legacy single-vector) or the
 *     newer `/api/embed` shape `embeddings: number[][]` to keep this client
 *     resilient across Ollama versions.
 */

interface OllamaEmbedResponse {
  embedding?: readonly number[];
  embeddings?: readonly (readonly number[])[];
}

export interface OllamaProviderOptions {
  readonly url: string;
  readonly model: string;
  readonly dim: number;
  /** Optional fetch override. Useful for tests. */
  readonly fetchImpl?: typeof fetch;
  /** Optional request timeout in ms (default 30s). */
  readonly timeoutMs?: number;
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  public readonly model: string;
  public readonly dim: number;
  private readonly url: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: OllamaProviderOptions) {
    this.url = options.url.replace(/\/$/, '');
    this.model = options.model;
    this.dim = options.dim;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  public async embed(text: string): Promise<Float32Array> {
    if (text.length === 0) {
      throw new ColberError(ERROR_CODES.VALIDATION_FAILED, 'embedding text must be non-empty', 400);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.url}/api/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt: text }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new ColberError(
          ERROR_CODES.INTERNAL_ERROR,
          `Ollama embeddings call failed: ${res.status} ${body.slice(0, 200)}`,
          502,
        );
      }
      const json = (await res.json()) as OllamaEmbedResponse;
      const vector = json.embedding ?? json.embeddings?.[0] ?? null;
      if (!vector || vector.length === 0) {
        throw new ColberError(
          ERROR_CODES.INTERNAL_ERROR,
          'Ollama returned an empty embedding',
          502,
        );
      }
      if (vector.length !== this.dim) {
        throw new ColberError(
          ERROR_CODES.INTERNAL_ERROR,
          `Ollama embedding has dim ${vector.length}, expected ${this.dim}`,
          502,
        );
      }
      return Float32Array.from(vector);
    } finally {
      clearTimeout(timer);
    }
  }

  public async embedBatch(texts: string[]): Promise<Float32Array[]> {
    // Sequential: Ollama's `/api/embeddings` does not support batching in
    // older releases. We keep this simple and predictable. Callers that
    // need throughput should batch upstream.
    const out: Float32Array[] = [];
    for (const t of texts) {
      out.push(await this.embed(t));
    }
    return out;
  }
}
