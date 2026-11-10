import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { demoMediaFromSnapshot } from './src/providers/catalogBridge';
import { packDemoMedia } from './src/providers/demoMedia';
import { supabaseSettings } from './src/providers/supabaseSettings';

const root = path.dirname(fileURLToPath(import.meta.url));
const iconRoot = path.join(root, 'ICONS', 'NexG_Discovery_Icons');

/**
 * Demo photos for the Supabase provider's demo rows (plan steps E1 and E2), packed from the demo API
 * snapshot the first time the provider asks. Only demo IDs get them; the snapshot is never served.
 */
function demoMediaModule(): Plugin {
  const id = 'virtual:nexg-demo-media';
  const resolved = `\0${id}`;
  const snapshot = path.join(root, 'demo-seed', 'source', 'demo-api-snapshot.json');
  return {
    name: 'nexg-demo-media',
    resolveId(source) { return source === id ? resolved : undefined; },
    load(source) {
      if (source !== resolved) return undefined;
      // A checkout without the snapshot (such as the public code-only branch) builds with no demo photos.
      if (!existsSync(snapshot)) return 'export default { version: 1, urls: [], hero: [], logo: [], item: [] };';
      this.addWatchFile(snapshot);
      // trimStart also drops a byte-order mark.
      const media = demoMediaFromSnapshot(JSON.parse(readFileSync(snapshot, 'utf8').trimStart()));
      return `export default ${JSON.stringify(packDemoMedia(media))};`;
    },
  };
}

/** Serve and emit the final PNGs unchanged. Original files live in one canonical pack. */
function discoveryIconAssets(): Plugin {
  const taxonomy = JSON.parse(readFileSync(path.join(root, 'docs/discovery/TAXONOMY_V1.1.json'), 'utf8').replace(/^\uFEFF/, ''));
  const references: string[] = taxonomy.categories.flatMap((category: { icon_reference?: string; subcategories: { icon_reference?: string }[] }) => [category.icon_reference, ...category.subcategories.map((subcategory) => subcategory.icon_reference)]).filter(Boolean);
  const files = new Map(references.map((reference) => {
    const relative = reference.replace(/^references\/icons-v1\.1\/NexG_Discovery_Icons\//, '');
    if (relative.includes('..') || !relative.endsWith('.png')) throw new Error('Invalid discovery icon reference');
    return [relative, path.join(iconRoot, relative)];
  }));
  return {
    name: 'nexg-final-icon-pack',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = request.url?.split('?')[0] ?? '';
        if (!pathname.startsWith('/icons/')) return next();
        let relative: string;
        try { relative = decodeURIComponent(pathname.slice('/icons/'.length)); } catch { response.statusCode = 400; response.end(); return; }
        const file = files.get(relative);
        if (!file) { response.statusCode = 404; response.end(); return; }
        try {
          response.setHeader('Content-Type', 'image/png');
          response.setHeader('Cache-Control', 'no-cache');
          response.end(readFileSync(file));
        } catch { response.statusCode = 404; response.end(); }
      });
    },
    generateBundle() {
      // Pages load the web-sized copies (scripts/icons/build-web-icons.mjs), so an original ships only where no
      // copy exists, and only if this checkout has the pack (the public branch carries the web copies alone).
      for (const [relative, file] of files) {
        if (existsSync(path.join(root, 'assets', 'icons-web', relative.replace(/\.png$/, '.webp'))) || !existsSync(file)) continue;
        this.emitFile({ type: 'asset', fileName: `icons/${relative}`, source: readFileSync(file) });
      }
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, root, '');
  const apiPort = env.API_PORT || '3001';
  if (!/^\d{2,5}$/.test(apiPort) || Number(apiPort) > 65535) throw new Error('API_PORT must be a valid port');
  const port = Number(env.DISCOVERY_PORT || 5180);
  const enginePort = env.DISCOVERY_ENGINE_PORT || '5190';
  if (!/^\d{2,5}$/.test(enginePort) || Number(enginePort) > 65535) throw new Error('DISCOVERY_ENGINE_PORT must be a valid port');
  if (env.VITE_DISCOVERY_PROVIDER && !['platform', 'engine', 'supabase'].includes(env.VITE_DISCOVERY_PROVIDER)) throw new Error('VITE_DISCOVERY_PROVIDER must be platform or engine or supabase');
  // The browser reads Supabase directly with the public key, so its settings are checked before anything is served or built.
  if (env.VITE_DISCOVERY_PROVIDER === 'supabase') {
    const { origin } = supabaseSettings(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
    // A build for visitors must not point their browsers at the builder's own machine; local checks opt in.
    if (command === 'build' && new URL(origin).protocol === 'http:' && env.DISCOVERY_ALLOW_LOCAL_SUPABASE !== '1') {
      throw new Error('VITE_SUPABASE_URL points at a local Supabase. Set the hosted project URL for a release build, or DISCOVERY_ALLOW_LOCAL_SUPABASE=1 for a local check');
    }
  }
  // Where the app is served: "/" on its own, "/discover/" inside the NexG website (scripts/build-for-web.mjs).
  const base = env.DISCOVERY_BASE || '/';
  if (!base.startsWith('/') || !base.endsWith('/') || base.includes('//') || /[^a-zA-Z0-9_/-]/.test(base)) throw new Error('DISCOVERY_BASE must look like / or /discover/');
  const proxy = { '/api/discovery': { target: `http://127.0.0.1:${enginePort}`, changeOrigin: false }, '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false } };
  return {
    base,
    plugins: [react(), discoveryIconAssets(), demoMediaModule()],
    publicDir: false,
    server: { host: '127.0.0.1', port, strictPort: true, proxy },
    preview: { host: '127.0.0.1', port, strictPort: true, proxy },
  };
});
