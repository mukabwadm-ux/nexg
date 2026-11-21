import { Button } from '@nexg/ui';
import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { LegalHeader } from '@/components/legal/legal-header';
import { LegalHub, type HubGroup } from '@/components/legal/legal-hub';
import { SiteFooter } from '@/components/site-footer';
import { LEGAL_HUB_GROUPS, findDocument } from '@/content/legal';

export const metadata: Metadata = {
  title: 'Legal',
  description: 'The terms and policies that apply when you use NexG.',
};

/**
 * The legal hub (owner, 21 Nov 2026): every document, grouped by who it is
 * for, with a filter so a rider or a merchant finds their own agreement.
 */
export default function LegalHubPage() {
  const groups: HubGroup[] = LEGAL_HUB_GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    documents: group.documents.flatMap((entry) => {
      const document = findDocument(entry.slug);
      if (!document) return [];
      return [
        {
          slug: document.slug,
          title: document.title,
          tagline: document.tagline,
          audiences: entry.audiences,
          badge: document.draft ? 'Being finalised' : entry.badge,
        },
      ];
    }),
  }));

  return (
    <>
      <LegalHeader />

      <main className="text-page mx-auto max-w-[67.5rem] px-4 pb-14 pt-3 sm:px-8 lg:pt-7">
        <Link
          href="/"
          className="text-page-muted hover:text-page inline-flex min-h-10 items-center gap-1.5 text-sm font-bold sm:hidden"
        >
          <ChevronLeft className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
          Back to NexG
        </Link>
        <nav aria-label="Breadcrumb" className="text-page-muted hidden text-sm sm:block">
          <Link href="/" className="hover:text-page">
            NexG
          </Link>
          <span aria-hidden="true" className="mx-2">
            /
          </span>
          <span className="text-page">Legal</span>
        </nav>

        <h1 className="mt-1 text-[1.75rem] font-extrabold leading-tight tracking-tight sm:mt-2 sm:text-[2.25rem]">
          Legal
        </h1>
        <p className="text-page/85 mt-2 text-[0.9375rem] leading-relaxed">
          The terms and policies that apply when you use NexG.
        </p>
        <p className="text-page-muted mt-1 text-[0.8125rem]">Kenya · English</p>

        <LegalHub groups={groups} />

        <div className="bg-surface text-ink mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl p-4">
          <p className="min-w-[16rem] flex-1 text-sm leading-normal">
            <strong className="font-extrabold">Not sure which applies to you?</strong>{' '}
            <span className="text-muted">
              Our support team can point you to the right document.
            </span>
          </p>
          <Button variant="gold" asChild className="w-full sm:w-auto">
            <Link href="/help">Contact support</Link>
          </Button>
        </div>
      </main>

      <div className="print:hidden">
        <SiteFooter />
      </div>
    </>
  );
}
