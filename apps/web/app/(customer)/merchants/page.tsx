import { MERCHANT_AGREEMENTS, merchantAgreementHref } from '@nexg/contracts/merchant-agreements';
import { Button, VALUE_PLACEHOLDER } from '@nexg/ui';
import { ArrowRight, ArrowUpRight, Check, FileText, Minus, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { DashboardPreview } from '@/components/merchants/dashboard-preview';
import { FeaturedSlots } from '@/components/merchants/featured-slots';
import { CONTAINER, H2, Highlight, SectionLabel } from '@/components/merchants/landing';
import { MerchantRegisterCard } from '@/components/merchants/merchant-register-card';
import { StorefrontPreview } from '@/components/merchants/storefront-preview';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { NEW_TAB } from '@/lib/legal-documents';
import { createPublicClient } from '@/lib/supabase/public';

export const metadata: Metadata = {
  title: 'List your business',
  description:
    'Hotel guests, travellers and expats ask NexG for what they need. List your restaurant, bar, laundry, florist or boutique and let our riders bring your products to their door.',
};

/* Copy from the `Merchants` artboard, signed off (ground rule 6). */

/** The categories guests ask for most, drawn dark in the grid. */
const MOST_ASKED = new Set([
  'airport_transfers',
  'restaurants_food',
  'laundry_cleaning',
  'travel_tours',
]);

const BENEFITS = [
  {
    title: "Customers you can't reach today",
    body: 'Hotel guests and visitors who do not know your street, but know NexG. Their concierge recommends you.',
  },
  {
    title: 'Our riders, not yours',
    body: 'No fleet to hire or manage. A vetted NexG rider collects from your counter and the guest tracks it live.',
  },
  {
    title: 'Paid without chasing',
    body: 'Guests pay NexG by card or M-Pesa. You get settled to your M-Pesa or bank every week, with a statement per order.',
  },
  {
    title: 'One simple dashboard',
    body: 'Update your menu or catalogue, pause items, set opening hours and accept orders from your phone or laptop.',
  },
] as const;

const STEPS = [
  {
    title: 'Register your business',
    body: 'Tell us who you are, what you sell and where you are. We verify your business permit and get in touch within two working days.',
  },
  {
    title: 'Build your catalogue',
    body: 'Add your menu or products with photos and prices in the dashboard — or send us a PDF and we will load it for you.',
  },
  {
    title: 'Go live and take orders',
    body: 'Switch on "Accepting orders". Concierges start recommending you, riders collect, you get paid weekly.',
  },
] as const;

const PRICING_POINTS = [
  'No listing or monthly fee',
  'Delivery paid by the guest, not you',
  'Weekly settlement to M-Pesa or bank',
  'Leave any time, no lock-in',
] as const;

const REQUIREMENTS = [
  'Valid business permit',
  'A physical location in one of our cities',
  'M-Pesa till or bank account for payouts',
] as const;

const FAQ = [
  {
    q: 'Who sets the prices guests see?',
    a: "You do. Your catalogue prices are what guests see; NexG's commission comes out of the settlement, and the delivery fee is charged to the guest separately.",
  },
  {
    q: 'Do I need my own delivery riders?',
    a: 'No. NexG riders collect from your counter. You never hire, manage or insure a delivery fleet.',
  },
  {
    q: 'Can I pause orders when we are busy?',
    a: 'Yes. Switch off "Accepting orders" in the dashboard and you stop receiving requests immediately. Turn it back on when the kitchen catches up.',
  },
  {
    q: 'How do refunds and complaints work?',
    a: 'The concierge handles the guest. If something is wrong with an order, we contact you, agree what happened, and adjust the settlement rather than leaving you to argue with a customer you never met.',
  },
] as const;

const darkButton =
  'bg-ink focus-visible:ring-gold inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-extrabold text-white transition-colors hover:bg-ink/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

export const dynamic = 'force-dynamic';

export default async function MerchantsPage() {
  const connectedRegistrationEnabled = process.env.MERCHANT_ONBOARDING_V1_ENABLED !== 'false';
  const registrationHref = '/merchants/apply';
  const supabase = createPublicClient();

  const [
    { data: cities, error: citiesError },
    { count: cityCount, error: cityCountError },
    { data: commission, error: commissionError },
    { data: categories, error: categoriesError },
  ] = await Promise.all([
    supabase
      .from('city')
      .select('id, name, slug, status')
      .neq('status', 'waitlist')
      .order('sort', { ascending: true }),
    // The hero counts the whole footprint, not just the cities open today —
    // "cities to grow into" is the point of the number.
    supabase.from('city').select('id', { count: 'exact', head: true }),
    // Ground rule 3: this row exists with a null value on purpose. The block
    // renders [—] until a real commission is configured and approved.
    supabase.from('setting').select('value').eq('key', 'commission_pct_by_category').maybeSingle(),
    supabase.from('category_config').select('category, label').eq('is_active', true).order('sort'),
  ]);

  if (citiesError) throw new Error(`Could not load merchant cities: ${citiesError.message}`);
  if (cityCountError) throw new Error(`Could not count merchant cities: ${cityCountError.message}`);
  if (commissionError) throw new Error(`Could not load merchant fees: ${commissionError.message}`);
  if (categoriesError)
    throw new Error(`Could not load merchant categories: ${categoriesError.message}`);

  const commissionValue = commission?.value ?? null;
  const allCities = cities ?? [];

  return (
    <>
      <SiteHeader
        signIn={{ label: 'Sign in', href: '/merchants/sign-in' }}
        action={{ label: 'List your business', href: registrationHref }}
      />

      <main>
        {/* ------------------------------------------------------------ hero */}
        <section className="relative isolate overflow-hidden bg-[#0b0907] text-white">
          <Image
            src="/images/hero/stay-sunset.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="-z-20 object-cover object-[72%_center]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-[#0b0907]/75 lg:bg-transparent lg:bg-gradient-to-r lg:from-[#0b0907] lg:via-[#0b0907]/85 lg:to-[#0b0907]/25"
          />
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 -z-10 h-32 bg-gradient-to-t from-[#0b0907]/80 to-transparent"
          />

          <div
            className={`${CONTAINER} grid gap-14 pb-20 pt-12 lg:grid-cols-[1fr_26rem] lg:items-center lg:gap-16 lg:pb-28 lg:pt-20`}
          >
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-xs font-bold text-white/85 backdrop-blur-sm">
                <span aria-hidden="true" className="bg-gold h-1.5 w-1.5 rounded-full" />
                Now onboarding merchants in Nairobi
              </span>

              <h1 className="mt-6 text-4xl/[1.04] font-extrabold tracking-tight sm:text-5xl/[1.04] lg:text-[4.5rem]/[1.02]">
                Put your business in <span className="text-gold">every guest&apos;s</span> hands.
              </h1>

              <p className="mt-5 max-w-[32.5rem] text-[1.0625rem] font-semibold leading-[1.7] text-white/70">
                Hotel guests, travellers and expats ask NexG for what they need. List your
                restaurant, bar, laundry, florist or boutique and let our riders bring your products
                to their door.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button
                  variant="gold"
                  size="lg"
                  asChild
                  className="rounded-full"
                  trailingIcon={<ArrowRight className="h-4 w-4" />}
                >
                  <Link href={registrationHref}>Register Your Business</Link>
                </Button>
                <Link
                  href="#how"
                  className="focus-visible:ring-gold inline-flex h-12 items-center justify-center rounded-full border border-white/30 px-6 text-sm font-extrabold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2"
                >
                  See how it works
                </Link>
              </div>

              {/* Three columns on a phone so the dividers always sit between
                  the figures; a row with wider spacing from sm up. */}
              <dl className="mt-10 grid grid-cols-3 sm:flex sm:gap-x-10">
                {[
                  { value: 'Zero', label: 'riders to hire' },
                  { value: 'Weekly', label: 'M-Pesa settlement' },
                  { value: cityCount ?? VALUE_PLACEHOLDER, label: 'cities to grow into' },
                ].map((stat, index) => (
                  <div
                    key={stat.label}
                    className={index > 0 ? 'border-l border-white/15 pl-4 sm:pl-10' : 'pr-2'}
                  >
                    <dt className="sr-only">{stat.label}</dt>
                    <dd>
                      <span className="block text-2xl font-extrabold tracking-tight">
                        {stat.value}
                      </span>
                      <span className="block text-xs font-semibold text-white/55">
                        {stat.label}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <StorefrontPreview />
          </div>
        </section>

        {/* ------------------------------------------------------ categories */}
        <section className="py-20 sm:py-24">
          <div className={CONTAINER}>
            <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
              <div>
                <SectionLabel>Categories</SectionLabel>
                <h2 className={`mt-3 max-w-2xl ${H2}`}>
                  Built for the businesses guests <Highlight>ask for most</Highlight>
                </h2>
              </div>
              <p className="text-muted max-w-xs text-sm font-semibold leading-relaxed">
                Don&apos;t see yours? Register anyway — we add categories as demand grows.
              </p>
            </div>

            {/* Two to a row on a phone, as before the redesign, so the list
                stays short; the running number joins in from sm up. */}
            <ul className="mt-10 grid grid-cols-2 gap-2.5 sm:mt-12 sm:gap-3 lg:grid-cols-4">
              {(categories ?? []).map((category, index) => {
                const dark = MOST_ASKED.has(category.category);
                return (
                  <li key={category.category}>
                    <Link
                      href={registrationHref}
                      aria-label={`Register your ${category.label} business`}
                      className={`focus-visible:ring-gold group flex h-full items-center gap-2 rounded-2xl border px-3 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 sm:gap-3 sm:px-4 sm:py-4 ${
                        dark
                          ? 'bg-ink border-ink text-white'
                          : 'bg-surface border-border text-ink hover:border-ink'
                      }`}
                    >
                      <span
                        className={`hidden text-[0.6875rem] font-extrabold tabular-nums sm:inline ${
                          dark ? 'text-gold' : 'text-muted-light'
                        }`}
                      >
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="min-w-0 flex-1 text-[0.8125rem] font-extrabold leading-snug sm:text-sm">
                        {category.label}
                      </span>
                      <span
                        aria-hidden="true"
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors sm:h-8 sm:w-8 ${
                          dark ? 'bg-gold text-ink' : 'bg-bg text-ink group-hover:bg-gold'
                        }`}
                      >
                        <ArrowUpRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* -------------------------------------------------------- benefits */}
        <section className="pb-20 sm:pb-28">
          <div className={CONTAINER}>
            <SectionLabel>Why NexG</SectionLabel>
            <h2 className={`mt-3 max-w-2xl ${H2}`}>
              A new front door, without a new <Highlight>headache</Highlight>
            </h2>
            <p className="text-muted mt-4 max-w-xl text-[0.9375rem] font-semibold leading-[1.7]">
              You keep cooking, pressing, arranging and selling. NexG handles the guest, the rider
              and the payment.
            </p>

            <ul className="mt-12 grid gap-4 lg:grid-cols-3">
              {BENEFITS.map((benefit, index) => {
                const look =
                  index === 0
                    ? 'bg-gold text-ink lg:row-span-2 lg:min-h-[26rem] justify-between'
                    : index === 2
                      ? 'bg-ink text-white'
                      : `bg-surface border-border text-ink border ${index === 3 ? 'lg:col-span-2' : ''}`;
                const number =
                  index === 0
                    ? 'bg-ink text-gold'
                    : index === 2
                      ? 'bg-gold text-ink'
                      : 'bg-ink text-white';
                const body =
                  index === 0 ? 'text-ink/80' : index === 2 ? 'text-white/65' : 'text-muted';
                return (
                  <li
                    key={benefit.title}
                    className={`flex flex-col gap-8 rounded-3xl p-7 sm:p-8 ${look}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-11 w-11 items-center justify-center rounded-xl text-sm font-extrabold ${number}`}
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <h3
                        className={`font-extrabold tracking-tight ${
                          index === 0 ? 'text-[1.75rem] leading-tight' : 'text-xl'
                        }`}
                      >
                        {benefit.title}
                      </h3>
                      <p
                        className={`mt-2 max-w-md text-[0.9375rem] font-semibold leading-[1.7] ${body}`}
                      >
                        {benefit.body}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <DashboardPreview />

        {/* ------------------------------------------- steps and pricing */}
        <section id="how" className="scroll-mt-20 py-20 sm:py-28">
          <div className={`${CONTAINER} grid gap-12 lg:grid-cols-[1fr_27rem] lg:gap-16`}>
            <div>
              <SectionLabel>Get started</SectionLabel>
              <h2 className={`mt-3 ${H2}`}>
                Live in <Highlight>three steps</Highlight>
              </h2>
              <p className="text-muted mt-4 text-[0.9375rem] font-semibold">
                Most merchants are taking orders within a few days of registering.
              </p>

              <ol className="relative mt-10 space-y-4">
                <span
                  aria-hidden="true"
                  className="bg-border-strong absolute bottom-8 left-[1.1875rem] top-8 w-px"
                />
                {STEPS.map((step, index) => (
                  <li key={step.title} className="relative flex gap-5">
                    <span
                      aria-hidden="true"
                      className="bg-ink text-gold ring-bg relative z-10 mt-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ring-4"
                    >
                      {index + 1}
                    </span>
                    <div className="border-border bg-surface flex-1 rounded-2xl border p-5 sm:p-6">
                      <h3 className="text-base font-extrabold">{step.title}</h3>
                      <p className="text-muted mt-1.5 text-[0.875rem] font-semibold leading-[1.7]">
                        {step.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {/*
             * Simple pricing. The percentage comes from
             * setting.commission_pct_by_category, which is seeded null — so
             * this renders [—] rather than a number nobody has agreed to
             * (ground rule 3).
             */}
            <div className="bg-ink self-start rounded-3xl p-8 text-white sm:p-10">
              <SectionLabel onDark>Simple pricing</SectionLabel>
              <p className="text-gold mt-4 text-[4rem] font-extrabold leading-none tracking-tight">
                {commissionValue === null ? VALUE_PLACEHOLDER : String(commissionValue)}%
              </p>
              <p className="mt-3 text-sm font-semibold text-white/60">
                per completed order. That&apos;s it.
              </p>

              <hr className="my-7 border-white/10" />

              <ul className="space-y-4">
                {PRICING_POINTS.map((point) => (
                  <li key={point} className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="bg-gold text-ink flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-sm font-semibold text-white/85">{point}</span>
                  </li>
                ))}
              </ul>

              <Button variant="gold" block className="mt-8 h-14 rounded-full text-base" asChild>
                <Link href={registrationHref}>Register Your Business</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- featured */}
        <FeaturedSlots />

        {/* -------------------------------------------------------- register */}
        <section className="py-20 sm:py-28">
          <div
            className={`${CONTAINER} grid gap-10 lg:grid-cols-[1fr_36rem] lg:items-center lg:gap-16`}
          >
            <div>
              <SectionLabel>Register</SectionLabel>
              <h2 className={`mt-3 ${H2}`}>
                Register your <Highlight>business</Highlight>
              </h2>
              <p className="text-muted mt-4 max-w-md text-[0.9375rem] font-semibold leading-[1.7]">
                Two minutes now. A member of the merchant team will call to confirm details and walk
                you through the dashboard.
              </p>

              <ul className="mt-8 space-y-4">
                {REQUIREMENTS.map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="bg-ink text-gold flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-[0.9375rem] font-bold">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* One card for both paths. The fallback form brings no surface of
                its own, and nothing here clips, so its pickers can open. */}
            <div className="border-border border-t-gold bg-surface rounded-3xl border border-t-[6px] p-6 shadow-[0_24px_50px_-28px_rgb(20_20_20/0.35)] sm:p-10">
              {connectedRegistrationEnabled ? (
                <>
                  <h3 className="text-2xl font-extrabold tracking-tight">Register your business</h3>
                  <p className="text-muted mt-3 text-[0.9375rem] font-semibold leading-[1.7]">
                    Start with the essentials. Finish your setup from your merchant Home.
                  </p>
                  <Link href={registrationHref} className={`${darkButton} mt-7`}>
                    Start registration
                    <ArrowRight aria-hidden="true" className="text-gold h-4 w-4" />
                  </Link>
                </>
              ) : (
                <MerchantRegisterCard cities={allCities} />
              )}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- FAQ */}
        <section className="pb-20 sm:pb-28">
          <div className={`${CONTAINER} grid gap-10 lg:grid-cols-[26rem_1fr] lg:gap-16`}>
            <div>
              <SectionLabel>FAQ</SectionLabel>
              <h2 className={`mt-3 ${H2}`}>
                Questions merchants <Highlight>ask</Highlight>
              </h2>
              <p className="text-muted mt-4 text-[0.9375rem] font-semibold">
                Anything else, the merchant team is a call away.
              </p>
              <Link href="/help" className={`${darkButton} mt-7`}>
                Talk to the merchant team
              </Link>
            </div>

            <ul className="space-y-3">
              {FAQ.map((item, index) => (
                <li key={item.q}>
                  <details
                    open={index === 0}
                    className="border-border bg-surface group rounded-2xl border px-5 py-4 open:shadow-[0_18px_40px_-26px_rgb(20_20_20/0.35)] sm:px-6 sm:py-5"
                  >
                    <summary className="focus-visible:ring-gold flex cursor-pointer list-none items-center justify-between gap-4 text-[0.9375rem] font-extrabold focus-visible:outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
                      {item.q}
                      <span
                        aria-hidden="true"
                        className="border-border text-ink flex h-8 w-8 shrink-0 items-center justify-center rounded-full border group-open:hidden"
                      >
                        <Plus className="h-4 w-4" />
                      </span>
                      <span
                        aria-hidden="true"
                        className="bg-gold text-ink hidden h-8 w-8 shrink-0 items-center justify-center rounded-full group-open:flex"
                      >
                        <Minus className="h-4 w-4" />
                      </span>
                    </summary>
                    <p className="text-muted mt-3 max-w-2xl text-[0.9375rem] font-semibold leading-[1.7]">
                      {item.a}
                    </p>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ------------------------------------------------------------- CTA */}
        <section className="pb-20 sm:pb-24">
          <div className={CONTAINER}>
            <div className="bg-gold text-ink relative isolate overflow-hidden rounded-3xl px-7 py-12 sm:px-12 sm:py-16">
              <span
                aria-hidden="true"
                className="bg-ink/[0.07] absolute -right-24 -top-28 -z-10 h-80 w-80 rounded-full"
              />
              <span
                aria-hidden="true"
                className="border-ink/[0.07] absolute -bottom-40 right-40 -z-10 h-72 w-72 rounded-full border-[2.5rem]"
              />
              <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="max-w-xl text-3xl font-extrabold leading-[1.08] tracking-tight sm:text-[2.75rem]">
                    Ready to reach thousands of guests?
                  </h2>
                  <p className="text-ink/75 mt-3 max-w-md text-[0.9375rem] font-semibold">
                    Register today and be on the concierge&apos;s list before the next check-in.
                  </p>
                </div>
                <Link
                  href={registrationHref}
                  className={`${darkButton} shrink-0 px-7 py-4 text-base`}
                >
                  Register Your Business
                  <ArrowRight aria-hidden="true" className="text-gold h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Every category's agreement, readable before applying. */}
        <section
          id="merchant-agreements"
          aria-labelledby="merchant-agreements-title"
          className="pb-20 sm:pb-24"
        >
          <div className={CONTAINER}>
            <SectionLabel>Legal</SectionLabel>
            <h2
              id="merchant-agreements-title"
              className="mt-3 text-2xl font-extrabold tracking-tight sm:text-[2rem]"
            >
              Merchant agreements
            </h2>
            <p className="text-muted mt-3 max-w-2xl text-[0.9375rem] font-semibold">
              Each category has its own NexG Merchant Agreement. You accept the one for your
              category when you apply.
            </p>
            <ul className="mt-7 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {MERCHANT_AGREEMENTS.map((agreement) => (
                <li key={agreement.id}>
                  <a
                    href={merchantAgreementHref(agreement)}
                    {...NEW_TAB}
                    className="border-border bg-surface hover:border-ink focus-visible:ring-gold flex items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-[0.875rem] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2"
                  >
                    <span>{agreement.title}</span>
                    <span className="bg-bg text-muted inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[0.6875rem] font-extrabold">
                      <FileText aria-hidden="true" className="h-3 w-3" />
                      PDF
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            <p className="text-muted-light mt-4 text-[0.75rem] font-semibold">
              Vehicle Rentals uses the Vehicle Services agreement, Health uses Wellness, and App
              Services uses Marketplace, until their own agreements are published.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
