import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

import {
  EndpointPath,
  EndpointStatusBadge,
  IssueBadge,
  MethodBadge,
} from '@/components/docs/badges';
import { CopyButton } from '@/components/docs/code';
import { DocPage } from '@/components/docs/doc-page';
import { A, C, Callout, H2, P } from '@/components/docs/prose';
import { ENDPOINT_GROUPS, ENDPOINTS, endpointsInGroup } from '@/lib/reference/endpoints';
import { pageMetadata } from '@/lib/reference/navigation';
import { HOSTS, type HttpMethod } from '@/lib/reference/types';

export const metadata = pageMetadata('/docs/reference');

const METHODS: HttpMethod[] = ['GET', 'POST', 'PATCH'];

function methodSummary(method: HttpMethod) {
  const all = ENDPOINTS.filter((endpoint) => endpoint.method === method);
  const served = all.filter((endpoint) => endpoint.status !== 'coming_soon').length;
  const soon = all.length - served;
  if (!all.length) return 'None yet';
  return [served ? `${served} served` : null, soon ? `${soon} coming soon` : null]
    .filter(Boolean)
    .join(' · ');
}

export default function ReferencePage() {
  return (
    <DocPage
      href="/docs/reference"
      toc={[
        { id: 'base-urls', label: 'Base URLs' },
        { id: 'methods', label: 'Methods' },
        ...ENDPOINT_GROUPS.map((group) => ({
          id: group.toLowerCase().replace(/\s+/g, '-'),
          label: group,
        })),
      ]}
    >
      <H2 id="base-urls">Base URLs</H2>
      <P>
        API endpoints live on <C>{HOSTS.api}</C> under <C>/v1</C>. Callbacks a partner sends to
        NexG go to the website, <C>{HOSTS.web}</C>. Every call uses HTTPS.
      </P>
      <div className="border-border bg-surface mt-6 divide-y divide-border rounded-lg border">
        {[
          { label: 'API', value: `${HOSTS.api}/v1` },
          { label: 'Callbacks', value: `${HOSTS.web}/api` },
        ].map((row) => (
          <div key={row.label} className="flex items-center gap-3 py-1.5 pl-4 pr-1.5">
            <span className="text-muted-light w-20 shrink-0 text-xs font-bold">{row.label}</span>
            <code className="text-ink min-w-0 flex-1 font-mono text-sm [overflow-wrap:anywhere]">
              {row.value}
            </code>
            <CopyButton text={row.value} label={`Copy the ${row.label} base URL`} tone="light" />
          </div>
        ))}
      </div>

      <H2 id="methods">Methods</H2>
      <P>
        Every endpoint on api.nexgapp.com today is a read. The one write served today is the bank
        webhook on nexgapp.com, in sandbox. Other writes are designed and listed here as coming
        soon until they ship, so you can plan for them without building against something that
        is not there.
      </P>
      <ul className="mt-6 grid gap-2.5 sm:grid-cols-3">
        {METHODS.map((method) => (
          <li key={method} className="border-border bg-surface rounded-lg border px-4 py-3">
            <MethodBadge method={method} />
            <p className="text-ink mt-2 text-sm font-semibold">{methodSummary(method)}</p>
          </li>
        ))}
      </ul>
      <Callout tone="soon" title="No PATCH endpoints yet">
        <p>
          Nothing in the API updates a record today. When updates arrive (changing or cancelling a
          booking, for example), they will be added here as PATCH endpoints and announced in the{' '}
          <A href="/docs/changelog">changelog</A>.
        </p>
      </Callout>

      {ENDPOINT_GROUPS.map((group) => (
        <section key={group} aria-labelledby={group.toLowerCase().replace(/\s+/g, '-')}>
          <H2 id={group.toLowerCase().replace(/\s+/g, '-')}>{group}</H2>
          <ul className="divide-border border-border mt-4 divide-y border-y">
            {endpointsInGroup(group).map((endpoint) => (
              <li key={endpoint.slug}>
                <Link
                  href={`/docs/reference/${endpoint.slug}`}
                  className="hover:bg-surface group -mx-3 flex items-start gap-3 rounded-md px-3 py-4 transition-colors duration-150"
                >
                  <MethodBadge method={endpoint.method} className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <EndpointPath path={endpoint.path} className="text-sm font-bold" />
                      {endpoint.status !== 'live' ? (
                        <EndpointStatusBadge status={endpoint.status} />
                      ) : null}
                      {endpoint.warning ? <IssueBadge title={endpoint.warning} /> : null}
                    </span>
                    <span className="text-ink mt-1 block text-sm font-semibold">{endpoint.title}</span>
                    <span className="text-muted mt-0.5 block text-sm leading-6">{endpoint.summary}</span>
                  </span>
                  <ChevronRight
                    className="text-muted-light group-hover:text-ink mt-1 h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </DocPage>
  );
}
