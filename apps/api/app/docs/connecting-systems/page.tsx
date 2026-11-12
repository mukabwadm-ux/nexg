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
      <div className="border-border bg-surface rounded-xl border p-4 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-micro text-gold-text font-bold uppercase">Popular</p>
            <p className="text-ink mt-1 text-base font-extrabold leading-snug">Nyama choma platter</p>
            <p className="text-muted mt-1 text-sm leading-5">Half kilo of goat ribs, kachumbari, ugali</p>
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
              Posts signed events to NexG. See <A href="/docs/webhooks">Webhooks</A>.
            </span>,
            'Banks, in sandbox. Other systems coming soon.',
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
            'Merchant console, or a CSV export from your system',
            <C key="o">GET /v1/catalog/merchants/{'{id}'}</C>,
            'Sync from your system',
          ],
          [
            'Availability',
            'The available column, in the console or CSV',
            'available on each item',
            'Stock levels from your inventory',
          ],
          [
            'Orders and their stage',
            'Guests order on nexgapp.com',
            <C key="o">GET /v1/orders</C>,
            'Bookings by API; order events pushed to you',
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
        console (<Strong>Menu</Strong>, then import). The import shows a preview with any
        problems row by row before anything is written. A row with an <C>id</C> updates that item;
        a row without one updates the item with exactly that name, or adds a new one, so
        re-importing the same file never duplicates products.
      </P>
      <CodeBlock className="mt-6" code={CSV} language="text" title="catalogue.csv (first columns)" />
      <P>
        The full template adds <C>portion_size</C>, <C>ingredients</C>, <C>allergens</C>,{' '}
        <C>dietary_labels</C>, <C>prep_time_minutes</C>, <C>availability_notes</C>,{' '}
        <C>handling_notes</C> and <C>storage_guidance</C>. Download it from the same page. Photos
        are uploaded in the console, not in the file. Prices are whole shillings.
      </P>

      <H3 id="orders">Your orders, from NexG to your system</H3>
      <P>
        Issue a key with <C>merchant_read</C> for your merchant, then poll your orders once a
        minute and upsert them by <C>order_id</C>. Map NexG&apos;s stage to your own statuses
        once, in one place.
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
        Read your merchant and catalogue as NexG publishes them, and show them in your own
        design. Link back to your storefront at{' '}
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
          The rules below are written into NexG&apos;s integration code, but no POS, ERP, booking
          or inventory provider is connected through them yet. The first providers will be
          announced in the <A href="/docs/changelog">changelog</A>.
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
          <Strong>Mapped</Strong>: every field is mapped between your records and NexG&apos;s,
          and the mapping is versioned.
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
        <li>Each event is applied once, by its id, and changes NexG made itself are not applied back.</li>
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
