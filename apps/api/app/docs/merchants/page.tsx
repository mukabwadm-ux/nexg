import { CodeBlock, CodeTabs } from '@/components/docs/code';
import { DocPage } from '@/components/docs/doc-page';
import { A, C, Callout, H2, List, P, Step, Steps } from '@/components/docs/prose';
import { endpointBySlug } from '@/lib/reference/endpoints';
import { pageMetadata } from '@/lib/reference/navigation';
import { requestSamples } from '@/lib/reference/samples';

export const metadata = pageMetadata('/docs/merchants');

const ORDER = `{
  "order_id": "0f1e2d3c-4b5a-4697-8a8b-9c0d1e2f3a4b",
  "reference": "NX-261110-0003",
  "service": "",
  "quantity": 3,
  "stage": "preparing",
  "payment_method": "mpesa_stk",
  "payment_status": "paid",
  "currency": "KES",
  "total_cents": 161625,
  "scheduled_for": null,
  "pickup_label": null,
  "dropoff_label": "Rhapta Road, Westlands, Nairobi",
  "created_at": "2026-11-10T09:42:17.204+00:00"
}`;

export default function MerchantIntegrationPage() {
  const orders = endpointBySlug('list-orders');
  return (
    <DocPage
      href="/docs/merchants"
      toc={[
        { id: 'today', label: 'What you can integrate today' },
        { id: 'set-up', label: 'Set up an integration' },
        { id: 'orders', label: 'Read your orders' },
        { id: 'practices', label: 'Good practice' },
      ]}
    >
      <H2 id="today">What you can integrate today</H2>
      <P>
        This guide is for NexG merchants and the developers who build their websites, point of
        sale, booking systems and back offices.
      </P>
      <List>
        <li>Read your own orders into your system, with a key bound to your merchant.</li>
        <li>Show your NexG listing and catalogue on your own website.</li>
        <li>Use NexG&apos;s delivery zones, published experiences and bookable services.</li>
        <li>
          Book NexG services for your guests, such as an airport transfer, charged to your account:{' '}
          <A href="/docs/reference/create-order">POST /v1/orders</A>. Try it first with a{' '}
          <A href="/docs/environments#test-keys">test key</A>, which books in a sandbox.
        </li>
        <li>Keep your catalogue in your own system and import it to NexG as CSV.</li>
      </List>
      <Callout tone="soon" title="Not through the API yet">
        <p>
          Changing or cancelling orders, accepting bookings from guests, starting a payment and
          requesting a payout.
        </p>
      </Callout>

      <H2 id="set-up">Set up an integration</H2>
      <Steps>
        <Step title="Sign in to the developer console">
          <P>
            Open the <A href="/developers">developer console</A> with the NexG account that owns
            your merchant. Your merchants are listed by name.
          </P>
        </Step>
        <Step title="Issue a key for your merchant">
          <P>
            Choose your merchant and only the scopes you need: <C>merchant_read</C> for your
            orders, <C>public_read</C> for public data. Merchant keys need your merchant to be
            approved and operating.
          </P>
        </Step>
        <Step title="Store it as a secret on your server">
          <P>
            The key is shown once. Put it in your server&apos;s secret store, never in a website,
            an app or a repository. See <A href="/docs/auth#safety">Keeping keys safe</A>.
          </P>
        </Step>
        <Step title="Call the API from your server">
          <P>
            Map NexG&apos;s ids and stages into your system. The{' '}
            <A href="/docs/connecting-systems#orders">order sync recipe</A> shows one way.
          </P>
        </Step>
      </Steps>

      <H2 id="orders">Read your orders</H2>
      <P>
        Request <C>GET /v1/orders</C> with your merchant key. Orders come newest first, 25 to a
        page; follow <C>next_cursor</C> for more. The key decides the merchant: you never send a
        merchant id, and no request can read another merchant&apos;s orders.
      </P>
      {orders ? <CodeTabs className="mt-6" samples={requestSamples(orders)} title="Request" /> : null}
      <CodeBlock className="mt-4" code={ORDER} language="json" title="One order in data.items" />
      <P>
        Amounts are integer cents: <C>161625</C> is KES 1,616.25. Keep both <C>order_id</C> and{' '}
        <C>reference</C> so you can match your record with NexG&apos;s. Every field is described
        in the <A href="/docs/reference/list-orders">reference</A>.
      </P>

      <H2 id="practices">Good practice</H2>
      <List>
        <li>Call NexG from your server only, over HTTPS.</li>
        <li>
          Handle errors by HTTP status and <C>error.code</C>: <C>401</C> means replace the key,{' '}
          <C>403</C> means the key lacks the scope, <C>429</C> means wait for{' '}
          <C>Retry-After</C>.
        </li>
        <li>Page with <C>next_cursor</C> rather than assuming one response holds everything.</li>
        <li>
          Poll your orders about once a minute. NexG does not push order changes yet; see{' '}
          <A href="/docs/webhooks#coming-soon">Webhooks</A>.
        </li>
        <li>Do not call routes that are not in the reference. They are not part of the API.</li>
      </List>
    </DocPage>
  );
}
