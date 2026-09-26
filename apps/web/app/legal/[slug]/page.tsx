import { Card } from '@nexg/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

/*
 * The policies themselves are not written here. Terms, a privacy notice and a
 * cookie policy are legal documents with real consequences under the Kenyan
 * Data Protection Act; drafting plausible-sounding ones would be inventing
 * commitments NexG has not made. The page says what each document will cover
 * and who to ask, and says plainly that it is not published yet.
 */
const DOCUMENTS = {
  terms: {
    title: 'Terms of service',
    summary:
      'The agreement between you and Nexgenius Concierge Limited when you ask NexG for something, ride with us, or list a business.',
  },
  privacy: {
    title: 'Privacy notice',
    summary:
      'What personal data NexG collects, why, how long it is kept and what you can ask us to do with it.',
  },
  cookies: {
    title: 'Cookie policy',
    summary: 'The cookies this site sets, what each one is for, and how to refuse them.',
  },
} as const;

type Slug = keyof typeof DOCUMENTS;

export function generateStaticParams() {
  return Object.keys(DOCUMENTS).map((slug) => ({ slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const document = DOCUMENTS[params.slug as Slug];
  return { title: document?.title ?? 'Legal' };
}

export default function LegalPage({ params }: { params: { slug: string } }) {
  const document = DOCUMENTS[params.slug as Slug];
  if (!document) notFound();

  return (
    <>
      <SiteHeader action={{ label: 'Sign in', href: '/sign-in' }} />

      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-8">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">{document.title}</h1>
        <p className="text-muted mt-4 text-[1.0625rem] font-semibold leading-[1.7]">
          {document.summary}
        </p>

        <Card tone="muted" className="mt-8 p-6">
          <h2 className="text-lg font-extrabold tracking-tight">Not published yet</h2>
          <p className="text-muted mt-2 text-[0.9375rem] leading-[1.7]">
            This document is with our legal advisers and will be published in full before NexG takes
            its first paying order. We would rather show you nothing here than a draft that reads
            like a commitment.
          </p>
          <p className="text-muted mt-3 text-[0.9375rem] leading-[1.7]">
            If you need to know how your data is handled before then,{' '}
            <Link href="/help" className="text-ink font-bold underline underline-offset-4">
              ask us
            </Link>{' '}
            and a person will answer.
          </p>
        </Card>

        <p className="text-muted-light mt-8 text-xs font-semibold">
          Nexgenius Concierge Limited · Nairobi, Kenya
        </p>
      </main>

      <SiteFooter />
    </>
  );
}
