import { CodeBlock, CodeTabs } from '@/components/docs/code';
import { DocPage } from '@/components/docs/doc-page';
import { A, C, H2, H3, List, P, Strong, Table } from '@/components/docs/prose';
import { pageMetadata } from '@/lib/reference/navigation';

export const metadata = pageMetadata('/docs/bank-transfers');

const OPEN_REQUEST = `POST /v1/collections
Authorization: Bearer <bank API key>
Idempotency-Key: NXP-261110-7FD3EEA0C8
Content-Type: application/json

{
  "merchant_reference": "NXP-261110-7FD3EEA0C8",
  "amount": 161625,
  "currency": "KES",
  "description": "NexG order NX-261110-0003",
  "customer": { "name": "Wanjiru Kamau", "email": "guest@example.com" },
  "callback_url": "https://nexgapp.com/api/payments/bank/webhook",
  "return_url": "https://nexgapp.com/pay/NXP-261110-7FD3EEA0C8"
}`;

const OPEN_RESPONSE = `{
  "id": "col_IwUUEAPrDf55OFD0",
  "object": "collection",
  "status": "pending",
  "merchant_reference": "NXP-261110-7FD3EEA0C8",
  "amount": 161625,
  "currency": "KES",
  "description": "NexG order NX-261110-0003",
  "customer": { "name": "Wanjiru Kamau", "email": "guest@example.com" },
  "payer": null,
  "bank_reference": null,
  "failure_code": null,
  "failure_reason": null,
  "checkout_url": "https://bank-sandbox.example.com/checkout/col_IwUUEAPrDf55OFD0",
  "created_at": "2026-11-10T11:20:04.112Z",
  "expires_at": "2026-11-10T11:50:04.112Z",
  "completed_at": null,
  "livemode": false
}`;

const EVENT = `POST /api/payments/bank/webhook
Content-Type: application/json
X-Bank-Signature: t=1794655243,v1=5f0c…64 hex characters…
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
    "payer": { "name": "Wanjiru Kamau", "bank": "NexG Sandbox Bank", "account": "****4821" },
    "bank_reference": "SBXB2FACAB615",
    "failure_code": null,
    "failure_reason": null,
    "completed_at": "2026-11-10T11:20:43.018Z",
    "…": "the other collection fields"
  }
}`;

const VERIFY = [
  {
    language: 'javascript',
    label: 'Node.js',
    code: `import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyBankSignature(rawBody, header, secret, now = Date.now()) {
  const m = /^t=(\\d{9,12}),v1=([0-9a-f]{64})$/.exec(header ?? '');
  if (!m) return false;
  if (Math.abs(Math.floor(now / 1000) - Number(m[1])) > 300) return false; // 5 minutes
  const expected = createHmac('sha256', secret).update(\`\${m[1]}.\${rawBody}\`).digest();
  const given = Buffer.from(m[2], 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}`,
  },
  {
    language: 'python',
    label: 'Python',
    code: `import hashlib, hmac, re, time

def verify_bank_signature(raw_body: bytes, header: str, secret: str) -> bool:
    m = re.fullmatch(r"t=(\\d{9,12}),v1=([0-9a-f]{64})", header or "")
    if not m or abs(int(time.time()) - int(m.group(1))) > 300:
        return False
    expected = hmac.new(secret.encode(), m.group(1).encode() + b"." + raw_body,
                        hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, m.group(2))`,
  },
];

const RUN = [
  {
    language: 'shell-local',
    label: 'Local',
    code: `# On the machine that runs the sandbox. Generate the values there;
# never paste them into chat or commit them.
export SANDBOX_API_KEY=$(openssl rand -hex 24)
export SANDBOX_WEBHOOK_SECRET=$(openssl rand -hex 32)
export PUBLIC_URL=http://localhost:4010
pnpm --filter @nexg/bank-sandbox dev

curl http://localhost:4010/health
# {"ok":true,"bank":"NexG Sandbox Bank","livemode":false}`,
  },
  {
    language: 'shell-docker',
    label: 'Docker',
    code: `docker build -f apps/bank-sandbox/Dockerfile -t nexg-bank-sandbox .
docker run -d --name nexg-bank-sandbox --restart unless-stopped \\
  -p 127.0.0.1:4010:4010 -v nexg-bank-sandbox:/data \\
  --env-file apps/bank-sandbox/.env nexg-bank-sandbox
# Put it behind HTTPS (e.g. Caddy: bank-sandbox.<your domain> → 127.0.0.1:4010)
# and set PUBLIC_URL to that https address.`,
  },
];

