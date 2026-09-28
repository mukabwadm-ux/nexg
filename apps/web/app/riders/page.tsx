import { Button, Card } from '@nexg/ui';
import {
  ArrowRight,
  Banknote,
  Check,
  Clock,
  MessageSquare,
  Navigation,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { RiderAppPreview } from '@/components/riders/rider-app-preview';
import { RiderApplyCard } from '@/components/riders/rider-apply-card';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Ride with NexG',
  description:
    'Deliver food, drinks, laundry, flowers and more to guests across the city. You choose when you ride. Weekly M-Pesa payouts.',
};

/* Copy from the `Riders` artboard, signed off (ground rule 6). */

const TICKER = [
  'Food',
  'Drinks',
  'Laundry',
  'Flowers',
  'Beauty products',
  'Pharmacy runs',
  'Hotel errands',
] as const;

const WHY = [
  {
    icon: Banknote,
    title: 'Paid every week',
    body: 'Earnings land in your M-Pesa every week, with a clear breakdown of every delivery.',
  },
  {
    icon: Clock,
    title: 'Ride when you want',
    body: 'Go online for a morning, an evening or a full day. No minimum shifts, no penalties for logging off.',
  },
  {
    icon: ShieldCheck,
    title: 'Guests you can trust',
    body: 'Every request comes from a verified guest or partner hotel, with the address and contact confirmed before you set off.',
  },
  {
    icon: MessageSquare,
    title: 'A real person on the line',
    body: 'Rider support seven days a week, in the app or by phone, for anything from a wrong gate to a flat tyre.',
  },
] as const;

const STEPS = [
  {
    title: 'Apply online',
    body: 'Your name, phone, city and vehicle. Two minutes, no paperwork yet.',
  },
  {
    title: 'Upload your documents',
    body: 'ID, licence, vehicle papers and a good conduct certificate. We verify and come back to you.',
  },
  {
    title: 'Onboard and collect your kit',
    body: 'A short session on how NexG works with hotels and guests, then your branded bag and jacket.',
  },
  {
    title: 'Go online and ride',
    body: 'Open the rider app, accept your first request and get paid at the end of the week.',
  },
] as const;

const REQUIREMENTS = [
  '18 years or older with a valid national ID',
  'A valid driving licence for your vehicle class',
  'Your own motorbike, bicycle, car or tuk-tuk, insured and roadworthy',
  'An Android or iPhone with data for the rider app',
  'A certificate of good conduct and an M-Pesa line in your name',
] as const;

const APP_FEATURES = [
  { icon: Navigation, label: 'Live pickup and drop-off navigation' },
  { icon: Wallet, label: 'Earnings and payout history, always visible' },
  { icon: MessageSquare, label: 'In-app chat with the concierge and support' },
] as const;

const FAQ = [
  {
    q: 'How and when do I get paid?',
    a: 'Every delivery you complete is added to your balance in the app. Balances are paid out to your M-Pesa line every week, and you can see the full breakdown any time.',
  },
  {
    q: 'Do I need my own vehicle?',
    a: 'Yes. You ride your own motorbike, bicycle, car or tuk-tuk, and it needs to be insured and roadworthy. We check the papers during onboarding.',
  },
  {
    q: 'Can I ride for other apps at the same time?',
    a: 'Yes. You choose when you go online with us, and there are no minimum shifts or exclusivity requirements.',
  },
  {
    q: "What happens if a guest isn't there?",
    a: 'Call the guest from the app. If they do not answer, rider support takes over and tells you what to do with the order. You are not left deciding on your own.',
  },
  {
    q: 'Which cities are you recruiting in?',
    a: 'We are onboarding riders in the cities that are live and soft-launching now, and building a waitlist everywhere else.',
  },
] as const;

