import type { SpanExporter } from './telemetry.js';

/** Standard OTLP/HTTP JSON, explicitly configured NexG-controlled collector only.
 * No inbound headers, resource attributes, exceptions, URLs or user payloads.
 */
export class OtlpHttpExporter implements SpanExporter {
  readonly #url: string;
  constructor(origin: string, private readonly fetcher: typeof fetch = fetch) {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || (url.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid OTLP origin');
    this.#url = new URL('/v1/traces', url).href;
  }
  async export(spans: Parameters<SpanExporter['export']>[0], signal: AbortSignal): Promise<number> {
    const body = JSON.stringify({ resourceSpans: [{ resource: { attributes: [{ key: 'service.name', value: { stringValue: 'nexg-discovery' } }] },
      scopeSpans: [{ scope: { name: 'nexg.discovery', version: '1' }, spans }] }] });
    if (Buffer.byteLength(body) > 262144) throw new Error('Export body exceeded');
    const response = await this.fetcher(this.#url, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal, redirect: 'error' });
    try {
      if (response.status !== 200 || !response.headers.get('content-type')?.toLowerCase().startsWith('application/json') || !response.body) throw new Error('Export rejected');
      const reader = response.body.getReader(); let bytes = 0; const chunks: Uint8Array[] = [];
      try { while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > 16384) throw new Error('Export response exceeded'); chunks.push(part.value); } }
      finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const rejected = result.partialSuccess?.rejectedSpans ?? 0;
      if (!/^\d+$/.test(String(rejected)) || !Number.isSafeInteger(Number(rejected)) || Number(rejected) > spans.length) throw new Error('Invalid OTLP receipt');
      return spans.length - Number(rejected);
    } finally { await response.body?.cancel().catch(() => {}); }
  }
}
