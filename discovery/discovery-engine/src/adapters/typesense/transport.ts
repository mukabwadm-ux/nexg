import { IndexingError, requireIndex } from '../../indexing/contracts.js';

export interface TypesenseConnection { origin: string; apiKey: string; namespace?: string; fetcher?: typeof fetch }
export const typesenseManifest = Object.freeze({ id: 'typesense-derived-catalog', version: '1', catalogWrites: false,
  dataClasses: {
    sourceCatalogFields: { authority: 'READ_ONLY_EXTERNAL', owner: 'DiscoveryProvider' },
    publishedReleaseContext: { authority: 'READ_ONLY_EXTERNAL', owner: 'published-release' },
    derivedIndexGenerations: { authority: 'NEXG_AUTHORITATIVE', owner: 'discovery-engine', rebuildable: true },
  }, retries: 0 });

/** Every network operation is bounded. The API key never enters an error/result. */
export class TypesenseTransport {
  readonly #origin: URL; readonly #key: string; readonly #fetch: typeof fetch;
  readonly namespace: string;
  constructor(options: TypesenseConnection) {
    try { this.#origin = new URL(options.origin); } catch { throw new IndexingError('INVALID_SEARCH_ORIGIN'); }
    requireIndex(['http:', 'https:'].includes(this.#origin.protocol) && !this.#origin.username && !this.#origin.password
      && !this.#origin.search && !this.#origin.hash && this.#origin.pathname === '/', 'INVALID_SEARCH_ORIGIN');
    requireIndex(typeof options.apiKey === 'string' && options.apiKey.length >= 16 && options.apiKey.length <= 256 && !/[\s\u0000-\u001f]/.test(options.apiKey), 'INVALID_SEARCH_KEY');
    this.namespace = options.namespace ?? 'nexg_discovery';
    requireIndex(/^[a-z][a-z0-9_]{2,40}$/.test(this.namespace), 'INVALID_SEARCH_NAMESPACE');
    this.#key = options.apiKey; this.#fetch = options.fetcher ?? fetch;
  }
  collection(value: string): string {
    requireIndex(new RegExp(`^${this.namespace}_g_[a-f0-9]{32}$`).test(value), 'INVALID_GENERATION_NAME'); return value;
  }
  alias(purpose: 'serving' | 'evaluation'): string {
    requireIndex(purpose === 'serving' || purpose === 'evaluation', 'INVALID_ALIAS'); return `${this.namespace}_${purpose}`;
  }
  async request(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, signal: AbortSignal, options: { body?: unknown; jsonl?: string; maxBytes?: number; allow404?: boolean } = {}): Promise<string | null> {
    requireIndex(path.startsWith('/') && !path.startsWith('//') && !/[\u0000-\u001f\\]/.test(path), 'INVALID_SEARCH_PATH');
    const url = new URL(path, this.#origin);
    const generation = `${this.namespace}_g_[a-f0-9]{32}`;
    const allowed = (url.pathname === '/health' && method === 'GET') || (url.pathname === '/collections' && method === 'POST')
      || (new RegExp(`^/collections/${generation}$`).test(url.pathname) && ['GET', 'DELETE'].includes(method))
      || (new RegExp(`^/collections/${generation}/documents/import$`).test(url.pathname) && method === 'POST')
      || (new RegExp(`^/collections/${generation}/documents/(export|search)$`).test(url.pathname) && method === 'GET')
      || (new RegExp(`^/aliases/${this.namespace}_(serving|evaluation)$`).test(url.pathname) && ['GET', 'PUT', 'DELETE'].includes(method));
    requireIndex(url.origin === this.#origin.origin && !url.hash && allowed, 'INVALID_SEARCH_PATH');
    const controller = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
    const body = options.jsonl ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
    requireIndex(body === undefined || Buffer.byteLength(body) <= 2 * 1024 * 1024, 'INDEX_BATCH_TOO_LARGE');
    const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
    requireIndex(Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= 32 * 1024 * 1024, 'INVALID_SEARCH_RESPONSE_LIMIT');
    let response: Response;
    try { response = await this.#fetch(url, { method, headers: { 'X-TYPESENSE-API-KEY': this.#key, Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': options.jsonl === undefined ? 'application/json' : 'text/plain' }) },
      ...(body === undefined ? {} : { body }), redirect: 'manual', credentials: 'omit', signal: controller }); }
    catch { throw new IndexingError(method === 'GET' ? 'SEARCH_UNAVAILABLE' : 'INDEX_WRITE_OUTCOME_UNKNOWN'); }
    if (response.status === 404 && options.allow404) { await response.body?.cancel(); return null; }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new IndexingError(response.status >= 500 && method !== 'GET' ? 'INDEX_WRITE_OUTCOME_UNKNOWN' : 'SEARCH_REQUEST_REJECTED');
    }
    const reader = response.body?.getReader(); requireIndex(reader, 'INVALID_SEARCH_RESPONSE');
    const cancel = () => { void reader.cancel().catch(() => {}); };
    controller.addEventListener('abort', cancel, { once: true });
    if (controller.aborted) cancel();
    const chunks: Uint8Array[] = []; let length = 0;
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        length += chunk.value.byteLength;
        requireIndex(length <= maxBytes, 'SEARCH_RESPONSE_TOO_LARGE'); chunks.push(chunk.value);
      }
      requireIndex(!controller.aborted, method === 'GET' ? 'SEARCH_UNAVAILABLE' : 'INDEX_WRITE_OUTCOME_UNKNOWN');
      return Buffer.concat(chunks).toString('utf8');
    } catch (error) {
      await reader.cancel().catch(() => {});
      if (error instanceof IndexingError) throw error;
      throw new IndexingError(method === 'GET' ? 'SEARCH_UNAVAILABLE' : 'INDEX_WRITE_OUTCOME_UNKNOWN');
    } finally { controller.removeEventListener('abort', cancel); reader.releaseLock(); }
  }
}
export function jsonObject(text: string | null): Record<string, unknown> {
  try { const value: unknown = JSON.parse(text!); requireIndex(value && typeof value === 'object' && !Array.isArray(value), 'INVALID_SEARCH_RESPONSE'); return value as Record<string, unknown>; }
  catch { throw new IndexingError('INVALID_SEARCH_RESPONSE'); }
}
