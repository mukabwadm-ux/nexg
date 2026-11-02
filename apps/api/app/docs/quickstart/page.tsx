import { Card, CardContent } from '@nexg/ui';

/**
 * Quick-start snippets for implemented read routes.
 */
export default function QuickstartPage() {
  const snippets = [
    {
      lang: 'curl (read)',
      code: `curl -H "X-Api-Key: your_key" \\
  https://api.nexgapp.com/v1/catalog/merchants?city=nairobi&limit=5`,
    },
    {
      lang: 'curl (merchant orders)',
      code: `curl -H "X-Api-Key: your_merchant_read_key" \\
  'https://api.nexgapp.com/v1/orders?limit=5'`,
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
      <p className="text-ink/70">Public catalog examples use public_read. Merchant orders require a merchant_read key bound to your approved merchant. Issue keys at <a href="/developers" className="underline">/developers</a>.</p>
      {snippets.map((s) => (
        <Card key={s.lang}>
          <CardContent className="pt-4">
            <h3 className="font-mono font-bold text-sm mb-3">{s.lang}</h3>
            <pre className="bg-surface p-3 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap">{s.code}</pre>
          </CardContent>
        </Card>
      ))}
      <p className="text-xs text-ink/40">HTTP 429 includes Retry-After in seconds. Order creation, individual order routes, OAuth and ERP connections are unavailable in this release.</p>
    </div>
  );
}
