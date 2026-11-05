import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The default config `pnpm test` (and CI) runs. It matches the per-phase
// configs: the `@/` alias from tsconfig, the automatic JSX runtime, and one
// React instance for server-rendered component tests.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
    dedupe: ['react', 'react-dom'],
  },
  esbuild: { jsx: 'automatic' },
  test: { environment: 'node', pool: 'forks', maxWorkers: 1, minWorkers: 1 },
});
