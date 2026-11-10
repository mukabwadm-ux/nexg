import { Card, CardContent, CardHeader, CardTitle } from '@nexg/ui';
import Link from 'next/link';

/**
 * Interactive docs explorer for api.nexgapp.com
 *
 * Lists every public endpoint with description, parameters, and response
 * shape. Uses @nexg/ui design tokens (Manrope, bg-bg, ink) for consistency
 * with the marketing site and staff console.
 *
 * Lists implemented endpoints only. Planned writes and bank transfers
 * are documented separately until their routes and financial controls ship.
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
    title: 'List available service types',
    desc: 'Browse active service types and their labels. This endpoint is informational; creating a booking is not currently supported.',
    params: [],
    response: '{ ok: true, data: { items: ApiService[] }, meta: { api_version: "v1" } }',
  },
  {
    method: 'GET',
    path: '/v1/orders',
    title: 'Read your merchant orders',
    desc: 'Read a cursor-paginated list of orders for the merchant bound to your API key. Requires the merchant_read scope.',
    params: ['X-Api-Key (merchant-bound key)', 'cursor (optional)', 'limit (1-100, default 25)'],
    response: '{ ok: true, data: { items: MerchantOrder[], next_cursor: string|null }, meta: { api_version: "v1", limit: number } }',
  },
];

export default function DocsPage() {
  return (
    <div className="space-y-8">
      <section className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Endpoints</h2>
        <p className="text-ink/70">Use the NexG API to connect a merchant website or back-office system to public catalogue data and, with a merchant-bound key, read that merchant&apos;s orders. Guests can pay by bank at checkout (sandbox bank today; see the bank guide). Payouts and write operations are not available yet.</p>
      </section>

      <section className="grid gap-8 border-y py-6 md:grid-cols-2" aria-label="Integration guides">
        <div className="space-y-2">
          <h3 className="text-lg font-bold">For merchants and developers</h3>
          <p className="text-sm text-ink/70">Connect a website, point-of-sale system, or back office to NexG&apos;s published data and your merchant&apos;s order feed.</p>
          <Link href="/docs/merchants" className="text-sm font-semibold underline underline-offset-4">Merchant integration guide</Link>
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-bold">For banks and payment providers</h3>
          <p className="text-sm text-ink/70">Bank collections at checkout: the API a bank provides, the signed webhooks NexG receives, and the NexG Sandbox Bank for testing.</p>
          <Link href="/docs/bank-transfers" className="text-sm font-semibold underline underline-offset-4">Bank and payment partner guide</Link>
        </div>
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
              <p>For integrations, use <code className="font-mono text-xs">public_read</code> for public data or <code className="font-mono text-xs">merchant_read</code> for the bound merchant&apos;s orders. Other scopes are defined, but no write endpoints are currently available.</p>
              <p>Keys share a PostgreSQL token bucket per merchant or developer. Public reads cost one token; merchant order reads cost three. A 429 response includes Retry-After in seconds. Manage keys at <Link href="/developers" className="underline">/developers</Link>.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>OAuth 2.0</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-ink/80 space-y-2">
              <p>OAuth client storage is present, but authorization and token endpoints are not implemented. Use an API key for the implemented routes.</p>
              <p>Do not build an integration against the planned OAuth flow until its endpoints are published here.</p>
            </CardContent>
          </Card>
        </div>
        <div className="mt-6 flex flex-wrap gap-4 text-sm">
          <Link href="/docs/auth" className="underline text-ink/80 hover:text-ink">Authentication guide →</Link>
          <Link href="/docs/quickstart" className="underline text-ink/80 hover:text-ink">Quick start →</Link>
          <Link href="/docs/merchants" className="underline text-ink/80 hover:text-ink">Merchant integration →</Link>
          <Link href="/docs/bank-transfers" className="underline text-ink/80 hover:text-ink">Bank &amp; payment partners →</Link>
          <Link href="/developers" className="underline text-ink/80 hover:text-ink">Issue a key →</Link>
        </div>
      </section>
    </div>
  );
}
