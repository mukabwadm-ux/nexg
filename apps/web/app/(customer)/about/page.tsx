import { ArrowRight, BadgeCheck, HandCoins, MapPin, Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHero, SectionHead } from '@/components/company/page-hero';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

export const metadata: Metadata = {
  title: 'About us',
  description:
    'NexG is a concierge for wherever you stay: local stores, vetted riders and a real person on the desk, starting in Nairobi.',
};

/*
 * Everything here is true of NexG today, and says so where something is
 * still being built (ground rule 3). No customer counts, no ratings, no
 * figures we do not have.
 */

const PILLARS = [
  {
    title: 'Local stores, delivered',
    body: 'Restaurants, pharmacies, groceries, drinks, flowers and laundry from Nairobi merchants, brought to your door, room or gate.',
    href: '/explore',
    cta: 'Explore stores',
  },
  {
    title: 'A concierge for the rest',
    body: 'Describe what you need, even if it is not listed. A concierge quotes a price and a time, and nothing is bought until you approve it.',
    href: '/ask',
    cta: 'Ask a concierge',
  },
  {
    title: 'Stays and days out',
    body: 'Places to stay, and days you can plan to your budget, so the whole visit is in one place.',
    href: '/experience',
    cta: 'Plan your trip',
  },
] as const;

const PRINCIPLES = [
  {
    icon: BadgeCheck,
    title: 'Checked by a person',
    body: 'Every merchant’s permit and KRA PIN, and every rider’s ID, licence, insurance and good conduct certificate, is checked by hand before they can take work.',
  },
  {
    icon: HandCoins,
    title: 'Prices you agree to first',
    body: 'Merchants keep their own prices. Concierge requests are quoted before anything is bought, and nothing is charged without your yes.',
  },
  {
    icon: MapPin,
    title: 'Local first',
    body: 'We start in Nairobi and grow neighbourhood by neighbourhood, with the merchants and riders who already know the city.',
  },
  {
    icon: Sparkles,
    title: 'Honest about what is ready',
    body: 'If a feature is not switched on yet, the site says so. A button that cannot work is worse than no button.',
  },
] as const;

const PEOPLE = [
  {
    who: 'Guests',
    body: 'In a hotel, an Airbnb or at home: order, ask and plan from one place.',
    href: '/explore',
  },
  {
    who: 'Hosts',
    body: 'Give your guests a concierge, and run every unit from one dashboard.',
    href: '/hosts',
  },
  {
    who: 'Merchants',
    body: 'Reach guests near you. You keep your prices; NexG handles delivery.',
    href: '/merchants',
  },
  {
    who: 'Riders',
    body: 'Deliver across Nairobi on your own schedule, once your documents are verified.',
    href: '/riders',
  },
] as const;

export default function AboutPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero
          eyebrow="About us"
          title="A concierge for"
          gold="wherever you stay."
          lede="NexG brings together local stores, vetted riders and a real person on the concierge desk, so that a guest in a hotel room, an Airbnb or at home can get what they need without knowing the city. We are starting in Nairobi."
        />

        <section className="mx-auto max-w-[120rem] px-4 py-16 sm:px-[30px] sm:py-20">
          <SectionHead eyebrow="What we do" title="Everything you need, from one place." />
          <ul className="mt-10 grid gap-5 md:grid-cols-3">
            {PILLARS.map((pillar) => (
              <li key={pillar.title}>
                <Link
                  href={pillar.href}
                  className="border-border bg-surface hover:border-border-strong group flex h-full flex-col rounded-[1.5rem] border p-7 transition-colors"
                >
                  <span className="text-xl font-extrabold tracking-tight">{pillar.title}</span>
                  <span className="text-muted mt-3 flex-1 text-[0.9375rem] leading-[1.75]">
                    {pillar.body}
                  </span>
                  <span className="text-gold-text mt-6 inline-flex items-center gap-2 text-sm font-extrabold">
                    {pillar.cta}
                    <ArrowRight
                      className="h-4 w-4 transition-transform group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-ink py-16 text-white sm:py-20">
          <div className="mx-auto max-w-[120rem] px-4 sm:px-[30px]">
            <p className="text-gold text-xs font-extrabold uppercase tracking-[0.2em]">
              How we hold ourselves
            </p>
            <h2 className="mt-3 max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.75rem]">
              Trust is the whole product.
            </h2>
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {PRINCIPLES.map(({ icon: Icon, title, body }) => (
                <li
                  key={title}
                  className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.04] p-7"
                >
                  <span className="bg-gold text-ink flex h-11 w-11 items-center justify-center rounded-full">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <p className="mt-5 text-lg font-extrabold">{title}</p>
                  <p className="mt-2 text-[0.9375rem] leading-[1.75] text-white/65">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-[120rem] px-4 py-16 sm:px-[30px] sm:py-20">
          <SectionHead eyebrow="Who it is for" title="Four sides, one city." />
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PEOPLE.map((person) => (
              <li key={person.who}>
                <Link
                  href={person.href}
                  className="border-border bg-surface hover:border-border-strong group block h-full rounded-[1.5rem] border p-7 transition-colors"
                >
                  <span className="flex items-center justify-between text-xl font-extrabold">
                    {person.who}
                    <span className="bg-gold text-ink flex h-8 w-8 items-center justify-center rounded-full transition-transform group-hover:translate-x-1">
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </span>
                  <span className="text-muted mt-3 block text-[0.9375rem] leading-[1.75]">
                    {person.body}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto max-w-[120rem] px-4 pb-16 sm:px-[30px] sm:pb-20">
          <div className="border-border bg-surface flex flex-col gap-6 rounded-[1.5rem] border p-7 sm:p-10 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-muted-light text-xs font-extrabold uppercase tracking-[0.2em]">
                The company
              </p>
              <p className="mt-2 text-2xl font-extrabold">Nexgenius Concierge Limited</p>
              <p className="text-muted mt-1 font-semibold">Nairobi, Kenya</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/careers"
                className="bg-gold text-ink hover:bg-gold/90 inline-flex h-12 items-center gap-2 rounded-full px-6 text-sm font-bold"
              >
                Join the team <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/help"
                className="border-border-strong hover:bg-bg inline-flex h-12 items-center rounded-full border px-6 text-sm font-bold"
              >
                Contact us
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
