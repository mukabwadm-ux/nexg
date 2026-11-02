import { Card, CardContent } from '@nexg/ui';

/**
 * Quick-start snippets for implemented read endpoints.
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
      code: `curl -H "X-Api-Key: your_merchant_key" \\
  "https://api.nexgapp.com/v1/orders?limit=25"`,
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
      <p className="text-ink/70">These snippets use public read endpoints. Replace <code className="font-mono text-xs">your_key</code> with an API key from <a href="/developers" className="underline">the developer console</a>, or omit it for anonymous public catalogue reads.</p>
      {snippets.map((s) => (
        <Card key={s.lang}>
          <CardContent className="pt-4">
            <h3 className="font-mono font-bold text-sm mb-3">{s.lang}</h3>
            <pre className="bg-surface p-3 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap">{s.code}</pre>
          </CardContent>
        </Card>
      ))}
      <p className="text-sm text-ink/70">The merchant orders example requires a merchant-bound key with the <code className="font-mono text-xs">merchant_read</code> scope. Read the <a href="/docs/merchants" className="underline">merchant integration guide</a> for setup and server-side key handling. Write operations, including service bookings and bank transfers, are not available; use only endpoints listed in the <a href="/docs" className="underline">API reference</a>.</p>
    </div>
  );
}