import { ArrowRight, Bike, MapPin, MessageSquareText, Search, Store, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHero, SectionHead } from '@/components/company/page-hero';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

export const metadata: Metadata = {
  title: 'How we work',
  description:
    'How an order moves through NexG: where you are, what you need, how you pay, and who brings it.',
};

/*
 * The guest's journey, in order. Each step describes what the site does
 * today; payment methods are only offered at checkout once each one is
 * switched on (ground rule 3).
 */
const STEPS = [
  {
    icon: MapPin,
    title: 'Tell us where you are',
    body: 'Set your spot on the map from the location pill, or scan the NexG QR code in your room or apartment. We use it to show the stores that deliver to you.',
  },
  {
    icon: Search,
    title: 'Find it, or ask for it',
    body: 'Search stores and categories near you, or describe what you need to the concierge. Anything not listed is quoted with a price and a time first.',
  },
  {
    icon: Wallet,
    title: 'Pay the way that suits you',
    body: 'M-Pesa, pay on delivery where the merchant offers it, or charge it to your room at partner hotels. Checkout only shows the options that are switched on.',
  },
  {
    icon: Bike,
    title: 'A NexG rider brings it',
    body: 'The merchant prepares your order and a vetted NexG rider delivers it to your door, room or gate, with the hand-off arranged for Airbnbs.',
  },
] as const;

const SIDES = [
  {
    icon: Store,
    title: 'Merchants',
    body: 'Register in about ten minutes and we verify your permit, KRA PIN and the rest by hand. You keep your own prices and run your menu, orders and payouts from one dashboard.',
    href: '/merchants',
    cta: 'Register your business',
  },
  {
    icon: Bike,
    title: 'Riders',
    body: 'Apply, then verify your email and submit your ID, licence, insurance and good conduct certificate. Once checked, collect your NexG kit at onboarding and start taking deliveries.',
    href: '/riders',
    cta: 'Become a rider',
  },
  {
    icon: MessageSquareText,
    title: 'Hosts',
    body: 'Put a guest-services QR in every unit. Your guests order and ask through NexG, and you run bookings, staff and payouts for every unit from one dashboard.',
    href: '/hosts',
    cta: 'List your Airbnb',
  },
] as const;

export default function HowWeWorkPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero
          eyebrow="How we work"
          title="From what you need to"
          gold="your door."
          lede="One place to order from local stores or ask a concierge for anything else, paid the way you like and brought by a rider we have vetted."
        />

        <section className="mx-auto max-w-[120rem] px-4 py-16 sm:px-[30px] sm:py-20">
          <SectionHead eyebrow="For guests" title="Four steps, start to finish." />
          <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ icon: Icon, title, body }, index) => (
              <li
                key={title}
                className="border-border bg-surface relative rounded-[1.5rem] border p-7"
              >
                <span className="flex items-center justify-between">
                  <span className="bg-gold text-ink flex h-11 w-11 items-center justify-center rounded-full">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="text-muted-light text-4xl font-extrabold tabular-nums">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </span>
                <p className="mt-6 text-xl font-extrabold tracking-tight">{title}</p>
                <p className="text-muted mt-2 text-[0.9375rem] leading-[1.75]">{body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/discover"
              className="bg-gold text-ink hover:bg-gold/90 inline-flex h-12 items-center gap-2 rounded-full px-6 text-sm font-bold"
            >
              Explore stores <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/ask"
              className="border-border-strong hover:bg-surface inline-flex h-12 items-center rounded-full border px-6 text-sm font-bold"
            >
              Ask a concierge
            </Link>
          </div>
        </section>

        <section className="bg-ink py-16 text-white sm:py-20">
          <div className="mx-auto max-w-[120rem] px-4 sm:px-[30px]">
            <p className="text-gold text-xs font-extrabold uppercase tracking-[0.2em]">
              Behind every order
            </p>
            <h2 className="mt-3 max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.75rem]">
              The people who make it happen.
            </h2>
            <ul className="mt-10 grid gap-5 lg:grid-cols-3">
              {SIDES.map(({ icon: Icon, title, body, href, cta }) => (
                <li key={title}>
                  <Link
                    href={href}
                    className="group flex h-full flex-col rounded-[1.5rem] border border-white/[0.08] bg-white/[0.04] p-7 transition-colors hover:border-white/20"
                  >
                    <span className="bg-gold text-ink flex h-11 w-11 items-center justify-center rounded-full">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="mt-5 text-xl font-extrabold">{title}</span>
                    <span className="mt-2 flex-1 text-[0.9375rem] leading-[1.75] text-white/65">
                      {body}
                    </span>
                    <span className="text-gold mt-6 inline-flex items-center gap-3 font-bold">
                      <span className="bg-gold text-ink flex h-8 w-8 items-center justify-center rounded-full transition-transform group-hover:translate-x-1">
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </span>
                      {cta}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-[120rem] px-4 py-16 sm:px-[30px] sm:py-20">
          <div className="border-border bg-surface flex flex-col gap-6 rounded-[1.5rem] border p-7 sm:p-10 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-2xl font-extrabold tracking-tight">Still have a question?</p>
              <p className="text-muted mt-2 font-semibold">
                The Help page has quick answers, and a form that reaches a real person.
              </p>
            </div>
            <Link
              href="/help"
              className="bg-ink hover:bg-ink/90 inline-flex h-12 shrink-0 items-center gap-2 self-start rounded-full px-6 text-sm font-bold text-white lg:self-auto"
            >
              Go to Help <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
