import { CodeBlock, CodeTabs } from '@/components/docs/code';
import { DocPage } from '@/components/docs/doc-page';
import { A, C, Callout, H2, H3, List, P, Table } from '@/components/docs/prose';
import { endpointBySlug } from '@/lib/reference/endpoints';
import { pageMetadata } from '@/lib/reference/navigation';

export const metadata = pageMetadata('/docs/webhooks');

const EVENT = `POST /api/payments/bank/webhook HTTP/1.1
Host: nexgapp.com
Content-Type: application/json
X-Bank-Signature: t=1794655243,v1=5f0c3a…(64 hex characters)
X-Bank-Event-Id: evt_Q1rM7kHf0b2vYp3n

{
  "id": "evt_Q1rM7kHf0b2vYp3n",
  "type": "collection.succeeded",
  "created_at": "2026-11-10T11:20:43.018Z",
  "livemode": false,
  "data": {
    "id": "col_IwUUEAPrDf55OFD0",
    "status": "succeeded",
    "merchant_reference": "NXP-261110-7FD3EEA0C8",
    "amount": 161625,
    "currency": "KES",
    "bank_reference": "SBXB2FACAB615",
    "failure_reason": null
  }
}`;

const VERIFY = [
  {
    language: 'javascript',
    label: 'Node.js',
    code: `import { createHmac, timingSafeEqual } from 'node:crypto';

/** True when header is a valid signature of rawBody, made in the last five minutes. */
export function verifySignature(rawBody, header, secret, now = Date.now()) {
  const m = /^t=(\\d{9,12}),v1=([0-9a-f]{64})$/.exec(header ?? '');
  if (!m) return false;
  if (Math.abs(Math.floor(now / 1000) - Number(m[1])) > 300) return false;
  const expected = createHmac('sha256', secret).update(\`\${m[1]}.\${rawBody}\`).digest();
  const given = Buffer.from(m[2], 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}`,
  },
  {
    language: 'python',
    label: 'Python',
    code: `import hashlib, hmac, re, time

def verify_signature(raw_body: bytes, header: str, secret: str) -> bool:
    """True when header is a valid signature of raw_body, made in the last five minutes."""
    m = re.fullmatch(r"t=(\\d{9,12}),v1=([0-9a-f]{64})", header or "")
    if not m or abs(int(time.time()) - int(m.group(1))) > 300:
        return False
    expected = hmac.new(secret.encode(), m.group(1).encode() + b"." + raw_body,
                        hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, m.group(2))`,
  },
];

const RESULT_DUPLICATE = `HTTP/1.1 200 OK

{ "ok": true, "result": { "ok": true, "duplicate": true } }`;