export default async function RidersPage() {
  const supabase = createClient();

  // The cities open for applications (section 4.2). The card adds an
  // "Other" chip, which is how someone in a waitlist city reaches us.
  const { data: cities } = await supabase
    .from('city')
    .select('id, name, slug, status')
    .neq('status', 'waitlist')
    .order('sort', { ascending: true });

  return (
    <>
      <SiteHeader
        signIn={{ label: 'Rider sign in', href: '/riders/sign-in' }}
        action={{ label: 'Apply now', href: '/riders/apply' }}
      />

      <main>
        {/* ------------------------------------------------------------ hero */}
        <section className="mx-auto max-w-[96rem] px-4 pb-10 pt-8 sm:px-8 lg:px-16 lg:pb-14 lg:pt-12">
          <div className="grid gap-8 lg:grid-cols-[1fr_31rem] lg:gap-12">
            <div className="lg:pt-6">
              <span className="border-border-strong bg-surface inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold">
                <span aria-hidden="true" className="bg-gold h-1.5 w-1.5 rounded-full" />
                Now recruiting riders in Nairobi
              </span>

              <h1 className="mt-5 text-4xl/[1.06] font-extrabold tracking-tight sm:text-5xl/[1.06] lg:text-[4.375rem]/[1.06]">
                Ride with <span className="text-gold">NexG.</span>
                <br />
                Earn on your terms.
              </h1>

              <p className="text-muted mt-4 max-w-md text-[1.0625rem] font-semibold leading-[1.7]">
                Deliver food, drinks, laundry, flowers and more to guests across the city. You
                choose when you ride. We keep the requests coming.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                <Button size="lg" asChild>
                  <Link href="/riders/apply">Start your application</Link>
                </Button>
                <Button variant="outline" size="lg" asChild>
                  <Link href="#how">How it works</Link>
                </Button>
              </div>

              <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
                {[
                  { value: 'Weekly', label: 'M-Pesa payouts' },
                  { value: 'You', label: 'choose the hours' },
                  { value: '7 days', label: 'rider support' },
                ].map((stat) => (
                  <div key={stat.label}>
                    <dt className="sr-only">{stat.label}</dt>
                    <dd>
                      <span className="block text-xl font-extrabold tracking-tight">
                        {stat.value}
                      </span>
                      <span className="text-muted-light block text-xs">{stat.label}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <RiderApplyCard cities={cities ?? []} />
          </div>
        </section>

        {/* ---------------------------------------------------------- ticker */}
        <div className="bg-ink overflow-x-auto py-5">
          <ul className="text-gold mx-auto flex max-w-[96rem] items-center gap-6 px-4 text-xs font-bold uppercase tracking-widest sm:px-8 lg:px-16">
            {TICKER.map((item) => (
              <li key={item} className="flex shrink-0 items-center gap-6">
                {item}
                <span aria-hidden="true" className="text-gold/40">
                  ◆
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* ------------------------------------------------------------- why */}
        <section className="mx-auto max-w-[96rem] px-4 py-14 sm:px-8 lg:px-16">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.375rem]">
            Why riders choose NexG
          </h2>
          <p className="text-muted mt-2 max-w-lg text-[0.9375rem] font-semibold leading-[1.7]">
            Fewer, better requests from hotels and guests — not a race to the bottom on every
            corner.
          </p>

          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WHY.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.title}>
                  <Card tone="gold" className="h-full">
                    <span
                      aria-hidden="true"
                      className="bg-ink text-gold flex h-12 w-12 items-center justify-center rounded-xl"
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <h3 className="mt-4 text-[1.0625rem] font-extrabold">{item.title}</h3>
                    <p className="text-ink/80 mt-1.5 text-[0.875rem] font-semibold leading-[1.7]">
                      {item.body}
                    </p>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ----------------------------------------------------------- steps */}
        <section id="how" className="border-border bg-surface border-y py-14">
          <div className="mx-auto max-w-[96rem] px-4 sm:px-8 lg:px-16">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.375rem]">
              From application to first delivery
            </h2>
            <p className="text-muted mt-2 text-sm font-semibold">
              Four steps. Most riders are on the road within the week.
            </p>

            <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <li key={step.title}>
                  <span
                    aria-hidden="true"
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                      index === 0 ? 'bg-ink text-white' : 'bg-gold text-ink'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-sm font-extrabold">{step.title}</h3>
                  <p className="text-muted mt-1.5 text-xs font-semibold leading-[1.7]">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------------------------------------------- requirements */}
        <section className="mx-auto max-w-[96rem] px-4 py-14 sm:px-8 lg:px-16">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.375rem]">
                What you&apos;ll need
              </h2>
              <p className="text-gold-text mt-2 text-sm font-semibold">
                Nothing unusual — if you already ride for a living, you probably have all of this.
              </p>

              <ul className="mt-6 space-y-2.5">
                {REQUIREMENTS.map((requirement) => (
                  <li
                    key={requirement}
                    className="border-border bg-surface shadow-card flex items-center gap-3 rounded-xl border px-3 py-3"
                  >
                    <span
                      aria-hidden="true"
                      className="bg-gold text-ink flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-[0.9375rem] font-bold">{requirement}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative">
              {/*
                The artboard's photo block is 584x520 at this breakpoint, so the
                frame is 7:5 and the photograph is cropped to fill it. `sizes`
                keeps a phone from pulling the full-width asset over 3G.
              */}
              <div className="relative aspect-[7/5] overflow-hidden rounded-xl">
                <Image
                  src="/images/nairobi-skyline.jpg"
                  alt="The Nairobi skyline, looking across the central business district"
                  fill
                  sizes="(min-width: 1024px) 45vw, 100vw"
                  className="object-cover"
                  priority={false}
                />
              </div>
              <Card tone="ink" className="absolute -bottom-4 left-4 right-8 sm:right-24">
                <p className="text-gold text-[0.625rem] font-bold uppercase tracking-widest">
                  Rider kit included
                </p>
                <p className="mt-1.5 text-sm font-extrabold">
                  Branded delivery bag, reflective jacket and phone mount.
                </p>
                <p className="mt-1 text-xs font-semibold text-white/50">
                  Issued at onboarding, yours to keep while you ride with us.
                </p>
              </Card>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- rider app */}
        <section className="bg-ink relative isolate mt-6 overflow-hidden py-16 text-white lg:py-[6.625rem]">
          {/*
            The warm bloom behind the phone. Mapped off the artboard: it peaks
            at #282214 around 70% across and 33% down the band, which is amber
            at roughly 11% over the ink ground, falling off over ~250px.
          */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-[70%] top-[33%] -z-10 h-[38rem] w-[38rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background:
                'radial-gradient(circle, rgba(210,146,30,0.16) 0%, rgba(210,146,30,0.07) 42%, transparent 68%)',
            }}
          />
          <div className="mx-auto grid max-w-[96rem] gap-8 px-4 sm:px-8 lg:grid-cols-2 lg:items-center lg:px-16">
            <div>
              <span className="bg-gold text-ink inline-block rounded-full px-3 py-1 text-[0.625rem] font-bold uppercase tracking-widest">
                The rider app
              </span>
              <h2 className="mt-5 text-4xl/[1.0] font-extrabold tracking-tight sm:text-[3.125rem]/[1.0]">
                Built for the road, not the office.
              </h2>
              <p className="mt-4 max-w-md text-[0.9375rem] font-semibold leading-[1.7] text-white/60">
                Big buttons, one-tap navigation and a clear view of what you&apos;ve earned today.
                Accept a request, follow the route, confirm the hand-off, done.
              </p>

              <ul className="mt-6 space-y-3">
                {APP_FEATURES.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <li key={feature.label} className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="bg-gold text-ink flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="text-sm font-semibold">{feature.label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="hidden lg:flex lg:justify-end lg:pr-[4.5rem]">
              <RiderAppPreview />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- FAQ */}
        <section className="mx-auto max-w-[96rem] px-4 py-14 sm:px-8 lg:px-16">
          <div className="grid gap-8 lg:grid-cols-[24rem_1fr]">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.375rem]">
                Questions riders ask
              </h2>
              <p className="text-muted mt-2 text-sm font-semibold">
                Anything else, message us — a person answers.
              </p>
              <Link
                href="/help"
                className="mt-3 inline-block text-sm font-bold underline underline-offset-4"
              >
                Talk to the rider team
              </Link>
            </div>

            <ul className="space-y-2">
              {FAQ.map((item) => (
                <li key={item.q}>
                  <details className="border-border bg-surface shadow-card group rounded-xl border px-4 py-3">
                    <summary className="focus-visible:ring-gold flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-2">
                      {item.q}
                      <span
                        aria-hidden="true"
                        className="text-muted-light shrink-0 text-lg group-open:hidden"
                      >
                        +
                      </span>
                      <span
                        aria-hidden="true"
                        className="text-gold-text hidden shrink-0 text-lg group-open:block"
                      >
                        −
                      </span>
                    </summary>
                    <p className="text-muted mt-2 text-[0.9375rem] font-semibold leading-[1.7]">
                      {item.a}
                    </p>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ------------------------------------------------------------- CTA */}
        <section className="mx-auto max-w-[96rem] px-4 pb-14 sm:px-8 lg:px-16">
          <Card
            tone="gold"
            className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight">Ready to ride with NexG?</h2>
              <p className="text-ink/80 mt-1.5 max-w-md text-sm font-semibold">
                Apply today, upload your documents when you&apos;re ready, and we&apos;ll get you on
                the road.
              </p>
            </div>
            <Button size="lg" asChild trailingIcon={<ArrowRight className="h-4 w-4" />}>
              <Link href="/riders/apply">Become A Rider</Link>
            </Button>
          </Card>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
