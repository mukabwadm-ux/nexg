import Link from 'next/link';

function Code({ children }: { children: string }) {
  return (
    <pre className="bg-surface overflow-x-auto rounded-lg border p-3 font-mono text-xs leading-relaxed">
      {children}
    </pre>
  );
}

const c = (s: string) => <code className="font-mono text-xs">{s}</code>;

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

const OPEN_RESPONSE = `201 Created

{
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

const VERIFY_NODE = `import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyBankSignature(rawBody, header, secret, now = Date.now()) {
  const m = /^t=(\\d{9,12}),v1=([0-9a-f]{64})$/.exec(header ?? '');
  if (!m) return false;
  if (Math.abs(Math.floor(now / 1000) - Number(m[1])) > 300) return false; // 5 minutes
  const expected = createHmac('sha256', secret).update(\`\${m[1]}.\${rawBody}\`).digest();
  const given = Buffer.from(m[2], 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}`;

const VERIFY_PYTHON = `import hashlib, hmac, re, time

def verify_bank_signature(raw_body: bytes, header: str, secret: str) -> bool:
    m = re.fullmatch(r"t=(\\d{9,12}),v1=([0-9a-f]{64})", header or "")
    if not m or abs(int(time.time()) - int(m.group(1))) > 300:
        return False
    expected = hmac.new(secret.encode(), m.group(1).encode() + b"." + raw_body,
                        hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, m.group(2))`;

const RUN_LOCAL = `# On the machine that runs the sandbox. Generate the values there;
# never paste them into chat or commit them.
export SANDBOX_API_KEY=$(openssl rand -hex 24)
export SANDBOX_WEBHOOK_SECRET=$(openssl rand -hex 32)
export PUBLIC_URL=http://localhost:4010
pnpm --filter @nexg/bank-sandbox dev

curl http://localhost:4010/health
# {"ok":true,"bank":"NexG Sandbox Bank","livemode":false}`;

const RUN_DOCKER = `docker build -f apps/bank-sandbox/Dockerfile -t nexg-bank-sandbox .
docker run -d --name nexg-bank-sandbox --restart unless-stopped \\
  -p 127.0.0.1:4010:4010 -v nexg-bank-sandbox:/data \\
  --env-file apps/bank-sandbox/.env nexg-bank-sandbox
# Put it behind HTTPS (e.g. Caddy: bank-sandbox.<your domain> → 127.0.0.1:4010)
# and set PUBLIC_URL to that https address.`;

const NEXG_ENV = `# Web app (Vercel or apps/web/.env.local). Server-only: never NEXT_PUBLIC_.
BANK_PROVIDER=sandbox
BANK_API_URL=https://bank-sandbox.<your domain>   # or http://localhost:4010
BANK_API_KEY=<same value as SANDBOX_API_KEY>
BANK_WEBHOOK_SECRET=<same value as SANDBOX_WEBHOOK_SECRET>

-- Supabase SQL editor, once per environment (type the value there):
select vault.create_secret('<same value as BANK_WEBHOOK_SECRET>', 'bank_webhook_secret');`;

const SIMULATE = `# Drive an outcome without the approval page (automated tests)
curl -X POST http://localhost:4010/v1/collections/col_…/simulate \\
  -H "Authorization: Bearer $SANDBOX_API_KEY" -H "Content-Type: application/json" \\
  -d '{"outcome":"succeed"}'   # or insufficient_funds, decline, cancel, expire

# See and resend webhooks
curl "http://localhost:4010/v1/webhook-deliveries?collection_id=col_…" \\
  -H "Authorization: Bearer $SANDBOX_API_KEY"
curl -X POST http://localhost:4010/v1/webhook-deliveries/dlv_…/retry \\
  -H "Authorization: Bearer $SANDBOX_API_KEY"`;

function Table({ head, rows }: { head: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-ink/20 text-ink border-b">
            {head.map((h) => (
              <th key={h} scope="col" className="py-2 pr-4 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-ink/10 border-b align-top">
              {row.map((cell, j) => (
                <td key={j} className={`py-2.5 pr-4 ${j === 0 ? 'text-ink font-medium' : ''}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BankTransfersPage() {
  return (
    <article className="text-ink/80 max-w-3xl space-y-10">
      <header className="space-y-3">
        <h2 className="text-ink text-3xl font-extrabold">Bank collections</h2>
        <p>
          Guests can pay for an order straight from a bank account at checkout. NexG asks the bank
          to collect the exact amount owed against a NexG payment reference, the guest approves it
          on the bank&apos;s own page, and the bank tells NexG what happened in a signed event. Only
          that signed event marks an order paid.
        </p>
        <p>
          The first bank is the <strong>NexG Sandbox Bank</strong>: a stand-in that behaves like a
          bank so the whole flow can be tested end to end. No real money moves, and it is refused on
          the production site. A real bank connects through the same contract, described below.
        </p>
      </header>

      <section className="space-y-3">
        <h3 className="text-ink text-xl font-bold">Status</h3>
        <Table
          head={['Capability', 'Status', 'Notes']}
          rows={[
            [
              'Bank collection at checkout',
              'Available in sandbox',
              'Orders, from checkout and the pay page.',
            ],
            [
              'NexG Sandbox Bank',
              'Available',
              <>Self-hosted service in {c('apps/bank-sandbox')}.</>,
            ],
            [
              'A real bank',
              'Not connected',
              'Needs a bank chosen, its sandbox keys, and an adapter (see the end).',
            ],
            [
              'Settlement payouts to merchants',
              'Not implemented',
              'NexG does not accept payout instructions over any API.',
            ],
          ]}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-ink text-xl font-bold">How a bank payment works</h3>
        <ol className="list-decimal space-y-2 pl-6">
          <li>
            The guest chooses <strong>Bank</strong> at checkout. NexG creates the order and a
            payment row with a reference such as {c('NXP-261110-7FD3EEA0C8')}. The amount comes from
            the order in the database, never from the browser.
          </li>
          <li>
            NexG opens a <em>collection</em> at the bank for that reference and amount, then sends
            the guest to the bank&apos;s {c('checkout_url')}.
          </li>
          <li>
            The guest approves (or cancels) at the bank and is sent back to {c('/pay/<reference>')}.
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
        </ol>
      </section>

      <section className="space-y-4">
        <h3 className="text-ink text-xl font-bold">The bank API NexG calls</h3>
        <p>
          Any bank (or bank adapter) NexG connects to provides these endpoints. The sandbox
          implements them exactly. Every call sends {c('Authorization: Bearer <bank API key>')}.
          Amounts are whole numbers in cents (KES 1,616.25 is {c('161625')}); only {c('KES')} is
          accepted. Errors are {c('{"error": {"code": "...", "message": "..."}}')} with a 4xx or 5xx
          status.
        </p>

        <h4 className="text-ink font-bold">Open a collection</h4>
        <p>
          {c('Idempotency-Key')} is required. NexG sends the payment reference, so a retried request
          returns the same collection (200) instead of opening a second one; the same key with a
          different body is refused (409).
        </p>
        <Code>{OPEN_REQUEST}</Code>
        <Code>{OPEN_RESPONSE}</Code>

        <Table
          head={['Endpoint', 'What it does']}
          rows={[
            [c('GET /v1/collections/{id}'), 'Read a collection.'],
            [
              c('GET /v1/collections/{id}/event'),
              <>
                The latest state as an event, signed like a webhook ({c('X-Bank-Signature')}{' '}
                header). NexG uses it when a webhook is late. Its id is{' '}
                {c('snap_<collection>_<status>')}.
              </>,
            ],
            [c('POST /v1/collections/{id}/cancel'), 'Cancel a collection that is still pending.'],
            [c('GET /health'), 'No key needed.'],
          ]}
        />
      </section>

      <section className="space-y-4">
        <h3 className="text-ink text-xl font-bold">Webhooks NexG receives</h3>
        <p>
          The bank posts every change to the {c('callback_url')} NexG gave it, which is{' '}
          {c('https://<NexG web domain>/api/payments/bank/webhook')}.
        </p>
        <Code>{EVENT}</Code>
        <Table
          head={['Event type', 'Collection status', 'What NexG does']}
          rows={[
            [
              c('collection.succeeded'),
              'succeeded',
              'Marks the payment and order paid and keeps the bank reference.',
            ],
            [
              c('collection.failed'),
              'failed',
              'Fails the payment with the bank’s failure_reason; the guest can pay again.',
            ],
            [c('collection.expired'), 'expired', 'Fails the payment: not approved in time.'],
            [c('collection.cancelled'), 'cancelled', 'Fails the payment: the guest cancelled.'],
            [
              c('collection.processing'),
              'processing',
              'Nothing yet; the guest sees “Waiting for your bank”.',
            ],
          ]}
        />
        <Table
          head={['NexG response', 'Meaning for the bank']}
          rows={[
            [
              '200',
              'Handled, a duplicate, or permanently refused (the body says which). Do not retry.',
            ],
            [
              '400 bad_signature',
              'The signature did not verify or the event is over five minutes old. Do not retry the same bytes.',
            ],
            ['500 not_recorded', 'NexG could not record it right now. Retry.'],
            [
              '503 no_bank_configured',
              'Bank payments are switched off on this deployment. Retry later.',
            ],
          ]}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-ink text-xl font-bold">Signatures</h3>
        <p>
          {c('X-Bank-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256>')}, where the HMAC is over the
          exact bytes {c('<t>.<raw body>')} with the shared webhook secret. Receivers refuse a
          timestamp more than five minutes from their clock, so an old event cannot be replayed.
          Verify the raw body before parsing it, and compare in constant time.
        </p>
        <Code>{VERIFY_NODE}</Code>
        <Code>{VERIFY_PYTHON}</Code>
      </section>

      <section className="space-y-3">
        <h3 className="text-ink text-xl font-bold">What NexG guarantees</h3>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            The signature is checked twice: in the webhook route, and again inside the database
            (against the Vault secret {c('bank_webhook_secret')}), so nobody can mark a payment paid
            by calling the database directly.
          </li>
          <li>
            The amount and currency must match what NexG asked for. A different amount fails the
            payment and raises a high-severity audit event.
          </li>
          <li>
            The collection must be the one recorded for that payment. If a bank reports money paid
            on a collection NexG has replaced, the event is kept, flagged unhandled, and raised for
            finance to refund or apply by hand. It never settles the order silently.
          </li>
          <li>Each event is recorded once; repeats are answered as duplicates.</li>
          <li>
            Payments made through the sandbox are stored with provider {c('bank_sandbox')}, and the
            sandbox is refused when {c('VERCEL_ENV=production')}, so a test approval is never taken
            for money.
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h3 className="text-ink text-xl font-bold">NexG Sandbox Bank</h3>
        <p>
          A small Node service in {c('apps/bank-sandbox')}. It keeps state in memory, or in a JSON
          file when {c('DATA_FILE')} is set, and retries webhooks after 2 s, 10 s, 1 min, 5 min and
          30 min.
        </p>
        <Code>{RUN_LOCAL}</Code>
        <Code>{RUN_DOCKER}</Code>

        <h4 className="text-ink font-bold">Test accounts on the approval page</h4>
        <Table
          head={['Account', 'Behaviour']}
          rows={[
            ['Wanjiru Kamau · 0110 0000 4821', 'KES 500,000 available. Pays.'],
            [
              'Otieno Achieng · 0110 0000 1177',
              'KES 150 available. Fails with insufficient_funds above that.',
            ],
            ['Blocked Account · 0110 0000 9020', 'Fails with account_blocked.'],
            [
              'Delayed Approval · 0110 0000 3315',
              'Processing for 20 seconds (SLOW_APPROVAL_SECONDS), then pays.',
            ],
          ]}
        />
        <p>
          A collection not approved within 30 minutes ({c('COLLECTION_TTL_MINUTES')}) expires.
          Balances reset when the sandbox restarts.
        </p>
        <Code>{SIMULATE}</Code>
      </section>

      <section className="space-y-3">
        <h3 className="text-ink text-xl font-bold">Connecting NexG to the sandbox</h3>
        <p>
          Generate the API key and webhook secret where the sandbox runs and give the same two
          values to the NexG web app. The <strong>Bank</strong> option appears at checkout only when
          all four settings are present.
        </p>
        <Code>{NEXG_ENV}</Code>
        <p>The database migration {c('20261130000100_bank_collections.sql')} must be run first.</p>
      </section>

      <section className="space-y-3">
        <h3 className="text-ink text-xl font-bold">Connecting a real bank</h3>
        <ol className="list-decimal space-y-2 pl-6">
          <li>Choose the bank and register on its developer portal to get sandbox credentials.</li>
          <li>
            Add an adapter in {c('apps/web/lib/bank')} that implements {c('BankProvider')} (
            {c('openCollection')}, {c('latestEvent')}, {c('cancelCollection')}) with provider id{' '}
            {c('bank_<name>')}, translating the bank&apos;s API and callbacks into the signed events
            above.
          </li>
          <li>Test it against the bank&apos;s sandbox exactly as against the NexG Sandbox Bank.</li>
          <li>
            Only after finance approves limits and reconciliation, allow it on the production site.
          </li>
        </ol>
        <p className="border-ink/10 border-t pt-5 text-sm">
          Merchants connecting their own systems should start with the{' '}
          <Link href="/docs/merchants" className="underline underline-offset-4">
            merchant integration guide
          </Link>
          .
        </p>
      </section>
    </article>
  );
}
