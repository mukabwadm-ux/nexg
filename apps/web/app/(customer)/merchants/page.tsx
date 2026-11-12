import { VALUE_PLACEHOLDER } from '@nexg/ui';
import { ArrowRight, ArrowUpRight, Banknote, Check, Minus, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { DashboardPreview } from '@/components/merchants/dashboard-preview';
import { FeaturedSlots } from '@/components/merchants/featured-slots';
import { CARD, CONTAINER, H2, SectionLabel, THEME_VARS } from '@/components/merchants/landing';
import { MerchantRegisterCard } from '@/components/merchants/merchant-register-card';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { createPublicClient } from '@/lib/supabase/public';

export const metadata: Metadata = {
  title: 'List your business',
  description:
    'Airbnb guests, travellers and expats ask NexG for what they need. List your restaurant, bar, laundry, florist or boutique and let our riders bring your products to their door.',
};

/* Copy from the `Merchants` artboard, signed off (ground rule 6). */

/**
 * The categories guests ask for most, shown as photographs. The label comes
 * from category_config; a category switched off there drops out. Photos in
 * public/images/merchant-page (see its CREDITS.md).
 */
const PHOTO_CATEGORIES = [
  {
    key: 'restaurants_food',
    image: '/images/merchant-page/barista.jpg',
    focus: 'object-[66%_center]',
  },
  {
    key: 'alcohol_beverages',
    image: '/images/merchant-page/bartender.jpg',
    focus: 'object-[50%_center]',
  },
  {
    key: 'fashion_apparel',
    image: '/images/merchant-page/tailor.jpg',
    focus: 'object-[38%_center]',
  },
  {
    key: 'groceries_essentials',
    image: '/images/merchant-page/market-stall.jpg',
    focus: 'object-[56%_center]',
  },
] as const;

const BENEFITS = [
  {
    title: "Customers you can't reach today",
    body: 'Airbnb guests and visitors who do not know your street, but know NexG. Their concierge recommends you.',
  },
  {
    title: 'Our riders, not yours',
    body: 'No fleet to hire or manage. A vetted NexG rider collects from your counter and the guest tracks it live.',
  },
  {
    title: 'Paid without chasing',
    body: 'Guests pay NexG by M-Pesa. You get settled to your M-Pesa or bank every week, with a statement per order.',
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

/** The orders in the dashboard row of the benefits list. Bracketed: no real data. */
const SAMPLE_ORDERS = [
  { items: '2 × [Menu item]', state: 'Accept', look: 'bg-gold text-ink' },
  { items: '1 × [Menu item]', state: 'On the way', look: 'bg-white text-ink' },
  { items: '1 × [Drink]', state: 'Delivered', look: 'bg-success-bg text-success' },
] as const;

const BUTTON =
  'focus-visible:ring-gold inline-flex items-center justify-center gap-2 rounded-full px-6 text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

/** The main action: ink on the cream page, gold on the dark one. */
const primaryButton = `${BUTTON} bg-ink text-white hover:bg-ink/85 dark:bg-gold dark:text-night dark:hover:bg-[#FEDD5C]`;

/** Ink in both themes: for the gold panel. */
const inkButton = `${BUTTON} bg-ink text-white hover:bg-ink/85`;

export const dynamic = 'force-dynamic';
// Next 14 caches plain fetches with no expiry; see lib/supabase/public.ts.
export const fetchCache = 'force-no-store';

/** The picture beside each benefit. Decorative. */
function BenefitVisual({ index }: { index: number }) {
  const frame = 'relative h-48 overflow-hidden rounded-3xl sm:h-56';
  if (index === 3) {
    return (
      <div
        className={`${frame} flex flex-col justify-center gap-2.5 bg-white/[0.05] p-5 ring-1 ring-inset ring-white/10`}
      >
        {SAMPLE_ORDERS.map((order) => (
          <div
            key={order.state}
            className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.06] px-4 py-3"
          >
            <span className="truncate text-[0.8125rem] font-bold text-white/85">
              #{VALUE_PLACEHOLDER} · {order.items}
            </span>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-[0.6875rem] font-bold ${order.look}`}
            >
              {order.state}
            </span>
          </div>
        ))}
      </div>
    );
  }
  const photo = [
    { src: '/images/merchant-page/market-stall.jpg', focus: 'object-center' },
    { src: '/images/merchant-page/rider.jpg', focus: 'object-[50%_30%]' },
    { src: '/images/merchant-page/card-terminal.jpg', focus: 'object-[62%_center]' },
  ][index];
  if (!photo) return null;
  return (
    <div className={frame}>
      <Image
        src={photo.src}
        alt=""
        fill
        sizes="(min-width: 1024px) 30rem, 100vw"
        className={`object-cover ${photo.focus}`}
      />
    </div>
  );
}

export default async function MerchantsPage() {
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
  const allCategories = categories ?? [];
  const photoCategories = PHOTO_CATEGORIES.flatMap((photo) => {
    const row = allCategories.find((category) => category.category === photo.key);
    return row
      ? [{ category: row.category, label: row.label, image: photo.image, focus: photo.focus }]
      : [];
  });

  return (
    <>
      <SiteHeader
        signIn={{ label: 'Sign in', href: '/merchants/sign-in' }}
        action={{ label: 'List your business', href: registrationHref }}
      />

      <main className={THEME_VARS}>
        {/* ------------------------------------------------------------ hero */}
        <section className="overflow-hidden">
          <div
            className={`${CONTAINER} grid gap-12 pb-16 pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,36rem)] lg:items-center lg:gap-16 lg:pb-24 lg:pt-16`}
          >
            <div>
              <h1 className="max-w-[40rem] text-4xl/[1.04] font-extrabold tracking-tight sm:text-5xl/[1.04] lg:text-[4.5rem]/[1.02]">
                Put your business in every guest&apos;s hands.
              </h1>

              <p className="text-muted mt-5 max-w-[32.5rem] text-[1.0625rem] font-semibold leading-[1.7]">
                List your restaurant, bar, laundry, florist or boutique and let our riders bring
                your products to their door.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link href={registrationHref} className={`${primaryButton} h-12`}>
                  Register Your Business
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
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
                    className={index > 0 ? 'border-border-strong border-l pl-4 sm:pl-10' : 'pr-2'}
                  >
                    <dt className="sr-only">{stat.label}</dt>
                    <dd>
                      <span className="block text-2xl font-extrabold tracking-tight">
                        {stat.value}
                      </span>
                      <span className="text-muted block text-xs font-semibold">{stat.label}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Two arched photographs with what a merchant gets pinned to them.
                Decorative: the copy beside it says the same. */}
            <div
              aria-hidden="true"
              className="relative mx-auto aspect-[6/5] w-full max-w-[36rem] lg:mr-0"
            >
              <span className="bg-gold absolute left-[26%] top-[3%] h-14 w-14 rounded-full sm:h-20 sm:w-20" />
              <div className="absolute right-0 top-0 h-[86%] w-[58%] overflow-hidden rounded-b-[2rem] rounded-t-full shadow-[0_30px_60px_-30px_rgb(0_0_0/0.45)]">
                <Image
                  src="/images/merchant-page/boutique-checkout.jpg"
                  alt=""
                  fill
                  priority
                  sizes="(min-width: 1024px) 21rem, 58vw"
                  className="object-cover object-[42%_center]"
                />
              </div>
              <div className="ring-bg absolute bottom-[12%] left-0 h-[60%] w-[42%] overflow-hidden rounded-b-[1.5rem] rounded-t-full shadow-[0_24px_50px_-26px_rgb(0_0_0/0.5)] ring-[6px]">
                <Image
                  src="/images/merchant-page/bartender.jpg"
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 15rem, 42vw"
                  className="object-cover object-[46%_center]"
                />
              </div>

              <div
                className={`${CARD} absolute -right-1 top-[8%] flex items-center gap-2.5 rounded-2xl px-3 py-2.5 shadow-[0_14px_30px_-12px_rgb(0_0_0/0.35)] sm:-right-6`}
              >
                <span className="bg-gold text-ink flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                  <Banknote className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-[0.75rem] font-extrabold">
                    Weekly M-Pesa settlement
                  </span>
                  <span className="text-muted block text-[0.625rem] font-semibold">
                    To your till or bank
                  </span>
                </span>
              </div>

              <div
                className={`${CARD} absolute bottom-0 left-[20%] flex items-center gap-3 rounded-2xl px-3.5 py-3 shadow-[0_14px_30px_-12px_rgb(0_0_0/0.4)]`}
              >
                <span className="bg-gold text-ink flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
                  <Check className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-[0.8125rem] font-extrabold">
                    New order from [Airbnb]
                  </span>
                  <span className="text-muted block text-[0.6875rem] font-semibold">
                    Rider assigned · pickup in 8 min
                  </span>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------- category strip */}
        {/* Decorative: the same categories are listed, as links, just below. */}
        <div aria-hidden="true" className="bg-gold text-ink overflow-hidden py-4">
          <div className="flex w-max animate-[marquee_70s_linear_infinite] hover:[animation-play-state:paused]">
            {[0, 1].map((copy) => (
              <ul key={copy} className="flex shrink-0">
                {allCategories.map((category) => (
                  <li
                    key={category.category}
                    className="flex items-center gap-6 whitespace-nowrap pl-6 text-sm font-extrabold sm:text-base"
                  >
                    {category.label}
                    <span className="bg-ink/60 h-1.5 w-1.5 rounded-full" />
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>

        {/* ------------------------------------------------------ categories */}
        <section className="py-20 sm:py-24">
          <div className={CONTAINER}>
            <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
              <div>
                <SectionLabel>Categories</SectionLabel>
                <h2 className={`mt-3 max-w-2xl ${H2}`}>
                  Built for the businesses guests ask for most
                </h2>
              </div>
              <p className="text-muted max-w-xs text-sm font-semibold leading-relaxed">
                Don&apos;t see yours? Register anyway — we add categories as demand grows.
              </p>
            </div>

            <ul className="mt-10 grid grid-cols-2 gap-3 sm:mt-12 sm:gap-4 lg:grid-cols-4">
              {photoCategories.map((category, index) => (
                <li key={category.category}>
                  <Link
                    href={registrationHref}
                    aria-label={`Register your ${category.label} business`}
                    className="focus-visible:ring-gold group block rounded-3xl focus-visible:outline-none focus-visible:ring-2"
                  >
                    <span className="relative block aspect-[4/5] overflow-hidden rounded-3xl">
                      <Image
                        src={category.image}
                        alt=""
                        fill
                        sizes="(min-width: 1024px) 25vw, 50vw"
                        className={`object-cover ${category.focus} transition-transform duration-500 ease-out group-hover:scale-[1.04]`}
                      />
                      <span className="bg-gold text-ink absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-[0.6875rem] font-extrabold tabular-nums">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                    </span>
                    <span className="mt-3 flex items-center justify-between gap-2 px-1">
                      <span className="text-[0.875rem] font-extrabold leading-snug sm:text-base">
                        {category.label}
                      </span>
                      <span
                        aria-hidden="true"
                        className="bg-ink group-hover:bg-gold group-hover:text-ink flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white transition-colors dark:bg-white/10"
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            <ul className="mt-8 flex flex-wrap gap-2">
              {allCategories.map((category) => {
                const lead = PHOTO_CATEGORIES.some((photo) => photo.key === category.category);
                return (
                  <li key={category.category}>
                    <Link
                      href={registrationHref}
                      aria-label={`Register your ${category.label} business`}
                      className={`focus-visible:ring-gold inline-flex h-9 items-center rounded-full border px-4 text-[0.8125rem] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 ${
                        lead
                          ? 'bg-ink dark:bg-gold dark:text-night border-transparent text-white'
                          : 'border-border-strong hover:border-ink bg-[var(--m-card)] dark:hover:border-white/50'
                      }`}
                    >
                      {category.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* -------------------------------------------------------- benefits */}
        <section className="bg-[#141414] py-20 text-white sm:py-28">
          <div className={CONTAINER}>
            <SectionLabel onDark>Why NexG</SectionLabel>
            <h2 className={`mt-3 max-w-2xl ${H2}`}>A new front door, without a new headache</h2>
            <p className="mt-4 max-w-xl text-[0.9375rem] font-semibold leading-[1.7] text-white/60">
              You keep cooking, pressing, arranging and selling. NexG handles the guest, the rider
              and the payment.
            </p>

            <ol className="mt-12 border-b border-white/10">
              {BENEFITS.map((benefit, index) => (
                <li
                  key={benefit.title}
                  className="grid gap-6 border-t border-white/10 py-8 sm:grid-cols-[3rem_minmax(0,1fr)] lg:grid-cols-[4rem_minmax(0,1fr)_minmax(0,30rem)] lg:items-center lg:gap-10 lg:py-10"
                >
                  <span
                    aria-hidden="true"
                    className="text-gold text-sm font-extrabold tabular-nums"
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3 className="max-w-sm text-2xl font-extrabold leading-tight tracking-tight sm:text-[1.75rem]">
                      {benefit.title}
                    </h3>
                    <p className="mt-3 max-w-md text-[0.9375rem] font-semibold leading-[1.7] text-white/60">
                      {benefit.body}
                    </p>
                  </div>
                  <div aria-hidden="true" className="sm:col-start-2 lg:col-start-auto">
                    <BenefitVisual index={index} />
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <DashboardPreview />

        {/* ------------------------------------------- steps and pricing */}
        <section id="how" className="scroll-mt-20 py-20 sm:py-28">
          <div className={`${CONTAINER} grid gap-12 lg:grid-cols-[1fr_27rem] lg:gap-16`}>
            <div>
              <SectionLabel>Get started</SectionLabel>
              <h2 className={`mt-3 ${H2}`}>Live in three steps</h2>
              <p className="text-muted mt-4 text-[0.9375rem] font-semibold">
                Most merchants are taking orders within a few days of registering.
              </p>

              <ol className="mt-10">
                {STEPS.map((step, index) => (
                  <li
                    key={step.title}
                    className="border-border-strong flex gap-6 border-t py-7 last:pb-0 sm:gap-8"
                  >
                    <span
                      aria-hidden="true"
                      className="text-gold-text dark:text-gold w-8 shrink-0 text-[2.5rem] font-extrabold tabular-nums leading-none"
                    >
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="text-lg font-extrabold">{step.title}</h3>
                      <p className="text-muted mt-1.5 max-w-lg text-[0.9375rem] font-semibold leading-[1.7]">
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

              <Link
                href={registrationHref}
                className={`${BUTTON} bg-gold text-ink mt-8 h-14 w-full text-base hover:bg-[#FEDD5C]`}
              >
                Register Your Business
              </Link>
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
              <h2 className={`mt-3 ${H2}`}>Register your business</h2>
              <p className="text-muted mt-4 max-w-md text-[0.9375rem] font-semibold leading-[1.7]">
                Two minutes now. A member of the merchant team will call to confirm details and walk
                you through the dashboard.
              </p>

              <ul className="mt-8 space-y-4">
                {REQUIREMENTS.map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="bg-ink text-gold dark:bg-gold dark:text-night flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-[0.9375rem] font-bold">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* The register form, as before: it collects the essentials here and
                carries them into the registration form, already filled in. A
                cream card in both themes, the way the form's fields are drawn. */}
            <div className="border-border bg-surface rounded-3xl border p-6 shadow-[0_24px_50px_-28px_rgb(20_20_20/0.35)] sm:p-8">
              <h3 className="text-2xl font-extrabold tracking-tight">Register your business</h3>
              <p className="text-muted mb-6 mt-2 text-[0.9375rem] font-semibold leading-[1.7]">
                Start with the essentials. We&apos;ll take you through the rest.
              </p>
              <MerchantRegisterCard cities={allCities} categories={allCategories} />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- FAQ */}
        <section className="pb-20 sm:pb-28">
          <div className={`${CONTAINER} grid gap-10 lg:grid-cols-[26rem_1fr] lg:gap-16`}>
            <div>
              <SectionLabel>FAQ</SectionLabel>
              <h2 className={`mt-3 ${H2}`}>Questions merchants ask</h2>
              <p className="text-muted mt-4 text-[0.9375rem] font-semibold">
                Anything else, the merchant team is a call away.
              </p>
              <Link href="/help" className={`${primaryButton} mt-7 h-12`}>
                Talk to the merchant team
              </Link>
            </div>

            <ul className="space-y-3">
              {FAQ.map((item, index) => (
                <li key={item.q}>
                  <details
                    open={index === 0}
                    className={`${CARD} group rounded-2xl px-5 py-4 open:shadow-[0_18px_40px_-26px_rgb(20_20_20/0.35)] sm:px-6 sm:py-5`}
                  >
                    <summary className="focus-visible:ring-gold flex cursor-pointer list-none items-center justify-between gap-4 text-[0.9375rem] font-extrabold focus-visible:outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
                      {item.q}
                      <span
                        aria-hidden="true"
                        className="border-border-strong flex h-8 w-8 shrink-0 items-center justify-center rounded-full border group-open:hidden"
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
            <div className="bg-gold text-ink relative isolate grid overflow-hidden rounded-3xl lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:items-stretch">
              <span
                aria-hidden="true"
                className="bg-ink/[0.07] absolute -left-24 -top-28 -z-10 h-80 w-80 rounded-full"
              />
              <div className="px-7 py-12 sm:px-12 sm:py-16">
                <h2 className="max-w-xl text-3xl font-extrabold leading-[1.08] tracking-tight sm:text-[2.75rem]">
                  Ready to reach thousands of guests?
                </h2>
                <p className="text-ink/75 mt-3 max-w-md text-[0.9375rem] font-semibold">
                  Register today and be on the concierge&apos;s list before the next check-in.
                </p>
                <Link href={registrationHref} className={`${inkButton} mt-8 h-14 px-7 text-base`}>
                  Register Your Business
                  <ArrowRight aria-hidden="true" className="text-gold h-4 w-4" />
                </Link>
              </div>
              <div
                aria-hidden="true"
                className="relative mx-7 mb-7 h-56 overflow-hidden rounded-[1.75rem] sm:mx-12 sm:mb-12 lg:m-5 lg:ml-0 lg:h-auto lg:rounded-l-[8rem]"
              >
                <Image
                  src="/images/merchant-page/barista.jpg"
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 30rem, 100vw"
                  className="object-cover object-[68%_25%]"
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
