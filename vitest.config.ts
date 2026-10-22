import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Colyseus' monitoring dependency uses process.send; isolate tests in threads instead of IPC forks.
    pool: 'threads',
    include: ['apps/*/src/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
