import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/server.ts', // composition root, exercised by integration tests at boot
        'src/config.ts', // pure env-loading wrapper around @colber/core-config
        'src/db/**', // schema/client/migrate require real Postgres
        'src/domain/memory-repository.ts', // drizzle adapter, exercised via testcontainers
        'src/domain/operator-resolver.ts', // raw SQL adapter, ditto
        'src/domain/vector-repository.ts', // pure types/interfaces
        'src/embeddings/provider.ts', // pure types/interfaces
        'src/qdrant/client.ts', // requires real Qdrant
        'src/grpc/**', // covered by separate gRPC test suite (TODO)
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
