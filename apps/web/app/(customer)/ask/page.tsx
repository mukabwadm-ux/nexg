import { ArrowRight, Check, MessageCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';

import { AskRequestForm } from '@/components/ask/ask-request-form';
import { Reveal } from '@/components/reveal';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { ASK_CATEGORIES } from '@/lib/ask-categories';
import { getTranslations } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'Ask a concierge',
  description:
    'Tell us where you are staying and what you need. A concierge takes it from there — no account needed.',
};

const CONTAINER = 'mx-auto max-w-[120rem] px-4 sm:px-[30px]';

/* What happens after they send it, in the words the form and its sent card use. */
const NEXT_STEPS = [
  {
    title: 'A person reads it',
    body: 'Not a bot. A concierge in Nairobi picks your request up as soon as it lands.',
  },
  {
    title: 'We reply on WhatsApp',
    body: 'To agree exactly what you need, the price and the timing, often in one short chat.',
  },
  {
    title: 'Nothing is ordered until you say yes',
    body: 'You see the price and the delivery time first, then settle by M-Pesa.',
  },
] as const;

/**
 * Ask a concierge: the request form, on a page of its own.
 *
 * Redesigned on 17 Nov 2026 (owner) in the site's current look: the theme's
 * colours (it follows the dark theme now), the /merchants hero with its two
 * arched photographs, and the form in the merchant and rider forms' style.
 * Everything that asks for a person comes here: the menu's "Ask a
 * concierge", the search's "Airport transfer", popular requests and an empty
 * search. `?category=` (or the older `?need=`) fills the form in.
 *
 * Below 1024px it is one column in the order text, form, photographs; under
 * 640px the photographs are left out (and, being lazy, not downloaded), so a
 * phone goes from the headline straight to the form.
 */
