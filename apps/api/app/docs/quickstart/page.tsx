import { CodeBlock, CodeTabs } from '@/components/docs/code';
import { DocPage } from '@/components/docs/doc-page';
import { A, C, Callout, H2, List, P, Step, Steps } from '@/components/docs/prose';
import { endpointBySlug } from '@/lib/reference/endpoints';
import { pageMetadata } from '@/lib/reference/navigation';
import { requestSamples } from '@/lib/reference/samples';

export const metadata = pageMetadata('/docs/quickstart');

const FIRST_REQUEST = 'curl https://api.nexgapp.com/v1/zones';

const FIRST_RESPONSE = `{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "7f1e2d3c-4b5a-4968-8776-655443322110",
        "name": "Kilimani",
        "tier": "core",
        "eta_min": 20,
        "eta_max": 30,
        "cod_allowed": true,
        "…": "and the zone's bounding box"
      }
    ],
    "next_cursor": null
  },
  "meta": { "api_version": "v1", "limit": 100 }
}`;

const ENV = `# On your server, in its secret store or environment. Never in a browser
# bundle, a mobile app or a repository.
NEXG_API_KEY=<the key from the developer console>`;

function samplesFor(slug: string) {
  const endpoint = endpointBySlug(slug);
  return endpoint ? requestSamples(endpoint) : [];
}

export default function QuickstartPage() {
  return (
    <DocPage
      href="/docs/quickstart"
      toc={[
        { id: 'steps', label: 'Five steps' },
        { id: 'go-live', label: 'Before you go live' },
      ]}
    >
      <H2 id="steps">Five steps</H2>
      <Steps>
        <Step title="Make a request without a key">
          <P>
            Public data needs no key. Ask for the zones NexG delivers to:
          </P>
          <CodeBlock className="mt-4" code={FIRST_REQUEST} language="curl" title="Terminal" />
          <CodeBlock className="mt-3" code={FIRST_RESPONSE} language="json" title="Response · 200 OK (shortened)" />
          <P>
            Every response has <C>ok</C>, then either <C>data</C> or <C>error</C>, then{' '}
            <C>meta</C>. Lists sit in <C>data.items</C>, with <C>next_cursor</C> for the next page.
          </P>
        </Step>

        <Step title="Get a key">
          <P>
            Sign in to the <A href="/developers">developer console</A> with the NexG account you
            use on nexgapp.com, and issue a key. Choose what it may do:
          </P>
          <List>
            <li>
              <strong className="text-ink">Read the public catalog</strong> (<C>public_read</C>):
              merchants, zones, experiences and services. Any account can have this.
            </li>
            <li>
              <strong className="text-ink">Read your merchant orders</strong> (<C>merchant_read</C>
              ): needs a merchant you own, which the console lists by name.
            </li>
          </List>
          <P>
            The key is shown once and NexG keeps only a hash of it, so copy it before you leave
            the page. Store it where your server reads secrets:
          </P>
          <CodeBlock className="mt-4" code={ENV} language="curl" title=".env" />
        </Step>

        <Step title="Call the API with your key">
          <P>
            Send the key in <C>X-Api-Key</C>. With a key, your requests spend from your own rate
            limit instead of the shared anonymous one.
          </P>
          <CodeTabs className="mt-4" samples={samplesFor('list-merchants')} title="Request" />
        </Step>

        <Step title="Read your orders">
          <P>
            With a <C>merchant_read</C> key, list your merchant&apos;s orders, newest first. You
            never name the merchant: the key does.
          </P>
          <CodeTabs className="mt-4" samples={samplesFor('list-orders')} title="Request" />
        </Step>

        <Step title="Handle errors and limits">
          <P>
            Check <C>ok</C> on every response. When it is false, branch on <C>error.code</C> and
            the HTTP status, and on a <C>429</C> wait for the seconds in <C>Retry-After</C>. The{' '}
            <A href="/docs/errors">Errors</A> and <A href="/docs/rate-limits">Rate limits</A>{' '}
            pages list every case.
          </P>
        </Step>
      </Steps>

      <H2 id="go-live">Before you go live</H2>
      <List>
        <li>The key lives on your server only, and you can replace it without a code change.</li>
        <li>
          Your client handles <C>401</C> (replace the key), <C>403</C> (wrong scope), <C>429</C>{' '}
          (wait, then retry) and <C>5xx</C> (retry with backoff).
        </li>
        <li>
          You follow <C>next_cursor</C> until it is <C>null</C>.
        </li>
        <li>You read amounts as integers: shillings in catalogues, cents on orders.</li>
        <li>
          You watch the <A href="/docs/changelog">changelog</A> for changes to the endpoints you
          use.
        </li>
      </List>
      <Callout tone="note" title="Building for a bank or a partner system?">
        <p>
          Those connect in a sandbox first. See <A href="/docs/environments">Environments</A>,
          then <A href="/docs/bank-transfers">Bank collections</A> or{' '}
          <A href="/docs/connecting-systems">Connecting your systems</A>.
        </p>
      </Callout>
    </DocPage>
  );
}
