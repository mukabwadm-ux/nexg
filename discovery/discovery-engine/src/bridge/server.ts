import Fastify from 'fastify';
import { BridgeError, merchantQuery, type CatalogBridge, type CatalogRows } from '../adapters/supabase/catalogBridge.js';

export interface BridgeServerOptions {
  bridge: CatalogBridge;
  load: () => Promise<CatalogRows>;
  /** How often the catalog is re-read from Supabase. */
  refreshMs?: number;
  /** After this long without a successful read, answers become 503 instead of old data. */
  staleAfterMs?: number;
  now?: () => number;
}

/** Read-only HTTP face of the catalog bridge, in the demo API's shape (plan step E1). */
export function buildBridgeServer(options: BridgeServerOptions) {
  const now = options.now ?? Date.now;
  const staleAfter = options.staleAfterMs ?? 5 * 60_000;
  let lastError: string | undefined;
  let refreshing: Promise<void> | undefined;
  const refresh = () => refreshing ??= (async () => {
    try { options.bridge.replace(await options.load(), now()); lastError = undefined; }
    catch (error) { lastError = error instanceof Error ? error.message : 'Catalog refresh failed'; }
  })().finally(() => { refreshing = undefined; });
  const fresh = (): void => {
    const loadedAt = options.bridge.loadedAt;
    if (loadedAt === undefined || now() - loadedAt > staleAfter) throw new BridgeError(503, lastError ?? 'The catalog has not loaded from Supabase yet');
  };

  const app = Fastify({ logger: false, routerOptions: { maxParamLength: 256 } });
  app.addHook('onRequest', async (_request, reply) => { reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff'); });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof BridgeError) return reply.code(error.status).send({ error: error.message });
    return reply.code(500).send({ error: 'Catalog bridge failure' });
  });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'Not found' }));
  app.get('/api/merchants', async request => { fresh(); return options.bridge.merchants(merchantQuery(request.query as Record<string, unknown>)); });
  app.get<{ Params: { id: string } }>('/api/merchants/:id', async request => { fresh(); return options.bridge.merchant(request.params.id); });
  app.get('/api/areas', async () => { fresh(); return options.bridge.areas(); });
  app.get('/health', async (_request, reply) => {
    const loadedAt = options.bridge.loadedAt;
    const ok = loadedAt !== undefined && now() - loadedAt <= staleAfter;
    return reply.code(ok ? 200 : 503).send({ status: ok ? 'ok' : loadedAt === undefined ? 'loading' : 'stale', source: 'supabase',
      ...(loadedAt !== undefined ? { loadedAt: new Date(loadedAt).toISOString() } : {}), ...options.bridge.size, ...(lastError ? { lastError } : {}) });
  });

  const timer = setInterval(() => { void refresh(); }, options.refreshMs ?? 30_000);
  timer.unref();
  app.addHook('onClose', async () => { clearInterval(timer); await refreshing; });
  return { app, refresh };
}
