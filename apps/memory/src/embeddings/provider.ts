/**
 * Embedding provider abstraction.
 *
 * The Colber memory service is multi-provider by design (Voyage / Cohere /
 * Nomic / OpenAI / self-hosted via Ollama — see CDC R6). The domain layer
 * speaks to this interface only; the concrete implementation is selected at
 * boot time from `MEMORY_EMBEDDING_PROVIDER`.
 *
 * Vectors are returned as `Float32Array` — Qdrant accepts arrays of `number`
 * over the wire, but the `Float32Array` shape keeps memory pressure
 * predictable and makes batch endpoints zero-copy.
 */
export interface EmbeddingProvider {
  /** Stable identifier of the underlying model (e.g. `nomic-embed-text`). */
  readonly model: string;
  /** Vector dimensionality the provider emits. */
  readonly dim: number;
  /** Embed a single text. */
  embed(text: string): Promise<Float32Array>;
  /**
   * Embed a batch. Default implementations may simply iterate, but real
   * providers benefit from native batching (Ollama supports it; OpenAI does).
   */
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}
