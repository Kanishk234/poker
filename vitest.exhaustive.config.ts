import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'threads',
    include: ['packages/engine/src/**/*.slow.test.ts'],
    testTimeout: 120_000,
  },
});
