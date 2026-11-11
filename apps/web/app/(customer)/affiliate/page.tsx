import { ArrowRight, Bike, Building2, Handshake, Home, QrCode, UserPlus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHero, SectionHead } from '@/components/company/page-hero';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

export const metadata: Metadata = {
  title: 'Affiliate',
  description:
    'Earn with NexG: hosts earn on what their guests order, riders earn for bringing riders, and partners can work with us directly.',
};

/*
 * The ways to earn by sending people to NexG that exist today. No rates are
 * printed here: the host commission terms live in the host agreement and the
 * rider reward on the rider's own Refer page, and a figure copied here would
 * drift from the one that is paid (ground rule 3).
 */
const PROGRAMMES = [
  {
    icon: Home,
    who: 'Hosts',
    title: 'Earn when your guests order',
    body: 'Every unit gets its own guest-services QR. When guests order or ask the concierge through it, eligible orders earn you a commission, shown in your host dashboard with your payouts.',
    points: [
      'A QR and link per unit',
      'Commissions tracked per unit',
      'Paid out with your earnings',
    ],
    href: '/hosts',
    cta: 'List your Airbnb',
  },
  {
    icon: Bike,
    who: 'Riders',
    title: 'Bring a rider you would ride with',
    body: 'Riders on NexG get a personal referral code. When someone you refer is verified and completes their first trip, you earn a reward, tracked on your Refer page.',
    points: [
      'Your own referral code',
      'See each referral’s progress',
      'Rewards paid with your payouts',
    ],
    href: '/riders',
    cta: 'Become a rider',
  },
  {
    icon: Building2,
    who: 'Hotels & partners',
    title: 'Work with us directly',
    body: 'Hotels, serviced apartments, tour operators and travel businesses can put NexG in front of their guests. Tell us about your business and we will work out the right arrangement together.',
    points: [
      'Charge-to-room at partner hotels',
      'QR codes for rooms and lobbies',
      'A person on our side to set it up',
    ],
    href: '/help',
    cta: 'Talk to us',
  },
] as const;

const STEPS = [
  {
    icon: UserPlus,
    title: 'Join',
    body: 'Sign up as a host or rider, or get in touch as a partner.',
  },
  {
    icon: QrCode,
    title: 'Share',
    body: 'Put your QR in front of guests, or share your referral code.',
  },
  {
    icon: Handshake,
    title: 'Earn',
    body: 'Eligible orders and referrals are tracked in your dashboard and paid out.',
  },
] as const;

export default function AffiliatePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <PageHero
          eyebrow="Affiliate"
          title="Send guests to NexG,"
          gold="and earn."
          lede="If people already ask you where to eat, what to do or who can deliver, NexG can answer them, and you can earn when they use it."
        />

        <section className="mx-auto max-w-[120rem] px-4 py-16 sm:px-[30px] sm:py-20">
          <SectionHead eyebrow="Ways to earn" title="Pick the one that fits you." />
          <ul className="mt-10 grid gap-5 lg:grid-cols-3">
            {PROGRAMMES.map(({ icon: Icon, who, title, body, points, href, cta }) => (
              <li key={who}>
                <Link
                  href={href}
                  className="border-border bg-surface hover:border-border-strong group flex h-full flex-col rounded-[1.5rem] border p-7 transition-colors sm:p-8"
                >
                  <span className="flex items-center gap-3">
                    <span className="bg-gold text-ink flex h-11 w-11 items-center justify-center rounded-full">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="text-gold-text text-xs font-extrabold uppercase tracking-[0.2em]">
                      {who}
                    </span>
                  </span>
                  <span className="mt-6 text-2xl font-extrabold tracking-tight">{title}</span>
                  <span className="text-muted mt-3 text-[0.9375rem] leading-[1.75]">{body}</span>
                  <ul className="mt-5 flex-1 space-y-2">
                    {points.map((point) => (
                      <li key={point} className="flex items-start gap-2.5 text-sm font-semibold">
                        <span
                          aria-hidden="true"
                          className="bg-gold mt-[0.4rem] h-1.5 w-1.5 shrink-0 rounded-full"
                        />
                        {point}
                      </li>
                    ))}
                  </ul>
                  <span className="text-gold-text mt-7 inline-flex items-center gap-3 font-bold">
                    <span className="bg-gold text-ink flex h-8 w-8 items-center justify-center rounded-full transition-transform group-hover:translate-x-1">
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                    {cta}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-ink py-16 text-white sm:py-20">
          <div className="mx-auto max-w-[120rem] px-4 sm:px-[30px]">
            <p className="text-gold text-xs font-extrabold uppercase tracking-[0.2em]">
              How it works
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.75rem]">
              Join, share, earn.
            </h2>
            <ol className="mt-10 grid gap-5 md:grid-cols-3">
              {STEPS.map(({ icon: Icon, title, body }, index) => (
                <li
                  key={title}
                  className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.04] p-7"
                >
                  <span className="flex items-center justify-between">
                    <span className="bg-gold text-ink flex h-11 w-11 items-center justify-center rounded-full">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="text-4xl font-extrabold tabular-nums text-white/25">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </span>
                  <p className="mt-6 text-xl font-extrabold">{title}</p>
                  <p className="mt-2 text-[0.9375rem] leading-[1.75] text-white/65">{body}</p>
                </li>
              ))}
            </ol>
            <p className="mt-8 max-w-3xl text-sm leading-[1.7] text-white/50">
              Commission and reward terms are set out in the host agreement and on each rider’s
              Refer page. Only completed, eligible orders and verified referrals count.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
