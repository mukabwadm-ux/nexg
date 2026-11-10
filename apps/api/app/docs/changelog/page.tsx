import { cn } from '@nexg/ui';
import Link from 'next/link';

import { EndpointPath, MethodBadge } from '@/components/docs/badges';
import { DocPage } from '@/components/docs/doc-page';
import { A, C, H2, H3, List, P } from '@/components/docs/prose';
import { CHANGELOG } from '@/lib/reference/changelog';
import { endpointBySlug } from '@/lib/reference/endpoints';
import { pageMetadata } from '@/lib/reference/navigation';
import type { ChangelogEntry } from '@/lib/reference/types';

export const metadata = pageMetadata('/docs/changelog');

const KIND: Record<ChangelogEntry['kind'], { label: string; className: string }> = {
  added: { label: 'Added', className: 'bg-success-bg text-success' },
  changed: { label: 'Changed', className: 'bg-info-bg text-info' },
  fixed: { label: 'Fixed', className: 'bg-ink text-white' },
  deprecated: { label: 'Deprecated', className: 'bg-warning-bg text-warning ring-1 ring-gold/40' },
  removed: { label: 'Removed', className: 'bg-danger-bg text-danger' },
  docs: { label: 'Docs', className: 'bg-border/60 text-muted' },
};

function formatDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function ChangelogPage() {
  return (
    <DocPage
      href="/docs/changelog"
      toc={[
        { id: 'versioning', label: 'How versions work' },
        { id: 'staying-current', label: 'How this page stays current' },
        { id: 'changes', label: 'Changes' },
      ]}
    >
      <H2 id="versioning">How versions work</H2>
      <P>
        The version is in the path (<C>/v1/…</C>) and in every JSON response, as{' '}
        <C>meta.api_version</C>. Within v1, NexG only makes changes that do not break a client
        written to these docs:
      </P>
      <List>
        <li>new endpoints, and coming-soon endpoints going live;</li>
        <li>new optional query parameters;</li>
        <li>new fields in a response object;</li>
        <li>new values in a field that lists states, such as an order&apos;s stage;</li>
        <li>clearer error messages, with the same error codes.</li>
      </List>
      <P>
        Anything that could break a client (removing or renaming a field, changing its type,
        refusing a request that works today) ships under a new version, <C>/v2</C>, while{' '}
        <C>/v1</C> keeps working. It is announced here first, with the date v1 will stop.
      </P>
      <P>
        Fixing a known issue so an endpoint does what these docs say it does counts as a fix, not
        a break: each one is listed on its endpoint&apos;s page and will be logged here when it
        lands. To stay safe through every kind of change, ignore fields you do not know, treat
        cursors as opaque, and branch on <C>error.code</C>, not on messages.
      </P>

      <H2 id="staying-current">How this page stays current</H2>
      <P>
        The reference and this changelog are built from one registry in the NexG repository,{' '}
        <C>apps/api/lib/reference</C>. Automated checks compare it with the API&apos;s route
        handlers and response schemas on every change, and fail if a route is added, removed or
        changes method without the registry and this page changing too. You can rely on the{' '}
        <A href="/docs/reference">API reference</A> listing exactly what is served.
      </P>

      <H2 id="changes">Changes</H2>
      <ol className="mt-8">
        {CHANGELOG.map((entry, index) => {
          const previous = CHANGELOG[index - 1];
          const newDate = !previous || previous.date !== entry.date;
          return (
            <li
              key={`${entry.date}-${entry.title}`}
              className={cn(
                'grid gap-x-8 sm:grid-cols-[9rem_minmax(0,1fr)]',
                newDate && index > 0 ? 'border-border mt-8 border-t pt-8' : 'mt-6',
              )}
            >
              <div className="pt-0.5">
                {newDate ? (
                  <time dateTime={entry.date} className="text-ink text-sm font-extrabold">
                    {formatDate(entry.date)}
                  </time>
                ) : null}
              </div>
              <div className="mt-2 min-w-0 sm:mt-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <H3 className="mt-0">{entry.title}</H3>
                  <span
                    className={cn(
                      'text-micro inline-flex translate-y-[-0.1em] rounded-md px-2 py-1 font-bold uppercase leading-none',
                      KIND[entry.kind].className,
                    )}
                  >
                    {KIND[entry.kind].label}
                  </span>
                </div>
                {entry.body.map((paragraph) => (
                  <p key={paragraph} className="text-muted mt-2 text-base leading-7">
                    {paragraph}
                  </p>
                ))}
                {entry.endpoints.length ? (
                  <ul className="mt-3 space-y-1.5">
                    {entry.endpoints.map((slug) => {
                      const endpoint = endpointBySlug(slug);
                      if (!endpoint) return null;
                      return (
                        <li key={slug}>
                          <Link
                            href={`/docs/reference/${slug}`}
                            className="hover:bg-surface -mx-2 inline-flex max-w-full items-center gap-2 rounded-md px-2 py-1 transition-colors duration-150"
                          >
                            <MethodBadge method={endpoint.method} size="sm" />
                            <EndpointPath
                              path={
                                endpoint.host === 'web'
                                  ? `nexgapp.com${endpoint.path}`
                                  : endpoint.path
                              }
                              className="text-sm"
                            />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </DocPage>
  );
}
