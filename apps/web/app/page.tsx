import { Button, Card, Tag } from '@nexg/ui';
import {
  ArrowRight,
  Car,
  Flower2,
  Gift,
  Landmark,
  Martini,
  Pill,
  Plane,
  Scissors,
  Shirt,
  ShoppingCart,
  Sparkles,
  Ticket,
  UtensilsCrossed,
} from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { AppPreview, StoreBadges } from '@/components/home/app-preview';
import { CityCarousel } from '@/components/home/city-carousel';
import { LeadForm } from '@/components/home/lead-form';
import { RotatingWord } from '@/components/home/rotating-word';
import { NotifyForm } from '@/components/home/notify-form';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Everything at your Doorstep',
  description:
    'Tell us where you are staying and what you need. A vetted local concierge confirms the plan, the price and the timing, and delivers it to your door.',
};

/* Copy below comes from the `BookingFirst` artboard and is signed off. */

const HOW_IT_WORKS = [
  {
    title: 'Ask in a sentence',
    body: 'Type or voice-note what you need. No forms, no menus to dig through.',
    image: '/images/how-it-works/ask-in-a-sentence.jpg',
  },
  {
    title: 'A concierge takes it',
    body: 'A vetted local concierge confirms the plan, the price and the timing with you.',
    image: '/images/how-it-works/a-concierge-takes-it.jpg',
  },
  {
    title: 'Track and pay',
    body: "Follow it live in the app and settle by card or M-Pesa when it's done.",
    image: '/images/how-it-works/track-and-pay.jpg',
  },
] as const;

const POPULAR_REQUESTS = [
  { label: 'Late-night dinner to my room', icon: UtensilsCrossed },
  { label: 'Airport pickup at JKIA', icon: Plane },
  { label: 'Laundry back by morning', icon: Shirt },
  { label: 'Birthday flowers, same day', icon: Flower2 },
  { label: 'Pharmacy run', icon: Pill },
  { label: 'Wine and ice for tonight', icon: Martini },
  { label: 'Hair and nails at the hotel', icon: Scissors },
  { label: 'Car and driver for the day', icon: Car },
  { label: 'Groceries for the apartment', icon: ShoppingCart },
] as const;

const CATEGORIES = [
  { label: 'Airport transfers', icon: Plane },
  { label: 'Alcohol & beverages', icon: Martini },
  { label: 'Fashion & apparel', icon: Shirt },
  { label: 'Beauty', icon: Sparkles },
  { label: 'Vehicle rentals', icon: Car },
  { label: 'Experiences', icon: Ticket },
  { label: 'Financial services', icon: Landmark },
  { label: 'Flowers & gifts', icon: Gift },
] as const;

/**
 * Featured merchant slots. Section 4.1: no real slots exist yet, so the
 * designed placeholder cards render instead — bracketed names, [COVER PHOTO],
 * and the Sponsored label. No invented merchant is presented as real.
 */
const FEATURED_PLACEHOLDERS = [
  {
    name: '[Italian restaurant]',
    meta: 'Fine dining · Westlands',
    eta: '25–35 min',
    cta: 'View menu',
  },
  { name: '[Wine & spirits shop]', meta: 'Drinks · Parklands', eta: '20–30 min', cta: 'Shop' },
  { name: '[Florist]', meta: 'Flowers & gifts · Kilimani', eta: 'Same day', cta: 'Shop' },
  {
    name: '[Laundry & dry cleaning]',
    meta: 'Wash, iron, press · Kilimani',
    eta: 'Next day',
    cta: 'View services',
  },
] as const;

