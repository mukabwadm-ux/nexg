import { DocPage } from '@/components/docs/doc-page';
import { A, C, Callout, H2, List, P, Step, Steps, Strong, Table } from '@/components/docs/prose';
import { pageMetadata } from '@/lib/reference/navigation';

export const metadata = pageMetadata('/docs/environments');

export default function EnvironmentsPage() {
  return (
    <DocPage
      href="/docs/environments"
      toc={[
        { id: 'base-urls', label: 'Base URLs' },
        { id: 'today', label: 'Sandbox and live today' },
        { id: 'sandbox-to-live', label: 'From sandbox to live' },
        { id: 'keys', label: 'Keys and environments' },
      ]}
    >
      <H2 id="base-urls">Base URLs</H2>
      <Table
        head={['What', 'URL', 'Notes']}
        rows={[
          ['The API', <C key="u">https://api.nexgapp.com/v1</C>, 'Every endpoint in the reference.'],
          [
            'Callbacks to NexG',
            <C key="u">https://nexgapp.com/api/…</C>,
            'Where partners send signed events, such as the bank webhook.',
          ],
          [
            'Local development',
            <C key="u">http://localhost:3002</C>,
            'For people working on NexG itself: pnpm --filter @nexg/api dev.',
          ],
        ]}
      />
      <P>
        Use HTTPS for every call. Do not let your HTTP client follow a redirect to another host
        with your key attached.
      </P>

      <H2 id="today">Sandbox and live today</H2>
      <P>
        What sandbox means depends on what you are connecting. Here is where each part of NexG
        stands.
      </P>
      <Table
        head={['Part', 'Sandbox', 'Live']}
        rows={[
          [
            'The NexG API',
            'Coming soon: sandbox keys with test data.',
            'api.nexgapp.com. Reads change nothing. A booking (POST /v1/orders) is a real order, so agree a test booking with NexG first.',
          ],
          [
            'Bank collections',
            'The NexG Sandbox Bank, on NexG’s test deployments. No real money moves.',
            'Not connected yet. The sandbox bank is refused on the production site.',
          ],
          [
            'Your systems (POS, ERP, booking, inventory)',
            'A sandbox connection NexG registers and tests, which may be plain http.',
            'A separate live connection: https on a public host, with live credentials.',
          ],
        ]}
      />
      <Callout tone="note" title="The API has no sandbox yet">
        <p>
          Sandboxes exist so a test cannot do something real. A read cannot change anything at
          NexG, but <A href="/docs/reference/create-order">booking a service</A> makes a real order
          that NexG will act on. Until sandbox keys arrive, agree a test booking with NexG before
          you send one.
        </p>
      </Callout>

      <H2 id="sandbox-to-live">From sandbox to live</H2>
      <P>
        Banks and partner systems that NexG calls are connected twice: once in sandbox, once in
        live. NexG registers each connection in its admin console, under{' '}
        <Strong>Settings, API &amp; Webhooks</Strong>.
      </P>
      <Steps>
        <Step title="Share your sandbox details">
          <P>
            Give NexG your sandbox base URL, a path it can call to check the connection (such as{' '}
            <C>/health</C>), and how it should authenticate: a bearer token, an API key header, or
            basic authentication. Credentials go into NexG&apos;s vault through the console. Never
            send them by email or chat.
          </P>
        </Step>
        <Step title="NexG tests the connection">
          <P>
            The test runs from NexG&apos;s database, so your credentials are used there and never
            shown to a browser or a person. The connection is marked connected or failing, with
            the status code and the time it took.
          </P>
        </Step>
        <Step title="Test the whole flow">
          <P>
            Run real scenarios end to end in sandbox: for a bank, every outcome the{' '}
            <A href="/docs/bank-transfers">Sandbox Bank</A> can produce, and every webhook retry.
          </P>
        </Step>
        <Step title="Go live">
          <P>
            NexG registers the live connection with your live URL and credentials. A live URL must
            use https and a public host; a local or private address is refused. Bank connections go
            live only after NexG finance approves limits and reconciliation.
          </P>
        </Step>
      </Steps>

      <H2 id="keys">Keys and environments</H2>
      <List>
        <li>
          An API key from the <A href="/developers">developer console</A> works against{' '}
          <C>https://api.nexgapp.com</C>. Keys do not carry an environment today.
        </li>
        <li>
          Credentials for a connection NexG calls are separate for sandbox and live. A sandbox
          secret must never be reused in live.
        </li>
        <li>
          A shared webhook secret is generated where the sender runs, at least 32 characters
          long, and stored by NexG in its vault. It is never sent by email or chat.
        </li>
      </List>
    </DocPage>
  );
}
