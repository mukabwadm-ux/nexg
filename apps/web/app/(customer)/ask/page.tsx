import type { Metadata } from 'next';
import { Suspense } from 'react';

import { LeadForm } from '@/components/home/lead-form';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { getTranslations } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'Ask a concierge',
  description:
    'Tell us where you are staying and what you need. A concierge takes it from there — no account needed.',
};

/**
 * Ask a concierge: the request form, on a page of its own.
 *
 * It used to sit under the homepage hero. The hero now leads with search,
 * so the form lives here, and everything that asks for a person — the
 * menu's "Ask a concierge", the hero's "Airport pickup", the popular
 * requests and an empty search — comes here. `?need=` prefills the form,
 * as it always has.
 */
export default async function AskPage() {
  const { t } = await getTranslations();

  return (
    <>
      <SiteHeader />

      <main>
        <section className="mx-auto max-w-[96rem] px-4 pb-14 pt-10 sm:px-8 lg:px-16 lg:pb-20 lg:pt-14">
          <div className="grid gap-8 lg:grid-cols-[1fr_32rem] lg:gap-12">
            <div className="lg:pt-6">
              <span className="border-border-strong bg-surface inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold">
                <span aria-hidden="true" className="bg-gold h-1.5 w-1.5 rounded-full" />
                {t('home.availableNow')}
              </span>

              <h1 className="mt-5 text-3xl/[1.16] font-extrabold tracking-tight sm:text-4xl/[1.16] lg:text-5xl/[1.16]">
                {t('nav.askConcierge')}
              </h1>

              <p className="mt-4 text-2xl font-extrabold tracking-tight sm:text-[1.75rem]">
                <span className="text-gold">{t('home.youWantIt')}</span>{' '}
                <span className="text-ink">{t('home.weGotYou')}</span>
              </p>

              <p className="text-muted mt-4 max-w-md text-[1.0625rem] font-semibold leading-[1.7]">
                {t('home.lede')}
              </p>
            </div>

            {/* LeadForm reads ?need= on the client, which needs a boundary for
                the page to prerender. The fallback is the card's own shape. */}
            <Suspense
              fallback={<div className="bg-surface shadow-raised min-h-[28rem] rounded-2xl" />}
            >
              <LeadForm />
            </Suspense>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
