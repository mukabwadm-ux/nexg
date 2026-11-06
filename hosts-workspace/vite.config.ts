import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/nexg-hosts-workspace/',
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL('../apps/web/public/nexg-hosts-workspace/', import.meta.url)),
    emptyOutDir: false,
  },
});
