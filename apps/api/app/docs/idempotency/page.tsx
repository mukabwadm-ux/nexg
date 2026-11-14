import { CodeBlock } from '@/components/docs/code';
import { DocPage } from '@/components/docs/doc-page';
import { A, C, H2, List, P, Table } from '@/components/docs/prose';
import { pageMetadata } from '@/lib/reference/navigation';

export const metadata = pageMetadata('/docs/idempotency');

const KEYED = `import { randomUUID } from 'node:crypto';

// Make the key once per booking and save it with the booking before sending,
// so a retry after a crash or a timeout reuses it.
const booking = await db.bookings.create({ ...details, idempotencyKey: randomUUID() });

const res = await fetch('https://api.nexgapp.com/v1/orders', {
  method: 'POST',
  headers: {
    'X-Api-Key': process.env.NEXG_API_KEY,
    'Idempotency-Key': booking.idempotencyKey,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(details),
});`;

export default function IdempotencyPage() {
  return (
    <DocPage
      href="/docs/idempotency"
      toc={[
        { id: 'reads', label: 'Reads are safe to retry' },
        { id: 'keys', label: 'Idempotency keys for writes' },
        { id: 'events', label: 'Events you send NexG' },
        { id: 'banks', label: 'The key NexG sends a bank' },
      ]}
    >
      <H2 id="reads">Reads are safe to retry</H2>
      <P>
        Every endpoint on api.nexgapp.com except booking a service is a <C>GET</C>, and a read never changes anything at NexG. If a
        call times out or fails with a <C>5xx</C>, send it again, waiting longer each time (1, 2,
        then 4 seconds is plenty). After a <C>429</C>, wait for <C>Retry-After</C> first.
      </P>

      <H2 id="keys">Idempotency keys for writes</H2>
      <P>
        A retried write must not happen twice: a second airport transfer is a second car nobody
        asked for. So every write, today{' '}
        <A href="/docs/reference/create-order">booking a service</A>, carries an{' '}
        <C>Idempotency-Key</C> header, and NexG keeps the first answer it gave for that key.
      </P>
      <List>
        <li>The key is 16 to 128 characters. A random UUID is a good choice.</li>
        <li>
          A second request with the same key gets the first answer back, and books nothing new.
          That holds even if the body differs, so never reuse a key for a different booking.
        </li>
        <li>
          Keys are scoped to your merchant and to the endpoint, so they cannot collide with
          another merchant&apos;s.
        </li>
      </List>
      <CodeBlock className="mt-6" code={KEYED} language="javascript" title="Keeping the key with the booking" />

      <H2 id="events">Events you send NexG</H2>
      <P>
        Webhooks run the other way, with the same goal. Give every event an id that stays the
        same on every retry; NexG records each id once and answers a repeat as a duplicate. Sign
        each attempt again, because the signature includes the time. See{' '}
        <A href="/docs/webhooks">Webhooks</A>.
      </P>

      <H2 id="banks">The key NexG sends a bank</H2>
      <P>
        When NexG opens a collection at a bank, it sends <C>Idempotency-Key</C> set to its payment
        reference, so one payment can only ever open one collection. A bank adapter must answer
        a retry the same way:
      </P>
      <Table
        head={['NexG sends', 'The bank answers']}
        rows={[
          ['A new key', '201 Created, with the new collection.'],
          ['The same key and the same body', '200 OK, with the collection it already opened.'],
          ['The same key and a different body', '409 Conflict.'],
        ]}
      />
    </DocPage>
  );
}
