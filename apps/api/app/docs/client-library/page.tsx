import { CodeBlock } from '@/components/docs/code';
import { DocPage } from '@/components/docs/doc-page';
import { A, C, Callout, H2, List, P } from '@/components/docs/prose';
import { pageMetadata } from '@/lib/reference/navigation';

export const metadata = pageMetadata('/docs/client-library');

const INSTALL = 'npm install @nexg-org/api-client';

const CALLS = `import { NexgClient } from '@nexg-org/api-client';

// On your server. A test key (nexg_test_…) works against the sandbox.
const nexg = new NexgClient({ apiKey: process.env.NEXG_API_KEY });

// Can NexG deliver this trip, how soon, and for how much?
const trip = await nexg.delivery.check({
  pickup_lat: -1.2648,
  pickup_lng: 36.8027,
  dropoff_lat: -1.2921,
  dropoff_lng: 36.7865,
});
if (trip.deliverable) console.log(trip.eta_min, trip.eta_max, trip.delivery_fee_cents);

// Keep your till's prices in step: up to 100 items per call, all or nothing.
await nexg.catalogue.updateMany([
  { id: '6e9f2a3b-4c5d-4e6f-9a7b-8c9d0e1f2a3b', price_kes: 1250 },
  { id: '7f0a3b4c-5d6e-4f70-8b9c-0d1e2f3a4b5c', available: false },
]);

// Book a courier. Keep the idempotency key with your own booking, so a
// retry after a crash cannot book twice.
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
for await (const order of nexg.orders.listAll()) {
  console.log(order.reference, order.status);
}`;

const ERRORS = `import { NexgApiError, NexgConnectionError } from '@nexg-org/api-client';

try {
  await nexg.catalogue.updateMany(changes);
} catch (error) {
  if (error instanceof NexgApiError) {
    // error.status, error.code ('invalid_request', 'not_found', 'rate_limited'…),
    // error.fields ({ 'items.3.price_kes': 'Whole shillings, …' }), error.requestId
  } else if (error instanceof NexgConnectionError) {
    // No answer, even after the retries.
  }
}`;

const EVENTS = `import { verifyWebhook, NexgWebhookError } from '@nexg-org/api-client';

// A Next.js route handler. Read the raw body: parsing and serialising it
// again changes the spacing and breaks the signature.
export async function POST(request: Request) {
  const raw = await request.text();
  try {
    const event = await verifyWebhook(
      raw,
      request.headers.get('NexG-Signature'),
      process.env.NEXG_WEBHOOK_SECRET,
    );
    await queue(event); // skip an event id you have already handled
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof NexgWebhookError) return new Response(null, { status: 400 });
    throw error;
  }
}`;

export default function ClientLibraryPage() {
  return (
    <DocPage
      href="/docs/client-library"
      toc={[
        { id: 'install', label: 'Installing' },
        { id: 'calls', label: 'Calls' },
        { id: 'errors', label: 'Errors and retries' },
        { id: 'events', label: 'Order events' },
        { id: 'testing', label: 'Testing' },
      ]}
    >
      <P>
        <C>@nexg-org/api-client</C> is NexG&apos;s TypeScript client: a typed method for every
        endpoint, the retries and idempotency keys every integration needs, and the signature check
        for the order events NexG posts to you. It has no dependencies.
      </P>

      <H2 id="install">Installing</H2>
      <CodeBlock className="mt-4" code={INSTALL} language="shell" title="Terminal" />
      <List>
        <li>
          It runs anywhere with <C>fetch</C> and Web Crypto: Node 20 or later, Deno, Bun and edge
          runtimes. Types are included.
        </li>
        <li>
          Use it on your server. With a key, it refuses to run in a browser, where anyone could read
          the key.
        </li>
      </List>

      <H2 id="calls">Calls</H2>
      <P>
        Every method returns the <C>data</C> of the answer, typed as the{' '}
        <A href="/docs/reference">reference</A> documents it, and the types are generated from the
        schemas the API itself uses.
      </P>
      <CodeBlock className="mt-6" code={CALLS} language="javascript" title="server.ts" />
      <P>
        The groups are <C>merchants</C>, <C>catalogue</C>, <C>zones</C>, <C>delivery</C>,{' '}
        <C>experiences</C>, <C>services</C>, <C>orders</C> and, for test keys, <C>sandbox</C>.{' '}
        <C>nexg.request(method, path)</C> reaches any endpoint not named yet.
      </P>

      <H2 id="errors">Errors and retries</H2>
      <P>
        An error answer throws <C>NexgApiError</C>, with the same <C>code</C>, <C>message</C> and{' '}
        <C>fields</C> as the <A href="/docs/errors">error envelope</A>, and the request id to quote
        when you report a problem. No answer at all throws <C>NexgConnectionError</C>.
      </P>
      <CodeBlock className="mt-6" code={ERRORS} language="javascript" title="Handling errors" />
      <P>The client tries again for you, twice by default (maxRetries):</P>
      <List>
        <li>
          after a <C>429</C>, once <C>Retry-After</C> has passed. A wait longer than a minute comes
          back to you as the error;
        </li>
        <li>
          after a <C>5xx</C>, a dropped connection or a timeout, with backoff, but only where{' '}
          <A href="/docs/idempotency">sending again is safe</A>: reads, the delivery check,
          catalogue changes, cancellations (<C>orders.cancel</C>), and bookings, whose <C>Idempotency-Key</C> stays the same across
          retries. Pass your own key to <C>orders.create</C>, kept with your booking, so a retry
          after a crash is safe too.
        </li>
      </List>

      <H2 id="events">Order events</H2>
      <P>
        <C>verifyWebhook</C> checks the <C>NexG-Signature</C> of an{' '}
        <A href="/docs/events">order event</A> in constant time, refuses one signed more than five
        minutes from your clock, and returns the event. It throws <C>NexgWebhookError</C>, with a{' '}
        <C>reason</C>, when the event is not NexG&apos;s: answer 400 and do not act on it.
      </P>
      <CodeBlock
        className="mt-6"
        code={EVENTS}
        language="javascript"
        title="app/nexg/events/route.ts"
      />

      <H2 id="testing">Testing</H2>
      <P>
        Give the client a test key (<C>nexg_test_…</C>) and everything runs against the{' '}
        <A href="/docs/environments">sandbox</A>: bookings are sandbox bookings, catalogue changes
        are answered and not saved, and <C>nexg.sandbox.moveOrder</C> and{' '}
        <C>nexg.sandbox.assignRider</C> move a test booking on, sending its events to your test
        endpoints.
      </P>
      <Callout tone="note" title="Prefer another language?">
        <p>
          The <A href="/openapi.json">OpenAPI spec</A> generates clients for most languages, and the{' '}
          <A href="/postman.json">Postman collection</A> tries every call by hand.
        </p>
      </Callout>
    </DocPage>
  );
}
