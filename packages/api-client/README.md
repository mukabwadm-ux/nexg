# @nexg/api-client

A typed TypeScript client for the NexG API (`https://api.nexgapp.com`), and the check for the order events NexG posts to your endpoints. No runtime dependencies: it needs `fetch` and Web Crypto, so it runs on Node 20 or later, Deno, Bun and edge runtimes.

It is not on npm yet. Inside this repository, depend on it as `"@nexg/api-client": "workspace:*"`.

## Calls

```ts
import { NexgClient, NexgApiError } from '@nexg/api-client';

const nexg = new NexgClient({ apiKey: process.env.NEXG_API_KEY });

// Can NexG deliver this trip, how soon, and for how much?
const trip = await nexg.delivery.check({
  pickup_lat: -1.2648,
  pickup_lng: 36.8027,
  dropoff_lat: -1.2921,
  dropoff_lng: 36.7865,
});
if (trip.deliverable) console.log(trip.eta_min, trip.eta_max, trip.delivery_fee_cents);

// Keep a till's prices in step: up to 100 items per call, all or nothing.
await nexg.catalogue.updateMany([
  { id: '6e9f2a3b-4c5d-4e6f-9a7b-8c9d0e1f2a3b', price_kes: 1250 },
  { id: '7f0a3b4c-5d6e-4f70-8b9c-0d1e2f3a4b5c', available: false },
]);

// Book a courier. Keep the idempotency key with your own booking, so a retry
// after a crash cannot book twice.
const { booking } = await nexg.orders.create(
  {
    service: 'courier',
    pickup_lat: -1.2648,
    pickup_lng: 36.8027,
    dropoff_lat: -1.2921,
    dropoff_lng: 36.7865,
  },
  { idempotencyKey: myBooking.id },
);

// Every order, page after page.
for await (const order of nexg.orders.listAll()) console.log(order.reference, order.status);
```

Every method returns the `data` of the answer, typed as the [reference](https://api.nexgapp.com/docs/reference) documents it. The types come from `@nexg/contracts`, the schemas the API itself uses, so they cannot drift from it.

| Group         | Methods                                                       |
| ------------- | ------------------------------------------------------------- |
| `merchants`   | `list`, `listAll`, `get`                                      |
| `catalogue`   | `list`, `update`, `updateMany`                                |
| `zones`       | `list`                                                        |
| `delivery`    | `check`                                                       |
| `experiences` | `list`, `listAll`                                             |
| `services`    | `list`                                                        |
| `orders`      | `list`, `listAll`, `get`, `create`                            |
| `sandbox`     | `moveOrder`, `assignRider` (test keys only)                   |
| —             | `request(method, path, options)` for anything not named above |

## Errors and retries

An error answer throws `NexgApiError` with `status`, `code` (the API's closed set: `invalid_request`, `not_found`, `rate_limited`…), `message`, `fields` (each refused field by its path, such as `items.3.price_kes`) and `requestId` (quote it when you report a problem). No answer at all throws `NexgConnectionError`.

The client tries again, up to `maxRetries` times (default 2):

- after a `429`, once `Retry-After` has passed (a wait longer than a minute goes back to you);
- after a `5xx`, a dropped connection or the `timeoutMs` (default 30 seconds), with backoff, but only where sending again is safe: reads, the delivery check, catalogue changes (they set values) and bookings, whose `Idempotency-Key` stays the same across retries. Sandbox moves are not repeated.

A key is refused in a browser, where anyone could read it. Call NexG from your server.

## Order events

```ts
import { verifyWebhook, NexgWebhookError } from '@nexg/api-client';

// A Next.js route handler. Read the raw body: parsing and serialising again
// changes the spacing and breaks the signature.
export async function POST(request: Request) {
  const raw = await request.text();
  try {
    const event = await verifyWebhook(
      raw,
      request.headers.get('NexG-Signature'),
      process.env.NEXG_WEBHOOK_SECRET!,
    );
    await queue(event); // skip an event id you have already handled
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof NexgWebhookError) return new Response(null, { status: 400 });
    throw error;
  }
}
```

`verifyWebhook` checks the HMAC-SHA256 of `"<t>.<raw body>"` against the `v1` in `NexG-Signature`, in constant time, keyed with the endpoint's whole `whsec_…` secret, and refuses a `t` more than five minutes from your clock. Its test checks a signature made by Postgres the way the webhook dispatcher makes it.

## Tests

`pnpm --filter @nexg/api-client test` runs the unit tests against a fake `fetch`. To run the same calls against a real API with a test key (skipped otherwise, so CI never runs it):

```bash
NEXG_SANDBOX_BASE_URL=https://api.nexgapp.com NEXG_SANDBOX_KEY=nexg_test_… pnpm --filter @nexg/api-client test
```

The key needs `merchant_read`, `merchant_write` and `catalogue_write`. Only a test key is accepted: it books in the sandbox and saves no catalogue change.

## Publishing later

To put it on npm, the package needs a build that emits JavaScript and bundles the `@nexg/contracts` types into its declarations (the source imports them as types only), a name under an npm organisation NexG controls, and a docs page on api.nexgapp.com.
