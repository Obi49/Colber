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
        'src/db/migrate.ts',
        'src/db/client.ts', // requires real Postgres for meaningful coverage
        'src/neo4j/client.ts', // requires real Neo4j
        'src/redis/client.ts', // requires real Redis
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
