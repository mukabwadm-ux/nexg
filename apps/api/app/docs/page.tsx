import { Card, CardContent, CardHeader, CardTitle } from '@nexg/ui';
import Link from 'next/link';

/**
 * Interactive docs explorer for api.nexgapp.com
 *
 * Lists every public endpoint with description, parameters, and response
 * shape. Uses @nexg/ui design tokens (Manrope, bg-bg, ink) for consistency
 * with the marketing site and staff console.
 *
 * Updated to include the merchant-booking endpoint (POST /v1/orders),
 * which is the second stage of the API and the reason a merchant can
 * connect through it: they book airport transfers and other services
 * for their visitors and pay from the merchant account.
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
    desc: 'What a merchant can request through the booking endpoint: airport transfers, intercity, courier, venue bookings. Configured as rows, not new endpoints.',
    params: [],
    response: '{ ok: true, data: { items: ApiService[] }, meta: { api_version: "v1" } }',
  },
  {
    method: 'POST',
    path: '/v1/orders',
    title: 'Book a service',
    desc: 'A merchant books a service on behalf of their visitors (e.g. airport transfer for a tour group). Requires merchant_write scope and an Idempotency-Key header. The caller never states a price.',
    params: ['Idempotency-Key (header, 16-128 chars)', 'X-Api-Key (header)', 'body: ServiceBooking'],
    response: '{ ok: true, data: BookingReceipt, meta: { api_version: "v1" } }',
  },
];

export default function DocsPage() {
  return (
    <div className="space-y-8">
      <section className="mb-8">
        <h2 className="text-2xl font-bold mb-2">Endpoints</h2>
        <p className="text-ink/70">Every endpoint is versioned. Read endpoints (stage one) work with a public-read key. Write endpoints (stage two) need merchant_write and an idempotency key. Configuring a new vertical is adding a row to /v1/services, not a new route.</p>
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
              <p>Scopes: <code className="font-mono text-xs">public_read</code>, <code className="font-mono text-xs">merchant_read</code>, <code className="font-mono text-xs">merchant_write</code>, <code className="font-mono text-xs">internal_read</code>, <code className="font-mono text-xs">internal_write</code>.</p>
              <p>Rate limit per key (default 60/min). Manage at <Link href="/developers" className="underline">/developers</Link>.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>OAuth 2.0</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-ink/80 space-y-2">
              <p>Full authorization code flow with scopes. For partner apps that act on behalf of merchants or guests. Tables exist (migration 22900); endpoints are phase 4.</p>
              <p>Clients are registered per partner. Redirect URIs must be pre-registered.</p>
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