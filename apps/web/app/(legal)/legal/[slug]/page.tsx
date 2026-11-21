import { Button } from '@nexg/ui';
import { ChevronLeft, Info, Mail } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { splitClause } from '@/components/legal/clause';
import { CopyLinkButton } from '@/components/legal/copy-link-button';
import { DocumentSwitcher } from '@/components/legal/document-switcher';
import { LegalContents } from '@/components/legal/legal-contents';
import { LegalHeader } from '@/components/legal/legal-header';
import { PrintButton } from '@/components/legal/print-button';
import { SiteFooter } from '@/components/site-footer';
import { LEGAL_DOCUMENTS, findDocument, type LegalDocument } from '@/content/legal';
import { DATA_PROTECTION_POLICY_URL, NEW_TAB } from '@/lib/legal-documents';

export function generateStaticParams() {
  return LEGAL_DOCUMENTS.map((document) => ({ slug: document.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const document = findDocument(params.slug);
  if (!document) return { title: 'Legal' };
  return { title: document.title, description: document.intro };
}

/**
 * Manrope draws "(c)" as "©" through its ligatures, which turned clause (c)
 * of every list into a copyright sign. Legal text is set without them.
 */
const NO_LIGATURES =
  "[font-variant-ligatures:none] [font-feature-settings:'liga'_0,'clig'_0,'calt'_0,'dlig'_0]";

/** One paragraph of operative text, with a lettered item's letter or a label picked out. */
function Clause({ text }: { text: string }) {
  const clause = splitClause(text);
  if (clause.kind === 'lettered') {
    return (
      <p className="flex gap-2">
        <span className="text-page-muted min-w-[1.75rem] shrink-0 font-bold">{clause.marker}</span>
        <span>{clause.text}</span>
      </p>
    );
  }
  if (clause.kind === 'labelled') {
    return (
      <p>
        <strong className="text-page font-bold">{clause.label}:</strong> {clause.text}
      </p>
    );
  }
  return <p>{clause.text}</p>;
}

function Meta({ document }: { document: LegalDocument }) {
  const parts = [
    document.lastUpdated ? `Last updated ${document.lastUpdated}` : null,
    // Shown only once a version is published: a number on unreviewed text
    // would claim an authority it lacks.
    document.version ? `Version ${document.version}` : null,
    'Kenya',
    'English',
  ].filter(Boolean);
  return <p className="text-page-muted mt-2 text-[0.8125rem]">{parts.join(' · ')}</p>;
}

export default function LegalPage({ params }: { params: { slug: string } }) {
  const document = findDocument(params.slug);
  if (!document) notFound();

  const numbered = document.sections.length > 0;
  const sections = document.sections.map(({ id, heading }) => ({ id, heading }));

  return (
    <>
      <LegalHeader />

      <main
        className={`text-page mx-auto max-w-[75rem] px-4 pb-14 pt-3 sm:px-8 lg:pt-7 ${NO_LIGATURES}`}
      >
        <div className="lg:grid lg:grid-cols-[15rem_minmax(0,44rem)] lg:items-start lg:gap-12">
          <aside className="hidden lg:sticky lg:top-24 lg:flex lg:max-h-[calc(100dvh-7rem)] lg:flex-col lg:gap-5 lg:overflow-y-auto lg:pb-4 print:hidden">
            <DocumentSwitcher
              current={document.slug}
              documents={LEGAL_DOCUMENTS.map(({ slug, title }) => ({ slug, title }))}
            />
            {numbered && (
              <LegalContents variant="rail" sections={sections} title={document.title} />
            )}
            <div className="border-page-line flex flex-col gap-3 border-t pt-5">
              <Link
                href="/legal"
                className="text-page text-sm font-bold underline-offset-4 hover:underline"
              >
                All legal documents
              </Link>
              <p className="text-page-muted text-[0.8125rem] leading-relaxed">
                Questions about a policy?{' '}
                <Link href="/help" className="text-page font-bold underline underline-offset-4">
                  Contact support
                </Link>
                . They can explain it, but they can’t change it.
              </p>
            </div>
          </aside>

          <article className="min-w-0">
            <Link
              href="/legal"
              className="text-page-muted hover:text-page inline-flex min-h-10 items-center gap-1.5 text-sm font-bold lg:hidden print:hidden"
            >
              <ChevronLeft className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
              All legal documents
            </Link>
            <nav
              aria-label="Breadcrumb"
              className="text-page-muted hidden text-sm lg:block print:hidden"
            >
              <Link href="/legal" className="hover:text-page">
                Legal
              </Link>
              <span aria-hidden="true" className="mx-2">
                /
              </span>
              <span className="text-page">{document.title}</span>
            </nav>

            <h1 className="mt-1 text-[1.75rem] font-extrabold leading-tight tracking-tight sm:text-[2.25rem] lg:mt-2">
              {document.title}
            </h1>
            <p className="text-page/85 mt-2.5 text-[0.9375rem] leading-relaxed">{document.intro}</p>
            <Meta document={document} />
            <div className="mt-3 print:hidden">
              <PrintButton />
            </div>

            {document.draft && (
              <div className="border-gold/40 bg-gold-soft mt-5 flex items-start gap-3 rounded-xl border p-4">
                <Info aria-hidden="true" className="text-warning mt-0.5 h-4 w-4 shrink-0" />
                <p className="text-muted text-sm font-semibold leading-relaxed">
                  <span className="text-ink font-extrabold">Draft for review.</span> This text is a
                  structure and a starting point. It must be reviewed by a Kenyan lawyer before
                  publication and is not legal advice.
                </p>
              </div>
            )}

            {document.glance && document.glance.length > 0 && (
              <section
                aria-labelledby="at-a-glance"
                className="bg-surface text-ink mt-5 rounded-2xl p-4 sm:p-5"
              >
                <h2
                  id="at-a-glance"
                  className="text-base font-extrabold tracking-tight sm:text-[1.0625rem]"
                >
                  {document.title.replace(/ Policy$/, '')} at a glance
                </h2>
                <ul className="mt-2.5 flex flex-col gap-1.5 text-sm font-semibold leading-snug sm:text-[0.9375rem]">
                  {document.glance.map((point) => (
                    <li key={point} className="flex gap-3">
                      <span
                        aria-hidden="true"
                        className="bg-gold mt-[0.4rem] h-1.5 w-1.5 shrink-0 rounded-full"
                      />
                      {point}
                    </li>
                  ))}
                </ul>
                {document.request && (
                  <a
                    href={`#${document.request.afterSection}-request`}
                    className="mt-2 inline-flex min-h-10 items-center text-sm font-extrabold underline underline-offset-4 print:hidden"
                  >
                    {document.request.title}
                  </a>
                )}
                <p className="text-muted text-xs">
                  A summary to help you read. The full text below is what applies.
                </p>
              </section>
            )}

            {numbered ? (
              <>
                {/* A direct child of the article, so it stays pinned all the way down. */}
                <LegalContents variant="bar" sections={sections} title={document.title} />
                <ol className="mt-1 lg:mt-5">
                  {document.sections.map((section, index) => (
                    <li
                      key={section.id}
                      id={section.id}
                      className="border-page-line scroll-mt-32 border-t pt-5 first:border-t-0 first:pt-4 lg:scroll-mt-24 [&:not(:first-child)]:mt-5"
                    >
                      <div className="flex items-center gap-2">
                        <h2 className="flex-1 text-lg font-extrabold leading-snug tracking-tight sm:text-xl">
                          <span className="text-warning dark:text-gold mr-1.5">{index + 1}.</span>
                          {section.heading}
                        </h2>
                        <CopyLinkButton id={section.id} heading={section.heading} />
                      </div>

                      {/* The owner took the per-section plain-English notes off the page (21 Nov 2026). */}
                      <div className="text-page/85 mt-2 flex flex-col gap-2 text-[0.9375rem] leading-relaxed">
                        {section.body.map((paragraph) => (
                          <Clause key={paragraph.slice(0, 40)} text={paragraph} />
                        ))}
                      </div>

                      {document.request && document.request.afterSection === section.id && (
                        <div
                          id={`${section.id}-request`}
                          className="bg-surface text-ink mt-4 flex scroll-mt-32 flex-wrap items-center gap-x-5 gap-y-3 rounded-xl p-4 lg:scroll-mt-24 print:hidden"
                        >
                          <div className="min-w-[15rem] flex-1">
                            <h3 className="text-base font-extrabold">{document.request.title}</h3>
                            <p className="text-muted mt-0.5 text-sm leading-snug">
                              {document.request.text}
                            </p>
                          </div>
                          <Button variant="gold" asChild className="w-full sm:w-auto">
                            <a href={`mailto:${document.request.email}`}>
                              <Mail className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
                              {document.request.label}
                            </a>
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <div className="bg-surface text-ink mt-5 rounded-xl p-5">
                <h2 className="text-lg font-extrabold tracking-tight">Not drafted yet</h2>
                <p className="text-muted mt-2 text-[0.9375rem] leading-[1.8]">
                  {document.intro} It will be published here in full, with a plain-English summary
                  under every section, once it has been drafted and reviewed.
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

            <footer className="border-page-line mt-8 border-t pt-5">
              <p className="text-page text-sm font-extrabold">Nexgenius Concierge Limited</p>
              <p className="text-page-muted mt-0.5 text-[0.8125rem]">
                Registered office: Nairobi, Kenya
              </p>
              <p className="text-page-muted mt-1 text-[0.8125rem]">
                Read the full{' '}
                <a
                  href={DATA_PROTECTION_POLICY_URL}
                  {...NEW_TAB}
                  className="text-page font-bold underline underline-offset-2"
                >
                  NexG Data Protection Policy
                </a>
                .
              </p>
            </footer>
          </article>
        </div>
      </main>

      <div className="print:hidden">
        <SiteFooter />
      </div>
    </>
  );
}
