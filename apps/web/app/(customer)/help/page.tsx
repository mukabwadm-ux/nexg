import { Card, VALUE_PLACEHOLDER } from '@nexg/ui';
import {
  Bike,
  CreditCard,
  MapPin,
  MessageSquare,
  RotateCcw,
  ShoppingCart,
  Sparkles,
  Store,
  UserRound,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ContactForm } from '@/components/help/contact-form';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

export const metadata: Metadata = {
  title: 'Help',
  description: 'Answers, or a real person on the concierge desk.',
};

/**
 * Topics from the Help artboard.
 *
 * The artboard shows an article count on each. There is no knowledge base
 * yet, so the counts render bracketed and each card jumps to the answers
 * below rather than to an article page that would 404 (ground rule 3).
 */
const TOPICS = [
  {
    icon: ShoppingCart,
    title: 'Placing an order',
    body: 'Browsing, concierge requests, minimums, restricted items',
    anchor: 'ordering',
  },
  {
    icon: CreditCard,
    title: 'Payments',
    body: 'M-Pesa, cards, pay on delivery, charge to room, receipts',
    anchor: 'payments',
  },
  {
    icon: MapPin,
    title: 'Tracking & delivery',
    body: 'Live tracking, late orders, wrong items, hotel hand-off',
    anchor: 'delivery',
  },
  {
    icon: RotateCcw,
    title: 'Refunds & cancellations',
    body: 'Cancel windows, refund timing, partial refunds',
    anchor: 'refunds',
  },
  {
    icon: UserRound,
    title: 'Account & privacy',
    body: 'Signing in, saved details, deleting your data',
    anchor: 'account',
  },
  {
    icon: Sparkles,
    title: 'Concierge service',
    body: 'What we can arrange, quotes, hours, special requests',
    anchor: 'concierge',
  },
  {
    icon: Bike,
    title: 'For riders',
    body: 'Applications, documents, what happens next',
    anchor: 'riders',
  },
  {
    icon: Store,
    title: 'For merchants',
    body: 'Registration, documents, going live, featured slots',
    anchor: 'merchants',
  },
] as const;

/*
 * Answers, not articles. Every one is true of what exists today — which is
 * why several of them say a thing is not built yet rather than describing a
 * feature the reader cannot use.
 */
const ANSWERS = [
  {
    group: 'ordering',
    q: 'Can I order right now?',
    a: 'Not yet. NexG is open for merchant and rider registration while we build the ordering side, so Explore shows you who has signed up rather than a checkout. Tell the concierge desk what you need and a person will answer.',
  },
  {
    group: 'concierge',
    q: 'Can the concierge get something that isn’t listed?',
    a: 'That is the idea. Describe it and a concierge quotes a price and a time before anything is bought. Nothing is purchased on your behalf until you approve the quote.',
  },
  {
    group: 'account',
    q: 'Do I need an account?',
    a: 'No. You can ask the concierge with just a phone number. An account saves your details for next time and lets you pick up a rider or merchant application on another device.',
  },
  {
    group: 'account',
    q: 'How do I sign in?',
    a: 'With an email and a password, from the sign-in page. One-time codes by SMS and Google sign-in are coming; the page says so plainly rather than offering a button that cannot work.',
  },
  {
    group: 'payments',
    q: 'How will payment work?',
    a: 'M-Pesa, cards and pay on delivery at participating merchants, with charge-to-room at partner hotels. None of it is switched on yet, and no price on this site is a real figure until it is.',
  },
  {
    group: 'refunds',
    q: 'What about refunds?',
    a: 'The refunds and cancellations policy is being drafted and will be published in full before NexG takes a paying order. We would rather show you nothing than a draft that reads like a commitment.',
  },
  {
    group: 'riders',
    q: 'I applied as a rider. What happens next?',
    a: 'We check every document by hand. Come back to the application on the same browser and you will see what is verified, what is rejected and why. Create an account and you can pick it up on any device.',
  },
  {
    group: 'merchants',
    q: 'How long does merchant registration take?',
    a: 'About ten minutes to submit, then we verify your permit, KRA PIN and the rest by hand. You keep your own prices; NexG takes a commission on completed orders, and that rate is not set yet.',
  },
  {
    group: 'delivery',
    q: 'Who delivers, and are they vetted?',
    a: 'NexG riders, and yes. Every rider supplies a national ID, a licence where the vehicle needs one, insurance, a good conduct certificate and a photo, and each is checked before they can take work.',
  },
] as const;

const CHANNELS = [
  {
    title: 'The concierge desk',
    body: 'Fastest for anything live. Published once the desk has a number.',
    detail: `+254 ${VALUE_PLACEHOLDER}`,
  },
  {
    title: 'Email',
    body: 'Receipts, refunds and account requests.',
    detail: `help@${VALUE_PLACEHOLDER}`,
  },
  {
    title: 'Rider support',
    body: 'Payouts, the app, problems on a trip.',
    detail: `+254 ${VALUE_PLACEHOLDER}`,
  },
  {
    title: 'Merchant success',
    body: 'Catalogue, settlements, featured slots.',
    detail: `merchants@${VALUE_PLACEHOLDER}`,
  },
] as const;

