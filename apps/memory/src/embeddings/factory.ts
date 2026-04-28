import { OllamaEmbeddingProvider } from './ollama.js';
import { DeterministicStubProvider } from './stub.js';

import type { EmbeddingProvider } from './provider.js';

/**
 * Build the embedding provider selected by `MEMORY_EMBEDDING_PROVIDER`.
 *
 * Selection lives behind this single dispatch point so the rest of the
 * service can depend on the abstract `EmbeddingProvider` interface alone.
 */
export interface EmbeddingFactoryOptions {
  readonly provider: 'ollama' | 'stub';
  readonly dim: number;
  readonly model: string;
  readonly ollamaUrl: string;
}

export const buildEmbeddingProvider = (opts: EmbeddingFactoryOptions): EmbeddingProvider => {
  switch (opts.provider) {
    case 'ollama':
      return new OllamaEmbeddingProvider({
        url: opts.ollamaUrl,
        model: opts.model,
        dim: opts.dim,
      });
    case 'stub':
      return new DeterministicStubProvider(opts.dim, opts.model);
    default: {
      // Compile-time exhaustiveness guard.
      const _exhaustive: never = opts.provider;
      throw new Error(`Unknown embedding provider: ${String(_exhaustive)}`);
    }
  }
};
