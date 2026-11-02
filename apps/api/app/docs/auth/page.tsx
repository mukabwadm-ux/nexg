import { Card, CardContent, CardHeader, CardTitle } from '@nexg/ui';

/**
 * Authentication guide for implemented API-key routes.
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
          <p>Scopes currently defined: <code className="font-mono text-xs">public_read</code> (default), <code className="font-mono text-xs">merchant_read</code>, <code className="font-mono text-xs">merchant_write</code>, <code className="font-mono text-xs">internal_read</code>, and <code className="font-mono text-xs">internal_write</code>. No bank-transfer endpoint currently accepts these scopes.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>OAuth 2.0</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-ink/80">
          <p>OAuth client storage exists, but authorization and token routes are not implemented. Do not treat the sample OAuth flow as available.</p>
        </CardContent>
      </Card>
    </div>
  );
}