export default async function AskPage() {
  const { t } = await getTranslations();

  /* The last word of the title carries the gold, in any language:
     "concierge" in English. */
  const title = t('nav.askConcierge');
  const split = title.lastIndexOf(' ');
  const titleLead = split > 0 ? title.slice(0, split) : '';
  const titleMark = split > 0 ? title.slice(split + 1) : title;

  return (
    <>
      <SiteHeader />

      <main>
        {/* ------------------------------------------------------------ hero */}
        {/* overflow-x-clip, not overflow-hidden: hidden would make the section
            a scroll box and stop the photographs from sticking. The
            photographs' column stays narrow until there is room, so the form
            is never the squeezed one. */}
        <section className="overflow-x-clip">
          <div
            className={`${CONTAINER} grid gap-12 pb-16 pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start lg:gap-16 lg:pb-24 lg:pt-14 xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]`}
          >
            <div className="min-w-0 max-w-[46rem]">
              <span className="border-border-strong bg-surface inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold">
                <span aria-hidden="true" className="bg-gold h-1.5 w-1.5 rounded-full" />
                {t('home.availableNow')}
              </span>

              <h1 className="text-ink mt-5 break-words text-[2.75rem]/[1.02] font-extrabold tracking-tight sm:text-6xl/[1.02] lg:text-[4.5rem]/[1.02]">
                {titleLead}
                {titleLead && ' '}
                <span className="dark:text-gold text-[#86650D]">{titleMark}</span>
              </h1>

              <p className="text-ink mt-4 text-xl font-extrabold tracking-tight sm:text-2xl">
                {t('home.youWantIt')}{' '}
                <span className="dark:text-gold text-[#86650D]">{t('home.weGotYou')}</span>
              </p>

              <p className="text-muted mt-4 max-w-xl text-[1.0625rem] font-semibold leading-[1.7]">
                {t('home.lede')}
              </p>

              <h2
                id="ask-title"
                className="text-ink mt-8 flex items-center gap-2 text-lg font-extrabold sm:text-xl"
              >
                Tell us what you need
                <ArrowRight
                  aria-hidden="true"
                  className="text-gold-text dark:text-gold h-5 w-5 rotate-90"
                />
              </h2>
              <p className="text-muted mt-0.5 text-[0.8125rem] font-semibold">
                Takes about a minute. No account needed.
              </p>

              {/* The form reads ?category= on the client, which needs a
                  boundary for the page to prerender. The fallback is the
                  form's own panel, so nothing jumps when it arrives. */}
              <div
                id="request"
                role="region"
                aria-labelledby="ask-title"
                className="mt-4 scroll-mt-24"
              >
                <Suspense
                  fallback={
                    <div className="border-border-strong bg-gold-soft min-h-[27rem] rounded-[20px] border" />
                  }
                >
                  <AskRequestForm categories={ASK_CATEGORIES} />
                </Suspense>
                <p className="text-muted mt-6 text-sm font-semibold">
                  Running a business?{' '}
                  <Link
                    href="/merchants#register"
                    className="text-gold-text dark:text-gold dark:hover:text-gold-light rounded-sm font-extrabold underline underline-offset-4"
                  >
                    List it on NexG
                  </Link>
                </p>
              </div>
            </div>

            {/* Two arched photographs, a guest at her stay and a NexG rider on
                the way, with what happens pinned to them. Decorative: the
                copy beside it says the same. */}
            <Reveal
              variant="arches"
              className="relative mx-auto hidden aspect-[6/5] w-full max-w-[34rem] sm:block lg:sticky lg:top-28 lg:mr-0 lg:mt-10"
            >
              <div aria-hidden="true" className="absolute inset-0">
                <span
                  data-reveal-item="dot"
                  className="bg-gold absolute left-[24%] top-[3%] h-14 w-14 rounded-full sm:h-20 sm:w-20"
                />
                <div
                  data-reveal-item="tall"
                  className="absolute right-0 top-0 h-[86%] w-[58%] overflow-hidden rounded-b-[2rem] rounded-t-full shadow-[0_30px_60px_-30px_rgb(0_0_0/0.45)]"
                >
                  <Image
                    src="/images/hero/stay-sunset.jpg"
                    alt=""
                    fill
                    loading="lazy"
                    sizes="(min-width: 1024px) 20rem, 58vw"
                    className="object-cover object-[71%_center]"
                  />
                </div>
                <div
                  data-reveal-item="short"
                  className="ring-bg absolute bottom-[12%] left-0 h-[60%] w-[42%] overflow-hidden rounded-b-[1.5rem] rounded-t-full shadow-[0_24px_50px_-26px_rgb(0_0_0/0.5)] ring-[6px]"
                >
                  <Image
                    src="/images/merchant-page/rider.jpg"
                    alt=""
                    fill
                    loading="lazy"
                    sizes="(min-width: 1024px) 15rem, 42vw"
                    className="object-cover object-[50%_center]"
                  />
                </div>

                <div
                  data-reveal-item="note-right"
                  className="border-border bg-surface absolute -right-1 top-[8%] flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 shadow-[0_14px_30px_-12px_rgb(0_0_0/0.35)] sm:-right-6"
                >
                  <span className="bg-gold text-ink flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                    <MessageCircle className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-[0.75rem] font-extrabold">
                      A concierge is on it
                    </span>
                    <span className="text-muted block text-[0.625rem] font-semibold">
                      Replying on WhatsApp
                    </span>
                  </span>
                </div>

                <div
                  data-reveal-item="note-left"
                  className="border-border bg-surface absolute bottom-0 left-[20%] flex items-center gap-3 rounded-2xl border px-3.5 py-3 shadow-[0_14px_30px_-12px_rgb(0_0_0/0.4)]"
                >
                  <span className="bg-gold text-ink flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
                    <Check className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-[0.8125rem] font-extrabold">
                      Dinner for two at 8 pm
                    </span>
                    <span className="text-muted block text-[0.6875rem] font-semibold">
                      Price agreed · rider on the way
                    </span>
                  </span>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ------------------------------------------------- category strip */}
        {/* Decorative: the same categories are in the form's dropdown. */}
        <div aria-hidden="true" className="bg-gold text-ink overflow-hidden py-4">
          <div className="flex w-max animate-[marquee_70s_linear_infinite] hover:[animation-play-state:paused]">
            {[0, 1].map((copy) => (
              <ul key={copy} className="flex shrink-0">
                {ASK_CATEGORIES.map((category) => (
                  <li
                    key={category.id}
                    className="flex items-center gap-6 whitespace-nowrap pl-6 text-sm font-extrabold sm:text-base"
                  >
                    {category.name}
                    <span className="bg-ink/60 h-1.5 w-1.5 rounded-full" />
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>

        {/* ------------------------------------------------------ next steps */}
        <section className="border-border band-surface border-b py-14 sm:py-16">
          <div className={CONTAINER}>
            <h2 className="text-ink text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.375rem]">
              What happens after you ask
            </h2>
            <p className="text-muted mt-2 max-w-lg text-[0.9375rem] font-semibold leading-[1.7]">
              No account, no app to download first. One request, and a person takes it from there.
            </p>

            <ol className="mt-8 grid gap-6 sm:grid-cols-3">
              {NEXT_STEPS.map((step, index) => (
                <li key={step.title} className="border-border border-t pt-5">
                  <span
                    aria-hidden="true"
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                      index === 0
                        ? 'bg-ink dark:bg-gold dark:text-ink text-white'
                        : 'bg-gold text-ink'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <h3 className="text-ink mt-4 text-[1.0625rem] font-extrabold">{step.title}</h3>
                  <p className="text-muted mt-1.5 max-w-sm text-sm font-semibold leading-[1.7]">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
