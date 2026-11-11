import type { Metadata } from 'next';
import Image from 'next/image';
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

  /* The last word of the title carries the marker highlight, in any
     language: "concierge" in English. */
  const title = t('nav.askConcierge');
  const split = title.lastIndexOf(' ');
  const titleLead = split > 0 ? title.slice(0, split) : '';
  const titleMark = split > 0 ? title.slice(split + 1) : title;

  return (
    <>
      <SiteHeader />

      <main className="bg-[#F6F2EA]">
        {/*
         * Design B, "Cream Editorial". Copy and an arched photograph on the
         * left, the order card on the right. Below 1024px it is one column
         * in the order text, form, photo — the form is the point of the
         * page, so it never waits behind a picture — and under 640px the
         * photo is not shown (and, being lazy, not downloaded).
         */}
        <section className="mx-auto max-w-[120rem] px-4 pb-14 pt-10 sm:px-[30px] lg:pb-20 lg:pt-16">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,620px)_minmax(0,540px)] lg:justify-between lg:gap-x-14 lg:gap-y-10">
            <div className="min-w-0 lg:col-start-1 lg:row-start-1">
              <span className="text-ink inline-flex items-center gap-2 rounded-full border border-[#E3DCC9] bg-white px-3.5 py-1.5 text-[0.78125rem] font-bold">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#E8B422]" />
                {t('home.availableNow')}
              </span>

              <h1 className="text-ink mt-6 break-words text-[2.75rem] font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-[3.75rem] lg:text-[4.875rem]">
                {titleLead}
                {titleLead && ' '}
                <span className="bg-[linear-gradient(transparent_62%,#F2C94C_62%,#F2C94C_92%,transparent_92%)] box-decoration-clone">
                  {titleMark}
                </span>
              </h1>

              <p className="text-ink mt-5 text-[1.625rem] font-extrabold leading-tight tracking-tight sm:text-[2rem]">
                {t('home.youWantIt')} <span className="text-[#86650D]">{t('home.weGotYou')}</span>
              </p>

              <p className="mt-5 max-w-[520px] text-[1.0625rem] leading-[1.65] text-[#4A4436] sm:text-lg">
                {t('home.lede')}
              </p>
            </div>

            {/* LeadForm reads ?need= on the client, which needs a boundary for
                the page to prerender. The fallback is the card's own shape. */}
            <div className="mx-auto w-full max-w-[560px] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mx-0 lg:max-w-none">
              <Suspense
                fallback={
                  <div className="min-h-[28rem] rounded-[22px] border-t-4 border-t-[#E8B422] bg-white shadow-[0_24px_60px_rgba(60,40,10,.12)]" />
                }
              >
                <LeadForm />
              </Suspense>
            </div>

            <div className="relative mx-auto hidden h-[300px] w-full max-w-[420px] overflow-hidden rounded-b-[28px] rounded-t-[150px] shadow-[0_30px_60px_rgba(60,40,10,.25)] sm:block lg:col-start-1 lg:row-start-2 lg:mx-0 lg:h-[360px] lg:max-w-[560px] lg:rounded-t-[200px]">
              <Image
                src="/images/hero/stay-sunset.jpg"
                alt=""
                fill
                loading="lazy"
                sizes="(max-width: 1023px) 420px, 560px"
                className="object-cover object-[67%_35%]"
              />
            </div>
          </div>
        </section>
      </main>

      {/* The floating WhatsApp button sits bottom-right; leave room under
          the footer so it never covers the copyright line. */}
      <div className="bg-bg pb-24">
        <SiteFooter />
      </div>
    </>
  );
}
