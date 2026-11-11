import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { EndpointPath, EndpointStatusBadge, MethodBadge } from '@/components/docs/badges';
import { CodeBlock, CodeTabs, CopyButton } from '@/components/docs/code';
import { PrevNext } from '@/components/docs/doc-page';
import { A, C, Callout, H2, H3, P } from '@/components/docs/prose';
import { ErrorList, Fact, FieldList, ParamList } from '@/components/docs/reference-parts';
import { endpointBySlug, ENDPOINTS, endpointUrl } from '@/lib/reference/endpoints';
import { requestSamples } from '@/lib/reference/samples';
import type { AuthDoc, EndpointDoc } from '@/lib/reference/types';

export function generateStaticParams() {
  return ENDPOINTS.map((endpoint) => ({ slug: endpoint.slug }));
}

export const dynamicParams = false;

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const endpoint = endpointBySlug(params.slug);
  if (!endpoint) return {};
  return {
    title: `${endpoint.title} (${endpoint.method} ${endpoint.path})`,
    description: endpoint.summary,
  };
}

function authText(auth: AuthDoc) {
  switch (auth.kind) {
    case 'optional_key':
      return (
        <>
          None needed. A key with <C>{auth.scope}</C> gets its own rate limit.
        </>
      );
    case 'key':
      return (
        <>
          API key with <C>{auth.scope}</C>
          {auth.merchantBound ? ', bound to your merchant' : ''}
        </>
      );
    case 'signature':
      return (
        <>
          Signed body (<C>{auth.header}</C>)
        </>
      );
    case 'none':
      return <>None</>;
  }
}

function cacheText(endpoint: EndpointDoc) {
  if (!endpoint.cache) return 'Not cached';
  if (endpoint.cache === 'no-store') return 'Never cached';
  const match = /s-maxage=(\d+)/.exec(endpoint.cache);
  return match
    ? `Without a key: shared caches, ${match[1]} seconds. With a key: never cached.`
    : endpoint.cache;
}

