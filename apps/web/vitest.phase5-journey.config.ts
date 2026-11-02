import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
    // The shared Home lives in a standalone preview package with its own React.
    // The SSR test must use the same React instance as this app's renderer.
    dedupe: ['react', 'react-dom'],
  },
  esbuild: { jsx: 'automatic' },
  test: { environment: 'node', pool: 'forks', maxWorkers: 1, minWorkers: 1 },
});