export default function HelpPage() {
  return (
    <>
      <SiteHeader />

      <main>
        {/* ------------------------------------------------------------ hero */}
        <section className="mx-auto max-w-[96rem] px-4 pt-6 sm:px-8 lg:px-16">
          <div className="bg-ink relative overflow-hidden rounded-2xl px-6 py-14 text-center text-white sm:px-10 sm:py-16">
            <p className="text-gold text-[0.625rem] font-extrabold uppercase tracking-[0.18em]">
              Help &amp; contact
            </p>
            <h1 className="mx-auto mt-4 max-w-2xl text-4xl font-extrabold tracking-tight sm:text-5xl">
              How can we <span className="text-gold">help</span> tonight?
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-[0.9375rem] font-semibold leading-[1.7] text-white/60">
              Read the answers below, or talk to a real person on the concierge desk. Most things
              are sorted while you are still on the phone.
            </p>

            <ul className="mt-7 flex flex-wrap justify-center gap-2">
              {TOPICS.slice(0, 5).map((topic) => (
                <li key={topic.anchor}>
                  <Link
                    href={`#${topic.anchor}`}
                    className="inline-block rounded-full border border-white/20 px-3.5 py-1.5 text-xs font-bold text-white/80 transition-colors hover:border-white/50 hover:text-white"
                  >
                    {topic.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------------------------------------------------- topics */}
        <section className="mx-auto max-w-[96rem] px-4 py-14 sm:px-8 lg:px-16">
          <p className="text-gold-text text-[0.625rem] font-extrabold uppercase tracking-[0.18em]">
            Browse by topic
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Find it yourself in a minute.
          </h2>

          <ul className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TOPICS.map((topic) => (
              <li key={topic.title}>
                <Link
                  href={`#${topic.anchor}`}
                  className="border-border bg-surface hover:border-border-strong block h-full rounded-2xl border p-5 transition-colors"
                >
                  <span
                    aria-hidden="true"
                    className="bg-bg text-ink flex h-10 w-10 items-center justify-center rounded-xl"
                  >
                    <topic.icon className="h-4 w-4" />
                  </span>
                  <span className="mt-4 block text-[0.9375rem] font-extrabold">{topic.title}</span>
                  <span className="text-muted-light mt-1.5 block text-xs font-semibold leading-[1.7]">
                    {topic.body}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* --------------------------------------------- answers + contact */}
        <section className="mx-auto max-w-[96rem] px-4 pb-14 sm:px-8 lg:px-16">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
            <div>
              <p className="text-gold-text text-[0.625rem] font-extrabold uppercase tracking-[0.18em]">
                Asked most
              </p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
                Quick answers
              </h2>

              <ul className="mt-6 space-y-2.5">
                {ANSWERS.map((item, index) => (
                  <li key={item.q} id={item.group} className="scroll-mt-6">
                    <details
                      open={index === 0}
                      className="border-border bg-surface shadow-card group rounded-xl border px-4 py-3.5"
                    >
                      <summary className="focus-visible:ring-gold flex cursor-pointer list-none items-center justify-between gap-4 text-[0.9375rem] font-bold focus-visible:outline-none focus-visible:ring-2">
                        {item.q}
                        <span
                          aria-hidden="true"
                          className="text-muted-light shrink-0 text-lg group-open:hidden"
                        >
                          +
                        </span>
                        <span
                          aria-hidden="true"
                          className="bg-gold text-ink hidden h-6 w-6 shrink-0 items-center justify-center rounded-full text-base leading-none group-open:flex"
                        >
                          −
                        </span>
                      </summary>
                      <p className="text-muted mt-2.5 text-[0.9375rem] leading-[1.8]">{item.a}</p>
                    </details>
                  </li>
                ))}
              </ul>
            </div>

            <ContactForm />
          </div>
        </section>

        {/* -------------------------------------------------------- channels */}
        <section className="mx-auto max-w-[96rem] px-4 pb-16 sm:px-8 lg:px-16">
          <p className="text-gold-text text-[0.625rem] font-extrabold uppercase tracking-[0.18em]">
            Talk to a person
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
            The concierge desk is a phone call away.
          </h2>

          <ul className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CHANNELS.map((channel) => (
              <li key={channel.title}>
                <Card className="h-full p-5">
                  <span
                    aria-hidden="true"
                    className="bg-bg text-ink flex h-10 w-10 items-center justify-center rounded-xl"
                  >
                    <MessageSquare className="h-4 w-4" />
                  </span>
                  <p className="mt-4 text-[0.9375rem] font-extrabold">{channel.title}</p>
                  <p className="text-muted-light mt-1.5 text-xs font-semibold leading-[1.7]">
                    {channel.body}
                  </p>
                  <p className="text-gold-text mt-3 text-[0.8125rem] font-extrabold">
                    {channel.detail}
                  </p>
                </Card>
              </li>
            ))}
          </ul>

          {/*
           * No number is printed because none is live. A support line that
           * does not ring is worse than none, and the form above reaches the
           * same desk.
           */}
          <Card tone="muted" className="mt-5 p-5">
            <p className="text-muted text-xs leading-[1.7]">
              These lines are published the day the desk opens. Until then the form above is the way
              through, and it reaches the same people.
            </p>
          </Card>
        </section>

        <section className="mx-auto max-w-[96rem] px-4 pb-16 sm:px-8 lg:px-16">
          <div className="border-border bg-surface rounded-2xl border p-6 sm:p-8">
            <p className="text-muted-light text-[0.5625rem] font-extrabold uppercase tracking-[0.16em]">
              Office
            </p>
            <p className="mt-2 text-lg font-extrabold">Nexgenius Concierge Limited</p>
            <p className="text-muted mt-1 text-sm font-semibold">Nairobi, Kenya</p>
            <p className="text-muted-light mt-3 text-xs font-semibold">
              Data protection enquiries are answered through the form above until the DPO contact is
              published with the Privacy Policy.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
