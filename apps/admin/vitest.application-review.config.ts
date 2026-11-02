import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) }, dedupe: ['react', 'react-dom'] },
  esbuild: { jsx: 'automatic' },
  test: { environment: 'node', pool: 'forks', maxWorkers: 1, minWorkers: 1 },
});