const NEXG_ENV = `# Web app (Vercel or apps/web/.env.local). Server-only: never NEXT_PUBLIC_.
BANK_PROVIDER=sandbox
BANK_API_URL=https://bank-sandbox.<your domain>   # or http://localhost:4010
BANK_API_KEY=<same value as SANDBOX_API_KEY>
BANK_WEBHOOK_SECRET=<same value as SANDBOX_WEBHOOK_SECRET>

# Supabase SQL editor, once per environment (type the value there):
# select vault.create_secret('<same value as BANK_WEBHOOK_SECRET>', 'bank_webhook_secret');`;

const SIMULATE = `# Drive an outcome without the approval page (automated tests)
curl -X POST http://localhost:4010/v1/collections/col_…/simulate \\
  -H "Authorization: Bearer $SANDBOX_API_KEY" -H "Content-Type: application/json" \\
  -d '{"outcome":"succeed"}'   # or insufficient_funds, decline, cancel, expire

# See and resend webhooks
curl "http://localhost:4010/v1/webhook-deliveries?collection_id=col_…" \\
  -H "Authorization: Bearer $SANDBOX_API_KEY"
curl -X POST http://localhost:4010/v1/webhook-deliveries/dlv_…/retry \\
  -H "Authorization: Bearer $SANDBOX_API_KEY"`;

