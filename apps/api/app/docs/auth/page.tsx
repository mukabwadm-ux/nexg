import { Card, CardContent, CardHeader, CardTitle } from '@nexg/ui';

/**
 * Authentication guide: API keys and OAuth 2.0
 */
export default function AuthPage() {
  return (
    <div className="space-y-8">
      <h2 className="text-3xl font-extrabold">Authentication</h2>

      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-ink/80">
          <p>Send the key in the <code className="font-mono bg-surface px-1 rounded text-xs">X-Api-Key</code> header. The server validates the SHA-256 hash (never the raw key) and checks scopes, rate limits, and expiry.</p>
          <pre className="bg-surface p-3 rounded text-xs font-mono overflow-x-auto">
{`curl -H "X-Api-Key: your_key_here" https://api.nexgapp.com/v1/catalog/merchants`}
          </pre>
          <p>Available read scopes are <code className="font-mono text-xs">public_read</code> and <code className="font-mono text-xs">merchant_read</code>. Merchant keys require owner or authorized staff issuance and current merchant approval. A key remains independent of the issuing person's browser session.</p>
          <p>Rotating a key does not reset its merchant or developer's token bucket. On HTTP 429, wait for the Retry-After number of seconds before retrying. Authentication and rate-limit failures are never cached.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>OAuth 2.0</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-ink/80">
          <p>OAuth authorization and token endpoints are unavailable in this release. Existing registry tables are not an active OAuth integration.</p>
        </CardContent>
      </Card>
    </div>
  );
}
