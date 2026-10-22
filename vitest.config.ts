import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Colyseus' monitoring dependency uses process.send; isolate tests in threads instead of IPC forks.
    pool: 'threads',
    include: ['apps/*/src/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
    exclude: ['**/*.slow.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/engine/src/**/*.ts'],
      exclude: ['**/*.test.ts'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: {
        perFile: true,
        lines: 90,
        branches: 90,
        functions: 90,
        statements: 90,
      },
    },
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
