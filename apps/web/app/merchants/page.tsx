import { Button, Card, VALUE_PLACEHOLDER } from '@nexg/ui';
import {
  ArrowRight,
  Bike,
  Check,
  CreditCard,
  Flower2,
  Gift,
  LayoutDashboard,
  Pill,
  Shirt,
  ShoppingCart,
  Sparkles,
  UtensilsCrossed,
  Wine,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { DashboardPreview } from '@/components/merchants/dashboard-preview';
import { MerchantRegisterCard } from '@/components/merchants/merchant-register-card';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'List your business',
  description:
    'Hotel guests, travellers and expats ask NexG for what they need. List your restaurant, bar, laundry, florist or boutique and let our riders bring your products to their door.',
};

/* Copy from the `Merchants` artboard, signed off (ground rule 6). */

const CATEGORY_TILES = [
  { label: 'Restaurants', icon: UtensilsCrossed },
  { label: 'Bars & liquor stores', icon: Wine },
  { label: 'Laundries', icon: Shirt },
  { label: 'Florists', icon: Flower2 },
  { label: 'Beauty & fashion', icon: Sparkles },
  { label: 'Pharmacies', icon: Pill },
  { label: 'Supermarkets', icon: ShoppingCart },
  { label: 'Gift shops', icon: Gift },
] as const;

