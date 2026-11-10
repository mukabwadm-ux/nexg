import Link from 'next/link';

export default function MerchantIntegrationPage() {
  return (
    <article className="max-w-3xl space-y-8 text-ink/80">
      <header className="space-y-3">
        <h2 className="text-3xl font-extrabold text-ink">Connect your system to NexG</h2>
        <p>
          This guide is for NexG merchants and the developers who build their
          websites, point-of-sale tools, booking systems, and back offices.
          Start with the data the API supports today; ordering and payment
          actions are not available through the API yet.
        </p>
      </header>

      <section className="space-y-3">
        <h3 className="text-xl font-bold text-ink">What you can integrate today</h3>
        <ul className="list-disc space-y-2 pl-6">
          <li>Read public NexG listings and catalogue details for use in your own digital channels.</li>
          <li>Read your own merchant orders using a key bound to your merchant account.</li>
          <li>Browse active service types, delivery zones, and published experiences.</li>
        </ul>
        <p className="text-sm">
          The API currently provides read access only. It cannot create or
          update orders, accept or cancel bookings, initiate a customer payment,
          or request a payout. The active service list is informational; it
          does not mean service booking is enabled.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-xl font-bold text-ink">Set up an integration</h3>
        <ol className="list-decimal space-y-2 pl-6">
          <li>Sign in to the <Link href="/developers" className="underline underline-offset-4">developer console</Link> with a NexG account that belongs to your merchant.</li>
          <li>Create a key for your merchant and select only the scopes your integration needs. Use <code className="font-mono text-sm">merchant_read</code> to read that merchant&apos;s orders; use <code className="font-mono text-sm">public_read</code> for public data.</li>
          <li>Copy the key when it is issued. NexG shows it only once; store it as a secret in your server environment.</li>
          <li>Call the API from your server, then map NexG IDs and statuses into your own system.</li>
        </ol>
        <p className="text-sm">
          Merchant keys are tied to one merchant. The API determines which
          merchant&apos;s orders to return from the key; your request cannot
          select a different merchant by sending its ID.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-xl font-bold text-ink">Read your orders</h3>
        <p>
          Request <code className="font-mono text-sm">GET /v1/orders</code> with
          a merchant-bound key that has <code className="font-mono text-sm">merchant_read</code>.
          Results are newest first and paginated. Follow <code className="font-mono text-sm">next_cursor</code> to
          load the next page; treat the cursor as opaque.
        </p>
        <pre className="overflow-x-auto rounded bg-surface p-3 text-xs">
{`curl "https://api.nexgapp.com/v1/orders?limit=25" \\
  -H "X-Api-Key: YOUR_MERCHANT_KEY"`}
        </pre>
        <pre className="overflow-x-auto rounded bg-surface p-3 text-xs">
{`{
  "ok": true,
  "data": {
    "items": [{
      "order_id": "…",
      "reference": "…",
      "service": "…",
      "stage": "…",
      "payment_status": "…",
      "currency": "KES",
      "total_cents": 12500
    }],
    "next_cursor": null
  },
  "meta": { "api_version": "v1", "limit": 25 }
}`}
        </pre>
        <p className="text-sm">
          Amounts are integer cents, not decimal shillings. Keep the NexG
          <code className="font-mono"> order_id</code> and <code className="font-mono"> reference</code> so
          you can match your local record with NexG. The actual response also
          includes quantity, payment method, schedule, pickup/drop-off labels,
          and creation time.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-xl font-bold text-ink">Integration practices</h3>
        <ul className="list-disc space-y-2 pl-6">
          <li>Keep API keys on your server. Never put them in browser JavaScript, mobile app bundles, public repositories, or URLs.</li>
          <li>Use HTTPS and request only the fields and scopes your workflow needs.</li>
          <li>Handle HTTP errors by status and stable error code. A 401 means check or replace the key; a 403 means the key lacks the required scope; a 429 means slow down and retry later.</li>
          <li>Use pagination rather than assuming one response contains every record. Respect response cache headers for public catalogue data.</li>
          <li>The API does not currently provide webhooks or order-write operations. Do not rely on instant push notifications or attempt to create, change, or cancel NexG orders through undocumented routes.</li>
        </ul>
      </section>

      <p className="border-t border-ink/10 pt-5 text-sm">
        For endpoint details, see the <Link href="/docs" className="underline underline-offset-4">API reference</Link>.
        For bank collections at checkout, see the{' '}
        <Link href="/docs/bank-transfers" className="underline underline-offset-4">bank and payment partner guide</Link>.
      </p>
    </article>
  );
}
