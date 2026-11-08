import type { EngineSchemas } from './DiscoveryProvider';
import { parseEngine } from './engineProtocol';
import { ProviderReadError, wireFailure } from './readState';

export type BrowserFetch = typeof fetch;
function bounded<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new ProviderReadError({ kind: 'unavailable' }));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
/** Same-origin catalog/observation transport. No automatic retry or provider fallback. */
export class EngineTransport {
  constructor(private readonly fetcher: BrowserFetch = fetch, private readonly timeoutMs = 5000) {}
  async read<K extends keyof EngineSchemas>(path: string, name: K, body?: unknown, signal?: AbortSignal): Promise<EngineSchemas[K]> {
    if (!/^\/api\/discovery\/(release|capabilities|areas|results|collections|events|merchants\/[^/?]+)(\?[^#]*)?$/.test(path)) throw new ProviderReadError({ kind: 'invalid' });
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await bounded(this.fetcher(path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', redirect: 'error', cache: 'no-store',
        signal: controller.signal, headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), controller.signal);
      if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json') || !response.body) throw new ProviderReadError({ kind: 'unavailable' });
      reader = response.body.getReader();
      const chunks: Uint8Array[] = []; let bytes = 0;
      while (true) {
        const chunk = await bounded(reader.read(), controller.signal);
        if (controller.signal.aborted) throw new ProviderReadError({ kind: 'unavailable' });
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 2 * 1024 * 1024) throw new ProviderReadError({ kind: 'unavailable' });
        chunks.push(chunk.value);
      }
      const buffer = new Uint8Array(bytes); let position = 0;
      for (const chunk of chunks) { buffer.set(chunk, position); position += chunk.byteLength; }
      const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
      if (!response.ok) {
        const retry = response.headers.get('retry-after');
        const numeric = retry && /^\d+$/.test(retry) ? Number(retry) : undefined;
        const dated = retry && numeric === undefined ? Math.ceil((Date.parse(retry) - Date.now()) / 1000) : undefined;
        const seconds = numeric !== undefined && Number.isSafeInteger(numeric) ? numeric : dated !== undefined && Number.isFinite(dated) ? Math.max(0, dated) : undefined;
        throw wireFailure(parseEngine('EngineError', value), seconds);
      }
      return parseEngine(name, value);
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
      throw error instanceof ProviderReadError ? error : new ProviderReadError({ kind: 'unavailable' });
    } finally {
      if (reader) { void reader.cancel().catch(() => {}); }
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
    }
  }
}
