import { Button } from '@nexg/ui';
import { Info } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { LEGAL_DOCUMENTS, findDocument } from '@/content/legal';
import { PrintButton } from '@/components/legal/print-button';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

export function generateStaticParams() {
  return LEGAL_DOCUMENTS.map((document) => ({ slug: document.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const document = findDocument(params.slug);
  if (!document) return { title: 'Legal' };
  return { title: document.title, description: document.intro };
}

export default function LegalPage({ params }: { params: { slug: string } }) {
  const document = findDocument(params.slug);
  if (!document) notFound();

  const numbered = document.sections.length > 0;

  return (
    <>
      <SiteHeader action={{ label: 'Sign in', href: '/sign-in' }} />

      <main className="mx-auto max-w-[80rem] px-4 pb-16 pt-6 sm:px-8">
        <nav aria-label="Breadcrumb" className="text-muted-light text-xs font-semibold">
          <Link href="/" className="hover:text-ink transition-colors">
            Home
          </Link>
          <span className="mx-2" aria-hidden="true">
            ›
          </span>
          <span>Legal</span>
          <span className="mx-2" aria-hidden="true">
            ›
          </span>
          <span className="text-ink">{document.title}</span>
        </nav>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-gold-text text-[0.625rem] font-extrabold uppercase tracking-[0.18em]">
              Legal
            </p>
            <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">
              {document.title}
            </h1>
            <p className="text-muted mt-3 text-[0.9375rem] font-semibold leading-[1.7]">
              {document.intro}
            </p>
          </div>

          <div className="text-right">
            <p className="text-muted-light text-xs font-semibold">
              {/* Bracketed until a version is actually published — a version
                  number on unreviewed text claims an authority it lacks. */}
              Last updated {document.lastUpdated ?? '[—]'} · Version {document.version ?? '[—]'}
            </p>
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              <PrintButton />
            </div>
          </div>
        </div>

        {/* Document switcher. Links, not tabs: each document is its own page
            with its own URL, which is what people paste into an email. */}
        <ul className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {LEGAL_DOCUMENTS.map((entry) => {
            const active = entry.slug === document.slug;
            return (
              <li key={entry.slug}>
                <Link
                  href={`/legal/${entry.slug}`}
                  aria-current={active ? 'page' : undefined}
                  className={`block h-full rounded-xl border p-4 transition-colors ${
                    active
                      ? 'border-ink bg-ink text-white'
                      : 'border-border bg-surface hover:border-border-strong'
                  }`}
                >
                  <span className="block text-[0.875rem] font-extrabold">{entry.title}</span>
                  <span
                    className={`mt-0.5 block text-xs font-semibold ${
                      active ? 'text-white/55' : 'text-muted-light'
                    }`}
                  >
                    {entry.tagline}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-8 grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
          <div className="lg:sticky lg:top-6 print:hidden">
            {numbered && (
              <nav
                aria-label="On this page"
                className="border-border bg-surface rounded-xl border p-4"
              >
                <p className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-[0.16em]">
                  On this page
                </p>
                <ol className="mt-3 space-y-2">
                  {document.sections.map((section, index) => (
                    <li key={section.id} className="flex gap-2">
                      <span className="text-muted-light shrink-0 text-xs font-bold">
                        {index + 1}
                      </span>
                      <a
                        href={`#${section.id}`}
                        className="text-muted hover:text-ink text-xs font-semibold leading-snug transition-colors"
                      >
                        {section.heading}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            )}

            <div className="bg-ink mt-4 rounded-xl p-5 text-white">
              <p className="text-gold text-[0.625rem] font-extrabold uppercase tracking-[0.16em]">
                Questions?
              </p>
              <p className="mt-2 text-xs font-semibold leading-[1.7] text-white/65">
                Our support team can explain any section — they can’t change it, but they can help
                you understand it.
              </p>
              <Button variant="gold" size="sm" asChild className="mt-4 w-full">
                <Link href="/help">Contact support</Link>
              </Button>
            </div>
          </div>

          <div>
            {document.draft && (
              <div className="border-gold/40 bg-gold-soft flex items-start gap-3 rounded-xl border p-4">
                <Info aria-hidden="true" className="text-gold-text mt-0.5 h-4 w-4 shrink-0" />
                <p className="text-muted text-xs font-semibold leading-[1.7]">
                  <span className="text-ink font-extrabold">Draft for review.</span> This text is a
                  structure and a starting point. It must be reviewed by a Kenyan lawyer before
                  publication and is not legal advice.
                </p>
              </div>
            )}

            {numbered ? (
              <ol className="mt-6 space-y-8">
                {document.sections.map((section, index) => (
                  <li key={section.id} id={section.id} className="scroll-mt-6">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
                      <div>
                        <h2 className="text-lg font-extrabold tracking-tight">
                          <span className="text-gold-text mr-2">{index + 1}.</span>
                          {section.heading}
                        </h2>
                        {section.body.map((paragraph) => (
                          <p
                            key={paragraph.slice(0, 40)}
                            className="text-muted mt-2 text-[0.9375rem] leading-[1.8]"
                          >
                            {paragraph}
                          </p>
                        ))}
                      </div>

                      {/*
                       * An aid to reading, not a term. Marked as an aside so a
                       * screen reader announces it as commentary rather than
                       * as part of the clause it sits beside.
                       */}
                      <aside
                        aria-label={`${section.heading}, in plain English`}
                        className="border-gold/30 bg-gold-soft rounded-xl border p-3"
                      >
                        <p className="text-gold-text text-[0.5625rem] font-extrabold uppercase tracking-[0.16em]">
                          In plain English
                        </p>
                        <p className="text-muted mt-1.5 text-xs font-semibold leading-[1.6]">
                          {section.plainEnglish}
                        </p>
                      </aside>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="border-border bg-surface mt-6 rounded-xl border p-6">
                <h2 className="text-lg font-extrabold tracking-tight">Not drafted yet</h2>
                <p className="text-muted mt-2 text-[0.9375rem] leading-[1.8]">
                  {document.intro} It will be published here in full, with a plain-English summary
                  beside every section, once it has been drafted and reviewed.
                </p>
                <p className="text-muted mt-3 text-[0.9375rem] leading-[1.8]">
                  If you need to know how this works before then,{' '}
                  <Link href="/help" className="text-ink font-bold underline underline-offset-4">
                    ask us
                  </Link>{' '}
                  and a person will answer.
                </p>
              </div>
            )}

            <footer className="border-border mt-10 border-t pt-6">
              <p className="text-[0.8125rem] font-extrabold">Nexgenius Concierge Limited</p>
              <p className="text-muted-light mt-1 text-xs font-semibold">
                Registered office: Nairobi, Kenya
              </p>
              <p className="text-muted-light mt-1 text-xs font-semibold">
                Data Protection Officer and support contacts are published with the Privacy Policy.
              </p>
            </footer>
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
