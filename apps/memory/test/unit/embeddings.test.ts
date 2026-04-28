import { describe, expect, it } from 'vitest';

import { buildEmbeddingProvider } from '../../src/embeddings/factory.js';
import { OllamaEmbeddingProvider } from '../../src/embeddings/ollama.js';
import { DeterministicStubProvider } from '../../src/embeddings/stub.js';

describe('DeterministicStubProvider', () => {
  it('produces vectors of the requested dimensionality', async () => {
    const p = new DeterministicStubProvider(768);
    const v = await p.embed('hello');
    expect(v).toBeInstanceOf(Float32Array);
    expect(v.length).toBe(768);
  });

  it('is deterministic across calls', async () => {
    const p = new DeterministicStubProvider(64);
    const a = await p.embed('the same text');
    const b = await p.embed('the same text');
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('produces different vectors for different inputs', async () => {
    const p = new DeterministicStubProvider(64);
    const a = await p.embed('first');
    const b = await p.embed('second');
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('emits unit vectors (L2-normalised)', async () => {
    const p = new DeterministicStubProvider(128);
    const v = await p.embed('any text');
    let norm = 0;
    for (const x of v) {
      norm += x * x;
    }
    expect(Math.sqrt(norm)).toBeCloseTo(1, 4);
  });

  it('handles batched calls', async () => {
    const p = new DeterministicStubProvider(64);
    const out = await p.embedBatch(['a', 'b', 'c']);
    expect(out).toHaveLength(3);
    expect(out[0]).not.toEqual(out[1]);
  });
});

describe('OllamaEmbeddingProvider', () => {
  it('decodes the legacy `embedding` shape', async () => {
    const fakeFetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ embedding: new Array(8).fill(0.5) }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )) as typeof fetch;
    const p = new OllamaEmbeddingProvider({
      url: 'http://stub',
      model: 'nomic-embed-text',
      dim: 8,
      fetchImpl: fakeFetch,
    });
    const v = await p.embed('hello');
    expect(Array.from(v)).toEqual(new Array(8).fill(0.5));
  });

  it('decodes the newer `embeddings` (array of arrays) shape', async () => {
    const fakeFetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ embeddings: [new Array(4).fill(0.1)] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )) as typeof fetch;
    const p = new OllamaEmbeddingProvider({
      url: 'http://stub',
      model: 'nomic-embed-text',
      dim: 4,
      fetchImpl: fakeFetch,
    });
    const v = await p.embed('hello');
    expect(v.length).toBe(4);
  });

  it('rejects vectors with the wrong dimensionality', async () => {
    const fakeFetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ embedding: [1, 2, 3] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )) as typeof fetch;
    const p = new OllamaEmbeddingProvider({
      url: 'http://stub',
      model: 'nomic-embed-text',
      dim: 768,
      fetchImpl: fakeFetch,
    });
    await expect(p.embed('hello')).rejects.toThrow(/dim 3, expected 768/);
  });

  it('surfaces non-2xx upstream responses as 502s', async () => {
    const fakeFetch = (() =>
      Promise.resolve(new Response('upstream offline', { status: 503 }))) as typeof fetch;
    const p = new OllamaEmbeddingProvider({
      url: 'http://stub',
      model: 'nomic-embed-text',
      dim: 768,
      fetchImpl: fakeFetch,
    });
    await expect(p.embed('hi')).rejects.toThrow(/Ollama embeddings call failed/);
  });

  it('rejects an empty embedding response', async () => {
    const fakeFetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ embedding: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )) as typeof fetch;
    const p = new OllamaEmbeddingProvider({
      url: 'http://stub',
      model: 'nomic-embed-text',
      dim: 768,
      fetchImpl: fakeFetch,
    });
    await expect(p.embed('hi')).rejects.toThrow(/empty embedding/);
  });

  it('refuses to embed empty text', async () => {
    const p = new OllamaEmbeddingProvider({
      url: 'http://stub',
      model: 'nomic-embed-text',
      dim: 768,
    });
    await expect(p.embed('')).rejects.toThrow(/non-empty/);
  });
});

describe('buildEmbeddingProvider', () => {
  it('returns the stub when MEMORY_EMBEDDING_PROVIDER=stub', () => {
    const p = buildEmbeddingProvider({
      provider: 'stub',
      dim: 64,
      model: 'praxis-stub',
      ollamaUrl: 'http://nope',
    });
    expect(p).toBeInstanceOf(DeterministicStubProvider);
    expect(p.dim).toBe(64);
  });

  it('returns the Ollama provider when MEMORY_EMBEDDING_PROVIDER=ollama', () => {
    const p = buildEmbeddingProvider({
      provider: 'ollama',
      dim: 768,
      model: 'nomic-embed-text',
      ollamaUrl: 'http://localhost:11434',
    });
    expect(p).toBeInstanceOf(OllamaEmbeddingProvider);
    expect(p.dim).toBe(768);
    expect(p.model).toBe('nomic-embed-text');
  });
});
