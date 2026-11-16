import { CodeBlock, CodeTabs } from '@/components/docs/code';
import { DocPage } from '@/components/docs/doc-page';
import { A, C, Callout, H2, List, P, Table } from '@/components/docs/prose';
import { pageMetadata } from '@/lib/reference/navigation';

export const metadata = pageMetadata('/docs/auth');

const HEADER_SAMPLES = [
  {
    language: 'curl',
    label: 'X-Api-Key',
    code: `curl https://api.nexgapp.com/v1/catalog/merchants \\
  -H "X-Api-Key: $NEXG_API_KEY"`,
  },
  {
    language: 'curl-bearer',
    label: 'Bearer',
    code: `curl https://api.nexgapp.com/v1/catalog/merchants \\
  -H "Authorization: Bearer $NEXG_API_KEY"`,
  },
];

const REFUSED = `HTTP/1.1 401 Unauthorized
Cache-Control: no-store
X-Request-Id: 3d0c8f8e-9a51-4f0e-8a77-1c5b2f6d9e40

{
  "ok": false,
  "error": { "code": "not_found", "message": "That API key is not valid." },
  "meta": { "api_version": "v1" }
}`;

export default function AuthPage() {
  return (
    <DocPage
      href="/docs/auth"
      toc={[
        { id: 'keys', label: 'API keys' },
        { id: 'live-and-test', label: 'Live and test keys' },
        { id: 'sending', label: 'Sending a key' },
        { id: 'scopes', label: 'Scopes' },
        { id: 'merchant-keys', label: 'Merchant keys' },
        { id: 'no-key', label: 'Requests without a key' },
        { id: 'refusals', label: 'When a key is refused' },
        { id: 'safety', label: 'Keeping keys safe' },
        { id: 'oauth', label: 'OAuth' },
      ]}
    >
      <H2 id="keys">API keys</H2>
      <P>
        An API key is a 64-character secret issued in the{' '}
        <A href="/developers">developer console</A>. NexG stores only a SHA-256 hash of it, so the
        key is shown once, when it is issued, and cannot be shown again. The console identifies a
        key by its first eight characters, or for a test key by <C>nexg_test_</C> and the four
        after it.
      </P>
      <P>
        A key is not tied to a person&apos;s login. It keeps working when the person who issued it
        signs out, which is what lets a server use it.
      </P>

      <H2 id="live-and-test">Live and test keys</H2>
      <P>
        Every key is live or test, chosen when it is issued. A test key is the same 64 characters
        with <C>nexg_test_</C> in front, so it is easy to spot in a config file or a log. It reads
        the same public data as a live key, but bookings made with it go to a sandbox and never
        become orders, and it reads only those test bookings. Test keys have a rate-limit bucket
        of their own. See <A href="/docs/environments#test-keys">Environments</A>.
      </P>

      <H2 id="sending">Sending a key</H2>
      <P>
        Send the key in the <C>X-Api-Key</C> header, or as a bearer token in{' '}
        <C>Authorization</C>. Use one or the other: a request with both is refused with{' '}
        <C>400 invalid_request</C>, as is an <C>Authorization</C> header that is not{' '}
        <C>Bearer</C>.
      </P>
      <CodeTabs className="mt-6" samples={HEADER_SAMPLES} title="Headers" />

      <H2 id="scopes">Scopes</H2>
      <P>A key carries one or more scopes, and each endpoint needs one of them.</P>
      <Table
        head={['Scope', 'Lets a key', 'Who can have it']}
        rows={[
          [
            <C key="s">public_read</C>,
            'Read merchants, catalogues, zones, experiences and services.',
            'Anyone with a NexG account.',
          ],
          [
            <C key="s">merchant_read</C>,
            'Read the orders of the one merchant the key is bound to.',
            'The merchant’s owner, or NexG merchant operations.',
          ],
          [
            <C key="s">merchant_write</C>,
            'Book services for that merchant (POST /v1/orders): for real, charged to its account, with a live key; in the sandbox with a test key.',
            'On a test key, the merchant’s owner, from the console. On a live key, ask NexG.',
          ],
          [
            <span key="s">
              <C>internal_read</C>, <C>internal_write</C>
            </span>,
            'NexG’s own systems.',
            'NexG staff, issued by a global administrator.',
          ],
        ]}
      />

      <H2 id="merchant-keys">Merchant keys</H2>
      <P>
        A key with <C>merchant_read</C> is bound to exactly one merchant when it is issued. The
        key, never the request, decides the merchant: no endpoint takes a merchant id from you, so
        a key cannot read another merchant&apos;s records by guessing an id.
      </P>
      <P>
        A merchant key works only while that merchant may operate on NexG. While the merchant is
        paused, suspended or delisted, or while its application is waiting for approval, its keys
        are refused, and they work again once it may operate.
      </P>

      <H2 id="no-key">Requests without a key</H2>
      <P>
        Public endpoints answer without a key. Keyless requests share one anonymous rate limit of
        120 tokens a minute across all callers (or 60 a minute for each address, where NexG
        identifies callers by IP at its edge), so a busy moment elsewhere can slow you down. Use a
        key for anything you run in production.
      </P>

      <H2 id="refusals">When a key is refused</H2>
      <P>
        An unknown, revoked or expired key, or a merchant key while its merchant cannot operate,
        all get the same answer, on purpose: telling them apart would tell a stranger which keys
        exist.
      </P>
      <CodeBlock className="mt-6" code={REFUSED} language="http" title="Response" />
      <P>
        A valid key without the scope an endpoint needs gets <C>403</C> with code{' '}
        <C>not_found</C>. See <A href="/docs/errors">Errors</A> for the full list.
      </P>
      <P>
        A key is checked on every request that carries it, public endpoints included, so sending a
        key to <C>/v1/zones</C> is a cheap way to test it.
      </P>

      <H2 id="safety">Keeping keys safe</H2>
      <List>
        <li>Call the API from your server. Never put a key in browser code, a mobile app or a URL.</li>
        <li>
          Web pages on other sites cannot call the API: it sends no CORS headers. That is deliberate,
          so a key never has to sit in a page. Fetch from your server and pass on what the page
          needs.
        </li>
        <li>
          Keep it in your host&apos;s secret store or environment, and never in a variable your
          framework exposes to the browser (in Next.js, anything named <C>NEXT_PUBLIC_…</C>).
        </li>
        <li>Never commit a key, paste it into a ticket or chat, or log it.</li>
        <li>Give each system its own key with only the scopes it needs.</li>
      </List>
      <P>
        To replace a key, issue a new one, deploy it, then have the old one revoked. The
        database already supports revoking a key; until the console can list and revoke keys,
        ask NexG to revoke it for you.
      </P>
      <Callout tone="soon" title="Listing and revoking keys in the console">
        <p>The console issues keys today. Seeing your keys and revoking them there is coming soon.</p>
      </Callout>

      <H2 id="oauth">OAuth</H2>
      <P>
        NexG has storage for OAuth clients, but no authorization or token endpoints. Use an API
        key. OAuth will be announced in the <A href="/docs/changelog">changelog</A> if it ships.
      </P>
    </DocPage>
  );
}