export default function EndpointPage({ params }: { params: { slug: string } }) {
  const endpoint = endpointBySlug(params.slug);
  if (!endpoint) notFound();

  const samples = requestSamples(endpoint);
  const soon = endpoint.status === 'coming_soon';
  const pathParams = endpoint.params.filter((param) => param.in === 'path');
  const queryParams = endpoint.params.filter((param) => param.in === 'query');
  const headerParams = endpoint.params.filter((param) => param.in === 'header');

  return (
    <div className="mx-auto max-w-[76rem]">
      <div className="grid gap-x-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,29rem)]">
        <header className="min-w-0 xl:col-start-1">
          <h1 className="text-ink text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
            {endpoint.title}
          </h1>
          <div className="border-border bg-surface mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border py-1.5 pl-2 pr-1.5">
            <MethodBadge method={endpoint.method} />
            <EndpointPath
              path={endpointUrl(endpoint)}
              className="min-w-0 flex-1 basis-[18rem] text-xs font-bold sm:text-sm"
            />
            <span className="ml-auto flex items-center gap-1">
              <EndpointStatusBadge status={endpoint.status} />
              <CopyButton text={endpointUrl(endpoint)} label="Copy the URL" tone="light" />
            </span>
          </div>

          {endpoint.warning ? (
            <Callout tone="issue" title="Not working right now">
              <p>
                {endpoint.warning} The <A href="#known-issues">known issues</A> below say why.
              </p>
            </Callout>
          ) : null}

          {soon ? (
            <Callout tone="soon" title="Not served yet">
              <p>
                This endpoint is designed but not live. Nothing here works against api.nexgapp.com
                today; the request and response below are the planned shape and may change. It
                will appear in the <A href="/docs/changelog">changelog</A> when it ships.
              </p>
            </Callout>
          ) : null}

          <div className="mt-6 space-y-4">
            {endpoint.description.map((paragraph) => (
              <p key={paragraph} className="text-muted text-base leading-7">
                {paragraph}
              </p>
            ))}
          </div>

          <dl className="mt-8 grid gap-2.5 sm:grid-cols-2">
            <Fact label="Authentication">{authText(endpoint.auth)}</Fact>
            <Fact label="Rate limit cost">
              {endpoint.rateCost === null
                ? 'No API bucket'
                : `${endpoint.rateCost} token${endpoint.rateCost === 1 ? '' : 's'}`}
            </Fact>
            <Fact label="Caching">{cacheText(endpoint)}</Fact>
            <Fact label={endpoint.since ? 'Available since' : 'Status'}>
              {endpoint.since
                ? new Date(`${endpoint.since}T00:00:00Z`).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    timeZone: 'UTC',
                  })
                : 'Coming soon'}
            </Fact>
          </dl>
        </header>

        {/* On wide screens the column sticks, and never runs past the bottom of the screen. */}
        <aside
          aria-label="Request and response"
          className="mt-10 flex min-w-0 flex-col gap-4 xl:sticky xl:top-24 xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:mt-0 xl:max-h-[calc(100dvh-7.5rem)] xl:self-start"
        >
          <CodeTabs
            samples={samples}
            title="Request"
            className="shrink-0"
            paneClassName="max-h-[24rem] xl:max-h-[34dvh]"
          />
          <CodeBlock
            title={`Response · ${endpoint.responseStatus}`}
            code={JSON.stringify(endpoint.responseExample, null, 2)}
            language="json"
            maxHeight
            fill
          />
        </aside>

        <div className="min-w-0 xl:col-start-1">
          {pathParams.length ? (
            <section aria-labelledby="path-parameters">
              <H2 id="path-parameters">Path parameters</H2>
              <ParamList params={pathParams} />
            </section>
          ) : null}

          {queryParams.length ? (
            <section aria-labelledby="query-parameters">
              <H2 id="query-parameters">Query parameters</H2>
              <ParamList params={queryParams} />
              <P className="text-sm">
                Any other query parameter is refused with <C>400 invalid_request</C>.
              </P>
            </section>
          ) : null}

          {headerParams.length ? (
            <section aria-labelledby="headers">
              <H2 id="headers">Headers</H2>
              <ParamList params={headerParams} />
            </section>
          ) : null}

          {endpoint.requestResources?.length ? (
            <section aria-labelledby="request-body">
              <H2 id="request-body">Request body</H2>
              {endpoint.requestResources.map((resource) => (
                <div key={resource.title}>
                  <P className="text-sm">{resource.title}, sent as JSON.</P>
                  <FieldList fields={resource.fields} />
                </div>
              ))}
            </section>
          ) : null}

          {endpoint.responseResources.length ? (
            <section aria-labelledby="response">
              <H2 id="response">Response</H2>
              {endpoint.responseResources.map((resource) => (
                <div key={resource.at}>
                  <H3>
                    {resource.title} <span className="text-muted-light font-mono text-sm font-semibold">{resource.at}</span>
                  </H3>
                  <FieldList fields={resource.fields} />
                </div>
              ))}
            </section>
          ) : null}

          {endpoint.errors.length ? (
            <section aria-labelledby="errors">
              <H2 id="errors">Errors</H2>
              <P className="text-sm">
                {endpoint.host === 'api' ? (
                  <>
                    Every error has the same shape; see <A href="/docs/errors">Errors</A>. Branch
                    on <C>error.code</C> and the HTTP status, never on the message.
                  </>
                ) : (
                  <>
                    The webhook answers <C>{'{ "ok": false, "reason": "…" }'}</C>. The status
                    tells the sender whether to retry; see{' '}
                    <A href="/docs/webhooks#responses-and-retries">Webhooks</A>.
                  </>
                )}
              </P>
              <ErrorList errors={endpoint.errors} />
            </section>
          ) : null}

          {endpoint.notes?.length ? (
            <section aria-labelledby="notes">
              <H2 id="notes">Good to know</H2>
              <ul className="text-muted marker:text-muted-light mt-4 list-disc space-y-2.5 pl-6 text-base leading-7">
                {endpoint.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {endpoint.knownIssues?.length ? (
            <section aria-labelledby="known-issues">
              <H2 id="known-issues">Known issues</H2>
              {endpoint.knownIssues.map((issue) => (
                <Callout key={issue} tone="issue">
                  <p>{issue}</p>
                </Callout>
              ))}
            </section>
          ) : null}

          <PrevNext href={`/docs/reference/${endpoint.slug}`} />
        </div>
      </div>
    </div>
  );
}
