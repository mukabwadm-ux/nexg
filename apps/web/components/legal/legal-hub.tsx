'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import type { LegalAudience } from '@/content/legal';

export type HubDocument = {
  slug: string;
  title: string;
  tagline: string;
  audiences: LegalAudience[];
  badge?: string;
};
export type HubGroup = { id: string; title: string; documents: HubDocument[] };

const FILTERS: { id: 'all' | LegalAudience; label: string }[] = [
  { id: 'all', label: 'Everyone' },
  { id: 'customers', label: 'Customers' },
  { id: 'merchants', label: 'Merchants' },
  { id: 'riders', label: 'Riders' },
];

/**
 * The documents on the legal hub, grouped, with a "Show documents for" filter
 * so a rider or a merchant finds their own agreement at once.
 */
export function LegalHub({ groups }: { groups: HubGroup[] }) {
  const [audience, setAudience] = React.useState<'all' | LegalAudience>('all');
  const shown = groups
    .map((group) => ({
      ...group,
      documents: group.documents.filter(
        (document) => audience === 'all' || document.audiences.includes(audience),
      ),
    }))
    .filter((group) => group.documents.length > 0);

  return (
    <>
      <div
        role="group"
        aria-labelledby="legal-filter"
        className="mt-5 flex flex-wrap items-center gap-2"
      >
        <span id="legal-filter" className="text-page-muted mr-1 w-full text-sm font-bold sm:w-auto">
          Show documents for
        </span>
        {FILTERS.map((filter) => {
          const on = filter.id === audience;
          return (
            <button
              key={filter.id}
              type="button"
              aria-pressed={on}
              onClick={() => setAudience(filter.id)}
              className={`focus-visible:ring-gold h-10 rounded-full border px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 ${
                on
                  ? 'bg-gold border-gold text-ink'
                  : 'border-page-line text-page hover:border-page-muted'
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid gap-x-12 gap-y-7 md:grid-cols-2">
        {shown.map((group) => (
          <section
            key={group.id}
            aria-labelledby={`legal-group-${group.id}`}
            className={group.id === 'partners' ? 'md:col-span-2' : undefined}
          >
            <h2
              id={`legal-group-${group.id}`}
              className="text-page text-base font-extrabold tracking-tight sm:text-lg"
            >
              {group.title}
            </h2>
            <ul className="mt-1">
              {group.documents.map((document) => (
                <li key={document.slug} className="border-page-line border-b">
                  <Link
                    href={`/legal/${document.slug}`}
                    className="text-page group flex min-h-[3.5rem] items-center gap-3 px-1 py-2.5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.9375rem] font-extrabold leading-snug underline-offset-4 group-hover:underline">
                        {document.title}
                      </span>
                      <span className="text-page-muted block text-[0.8125rem] leading-normal">
                        {document.tagline}
                      </span>
                      {document.badge && (
                        <span className="border-page-line text-page-muted mt-1 inline-block rounded-full border px-2 py-px text-xs font-bold">
                          {document.badge}
                        </span>
                      )}
                    </span>
                    <ChevronRight className="text-page-muted h-5 w-5 shrink-0" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
