import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: [
      'tests/**/*.{test,spec}.ts',
      'server/__tests__/**/*.{test,spec}.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/.git/**',
      'tests/agent_tests/**',
      'tests/memory_tests/**',
    ],
    environment: 'node',
    globals: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'server/**/*.ts',
      ],
      exclude: [
        'server/__tests__/**',
        'server/index.ts',
        '**/node_modules/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client/src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});
