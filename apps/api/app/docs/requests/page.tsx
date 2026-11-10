import { CodeBlock } from '@/components/docs/code';
import { DocPage } from '@/components/docs/doc-page';
import { A, C, Callout, H2, H3, List, P, Table } from '@/components/docs/prose';
import { pageMetadata } from '@/lib/reference/navigation';

export const metadata = pageMetadata('/docs/requests');

const LIST = `{
  "ok": true,
  "data": {
    "items": [ { "id": "9b2f6c1e-…", "trading_name": "Sokoni Grill House", "…": "…" } ],
    "next_cursor": "MjAyNi0xMC0yMVQwODoxNTowMCswMDowMHw5YjJmNmMxZS00YTdk…"
  },
  "meta": { "api_version": "v1", "limit": 25 }
}`;

const ONE = `{
  "ok": true,
  "data": {
    "merchant": { "id": "9b2f6c1e-…", "trading_name": "Sokoni Grill House", "…": "…" },
    "catalogue": [ { "name": "Nyama choma platter", "price_kes": 1450, "…": "…" } ]
  },
  "meta": { "api_version": "v1" }
}`;

const ERROR = `{
  "ok": false,
  "error": {
    "code": "invalid_request",
    "message": "Unrecognized key(s) in object: 'town'",
    "fields": { "_": "Unrecognized key(s) in object: 'town'" }
  },
  "meta": { "api_version": "v1" }
}`;

const PAGING = `// Follow next_cursor until it is null. Stop if a page repeats.
let cursor = null;
const seen = new Set();

do {
  const url = new URL('https://api.nexgapp.com/v1/orders');
  if (cursor) url.searchParams.set('cursor', cursor);

  const res = await fetch(url, { headers: { 'X-Api-Key': process.env.NEXG_API_KEY } });
  const body = await res.json();
  if (!body.ok) throw new Error(\`\${res.status} \${body.error.code}\`);

  const fresh = body.data.items.filter((order) => !seen.has(order.order_id));
  if (fresh.length === 0) break;
  fresh.forEach((order) => seen.add(order.order_id));
  await saveOrders(fresh);

  cursor = body.data.next_cursor;
} while (cursor);`;

export default function RequestsPage() {
  return (
    <DocPage
      href="/docs/requests"
      toc={[
        { id: 'requests', label: 'Requests' },
        { id: 'envelope', label: 'The response envelope' },
        { id: 'pagination', label: 'Pagination' },
        { id: 'money', label: 'Money' },
        { id: 'times-and-ids', label: 'Times and ids' },
        { id: 'caching', label: 'Caching' },
        { id: 'request-ids', label: 'Request ids' },
      ]}
    >
      <H2 id="requests">Requests</H2>
      <List>
        <li>Every call is HTTPS. Reads are <C>GET</C> with their options in the query string.</li>
        <li>
          List endpoints refuse a query parameter they do not know with{' '}
          <C>400 invalid_request</C>, so a typo such as <C>town=nairobi</C> fails loudly instead of
          being ignored.
        </li>
        <li>
          If a parameter is repeated (<C>?city=nairobi&amp;city=mombasa</C>), the first one is
          used.
        </li>
        <li>
          Writes, when they ship, take a JSON body with{' '}
          <C>Content-Type: application/json</C> and an <C>Idempotency-Key</C> header.
        </li>
      </List>

      <H2 id="envelope">The response envelope</H2>
      <P>
        Every response, success or failure, is a JSON object with <C>ok</C> first. Check it
        before anything else.
      </P>
      <H3>A list</H3>
      <CodeBlock className="mt-4" code={LIST} language="json" title="200 OK" />
      <H3>One object</H3>
      <CodeBlock className="mt-4" code={ONE} language="json" title="200 OK" />
      <H3>An error</H3>
      <CodeBlock className="mt-4" code={ERROR} language="json" title="400 Bad Request" />
      <P>
        <C>meta.api_version</C> is always <C>v1</C> on these endpoints. On a list,{' '}
        <C>meta.limit</C> is the page size the server applied. See{' '}
        <A href="/docs/errors">Errors</A> for every error code.
      </P>

      <H2 id="pagination">Pagination</H2>
      <P>
        Lists are paged with a cursor, never an offset. Each list has a fixed order (merchants by
        when they went live, newest first; orders by when they were placed, newest first;
        experiences by start time, soonest first), and <C>next_cursor</C> marks where the page
        ended. Pass it back as <C>cursor</C> to get the next page, unchanged; it is opaque and its
        contents may change. When <C>next_cursor</C> is <C>null</C>, there are no more pages.
      </P>
      <CodeBlock className="mt-6" code={PAGING} language="javascript" title="Reading every page" />
      <Callout tone="issue">
        <p>
          The <C>limit</C> parameter is refused with <C>400</C> today, so pages are always 25. On
          merchants and experiences, pages after the first can skip rows. An unreadable cursor
          returns the first page again, which is why the loop above stops when a page repeats.
          These are listed on each endpoint and will be logged in the{' '}
          <A href="/docs/changelog">changelog</A> when fixed.
        </p>
      </Callout>

      <H2 id="money">Money</H2>
      <P>
        Amounts are integers, never decimals, so they add up exactly. Two units are in use, and the
        field name always says which.
      </P>
      <Table
        head={['Field', 'Unit', 'Example']}
        rows={[
          [<C key="f">price_kes</C>, 'Whole Kenyan shillings', <span key="e"><C>1450</C> is KES 1,450</span>],
          [<C key="f">total_cents</C>, 'Cents', <span key="e"><C>161625</C> is KES 1,616.25</span>],
          [<C key="f">pay_on_delivery_cap_kes</C>, 'Whole Kenyan shillings', <span key="e"><C>5000</C> is KES 5,000</span>],
        ]}
      />
      <P>
        The currency is always KES. A price on an order is fixed when the order is placed, and NexG
        works it out itself: no request ever states a price.
      </P>

      <H2 id="times-and-ids">Times and ids</H2>
      <List>
        <li>
          Times are ISO 8601 with an offset, and NexG sends them in UTC, for example{' '}
          <C>2026-11-10T09:42:17.204+00:00</C>. Show them to people in Nairobi time (UTC+3).
        </li>
        <li>When you send a time, include its offset: <C>2026-11-14T06:30:00+03:00</C>.</li>
        <li>
          Ids are UUIDs. Orders also have a <C>reference</C> such as <C>NX-261110-0003</C> for
          people to read. Store both.
        </li>
      </List>

      <H2 id="caching">Caching</H2>
      <P>
        Public data may come from a shared cache, so a change at NexG, such as a merchant closing
        early, can take a minute or more to reach you. Your own orders and every error are never
        cached.
      </P>
      <Table
        head={['Endpoints', 'Cache-Control', 'Fresh for']}
        rows={[
          [
            'Merchants, a merchant, experiences',
            <C key="c">public, s-maxage=60, stale-while-revalidate=300</C>,
            '60 seconds',
          ],
          [
            'Zones, services',
            <C key="c">public, s-maxage=300, stale-while-revalidate=3600</C>,
            '5 minutes',
          ],
          ['Your orders, every error', <C key="c">no-store</C>, 'Never cached'],
        ]}
      />

      <H2 id="request-ids">Request ids</H2>
      <P>
        Every JSON error carries an <C>X-Request-Id</C> header, unique to that response. Log it with
        the failure. NexG does not record it yet, so when you report a problem, include the time,
        the endpoint and the error code too.
      </P>
    </DocPage>
  );
}
