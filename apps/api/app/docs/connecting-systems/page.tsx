import { CodeBlock, CodeTabs } from '@/components/docs/code';
import { DocPage } from '@/components/docs/doc-page';
import { A, C, Callout, H2, H3, List, P, Strong, Table } from '@/components/docs/prose';
import { endpointBySlug } from '@/lib/reference/endpoints';
import { pageMetadata } from '@/lib/reference/navigation';
import { requestSamples } from '@/lib/reference/samples';

export const metadata = pageMetadata('/docs/connecting-systems');

const CSV = `id,section,name,description,price_kes,available,age_restricted
,Popular,Nyama choma platter,"Half kilo of goat ribs, kachumbari, ugali",1450,true,false
,Popular,Grilled tilapia,"Whole fish, lemon and chilli, sukuma wiki",1200,true,false`;

const ITEM = `{
  "name": "Nyama choma platter",
  "description": "Half kilo of goat ribs, kachumbari, ugali",
  "price_kes": 1450,
  "available": true,
  "age_restricted": false,
  "highlighted": true
}`;

const PRICE_CHANGE = `curl -X PATCH https://api.nexgapp.com/v1/catalog/items/6e9f2a3b-4c5d-4e6f-9a7b-8c9d0e1f2a3b \\
  -H "X-Api-Key: $NEXG_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"price_kes": 1250, "available": false}'`;

const BULK_CHANGE = `curl -X PATCH https://api.nexgapp.com/v1/catalog/items \\
  -H "X-Api-Key: $NEXG_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"items": [
        {"id": "6e9f2a3b-4c5d-4e6f-9a7b-8c9d0e1f2a3b", "price_kes": 1250},
        {"id": "7f0a3b4c-5d6e-4f70-8b9c-0d1e2f3a4b5c", "available": false}
      ]}'`;

const SYNC = `// Every minute: read new and changed orders, newest first, until one you
// already have at the same stage. Keyed by NexG's order_id.
const res = await fetch('https://api.nexgapp.com/v1/orders', {
  headers: { 'X-Api-Key': process.env.NEXG_API_KEY },
});
const body = await res.json();
if (!body.ok) throw new Error(body.error.code);

for (const order of body.data.items) {
  await pos.orders.upsert({
    externalId: order.order_id,     // NexG's id
    reference: order.reference,     // what staff read: NX-261110-0003
    status: STAGE_TO_POS[order.stage],
    totalCents: order.total_cents,  // integer cents, never a float
  });
}`;

/** An item as nexgapp.com sets it: the illustration of the brand format. */
function ItemIllustration() {
  return (
    <div
      aria-label="Illustration: the item as a NexG storefront shows it"
      role="img"
      className="border-border bg-bg flex h-full flex-col justify-center rounded-xl border p-4 sm:p-6"
    >
      <div className="border-border bg-surface shadow-card rounded-xl border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-micro text-gold-text font-bold uppercase">Popular</p>
            <p className="text-ink mt-1 text-base font-extrabold leading-snug">
              Nyama choma platter
            </p>
            <p className="text-muted mt-1 text-sm leading-5">
              Half kilo of goat ribs, kachumbari, ugali
            </p>
          </div>
          <span className="bg-gold-soft text-gold-text border-gold/40 shrink-0 rounded-full border px-2 py-0.5 text-[0.6875rem] font-bold">
            Highlight
          </span>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <p className="text-ink text-base font-extrabold tabular-nums">KES 1,450</p>
          <span className="bg-gold text-ink inline-flex h-9 items-center rounded-lg px-4 text-sm font-bold">
            Add
          </span>
        </div>
      </div>
      <p className="text-muted-light mt-3 text-center text-xs">
        Illustration. NexG&apos;s type, colours and layout; your words and prices.
      </p>
    </div>
  );
}