export default function WebhooksPage() {
  const bankWebhook = endpointBySlug('bank-webhook');
  return (
    <DocPage
      href="/docs/webhooks"
      toc={[
        { id: 'overview', label: 'How it works' },
        { id: 'endpoints', label: 'Where to send events' },
        { id: 'event', label: 'An event' },
        { id: 'signing', label: 'Signing' },
        { id: 'verifying', label: 'Verifying' },
        { id: 'responses-and-retries', label: 'Responses and retries' },
        { id: 'duplicates', label: 'Duplicates and order' },
        { id: 'testing', label: 'Testing' },
        { id: 'coming-soon', label: 'Coming soon' },
      ]}
    >
      <H2 id="overview">How it works</H2>
      <P>
        When something happens on your side that NexG needs to know, such as a guest&apos;s
        payment clearing at your bank, your system posts an event to NexG. Each event is signed
        with a secret only you and NexG hold, so NexG can prove it came from you and was not
        changed on the way.
      </P>
      <List ordered>
        <li>You and NexG share a webhook secret of at least 32 characters, generated on your side.</li>
        <li>You send each event as JSON, with a signature over its exact bytes.</li>
        <li>
          NexG checks the signature and its age at the door, then again inside the database, which
          is what decides. Only then does anything change.
        </li>
        <li>NexG records the event id once, and answers with a status that tells you whether to retry.</li>
      </List>

      <H2 id="endpoints">Where to send events</H2>
      <Table
        head={['Endpoint', 'Who sends', 'Status']}
        rows={[
          [
            <A key="e" href="/docs/reference/bank-webhook">
              POST nexgapp.com/api/payments/bank/webhook
            </A>,
            'Banks: collection succeeded, failed, expired or cancelled.',
            'Sandbox today',
          ],
          [
            <A key="e" href="/docs/reference/bank-webhook-check">
              GET nexgapp.com/api/payments/bank/webhook
            </A>,
            'Anyone: checks the URL is there.',
            'Live',
          ],
        ]}
      />
      <P>
        The bank webhook works with the NexG Sandbox Bank on NexG&apos;s test deployments. On the
        production site it answers <C>503 no_bank_configured</C> until a real bank is connected.
        NexG&apos;s M-Pesa provider calls NexG too, but on its own contract, which is not open to
        partners.
      </P>

      <H2 id="event">An event</H2>
      <P>
        Each event has an <C>id</C> of your choosing that is unique and never changes between
        retries, a <C>type</C>, and the current state of the object in <C>data</C>.
      </P>
      <CodeBlock className="mt-6" code={EVENT} language="http" title="Request" maxHeight />
      <P>
        Every field NexG reads is listed on the{' '}
        <A href="/docs/reference/bank-webhook">endpoint&apos;s reference page</A>. Amounts are
        cents, and must match what NexG asked for to the cent.
      </P>

      <H2 id="signing">Signing</H2>
      <P>The signature goes in one header:</P>
      <CodeBlock
        className="mt-4"
        code={'X-Bank-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">'}
        language="http"
        title="Header"
      />
      <List>
        <li>
          <C>t</C> is the current time in whole seconds. Keep your clock synced (NTP): NexG
          refuses a signature more than five minutes from its own clock, so an old event cannot be
          replayed.
        </li>
        <li>
          <C>v1</C> is the HMAC-SHA256, with the shared secret as the key, of <C>t</C>, a dot, and
          the request body exactly as sent, in lowercase hex (64 characters).
        </li>
        <li>
          Sign the bytes you send. Serialise the JSON once, sign that string, and send that string;
          re-serialising can reorder keys or spacing and break the signature.
        </li>
        <li>Sign every delivery attempt afresh, with a new <C>t</C>. The body stays the same.</li>
      </List>
      {bankWebhook?.samples ? (
        <CodeTabs className="mt-6" samples={bankWebhook.samples} title="Sending a signed event" />
      ) : null}

      <H2 id="verifying">Verifying</H2>
      <P>
        NexG signs the events it sends in the same way: a bank adapter fetching the latest state
        of a collection verifies the answer with this code, and so will you, when NexG starts
        sending events to partners. Verify the raw body before parsing it, and compare in constant
        time.
      </P>
      <CodeTabs className="mt-6" samples={VERIFY} title="Verifying a signature" />

      <H2 id="responses-and-retries">Responses and retries</H2>
      <P>NexG&apos;s answer tells you exactly what to do next.</P>
      <Table
        head={['Status', 'Body', 'What to do']}
        rows={[
          [
            '200',
            <C key="b">{'{ "ok": true, "result": … }'}</C>,
            'Stop. NexG handled it, already had it, or refused it for good; result says which.',
          ],
          [
            '400',
            <C key="b">{'{ "ok": false, "reason": "bad_signature" }'}</C>,
            'Do not resend the same bytes. Check the secret and your clock, then sign again.',
          ],
          [
            '500',
            <C key="b">{'{ "ok": false, "reason": "not_recorded" }'}</C>,
            'Retry with backoff.',
          ],
          [
            '503',
            <C key="b">{'{ "ok": false, "reason": "no_bank_configured" }'}</C>,
            'Bank payments are off on this deployment. Retry later.',
          ],
        ]}
      />
      <P>
        Retry on <C>5xx</C> and on network errors, with growing gaps. The NexG Sandbox Bank waits 2
        seconds, 10 seconds, 1 minute, 5 minutes and 30 minutes, then gives up and keeps the
        delivery for a manual resend. That schedule is a good default.
      </P>
      <H3>What a 200 can mean</H3>
      <Table
        head={['result', 'Meaning']}
        rows={[
          [<C key="r">{'"state": "paid"'}</C>, 'The payment and its order are now paid.'],
          [<C key="r">{'"state": "failed"'}</C>, 'The payment failed; the guest can pay again.'],
          [<C key="r">{'"duplicate": true'}</C>, 'NexG already has this event id. Nothing changed.'],
          [<C key="r">{'"ignored": true'}</C>, 'A status NexG does not act on, such as processing.'],
          [
            <C key="r">{'"reason": "…"'}</C>,
            'Refused for good: unknown_reference, collection_mismatch, currency_mismatch, invalid_amount, amount_mismatch, incomplete_event or unreadable. Fix the cause; resending will not help.',
          ],
        ]}
      />

      <H2 id="duplicates">Duplicates and order</H2>
      <P>
        Deliveries can repeat: you retry, or NexG asks your API for the latest state when an event
        is late. NexG records each event id once, under a lock on the payment, so two copies
        arriving together are handled one after the other and the second is answered as a
        duplicate.
      </P>
      <CodeBlock className="mt-6" code={RESULT_DUPLICATE} language="http" title="A repeat" />
      <P>
        A payment settles once. NexG acts on final statuses (succeeded, failed, expired,
        cancelled), and once a payment is paid, any later event for it is answered as a duplicate
        and changes nothing. If money is reported on a collection NexG has since replaced, the
        event is kept and raised to NexG finance to refund or apply by hand. It never quietly
        settles an order.
      </P>

      <H2 id="testing">Testing</H2>
      <List>
        <li>
          Check the endpoint is reachable: <C>curl https://nexgapp.com/api/payments/bank/webhook</C>.
        </li>
        <li>
          Run the <A href="/docs/bank-transfers">NexG Sandbox Bank</A>: it signs and retries events
          exactly as described here, lists every delivery, and resends one on request.
        </li>
        <li>Never test with a live secret, and never put a secret in a URL, a log or a ticket.</li>
      </List>

      <H2 id="coming-soon">Coming soon</H2>
      <Callout tone="soon" title="Events from more partners">
        <p>
          Today only banks send events to NexG. Connections for POS, ERP, booking and inventory
          systems already have a place for a per-connection webhook secret; the endpoints that
          accept their events will be listed in the reference when they ship.
        </p>
      </Callout>
      <Callout tone="soon" title="Events NexG sends you">
        <p>
          NexG does not push order changes to merchants yet. Until it does, poll{' '}
          <A href="/docs/reference/list-orders">GET /v1/orders</A>; once a minute costs 3 tokens.
        </p>
      </Callout>
    </DocPage>
  );
}
