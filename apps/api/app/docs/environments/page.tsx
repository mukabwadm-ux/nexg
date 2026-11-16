import { CodeBlock } from '@/components/docs/code';
import { DocPage } from '@/components/docs/doc-page';
import { A, C, Callout, H2, List, P, Step, Steps, Strong, Table } from '@/components/docs/prose';
import { pageMetadata } from '@/lib/reference/navigation';

export const metadata = pageMetadata('/docs/environments');

const TEST_BOOKING = `HTTP/1.1 201 Created
NexG-Environment: test
Location: /v1/orders/0b7e5c1a-3f2d-4c8e-9a61-5d4f3e2b1a09

{
  "ok": true,
  "data": {
    "booking": {
      "order_id": "0b7e5c1a-3f2d-4c8e-9a61-5d4f3e2b1a09",
      "reference": "TEST-261114-4F9A2C",
      "service": "airport_transfer",
      "quantity": 2,
      "total_cents": 200000,
      "currency": "KES",
      "payment_method": "on_account",
      "scheduled_for": null
    }
  },
  "meta": { "api_version": "v1" }
}`;

export default function EnvironmentsPage() {
  return (
    <DocPage
      href="/docs/environments"
      toc={[
        { id: 'base-urls', label: 'Base URLs' },
        { id: 'today', label: 'Sandbox and live today' },
        { id: 'test-keys', label: 'Test keys' },
        { id: 'sandbox-to-live', label: 'From sandbox to live' },
        { id: 'keys', label: 'Keys and environments' },
      ]}
    >
      <H2 id="base-urls">Base URLs</H2>
      <Table
        head={['What', 'URL', 'Notes']}
        rows={[
          ['The API', <C key="u">https://api.nexgapp.com/v1</C>, 'Every endpoint in the reference.'],
          [
            'Callbacks to NexG',
            <C key="u">https://nexgapp.com/api/…</C>,
            'Where partners send signed events, such as the bank webhook.',
          ],
          [
            'Local development',
            <C key="u">http://localhost:3002</C>,
            'For people working on NexG itself: pnpm --filter @nexg/api dev.',
          ],
        ]}
      />
      <P>
        Use HTTPS for every call. Do not let your HTTP client follow a redirect to another host
        with your key attached.
      </P>

      <H2 id="today">Sandbox and live today</H2>
      <P>
        What sandbox means depends on what you are connecting. Here is where each part of NexG
        stands.
      </P>
      <Table
        head={['Part', 'Sandbox', 'Live']}
        rows={[
          [
            'The NexG API',
            'Test keys (nexg_test_…) on api.nexgapp.com. Bookings go to a sandbox and never become orders.',
            'Live keys on api.nexgapp.com. Reads change nothing. A booking (POST /v1/orders) is a real order.',
          ],
          [
            'Bank collections',
            'The NexG Sandbox Bank, on NexG’s test deployments. No real money moves.',
            'Not connected yet. The sandbox bank is refused on the production site.',
          ],
          [
            'Your systems (POS, ERP, booking, inventory)',
            'A sandbox connection NexG registers and tests, which may be plain http.',
            'A separate live connection: https on a public host, with live credentials.',
          ],
        ]}
      />
      <Callout tone="note" title="Try bookings with a test key">
        <p>
          A read cannot change anything at NexG, but{' '}
          <A href="/docs/reference/create-order">booking a service</A> with a live key makes a real
          order that NexG will act on. Build and test with a test key, and switch to a live key
          when you are ready.
        </p>
      </Callout>

      <H2 id="test-keys">Test keys</H2>
      <P>
        Choose <Strong>Test key</Strong> in the <A href="/developers">developer console</A>. A test
        key starts <C>nexg_test_</C> and calls the same URL as a live key. The key decides where a
        request goes, so going live means changing the key and nothing else.
      </P>
      <Table
        head={['', 'Test key', 'Live key']}
        rows={[
          ['Public reads', 'The same live public data.', 'The same live public data.'],
          [
            <C key="e">POST /v1/orders</C>,
            'A sandbox booking with a TEST- reference. Nothing is dispatched, charged or sent to anyone.',
            'A real order, charged to your merchant’s account.',
          ],
          [<C key="e">GET /v1/orders</C>, 'Your test bookings only.', 'Your real orders only.'],
          [
            'Price of a booking',
            'NexG’s price where it has one, otherwise a sample price: KES 1,000 a unit, or KES 1,000 for a flat-priced service.',
            'NexG’s price. A service NexG has not priced in your city is refused.',
          ],
          [
            'Rate limit',
            'A bucket of its own, shared by your test keys.',
            'Your live bucket, shared by your live keys.',
          ],
        ]}
      />
      <P>
        A test booking goes through the same checks as a live one: the key&apos;s scope, the{' '}
        <A href="/docs/idempotency">Idempotency-Key</A>, and every field of the request.
        Idempotency keys used with a test key are kept apart from live ones. A test key can never
        reach a real order, and a live key never writes to the sandbox.
      </P>
      <P>
        Every successful answer to a request with a key carries <C>NexG-Environment</C>,{' '}
        <C>live</C> or <C>test</C>, so your logs show which kind of key made each call.
      </P>
      <CodeBlock className="mt-6" code={TEST_BOOKING} language="http" title="A test booking" />

      <H2 id="sandbox-to-live">From sandbox to live</H2>
      <P>
        Banks and partner systems that NexG calls are connected twice: once in sandbox, once in
        live. NexG registers each connection in its admin console, under{' '}
        <Strong>Settings, API &amp; Webhooks</Strong>.
      </P>
      <Steps>
        <Step title="Share your sandbox details">
          <P>
            Give NexG your sandbox base URL, a path it can call to check the connection (such as{' '}
            <C>/health</C>), and how it should authenticate: a bearer token, an API key header, or
            basic authentication. Credentials go into NexG&apos;s vault through the console. Never
            send them by email or chat.
          </P>
        </Step>
        <Step title="NexG tests the connection">
          <P>
            The test runs from NexG&apos;s database, so your credentials are used there and never
            shown to a browser or a person. The connection is marked connected or failing, with
            the status code and the time it took.
          </P>
        </Step>
        <Step title="Test the whole flow">
          <P>
            Run real scenarios end to end in sandbox: for a bank, every outcome the{' '}
            <A href="/docs/bank-transfers">Sandbox Bank</A> can produce, and every webhook retry.
          </P>
        </Step>
        <Step title="Go live">
          <P>
            NexG registers the live connection with your live URL and credentials. A live URL must
            use https and a public host; a local or private address is refused. Bank connections go
            live only after NexG finance approves limits and reconciliation.
          </P>
        </Step>
      </Steps>

      <H2 id="keys">Keys and environments</H2>
      <List>
        <li>
          An API key from the <A href="/developers">developer console</A> is live or test, and
          both work against <C>https://api.nexgapp.com</C>. A test key starts <C>nexg_test_</C>.
          Keep test keys out of production, and live keys out of your tests.
        </li>
        <li>
          Credentials for a connection NexG calls are separate for sandbox and live. A sandbox
          secret must never be reused in live.
        </li>
        <li>
          A shared webhook secret is generated where the sender runs, at least 32 characters
          long, and stored by NexG in its vault. It is never sent by email or chat.
        </li>
      </List>
    </DocPage>
  );
}