export default function BankTransfersPage() {
  return (
    <DocPage
      href="/docs/bank-transfers"
      toc={[
        { id: 'status', label: 'Status' },
        { id: 'flow', label: 'How a bank payment works' },
        { id: 'bank-api', label: 'The bank API NexG calls' },
        { id: 'webhooks', label: 'Webhooks NexG receives' },
        { id: 'signatures', label: 'Signatures' },
        { id: 'guarantees', label: 'What NexG guarantees' },
        { id: 'sandbox', label: 'NexG Sandbox Bank' },
        { id: 'connect-sandbox', label: 'Connecting NexG to the sandbox' },
        { id: 'real-bank', label: 'Connecting a real bank' },
      ]}
    >
      <P className="mt-0">
        Guests can pay for an order straight from a bank account at checkout. NexG asks the bank
        to collect the exact amount owed against a NexG payment reference, the guest approves it
        on the bank&apos;s own page, and the bank tells NexG what happened in a signed event. Only
        that signed event marks an order paid.
      </P>
      <P>
        The first bank is the <Strong>NexG Sandbox Bank</Strong>: a stand-in that behaves like a
        bank so the whole flow can be tested end to end. No real money moves, and it is refused on
        the production site. A real bank connects through the same contract, described below.
      </P>

      <H2 id="status">Status</H2>
      <Table
        head={['Capability', 'Status', 'Notes']}
        rows={[
          ['Bank collection at checkout', 'Available in sandbox', 'Orders, from checkout and the pay page.'],
          ['NexG Sandbox Bank', 'Available', <>Self-hosted service in <C>apps/bank-sandbox</C>.</>],
          ['A real bank', 'Not connected', 'Needs a bank chosen, its sandbox keys, and an adapter (see the end).'],
          ['Settlement payouts to merchants', 'Not implemented', 'NexG does not accept payout instructions over any API.'],
        ]}
      />

      <H2 id="flow">How a bank payment works</H2>
      <List ordered>
        <li>
          The guest chooses <Strong>Bank</Strong> at checkout. NexG creates the order and a payment
          row with a reference such as <C>NXP-261110-7FD3EEA0C8</C>. The amount comes from the
          order in the database, never from the browser.
        </li>
        <li>
          NexG opens a <em>collection</em> at the bank for that reference and amount, then sends
          the guest to the bank&apos;s <C>checkout_url</C>.
        </li>
        <li>
          The guest approves (or cancels) at the bank and is sent back to{' '}
          <C>/pay/&lt;reference&gt;</C>.
        </li>
        <li>
          The bank posts a signed event to NexG&apos;s webhook. The database checks the signature,
          its age, the collection, the amount and the currency, then marks the payment and the
          order paid, or the payment failed with the bank&apos;s reason.
        </li>
        <li>
          If the webhook is late or lost, the pay page asks the bank for the collection&apos;s
          latest signed event and records it the same way. Either path settles a payment once.
        </li>
      </List>

      <H2 id="bank-api">The bank API NexG calls</H2>
      <P>
        Any bank (or bank adapter) NexG connects to provides these endpoints. The sandbox
        implements them exactly. Every call sends <C>Authorization: Bearer &lt;bank API key&gt;</C>.
        Amounts are whole numbers in cents (KES 1,616.25 is <C>161625</C>); only <C>KES</C> is
        accepted. Errors are <C>{'{"error": {"code": "...", "message": "..."}}'}</C> with a 4xx or
        5xx status.
      </P>
      <H3 id="open-collection">Open a collection</H3>
      <P>
        <C>Idempotency-Key</C> is required. NexG sends the payment reference, so a retried request
        returns the same collection (200) instead of opening a second one; the same key with a
        different body is refused (409).
      </P>
      <CodeBlock className="mt-6" code={OPEN_REQUEST} language="http" title="Request" />
      <CodeBlock className="mt-4" code={OPEN_RESPONSE} language="json" title="Response · 201 Created" maxHeight />
      <Table
        head={['Endpoint', 'What it does']}
        rows={[
          [<C key="e">GET /v1/collections/{'{id}'}</C>, 'Read a collection.'],
          [
            <C key="e">GET /v1/collections/{'{id}'}/event</C>,
            <>
              The latest state as an event, signed like a webhook (<C>X-Bank-Signature</C>
              header). NexG uses it when a webhook is late. Its id is{' '}
              <C>snap_&lt;collection&gt;_&lt;status&gt;</C>.
            </>,
          ],
          [<C key="e">POST /v1/collections/{'{id}'}/cancel</C>, 'Cancel a collection that is still pending.'],
          [<C key="e">GET /health</C>, 'No key needed.'],
        ]}
      />

      <H2 id="webhooks">Webhooks NexG receives</H2>
      <P>
        The bank posts every change to the <C>callback_url</C> NexG gave it, which is{' '}
        <C>https://&lt;NexG web domain&gt;/api/payments/bank/webhook</C>. It is in the{' '}
        <A href="/docs/reference/bank-webhook">reference</A>, and{' '}
        <A href="/docs/webhooks">Webhooks</A> covers signing, retries and duplicates in full.
      </P>
      <CodeBlock className="mt-6" code={EVENT} language="http" title="Request" maxHeight />
      <Table
        head={['Event type', 'Collection status', 'What NexG does']}
        rows={[
          [<C key="t">collection.succeeded</C>, 'succeeded', 'Marks the payment and order paid and keeps the bank reference.'],
          [<C key="t">collection.failed</C>, 'failed', 'Fails the payment with the bank’s failure_reason; the guest can pay again.'],
          [<C key="t">collection.expired</C>, 'expired', 'Fails the payment: not approved in time.'],
          [<C key="t">collection.cancelled</C>, 'cancelled', 'Fails the payment: the guest cancelled.'],
          [<C key="t">collection.processing</C>, 'processing', 'Nothing yet; the guest sees “Waiting for your bank”.'],
        ]}
      />
      <Table
        head={['NexG response', 'Meaning for the bank']}
        rows={[
          ['200', 'Handled, a duplicate, or permanently refused (the body says which). Do not retry.'],
          ['400 bad_signature', 'The signature did not verify or the event is over five minutes old. Do not retry the same bytes.'],
          ['500 not_recorded', 'NexG could not record it right now. Retry.'],
          ['503 no_bank_configured', 'Bank payments are switched off on this deployment. Retry later.'],
        ]}
      />

      <H2 id="signatures">Signatures</H2>
      <P>
        <C>X-Bank-Signature: t=&lt;unix seconds&gt;,v1=&lt;hex HMAC-SHA256&gt;</C>, where the HMAC
        is over the exact bytes <C>&lt;t&gt;.&lt;raw body&gt;</C> with the shared webhook secret.
        Receivers refuse a timestamp more than five minutes from their clock, so an old event cannot
        be replayed. Verify the raw body before parsing it, and compare in constant time.
      </P>
      <CodeTabs className="mt-6" samples={VERIFY} title="Verifying a signature" />

      <H2 id="guarantees">What NexG guarantees</H2>
      <List>
        <li>
          The signature is checked twice: in the webhook route, and again inside the database
          (against the Vault secret <C>bank_webhook_secret</C>), so nobody can mark a payment paid
          by calling the database directly.
        </li>
        <li>
          The amount and currency must match what NexG asked for. A different amount fails the
          payment and raises a high-severity audit event.
        </li>
        <li>
          The collection must be the one recorded for that payment. If a bank reports money paid on
          a collection NexG has replaced, the event is kept, flagged unhandled, and raised for
          finance to refund or apply by hand. It never settles the order silently.
        </li>
        <li>Each event is recorded once; repeats are answered as duplicates.</li>
        <li>
          Payments made through the sandbox are stored with provider <C>bank_sandbox</C>, and the
          sandbox is refused when <C>VERCEL_ENV=production</C>, so a test approval is never taken
          for money.
        </li>
      </List>

      <H2 id="sandbox">NexG Sandbox Bank</H2>
      <P>
        A small Node service in <C>apps/bank-sandbox</C>. It keeps state in memory, or in a JSON
        file when <C>DATA_FILE</C> is set, and retries webhooks after 2 s, 10 s, 1 min, 5 min and
        30 min.
      </P>
      <CodeTabs className="mt-6" samples={RUN} title="Run the sandbox" />
      <H3 id="test-accounts">Test accounts on the approval page</H3>
      <Table
        head={['Account', 'Behaviour']}
        rows={[
          ['Wanjiru Kamau · 0110 0000 4821', 'KES 500,000 available. Pays.'],
          ['Otieno Achieng · 0110 0000 1177', 'KES 150 available. Fails with insufficient_funds above that.'],
          ['Blocked Account · 0110 0000 9020', 'Fails with account_blocked.'],
          ['Delayed Approval · 0110 0000 3315', 'Processing for 20 seconds (SLOW_APPROVAL_SECONDS), then pays.'],
        ]}
      />
      <P>
        A collection not approved within 30 minutes (<C>COLLECTION_TTL_MINUTES</C>) expires.
        Balances reset when the sandbox restarts.
      </P>
      <CodeBlock className="mt-6" code={SIMULATE} language="curl" title="Testing outcomes and deliveries" />

      <H2 id="connect-sandbox">Connecting NexG to the sandbox</H2>
      <P>
        Generate the API key and webhook secret where the sandbox runs and give the same two values
        to the NexG web app. The <Strong>Bank</Strong> option appears at checkout only when all four
        settings are present.
      </P>
      <CodeBlock className="mt-6" code={NEXG_ENV} language="curl" title="Settings" />
      <P>
        The database migration <C>20261130000100_bank_collections.sql</C> must be run first.
      </P>

      <H2 id="real-bank">Connecting a real bank</H2>
      <List ordered>
        <li>Choose the bank and register on its developer portal to get sandbox credentials.</li>
        <li>
          Add an adapter in <C>apps/web/lib/bank</C> that implements <C>BankProvider</C> (
          <C>openCollection</C>, <C>latestEvent</C>, <C>cancelCollection</C>) with provider id{' '}
          <C>bank_&lt;name&gt;</C>, translating the bank&apos;s API and callbacks into the signed
          events above.
        </li>
        <li>Test it against the bank&apos;s sandbox exactly as against the NexG Sandbox Bank.</li>
        <li>Only after finance approves limits and reconciliation, allow it on the production site.</li>
      </List>
      <P className="text-sm">
        Merchants connecting their own systems should start with the{' '}
        <A href="/docs/merchants">merchant integration guide</A>.
      </P>
    </DocPage>
  );
}