export default function ConnectingSystemsPage() {
  const merchantSamples = (() => {
    const endpoint = endpointBySlug('get-merchant');
    return endpoint ? requestSamples(endpoint) : [];
  })();

  return (
    <DocPage
      href="/docs/connecting-systems"
      toc={[
        { id: 'directions', label: 'Three directions' },
        { id: 'what-moves', label: 'What moves, and which way' },
        { id: 'today', label: 'Connecting a system today' },
        { id: 'brand-format', label: 'Your data on nexgapp.com' },
        { id: 'two-way-sync', label: 'Two-way sync' },
      ]}
    >
      <H2 id="directions">Three directions</H2>
      <P>
        A point-of-sale, ERP, booking or inventory system can be connected to NexG in three
        directions. Each has its own channel and its own security.
      </P>
      <Table
        head={['Direction', 'How', 'Status']}
        rows={[
          [
            'Your system reads NexG',
            <span key="h">
              Calls the API with a key: your orders, your catalogue as NexG publishes it, zones and
              events. See the <A href="/docs/reference">reference</A>.
            </span>,
            'Live',
          ],
          [
            'Your system tells NexG',
            <span key="h">
              Updates your catalogue&apos;s prices and availability with{' '}
              <A href="/docs/reference/update-catalogue-item">PATCH /v1/catalog/items/{'{id}'}</A>,
              or up to 100 items at once with{' '}
              <A href="/docs/reference/update-catalogue-items">PATCH /v1/catalog/items</A>, or posts
              signed events to NexG. See <A href="/docs/webhooks">Webhooks</A>.
            </span>,
            'Catalogue updates live. Bank events in sandbox.',
          ],
          [
            'NexG calls your system',
            'NexG registers your system as a connection, keeps its credentials in a vault, and tests it from its database.',
            'Registration and tests live. Syncing data coming soon.',
          ],
        ]}
      />

      <H2 id="what-moves">What moves, and which way</H2>
      <Table
        head={['Data', 'Into NexG today', 'Out of NexG today', 'Coming soon']}
        rows={[
          [
            'Catalogue and prices',
            <span key="i">
              Merchant console, a CSV export from your system, or{' '}
              <C>PATCH /v1/catalog/items/{'{id}'}</C> (one item) and <C>PATCH /v1/catalog/items</C>{' '}
              (up to 100) for prices
            </span>,
            <C key="o">GET /v1/catalog/merchants/{'{id}'}</C>,
            'New items and photos by API',
          ],
          [
            'Availability',
            <span key="i">
              The available column, in the console or CSV, or available in{' '}
              <C>PATCH /v1/catalog/items/{'{id}'}</C>
            </span>,
            'available on each item',
            'Stock levels from your inventory',
          ],
          [
            'Orders and their stage',
            <span key="i">
              Guests order on nexgapp.com; merchants book services with <C>POST /v1/orders</C>
            </span>,
            <span key="o">
              <C>GET /v1/orders</C>, and order events pushed to you
            </span>,
            'Changing and cancelling bookings by API',
          ],
          [
            'Payments',
            'Signed bank events (sandbox)',
            'payment_status on each order',
            'A live bank',
          ],
          ['Settlements and payouts', 'Not over any API', 'Not over any API', 'Not planned yet'],
        ]}
      />

      <H2 id="today">Connecting a system today</H2>
      <H3 id="catalogue">Your catalogue, from your system to NexG</H3>
      <P>
        Export your products from your POS or ERP as CSV and import the file in the NexG merchant
        console (<Strong>Menu</Strong>, then import). The import shows a preview with any problems
        row by row before anything is written. A row with an <C>id</C> updates that item; a row
        without one updates the item with exactly that name, or adds a new one, so re-importing the
        same file never duplicates products.
      </P>
      <CodeBlock
        className="mt-6"
        code={CSV}
        language="text"
        title="catalogue.csv (first columns)"
      />
      <P>
        The full template adds <C>portion_size</C>, <C>ingredients</C>, <C>allergens</C>,{' '}
        <C>dietary_labels</C>, <C>prep_time_minutes</C>, <C>availability_notes</C>,{' '}
        <C>handling_notes</C> and <C>storage_guidance</C>. Download it from the same page. Photos
        are uploaded in the console, not in the file. Prices are whole shillings.
      </P>

      <H3 id="prices">Prices and availability, as they change</H3>
      <P>
        Issue a live key with <C>catalogue_write</C> for your merchant in the{' '}
        <A href="/developers">developer console</A>. Read your items once with{' '}
        <A href="/docs/reference/list-catalogue-items">GET /v1/catalog/items</A> and keep each
        item&apos;s <C>id</C> next to your own product code. Then, whenever a price changes or
        something sells out in your system, send only that change with{' '}
        <A href="/docs/reference/update-catalogue-item">PATCH /v1/catalog/items/{'{id}'}</A>. It
        applies to the next order. Try it first with a test key, which answers with the result and
        saves nothing.
      </P>
      <CodeBlock
        className="mt-6"
        code={PRICE_CHANGE}
        language="curl"
        title="Sold out, at a new price"
      />
      <P>
        To send many changes at once, such as a price list after a supplier&apos;s increase, use{' '}
        <A href="/docs/reference/update-catalogue-items">PATCH /v1/catalog/items</A> with up to 100
        items per call. It saves all of them or none: ids your merchant does not have come back
        together, each named by its place in the list. One call costs one token, however many items
        it carries.
      </P>
      <CodeBlock
        className="mt-6"
        code={BULK_CHANGE}
        language="curl"
        title="Two changes in one call"
      />

      <H3 id="orders">Your orders, from NexG to your system</H3>
      <P>
        Issue a key with <C>merchant_read</C> for your merchant, then poll your orders once a minute
        and upsert them by <C>order_id</C>. Map NexG&apos;s stage to your own statuses once, in one
        place.
      </P>
      <CodeBlock className="mt-6" code={SYNC} language="javascript" title="Order sync" />
      <Table
        head={['NexG stage', 'Means']}
        rows={[
          [<C key="s">placed</C>, 'A guest has ordered. New for you.'],
          [<C key="s">confirmed</C>, 'Accepted.'],
          [<C key="s">preparing</C>, 'Being made or packed.'],
          [<C key="s">ready</C>, 'Ready for the rider.'],
          [<C key="s">picked_up</C>, 'The rider has it.'],
          [<C key="s">arriving</C>, 'Nearly there.'],
          [<C key="s">delivered</C>, 'Done.'],
          [
            <span key="s">
              <C>cancelled</C>, <C>disputed</C>, <C>refunded</C>
            </span>,
            'Stopped, under review, or money returned.',
          ],
        ]}
      />

      <H3 id="your-site">Your NexG listing, on your own website</H3>
      <P>
        Read your merchant and catalogue as NexG publishes them, and show them in your own design.
        Link back to your storefront at{' '}
        <C>https://nexgapp.com/discover?merchant={'{merchant id}'}</C> so guests can order.
      </P>
      <CodeTabs className="mt-6" samples={merchantSamples} title="Request" />

      <H2 id="brand-format">Your data on nexgapp.com</H2>
      <P>
        NexG shows your business in NexG&apos;s own format. What you send is data, never markup:
        names, descriptions, prices, sections and flags. NexG stores it in its own fields and sets
        it with its own design, so every storefront reads the same way and a guest always knows
        where to look.
      </P>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <CodeBlock code={ITEM} language="json" title="What you send" />
        <ItemIllustration />
      </div>
      <List>
        <li>
          No HTML, scripts, styles, fonts or tracking from a partner ever reach a NexG page.
          Formatting characters in text are shown as text.
        </li>
        <li>
          Prices are whole shillings, and the totals guests pay (delivery, service fee) are worked
          out by NexG. A partner never sets a fee.
        </li>
        <li>
          Nothing is public until NexG has verified the merchant&apos;s documents. Age-restricted
          items appear only for a verified licence, labelled 18+ with ID checked at hand-over.
        </li>
        <li>Photos are uploaded in the merchant console and shown in NexG&apos;s frames.</li>
      </List>

      <H2 id="two-way-sync">Two-way sync</H2>
      <Callout tone="soon" title="Designed, not live">
        <p>
          The rules below are written into NexG&apos;s integration code, but no POS, ERP, booking or
          inventory provider is connected through them yet. The first providers will be announced in
          the <A href="/docs/changelog">changelog</A>.
        </p>
      </Callout>
      <P>Every connection moves through the same steps, and cannot skip one:</P>
      <List ordered>
        <li>
          <Strong>Requested</Strong>: someone allowed to manage connections adds your system for
          your business and the locations it serves.
        </li>
        <li>
          <Strong>Tested</Strong>: NexG calls your system with your current credentials, and every
          operation the connection will use must pass.
        </li>
        <li>
          <Strong>Mapped</Strong>: every field is mapped between your records and NexG&apos;s, and
          the mapping is versioned.
        </li>
        <li>
          <Strong>Previewed</Strong>: the changes the mapping would make are shown before any are
          made.
        </li>
        <li>
          <Strong>Active</Strong>: only after approval. A connection can be paused, sent back for
          new credentials, or disconnected once pending work is settled.
        </li>
      </List>
      <P>And once data flows:</P>
      <List>
        <li>
          Each kind of data has one owner: NexG, your system, shared under written rules, or read
          only from yours. Your system can never write what NexG owns.
        </li>
        <li>
          Each event is applied once, by its id, and changes NexG made itself are not applied back.
        </li>
        <li>
          Events apply in your system&apos;s order, or are reconciled when order cannot be trusted.
        </li>
        <li>
          Nothing is deleted because it is missing from a snapshot. Deletion needs an explicit
          delete from your side.
        </li>
      </List>
    </DocPage>
  );
}