export default async function HomePage({ searchParams }: { searchParams?: { need?: string } }) {
  const supabase = createClient();

  // Live and soft-launch cities first, then the waitlist — as designed.
  const { data: cities } = await supabase
    .from('city')
    .select('id, slug, name, status')
    .order('sort', { ascending: true });

  const allCities = cities ?? [];
  const openCities = allCities.filter((c) => c.status !== 'waitlist');

  return (
    <>
      <SiteHeader action={{ label: 'Sign in', href: '/sign-in' }} />

      <main>
        {/* ------------------------------------------------------------ hero */}
        <section className="mx-auto max-w-[96rem] px-4 pb-10 pt-8 sm:px-8 lg:px-16 lg:pb-16 lg:pt-12">
          <div className="grid gap-8 lg:grid-cols-[1fr_32rem] lg:gap-12">
            <div className="lg:pt-6">
              <span className="border-border-strong bg-surface inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold">
                <span aria-hidden="true" className="bg-gold h-1.5 w-1.5 rounded-full" />
                Concierges available now in Nairobi
              </span>

              {/*
                The accessible name stays "Everything at your Doorstep" however
                the gold word is cycling; RotatingWord is hidden from assistive
                technology and reserves its own space so nothing below shifts.
              */}
              <h1
                aria-label="Everything at your Doorstep"
                className="mt-5 text-4xl/[1.16] font-extrabold tracking-tight sm:text-5xl/[1.16] lg:text-6xl/[1.16]"
              >
                <RotatingWord />
                <span aria-hidden="true" className="block">
                  at your Doorstep
                </span>
              </h1>

              <p className="mt-6 text-2xl font-extrabold tracking-tight sm:text-[2rem]">
                <span className="text-gold">You Want it!</span>{' '}
                <span className="text-ink">We Got You!</span>
              </p>

              <p className="text-muted mt-4 max-w-md text-[1.0625rem] font-semibold leading-[1.7]">
                Tell us where you&apos;re staying — hotel or Airbnb — and what you need. We will
                deliver it to you.
              </p>

              <dl className="mt-7 flex flex-wrap gap-x-10 gap-y-4">
                {[
                  { value: allCities.length || '—', label: 'cities' },
                  { value: CATEGORIES.length, label: 'service categories' },
                  { value: '100%', label: 'Tracking' },
                ].map((stat) => (
                  <div key={stat.label}>
                    <dt className="sr-only">{stat.label}</dt>
                    <dd>
                      <span className="block text-2xl font-extrabold tracking-tight">
                        {stat.value}
                      </span>
                      <span className="text-muted-light block text-xs">{stat.label}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <LeadForm {...(searchParams?.need ? { initialNeed: searchParams.need } : {})} />
          </div>
        </section>

        {/* ---------------------------------------------------- how it works */}
        <section id="how-it-works" className="mx-auto max-w-[96rem] px-4 pb-12 sm:px-8 lg:px-16">
          <ol className="grid gap-4 sm:grid-cols-3 sm:gap-6">
            {HOW_IT_WORKS.map((step, index) => (
              <li
                key={step.title}
                /* The tile is a hover-reveal, so it needs a tab stop: without one a
                   sighted keyboard user can never read the copy. The rule cannot see
                   that, hence the exception. */
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                tabIndex={0}
                className="focus-visible:ring-gold focus-visible:ring-offset-bg group relative aspect-[418/197] min-h-[11rem] overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                {/* Decorative: the panel below carries the same meaning in text. */}
                <Image
                  src={step.image}
                  alt=""
                  fill
                  sizes="(min-width: 640px) 33vw, 100vw"
                  className="object-cover"
                />

                {/*
                  The gold card, revealed on hover.

                  The base state is visible, and only devices that actually
                  support hover start it hidden — a touch screen has no hover,
                  so the copy would otherwise be unreachable. Focus reveals it
                  too, which is why the tile is focusable: without that a
                  sighted keyboard user could never read it. The text stays in
                  the DOM throughout, so screen readers get it in every state.
                */}
                <div className="bg-gold absolute inset-0 flex flex-col p-4 transition-opacity duration-300 sm:p-5 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
                  <span
                    aria-hidden="true"
                    className="bg-ink text-gold flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold"
                  >
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-base font-extrabold">{step.title}</h3>
                  <p className="text-ink/80 mt-1.5 text-[0.9375rem] font-semibold leading-[1.7]">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ------------------------------------------------ popular requests */}
        <section className="mx-auto max-w-[96rem] px-4 pb-14 sm:px-8 lg:px-16">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
              <span
                aria-hidden="true"
                className="bg-ink text-gold flex h-7 w-7 items-center justify-center rounded-full"
              >
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              Popular requests right now
            </h2>
            <p className="text-muted-light text-xs font-semibold">
              Tap one to start — a concierge takes it from there.
            </p>
          </div>

          <ul className="mt-4 flex flex-wrap gap-2">
            {POPULAR_REQUESTS.map((request) => {
              const Icon = request.icon;
              return (
                <li key={request.label}>
                  <Link
                    href={`/?need=${encodeURIComponent(request.label)}#start`}
                    className="border-border-strong bg-surface hover:border-ink/40 hover:bg-bg focus-visible:ring-gold inline-flex min-h-[2.5rem] items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  >
                    <span
                      aria-hidden="true"
                      className="bg-gold-soft text-gold-text flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    {request.label}
                  </Link>
                </li>
              );
            })}
            <li>
              <Link
                href="/#start"
                className="bg-ink hover:bg-ink/90 focus-visible:ring-gold inline-flex min-h-[2.5rem] items-center rounded-full px-4 py-2 text-sm font-bold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                Something else
              </Link>
            </li>
          </ul>
        </section>

        {/* ------------------------------------------------------- featured */}
        <section className="bg-ink py-14 text-white">
          <div className="mx-auto max-w-[96rem] px-4 sm:px-8 lg:px-16">
            <Tag tone="goldOutline" className="px-3 py-1 uppercase tracking-[0.12em]">
              Featured merchants · Nairobi
            </Tag>

            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.375rem]">
                  Delivering to your door tonight
                </h2>
                <p className="mt-2 max-w-lg text-[0.9375rem] font-semibold leading-[1.7] text-white/60">
                  A selection of partners in your city. Featured placements are paid for by the
                  merchant and marked as sponsored.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                asChild
                className="border-white/20 bg-transparent text-white hover:bg-white/10"
              >
                <Link href="/explore">
                  Explore all merchants <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
            </div>

            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURED_PLACEHOLDERS.map((merchant) => (
                <li
                  key={merchant.name}
                  className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#17140F]"
                >
                  <div className="relative flex h-36 items-center justify-center bg-gradient-to-br from-[#3B2E1B] via-[#241D13] to-[#14120E]">
                    <span className="absolute left-2 top-2">
                      <Tag tone="sponsored" size="sm" className="uppercase tracking-wide">
                        Sponsored
                      </Tag>
                    </span>
                    <span className="text-[0.625rem] uppercase tracking-widest text-white/35">
                      [Cover photo]
                    </span>
                    <span className="bg-gold text-ink absolute bottom-2 right-2 rounded-full px-2 py-0.5 text-[0.625rem] font-bold">
                      {merchant.eta}
                    </span>
                  </div>
                  <div className="p-3">
                    <p className="truncate text-sm font-bold">{merchant.name}</p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-white/50">
                      {merchant.meta}
                    </p>
                    <span className="bg-gold text-ink mt-3 block rounded-md py-1.5 text-center text-xs font-bold">
                      {merchant.cta}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-white/40">
                Own a business? Featured slots are limited per city and category.
              </p>
              <Link
                href="/merchants#featured"
                className="text-gold text-xs font-bold hover:underline"
              >
                Get featured on the homepage →
              </Link>
            </div>
          </div>
        </section>

        {/* -------------------------------------------- everything we arrange */}
        <section className="bg-surface">
          <div className="mx-auto max-w-[96rem] px-4 py-14 sm:px-8 lg:px-16">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.375rem]">
                Everything we arrange
              </h2>
              <Link href="/explore" className="text-sm font-bold underline underline-offset-4">
                Browse all services
              </Link>
            </div>

            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {CATEGORIES.map((category) => {
                const Icon = category.icon;
                return (
                  <li key={category.label}>
                    <Card className="flex h-full items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="bg-gold text-ink flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="text-sm font-bold">{category.label}</span>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* ---------------------------------------------------------- cities */}
        <section id="cities" className="py-14 sm:py-16">
          <div className="mx-auto max-w-[96rem] px-4 sm:px-8 lg:px-16">
            <CityCarousel cities={allCities} />
            {openCities.length > 0 && (
              <p className="text-muted-light mt-8 text-center text-xs font-semibold">
                Open for orders in {openCities.map((c) => c.name).join(', ')}.
              </p>
            )}
          </div>
        </section>

        {/* --------------------------------------------------- partner band */}
        <section className="mx-auto max-w-[96rem] px-4 py-12 sm:px-8 lg:px-16">
          <Card
            tone="ink"
            className="flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between"
          >
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight">Host, ride, list or join.</h2>
              <p className="mt-2 max-w-md text-[0.9375rem] font-semibold leading-[1.7] text-white/60">
                Airbnb hosts give their guests a concierge. Riders and merchants make it happen. A
                small team builds it.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="gold" size="sm" asChild>
                <Link href="/hosts">List Your Airbnb</Link>
              </Button>
              <Button size="sm" asChild className="text-ink bg-white hover:bg-white/90">
                <Link href="/riders">Become A Rider</Link>
              </Button>
              <Button size="sm" asChild className="text-ink bg-white hover:bg-white/90">
                <Link href="/merchants">Register Your Business</Link>
              </Button>
              <Button size="sm" asChild className="text-ink bg-white hover:bg-white/90">
                <Link href="/careers">View Openings</Link>
              </Button>
            </div>
          </Card>
        </section>

        {/* ------------------------------------------------------------- app */}
        <section className="bg-gold py-14">
          <div className="mx-auto grid max-w-[96rem] gap-8 px-4 sm:px-8 lg:grid-cols-2 lg:items-center lg:px-16">
            <div>
              <span className="bg-ink inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[0.625rem] font-bold uppercase tracking-wide text-white">
                <span aria-hidden="true" className="bg-gold h-1.5 w-1.5 rounded-full" />
                The NexG app · Coming soon
              </span>

              <h2 className="mt-5 text-4xl/[1.06] font-extrabold tracking-tight sm:text-[3.125rem]/[1.06]">
                Your concierge, in
                <br />
                your pocket.
              </h2>

              <p className="text-ink/80 mt-4 max-w-md text-[0.9375rem] font-semibold leading-[1.7]">
                Ask for anything in a sentence, watch your concierge move on the map, and pay by
                card or M-Pesa when it&apos;s done. Launching first in Nairobi, then across East
                Africa.
              </p>

              <NotifyForm />
              <StoreBadges />
            </div>

            <div className="hidden lg:block">
              <AppPreview />
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
