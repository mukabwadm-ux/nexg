import { Card, CardContent, CardHeader, CardTitle } from '@nexg/ui';
import Link from 'next/link';

/**
 * Interactive docs explorer for api.nexgapp.com
 *
 * Lists every public endpoint with description, parameters, and response
 * shape. Uses @nexg/ui design tokens (Manrope, bg-bg, ink) for consistency
 * with the marketing site and staff console.
 *
 * Documents routes implemented in this API app.
 */

const endpoints = [
  {
    method: 'GET',
    path: '/v1/catalog/merchants',
    title: 'List merchants',
    desc: 'Cursor-paginated list of live merchants. Filter by city slug, taxonomy category, or free-text query.',
    params: ['cursor', 'limit (1-100, default 25)', 'city', 'category', 'q'],
    response: '{ ok: true, data: { items: PublicMerchant[], next_cursor: string|null }, meta: { api_version: "v1", limit: number } }',
  },
  {
    method: 'GET',
    path: '/v1/catalog/merchants/{id}',
    title: 'Get merchant',
    desc: 'Single merchant with its catalogue items. Returns 404 if the merchant is not live.',
    params: ['id (UUID)'],
    response: '{ ok: true, data: { merchant: PublicMerchant, catalogue: CatalogueItem[] }, meta: { api_version: "v1" } }',
  },
  {
    method: 'GET',
    path: '/v1/zones',
    title: 'List zones',
    desc: 'Active delivery zones with bounding boxes. No pagination needed: small, stable set.',
    params: [],
    response: '{ ok: true, data: { items: PublicZone[], next_cursor: null }, meta: { api_version: "v1", limit: number } }',
  },
  {
    method: 'GET',
    path: '/v1/experiences',
    title: 'List experiences',
    desc: 'Upcoming events. Sorted by starts_at ascending. Cursor-paginated.',
    params: ['cursor', 'limit', 'city', 'q'],
    response: '{ ok: true, data: { items: PublicEvent[], next_cursor: string|null }, meta: { api_version: "v1", limit: number } }',
  },
  {
    method: 'GET',
    path: '/v1/services',
    title: 'List bookable services',
    desc: 'Configured active service descriptions. This list does not enable API booking.',
    params: [],
    response: '{ ok: true, data: { items: ApiService[] }, meta: { api_version: "v1" } }',
  },
  {
    method: 'GET',
    path: '/v1/orders',
    title: 'List merchant orders',
    desc: 'Read orders belonging to the merchant resolved from the key. Requires merchant_read and current merchant access approval. Orders are never selected by a caller-supplied merchant id.',
    params: ['X-Api-Key (header)', 'cursor', 'limit (1-100, default 25)'],
    response: '{ ok: true, data: { items: Order[], next_cursor: string|null }, meta: { api_version: "v1", limit: number } }',
  },
];

export default function DocsPage() {
  return (
    <div className="space-y-8">
      <section className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Endpoints</h2>
        <p className="text-ink/70">Public reads work without a key and are rate limited. Merchant orders require a merchant_read key. Order creation, individual order routes, OAuth, and ERP connectors are unavailable in this release.</p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {endpoints.map((ep) => (
          <Card key={ep.path} className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-surface border text-ink/60">{ep.method}</span>
                <CardTitle className="text-base font-mono text-sm">{ep.path}</CardTitle>
              </div>
              <h3 className="font-extrabold text-lg">{ep.title}</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-ink/80">{ep.desc}</p>
              <div className="text-xs">
                <strong className="block mb-1">Parameters</strong>
                <div className="flex flex-wrap gap-2">
                  {ep.params.length > 0 ? (
                    ep.params.map((p) => (
                      <span key={p} className="px-2 py-0.5 rounded bg-surface text-ink/70 text-xs font-mono">{p}</span>
                    ))
                  ) : (
                    <span className="text-ink/40 text-xs">None</span>
                  )}
                </div>
              </div>
              <div className="text-xs">
                <strong className="block mb-1">Response</strong>
                <code className="block bg-surface p-2 rounded text-[11px] font-mono text-ink/80 overflow-x-auto whitespace-pre-wrap">{ep.response}</code>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="border-t pt-8 mt-8">
        <h2 className="text-2xl font-bold mb-4">Authentication</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>API Keys</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-ink/80 space-y-2">
              <p>Send the key in the <code className="font-mono bg-surface px-1 rounded text-xs">X-Api-Key</code> header. The server validates the SHA-256 hash (never the raw key) and checks scopes, rate limits, and expiry.</p>
              <p>Use <code className="font-mono text-xs">public_read</code> for public data and <code className="font-mono text-xs">merchant_read</code> for your merchant's orders. Other stored scopes do not enable unimplemented routes.</p>
              <p>Keys share a PostgreSQL token bucket per merchant or developer. Public reads cost one token; merchant order reads cost three. A 429 response includes Retry-After in seconds. Manage keys at <Link href="/developers" className="underline">/developers</Link>.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>OAuth 2.0</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-ink/80 space-y-2">
              <p>Unavailable. Existing database tables do not provide an authorization or token endpoint.</p>
              <p>Use API keys for the supported read operations.</p>
            </CardContent>
          </Card>
        </div>
        <div className="mt-6 flex flex-wrap gap-4 text-sm">
          <Link href="/docs/auth" className="underline text-ink/80 hover:text-ink">Authentication guide →</Link>
          <Link href="/docs/quickstart" className="underline text-ink/80 hover:text-ink">Quick start →</Link>
          <Link href="/developers" className="underline text-ink/80 hover:text-ink">Issue a key →</Link>
        </div>
      </section>
    </div>
  );
}
