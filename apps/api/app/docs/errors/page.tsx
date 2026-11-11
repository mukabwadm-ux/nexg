import { CodeBlock } from '@/components/docs/code';
import { DocPage } from '@/components/docs/doc-page';
import { C, H2, P, Table } from '@/components/docs/prose';
import { pageMetadata } from '@/lib/reference/navigation';

export const metadata = pageMetadata('/docs/errors');

const SHAPE = `HTTP/1.1 429 Too Many Requests
Cache-Control: no-store
Retry-After: 4
X-Request-Id: 8c1d2b7e-55f3-4a0b-9e2d-6f4a1c3b8d90

{
  "ok": false,
  "error": {
    "code": "rate_limited",
    "message": "Too many requests. Try again later."
  },
  "meta": { "api_version": "v1" }
}`;

const HANDLING = `async function nexg(url, attempt = 0) {
  const res = await fetch(url, { headers: { 'X-Api-Key': process.env.NEXG_API_KEY } });
  const body = await res.json().catch(() => null);
  if (body?.ok) return body.data;

  const code = body?.error?.code;
  const requestId = res.headers.get('X-Request-Id');

  if (res.status === 429 && attempt < 3) {
    const wait = Number(res.headers.get('Retry-After') ?? 1);
    await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    return nexg(url, attempt + 1);
  }
  if (res.status >= 500 && attempt < 3) {
    await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
    return nexg(url, attempt + 1);
  }
  // 400, 401, 403: retrying the same request will not help.
  throw new Error(\`NexG \${res.status} \${code ?? 'no_body'} (request \${requestId})\`);
}`;

export default function ErrorsPage() {
  return (
    <DocPage
      href="/docs/errors"
      toc={[
        { id: 'shape', label: 'The error shape' },
        { id: 'codes', label: 'Error codes' },
        { id: 'statuses', label: 'HTTP statuses' },
        { id: 'handling', label: 'Handling errors' },
      ]}
    >
      <H2 id="shape">The error shape</H2>
      <P>
        Errors the API decides on are the same JSON object. <C>error.code</C> is for your program
        and never changes for a given failure; <C>error.message</C> is for people and may be
        reworded. When a request field is wrong, <C>error.fields</C> names it.
      </P>
      <CodeBlock className="mt-6" code={SHAPE} language="http" title="Response" />
      <P>
        Two answers come from the web server instead and have no JSON body: a <C>404</C> for a
        path that does not exist, and a <C>405</C> for a method a path does not take. Check the
        status before you parse.
      </P>
      <P>
        JSON errors are never cached, and a <C>429</C> carries <C>Retry-After</C>, in seconds. Each
        also carries an <C>X-Request-Id</C>, unique to that response. NexG logs the id of every
        server error (5xx), so quote it when you report one.
      </P>

      <H2 id="codes">Error codes</H2>
      <P>The set is small and closed, so you can handle every code.</P>
      <Table
        head={['Code', 'Means', 'What to do']}
        rows={[
          [
            <C key="c">invalid_request</C>,
            'The request was not in a shape NexG understands: conflicting credential headers, an unknown or invalid query parameter, or an id that is not a UUID.',
            'Fix the request. Sending it again unchanged gets the same answer.',
          ],
          [
            <C key="c">not_found</C>,
            'Something does not exist, or is not yours. A refused key (401) and a missing scope (403) also use this code, so nobody can tell which keys exist.',
            'Read the status: 401, replace the key; 403, check its scopes; 404, the record is not there.',
          ],
          [
            <C key="c">rate_limited</C>,
            'Your token bucket is empty.',
            'Wait the seconds in Retry-After, then retry.',
          ],
          [
            <C key="c">internal_error</C>,
            'NexG could not finish the request.',
            'Retry with backoff. On 503, NexG could not check your key or limit right now.',
          ],
          [
            <C key="c">method_not_allowed</C>,
            'The endpoint exists but does not accept that method.',
            'Use a method from the Allow header.',
          ],
        ]}
      />

      <H2 id="statuses">HTTP statuses</H2>
      <Table
        head={['Status', 'When', 'Retry?']}
        rows={[
          ['200', 'It worked. Check ok anyway.', '—'],
          ['400', 'invalid_request.', 'No. Fix the request.'],
          ['401', 'The key was refused.', 'No. Replace the key.'],
          ['403', 'The key lacks the scope, or no key was sent where one is needed.', 'No'],
          ['404', 'not_found: no such record, or no endpoint at that path.', 'No'],
          [
            '405',
            'method_not_allowed: the path exists but not for that method. Allow lists the methods it accepts.',
            'No',
          ],
          ['429', 'rate_limited.', 'Yes, after Retry-After'],
          ['500', 'internal_error. NexG logs the request id.', 'Yes, with backoff'],
          ['503', 'internal_error: NexG could not check the key or the limit.', 'Yes, with backoff'],
        ]}
      />

      <H2 id="handling">Handling errors</H2>
      <P>Retry what can succeed on a second try, and stop on what cannot.</P>
      <CodeBlock className="mt-6" code={HANDLING} language="javascript" title="JavaScript" />
    </DocPage>
  );
}
