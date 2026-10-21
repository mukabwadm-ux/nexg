import { Card, CardContent } from '@nexg/ui';

/**
 * Quick-start snippets: curl, JavaScript, Python, Go, Ruby.
 *
 * Updated with the booking (POST /v1/orders) example that shows the
 * idempotency key, the service code, and the receipt. The booking is
 * the reason a merchant connects through the API -- a tour company
 * books airport transfers for visitors and pays from the account.
 */
export default function QuickstartPage() {
  const snippets = [
    {
      lang: 'curl (read)',
      code: `curl -H "X-Api-Key: your_key" \\
  https://api.nexgapp.com/v1/catalog/merchants?city=nairobi&limit=5`,
    },
    {
      lang: 'curl (book)',
      code: `curl -X POST https://api.nexgapp.com/v1/orders \\
  -H "X-Api-Key: your_key" \\
  -H "Idempotency-Key: tour-visit-2030-01" \\
  -H "Content-Type: application/json" \\
  -d '{
    "service":"airport_transfer","quantity":2,
    "pickup_label":"JKIA Terminal 1",
    "pickup_lat":-1.3192,"pickup_lng":36.9278,
    "dropoff_label":"Serena Hotel","dropoff_lat":-1.2833,"dropoff_lng":36.8176,
    "scheduled_for":"2030-06-01T09:00:00+03:00",
    "payment_method":"on_account"
  }'`,
    },
    {
      lang: 'JavaScript (read)',
      code: `const res = await fetch(
  'https://api.nexgapp.com/v1/catalog/merchants',
  { headers: { 'X-Api-Key': 'your_key' } }
);
const { data } = await res.json();`,
    },
    {
      lang: 'Python (read)',
      code: `import requests
res = requests.get(
  'https://api.nexgapp.com/v1/catalog/merchants',
  headers={'X-Api-Key': 'your_key'}
)
print(res.json()['data']['items'])`,
    },
  ];

  return (
    <div className="space-y-8">
      <h2 className="text-3xl font-extrabold">Quick Start</h2>
      <p className="text-ink/70">Every snippet uses the public read scope, except the booking which needs merchant_write. Replace <code className="font-mono text-xs">your_key</code> with an actual API key from <a href="/docs/auth" className="underline">/docs/auth</a>.</p>
      {snippets.map((s) => (
        <Card key={s.lang}>
          <CardContent className="pt-4">
            <h3 className="font-mono font-bold text-sm mb-3">{s.lang}</h3>
            <pre className="bg-surface p-3 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap">{s.code}</pre>
          </CardContent>
        </Card>
      ))}
      <p className="text-xs text-ink/40">The idempotency key prevents duplicate orders when retrying. Same key + same payload = same order_id and reference. A retry returns 201 with the same receipt, never a second booking.</p>
    </div>
  );
}