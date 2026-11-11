import { ReadServiceError, sourceUnavailable } from '../../contracts/readErrors.js';
import type { ReadBudget } from '../../orchestrator/readBudget.js';
import { catalogAdapterManifest } from './manifest.js';

export type CatalogFetch = (url: URL, init: { method: 'GET'; headers: Record<string, string>; redirect: 'manual'; credentials: 'omit'; signal: AbortSignal }) => Promise<Response>;
export function validateSourceOrigin(value: string): URL {
  const origin = new URL(value);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw new Error('Invalid catalog origin');
  return origin;
}
export function sourcePathId(id: string): string {
  if (!id || id.length > 256 || id === '.' || id === '..' || /[\\/\u0000-\u001f\u007f]/.test(id)) throw new ReadServiceError('INVALID_REQUEST', 400, false, 'correct_request', ['/id']);
  try { return encodeURIComponent(id); } catch { throw new ReadServiceError('INVALID_REQUEST', 400, false, 'correct_request', ['/id']); }
}

/** GET-only transport. The caller never supplies an absolute URL or credentials. */
export class CatalogHttpTransport {
  readonly #origin: URL;
  constructor(origin: string, private readonly fetcher: CatalogFetch = fetch, private readonly maxBytes = catalogAdapterManifest.maxResponseBytes) {
    this.#origin = validateSourceOrigin(origin);
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > catalogAdapterManifest.maxResponseBytes) throw new Error('Invalid source response limit');
  }
  get(path: '/api/merchants' | '/api/areas' | `/api/merchants/${string}`, params: URLSearchParams, budget: ReadBudget, detailId?: string): Promise<unknown> {
    if (!(path === '/api/merchants' || path === '/api/areas' || /^\/api\/merchants\/[^/]+$/.test(path))) throw sourceUnavailable(false);
    const url = new URL(path, this.#origin); url.search = params.toString();
    if (url.origin !== this.#origin.origin || url.pathname !== path) throw sourceUnavailable(false);
    return budget.memo(url.href, () => budget.run(async signal => {
      let response: Response;
      try { response = await this.fetcher(url, { method: 'GET', headers: { Accept: 'application/json' }, redirect: 'manual', credentials: 'omit', signal }); }
      catch { throw sourceUnavailable(); }
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        if (response.status === 404 && detailId) throw new ReadServiceError('NOT_FOUND', 404, false, 'none');
        if (response.status === 429) {
          const raw = response.headers.get('retry-after'); const seconds = raw && /^\d+$/.test(raw) ? Math.min(3600, Number(raw)) : undefined;
          throw new ReadServiceError('CATALOG_UNAVAILABLE', 503, true, 'retry_read', [], seconds);
        }
        throw sourceUnavailable(response.status >= 500);
      }
      const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      const length = Number(response.headers.get('content-length') ?? 0);
      if (!contentType || !(contentType === 'application/json' || contentType.endsWith('+json')) || length > this.maxBytes) {
        await response.body?.cancel().catch(() => {}); throw sourceUnavailable(false);
      }
      const reader = response.body?.getReader(); if (!reader) throw sourceUnavailable(false);
      const cancelBody = () => { void reader.cancel().catch(() => {}); };
      signal.addEventListener('abort', cancelBody, { once: true });
      if (signal.aborted) cancelBody();
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        while (true) {
          const next = await reader.read(); if (next.done) break;
          size += next.value.byteLength;
          if (size > this.maxBytes) { await reader.cancel(); throw sourceUnavailable(false); }
          chunks.push(next.value);
        }
        return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
      } catch (error) { if (error instanceof ReadServiceError) throw error; throw sourceUnavailable(false); }
      finally { signal.removeEventListener('abort', cancelBody); reader.releaseLock(); }
    }, detailId));
  }
}