const BENEFITS = [
  {
    icon: Sparkles,
    title: "Customers you can't reach today",
    body: 'Hotel guests and visitors who do not know your street, but know NexG. Their concierge recommends you.',
  },
  {
    icon: Bike,
    title: 'Our riders, not yours',
    body: 'No fleet to hire or manage. A vetted NexG rider collects from your counter and the guest tracks it live.',
  },
  {
    icon: CreditCard,
    title: 'Paid without chasing',
    body: 'Guests pay NexG by card or M-Pesa. You get settled to your M-Pesa or bank every week, with a statement per order.',
  },
  {
    icon: LayoutDashboard,
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

export default async function MerchantsPage() {
  const supabase = createClient();

  const [{ data: cities }, { count: cityCount }, { data: commission }] = await Promise.all([
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
  ]);

  const commissionValue = commission?.value ?? null;
  const allCities = cities ?? [];

  return (
    <>
      <SiteHeader
        signIn={{ label: 'Merchant sign in', href: '/merchants/sign-in' }}
        action={{ label: 'List your business', href: '/merchants/apply' }}
      />

      <main>
        {/* ------------------------------------------------------------ hero */}
        <section className="mx-auto max-w-[96rem] px-4 pb-10 pt-8 sm:px-8 lg:px-16 lg:pb-14 lg:pt-12">
          <div className="grid gap-8 lg:grid-cols-[1fr_26rem] lg:gap-12">
            <div className="lg:pt-6">
              <span className="border-border-strong bg-surface inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold">
                <span aria-hidden="true" className="bg-gold h-1.5 w-1.5 rounded-full" />
                Now onboarding merchants in Nairobi
              </span>

              <h1 className="mt-5 text-4xl/[1.06] font-extrabold tracking-tight sm:text-5xl/[1.06] lg:text-[4.375rem]/[1.06]">
                Put your business in
                <br />
                <span className="text-gold">every guest&apos;s</span> hands.
              </h1>

              <p className="text-muted mt-4 max-w-md text-[1.0625rem] leading-[1.7]">
                Hotel guests, travellers and expats ask NexG for what they need. List your
                restaurant, bar, laundry, florist or boutique and let our riders bring your products
                to their door.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                <Button size="lg" asChild>
                  <Link href="/merchants/apply">Register Your Business</Link>
                </Button>
                <Button variant="outline" size="lg" asChild>
                  <Link href="#how">See how it works</Link>
                </Button>
              </div>

              <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
                {[
                  { value: 'Zero', label: 'riders to hire' },
                  { value: 'Weekly', label: 'M-Pesa settlement' },
                  { value: cityCount ?? VALUE_PLACEHOLDER, label: 'cities to grow into' },
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

            {/* How the merchant's card will look to a guest once live. */}
            <Card className="self-start p-3">
              <div className="flex items-center justify-between">
                <p className="text-muted-light text-[0.625rem] font-bold uppercase tracking-widest">
                  How guests will see you
                </p>
                <span className="text-success flex items-center gap-1 text-[0.625rem] font-bold">
                  <span aria-hidden="true" className="bg-success h-1.5 w-1.5 rounded-full" />
                  Open now
                </span>
              </div>

              <div
                aria-hidden="true"
                className="bg-bg text-muted-light mt-2 flex h-28 items-center justify-center rounded-lg text-[0.625rem] uppercase tracking-widest"
              >
                [Your cover photo]
              </div>

              <p className="mt-3 text-sm font-extrabold">[Your business name]</p>
              <p className="text-muted-light text-xs">
                Restaurant · Westlands, Nairobi · Delivers in {VALUE_PLACEHOLDER} min
              </p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {['Popular', 'Mains', 'Drinks', 'Desserts'].map((tab, index) => (
                  <span
                    key={tab}
                    className={`rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold ${
                      index === 0 ? 'bg-gold text-ink' : 'bg-bg text-muted'
                    }`}
                  >
                    {tab}
                  </span>
                ))}
              </div>

              <ul className="mt-3 space-y-2">
                {[1, 2].map((item) => (
                  <li
                    key={item}
                    className="border-border flex items-baseline justify-between gap-3 border-t pt-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold">[Menu item]</span>
                      <span className="text-muted-light block truncate text-[0.6875rem]">
                        [Short description]
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-bold">KES {VALUE_PLACEHOLDER}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </section>

        {/* ------------------------------------------------------ categories */}
        <section className="border-border bg-surface border-y py-12">
          <div className="mx-auto max-w-[96rem] px-4 sm:px-8 lg:px-16">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-2xl font-extrabold tracking-tight">
                Built for the businesses guests ask for most
              </h2>
              <p className="text-muted-light text-xs">
                Don&apos;t see yours? Register anyway — we add categories as demand grows.
              </p>
            </div>

            <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              {CATEGORY_TILES.map((category) => {
                const Icon = category.icon;
                return (
                  <li
                    key={category.label}
                    className="bg-bg flex flex-col items-center gap-2 rounded-xl px-2 py-4 text-center"
                  >
                    <span
                      aria-hidden="true"
                      className="bg-gold text-ink flex h-9 w-9 items-center justify-center rounded-lg"
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-[0.6875rem] font-bold leading-tight">
                      {category.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* -------------------------------------------------------- benefits */}
        <section className="mx-auto max-w-[96rem] px-4 py-14 sm:px-8 lg:px-16">
          <h2 className="max-w-lg text-3xl font-extrabold leading-tight tracking-tight">
            A new front door, without a new headache
          </h2>
          <p className="text-muted mt-2 max-w-xl text-[0.9375rem] leading-[1.7]">
            You keep cooking, pressing, arranging and selling. NexG handles the guest, the rider and
            the payment.
          </p>

          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {BENEFITS.map((benefit) => {
              const Icon = benefit.icon;
              return (
                <li key={benefit.title}>
                  <Card tone="gold" className="h-full">
                    <span
                      aria-hidden="true"
                      className="bg-ink text-gold flex h-8 w-8 items-center justify-center rounded-lg"
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <h3 className="mt-4 text-[1.0625rem] font-extrabold">{benefit.title}</h3>
                    <p className="text-ink/80 mt-1.5 text-[0.875rem] leading-[1.7]">
                      {benefit.body}
                    </p>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>

        <DashboardPreview />

        {/* ------------------------------------------- steps and pricing */}
        <section id="how" className="mx-auto max-w-[96rem] px-4 pb-14 sm:px-8 lg:px-16">
          <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.375rem]">
                Live in three steps
              </h2>
              <p className="text-muted mt-2 text-sm">
                Most merchants are taking orders within a few days of registering.
              </p>

              <ol className="mt-6 space-y-3">
                {STEPS.map((step, index) => (
                  <li key={step.title}>
                    <Card className="flex gap-4">
                      <span
                        aria-hidden="true"
                        className="bg-ink flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      >
                        {index + 1}
                      </span>
                      <span>
                        <span className="block text-sm font-extrabold">{step.title}</span>
                        <span className="text-muted mt-1 block text-xs leading-[1.7]">
                          {step.body}
                        </span>
                      </span>
                    </Card>
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
            <Card tone="ink" className="self-start">
              <p className="text-gold text-[0.625rem] font-bold uppercase tracking-widest">
                Simple pricing
              </p>
              <p className="mt-3 text-5xl font-extrabold tracking-tight">
                {commissionValue === null ? VALUE_PLACEHOLDER : String(commissionValue)}%
              </p>
              <p className="mt-1 text-xs text-white/60">per completed order. That&apos;s it.</p>

              <ul className="mt-4 space-y-2">
                {PRICING_POINTS.map((point) => (
                  <li key={point} className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="bg-gold text-ink flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                    >
                      <Check className="h-2.5 w-2.5" />
                    </span>
                    <span className="text-xs text-white/80">{point}</span>
                  </li>
                ))}
              </ul>

              <Button variant="gold" block className="mt-5" asChild>
                <Link href="/merchants/apply">Register Your Business</Link>
              </Button>
            </Card>
          </div>
        </section>

        {/* ------------------------------------------------------- featured */}
        <section id="featured" className="bg-ink py-14 text-white">
          <div className="mx-auto max-w-[96rem] px-4 sm:px-8 lg:px-16">
            <span className="bg-gold text-ink inline-block rounded-full px-3 py-1 text-[0.625rem] font-bold uppercase tracking-widest">
              Get featured
            </span>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight">
              Put your store on the <span className="text-gold">homepage.</span>
            </h2>
            <p className="mt-2 max-w-xl text-[0.9375rem] leading-[1.7] text-white/60">
              Once you&apos;re live, you can buy a featured slot and be the first store guests see
              when they open NexG. Slots are limited per city, so every featured merchant actually
              gets seen.
            </p>

            <ul className="mt-6 grid gap-4 sm:grid-cols-3">
              {[
                { name: 'Homepage spot', note: 'Featured on the homepage, in your city.' },
                { name: 'Category top', note: 'First result when guests browse your category.' },
                { name: 'Popular request', note: 'Your best-seller pinned in Popular Requests.' },
              ].map((slot) => (
                <li
                  key={slot.name}
                  className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
                >
                  <p className="text-[0.625rem] font-bold uppercase tracking-widest text-white/40">
                    Sponsored slot
                  </p>
                  <p className="mt-2 text-sm font-extrabold">{slot.name}</p>
                  <p className="mt-2 text-2xl font-extrabold tracking-tight">
                    KES {VALUE_PLACEHOLDER}
                    <span className="text-sm font-semibold text-white/50"> / week</span>
                  </p>
                  <p className="mt-2 text-xs text-white/50">{slot.note}</p>
                </li>
              ))}
            </ul>

            <p className="mt-5 text-xs text-white/40">
              Available to live merchants in good standing. Ask about featured placement once
              you&apos;re taking orders.
            </p>
          </div>
        </section>

        {/* -------------------------------------------------------- register */}
        <section className="mx-auto max-w-[96rem] px-4 py-14 sm:px-8 lg:px-16">
          <div className="grid gap-8 lg:grid-cols-[1fr_28rem] lg:items-start">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.375rem]">
                Register your business
              </h2>
              <p className="text-muted mt-2 max-w-md text-[0.9375rem] leading-[1.7]">
                Two minutes now. A member of the merchant team will call to confirm details and walk
                you through the dashboard.
              </p>

              <ul className="mt-6 space-y-2.5">
                {[
                  'Valid business permit',
                  'A physical location in one of our cities',
                  'M-Pesa till or bank account for payouts',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="bg-gold text-ink flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                    >
                      <Check className="h-3 w-3" />
                    </span>
                    <span className="text-sm font-semibold">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <MerchantRegisterCard cities={allCities} />
          </div>
        </section>

        {/* ------------------------------------------------------------- FAQ */}
        <section className="mx-auto max-w-[96rem] px-4 pb-14 sm:px-8 lg:px-16">
          <div className="grid gap-8 lg:grid-cols-[18rem_1fr]">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.375rem]">
                Questions merchants ask
              </h2>
              <p className="text-muted mt-2 text-sm">
                Anything else, the merchant team is a call away.
              </p>
              <Link
                href="/help"
                className="mt-3 inline-block text-sm font-bold underline underline-offset-4"
              >
                Talk to the merchant team
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
                    <p className="text-muted mt-2 text-[0.9375rem] leading-[1.7]">{item.a}</p>
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
              <h2 className="text-2xl font-extrabold tracking-tight">
                Ready to reach thousands of guests?
              </h2>
              <p className="text-ink/80 mt-1.5 max-w-md text-sm">
                Register today and be on the concierge&apos;s list before the next check-in.
              </p>
            </div>
            <Button size="lg" asChild trailingIcon={<ArrowRight className="h-4 w-4" />}>
              <Link href="/merchants/apply">Register Your Business</Link>
            </Button>
          </Card>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
