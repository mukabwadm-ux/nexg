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
          <p>Scopes: <code className="font-mono text-xs">public_read</code> (default), <code className="font-mono text-xs">partner_read</code>, <code className="font-mono text-xs">partner_write</code>, <code className="font-mono text-xs">internal_read</code>, <code className="font-mono text-xs">internal_write</code>.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>OAuth 2.0</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-ink/80">
          <p>Standard authorization code flow. Register clients at <code className="font-mono text-xs">/developers</code> (partner) or the staff console (internal).</p>
          <pre className="bg-surface p-3 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap">
{`GET /oauth/authorize?
  response_type=code&
  client_id=CLIENT_ID&
  redirect_uri=REDIRECT_URI&
  scope=read:catalog&
  state=RANDOM_STRING`}
          </pre>
          <pre className="bg-surface p-3 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap">
{`POST /oauth/token
grant_type=authorization_code
client_id=CLIENT_ID
client_secret=CLIENT_SECRET
code=CODE_FROM_AUTHORIZE
redirect_uri=REDIRECT_URI`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}