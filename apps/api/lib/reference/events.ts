/**
 * The order events page's examples, kept here so the reference tests can
 * hold them to the WebhookEvent contract.
 */

export const EVENT_EXAMPLE = {
  id: '7c1f9e2a-4b3d-4e5f-8a6b-9c0d1e2f3a4b',
  type: 'booking.status_changed',
  api_version: 'v1',
  environment: 'live',
  created_at: '2026-11-17T06:42:10.512+00:00',
  data: {
    booking: {
      order_id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
      reference: 'NX-261117-0012',
      service: 'airport_transfer',
      quantity: 2,
      status: 'confirmed',
      stage: 'confirmed',
      payment_method: 'on_account',
      payment_status: 'pending',
      currency: 'KES',
      total_cents: 450000,
      scheduled_for: '2026-11-17T03:30:00+00:00',
      pickup_label: 'JKIA Terminal 1A',
      dropoff_label: 'Woodvale Grove, Westlands, Nairobi',
      created_at: '2026-11-17T06:30:02.118+00:00',
      rider: null,
    },
    previous_status: 'requested',
    previous_stage: 'placed',
  },
} as const;

export const EVENT_REQUEST = `POST /nexg/events HTTP/1.1
Host: example.com
Content-Type: application/json
User-Agent: NexG-Webhooks/1.0
NexG-Event-Id: 7c1f9e2a-4b3d-4e5f-8a6b-9c0d1e2f3a4b
NexG-Event-Type: booking.status_changed
NexG-Environment: live
NexG-Signature: t=1794897730,v1=9d4c1b…(64 hex characters)`;

export const VERIFY_EVENT = [
  {
    language: 'javascript',
    label: 'Node.js',
    code: `import { createHmac, timingSafeEqual } from 'node:crypto';

/** True when header is a valid NexG signature of rawBody, made in the last five minutes. */
export function verifyNexgEvent(rawBody, header, secret, now = Date.now()) {
  const m = /^t=(\\d{9,12}),v1=([0-9a-f]{64})$/.exec(header ?? '');
  if (!m) return false;
  if (Math.abs(Math.floor(now / 1000) - Number(m[1])) > 300) return false;
  const expected = createHmac('sha256', secret).update(\`\${m[1]}.\${rawBody}\`).digest();
  const given = Buffer.from(m[2], 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Express: keep the raw body, verify, answer, then work.
app.post('/nexg/events', express.raw({ type: 'application/json' }), (req, res) => {
  const raw = req.body.toString('utf8');
  if (!verifyNexgEvent(raw, req.get('NexG-Signature'), process.env.NEXG_WEBHOOK_SECRET)) {
    return res.status(400).end();
  }
  res.status(204).end();
  handle(JSON.parse(raw)); // skip an event id you have already handled
});`,
  },
  {
    language: 'python',
    label: 'Python',
    code: `import hashlib, hmac, re, time

def verify_nexg_event(raw_body: bytes, header: str, secret: str) -> bool:
    """True when header is a valid NexG signature of raw_body, made in the last five minutes."""
    m = re.fullmatch(r"t=(\\d{9,12}),v1=([0-9a-f]{64})", header or "")
    if not m or abs(int(time.time()) - int(m.group(1))) > 300:
        return False
    expected = hmac.new(secret.encode(), m.group(1).encode() + b"." + raw_body,
                        hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, m.group(2))`,
  },
];
