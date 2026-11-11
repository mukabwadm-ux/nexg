import { Button, Card } from '@nexg/ui';
import {
  ArrowRight,
  BarChart3,
  BedDouble,
  CalendarCheck,
  Check,
  Coins,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  MapPinned,
  Megaphone,
  Percent,
  ShoppingBag,
  Smile,
  Sparkles,
  Store,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { HostRegisterCard } from '@/components/hosts/host-register-card';
import { PropertyCard, type PropertyCardRow } from '@/components/stays/listing';
import { TailorForm } from '@/components/stays/tailor-form';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { createPublicClient } from '@/lib/supabase/public';
import airport from '@/public/images/categories/airport.jpg';
import experiences from '@/public/images/categories/experiences.jpg';
import laundry from '@/public/images/categories/laundry.jpg';
import restaurants from '@/public/images/categories/restaurants.jpg';
import sunset from '@/public/images/hero/stay-sunset.jpg';

export const metadata: Metadata = {
  title: 'List your property',
  description:
    'List your Airbnb or short-stay property on NexG for free. Manage bookings, units, staff and payouts from one dashboard for KES 1,000 per unit per month, with your first month free.',
};

export const dynamic = 'force-dynamic';

/*
 * Pricing, in one place so the hero, the plans, the form and the FAQ
 * can never quote different numbers.
 */
const PRICE = {
  managementKes: 1000,
  commissionPct: 15,
} as const;

/* Non-breaking space, so "KES" never wraps away from its number. */
const NBSP = String.fromCharCode(160);
const kes = (n: number) => `KES${NBSP}${n.toLocaleString('en-KE')}`;

const HOST_BENEFITS: readonly { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Store,
    title: 'Free property listing',
    body: 'Increase visibility, bookings and occupancy.',
  },
  {
    icon: LayoutDashboard,
    title: 'Centralised property management',
    body: 'Manage multiple properties and units from one dashboard.',
  },
  {
    icon: CalendarCheck,
    title: 'Booking & guest management',
    body: 'Track reservations, check-ins, check-outs and guest communication.',
  },
  {
    icon: Users,
    title: 'Unit & staff management',
    body: 'Coordinate housekeeping, maintenance, unit readiness and staff.',
  },
  {
    icon: Wallet,
    title: 'Financial management',
    body: 'Track revenue, expenses, commissions and payouts.',
  },
  {
    icon: Coins,
    title: 'Additional income',
    body: 'Earn eligible commissions from guests using NexG services.',
  },
  {
    icon: Megaphone,
    title: 'Marketing & growth',
    body: 'Reach more guests through NexG promotions and recommendations.',
  },
  {
    icon: BarChart3,
    title: 'Performance insights',
    body: 'Monitor occupancy, earnings, reviews and property performance.',
  },
];

const GUEST_BENEFITS: readonly { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: BedDouble,
    title: 'Easy accommodation booking',
    body: 'Discover, compare and book stays.',
  },
  {
    icon: KeyRound,
    title: 'Seamless check-in & check-out',
    body: 'Arrival instructions and property information, ready before they land.',
  },
  {
    icon: ShoppingBag,
    title: 'All-in-one services',
    body: 'Order food, transport, cleaning, laundry and more.',
  },
  {
    icon: MapPinned,
    title: 'Experiences & activities',
    body: 'Restaurants, events, attractions and local experiences.',
  },
  {
    icon: LifeBuoy,
    title: 'Digital guest assistance',
    body: 'Message the host and request support in the app.',
  },
  {
    icon: Sparkles,
    title: 'Personalised experience',
    body: 'Recommendations and services tailored to their stay.',
  },
  {
    icon: Smile,
    title: 'Convenience & comfort',
    body: 'The whole stay, managed from one platform.',
  },
];

const LISTING_FEATURES = [
  'Your property and every unit listed on NexG',
  'Shown to guests searching and booking stays',
  'Featured in NexG promotions and recommendations',
  'A guest-services QR for every unit',
  'Eligible commissions when your guests order',
] as const;

const MANAGEMENT_FEATURES = [
  'One dashboard for every property and unit',
  'Reservations, check-ins, check-outs and guest messages',
  'Housekeeping, maintenance, unit readiness and staff',
  'Revenue, expenses, commissions and payouts',
  'Occupancy, earnings, reviews and performance insights',
] as const;

const STEPS = [
  {
    title: 'Add your units',
    body: 'Address, gate or lockbox details, caretaker or askari contact, delivery hours and how riders should hand things over.',
  },
  {
    title: 'Put the QR in your welcome message',
    body: 'We send you a QR and link per unit. Paste it into your Airbnb message, house manual or a card on the counter.',
  },
  {
    title: 'Guests order, we deliver, you relax',
    body: 'Food, drinks, laundry, pharmacy, transfers and special requests — tracked live, delivered by your rules. You see it all in your host view.',
  },
] as const;

const PACKAGE_POINTS = [
  'Schedule per booking or automate for every check-in',
  'Billed monthly to the host · one invoice for all units',
  'Photo confirmation of the set-up in the unit',
] as const;

const FAQ = [
  {
    q: 'What does NexG cost hosts?',
    a: `Listing is free. Management is ${kes(PRICE.managementKes)} per unit per month, and your first month is free. NexG takes ${PRICE.commissionPct}% commission on bookings made through NexG. Guests pay for their own orders.`,
  },
  {
    q: 'What if my guest has no Kenyan number?',
    a: 'They order with any phone number, including a foreign SIM, and pay by M-Pesa or in cash on delivery where the merchant offers it.',
  },
  {
    q: 'Who is responsible if something goes wrong?',
    a: 'NexG. Refunds, late orders and disputes are handled by our concierge desk, not by you.',
  },
  {
    q: 'Can riders get into gated compounds at night?',
    a: 'Only by your rule. Set "leave with askari after 22:00" and riders will never ring your guest at 1am.',
  },
  {
    q: 'Can I use it for my own guests’ airport pickups?',
    a: 'Yes — transfers can be booked by you or the guest, with the fare shown before confirming.',
  },
] as const;

export default async function HostsPage() {
  const supabase = createPublicClient();

  /*
   * The stats are read, not written into the copy. The artboard says
   * "11 cities"; if the database says something else, the database is
   * right — a landing page that overstates the footprint is a promise
   * to a host in a town nobody delivers to.
   */
  const [
    { count: cityCount },
    { data: packageRows },
    { data: listed },
    { data: allAreas, count: listedCount },
  ] = await Promise.all([
    supabase.from('city').select('id', { count: 'exact', head: true }).eq('status', 'live'),
    /*
     * The catalogue is per city, so an unfiltered `limit(4)` returned
     * four copies of whichever package sorts first — the page showed
     * "Essentials" four times.
     *
     * This page is not city-specific, so collapse to one card per
     * package and take the lowest price across cities, which is what
     * "from KES" actually claims.
     */
    supabase
      .from('welcome_package')
      .select('id, name, description, price, sort')
      .eq('status', 'live')
      .order('sort'),
    /* Three of the properties already listed, as proof to a host that
       this is a real shop window and not a promise. */
    supabase
      .from('property_public')
      .select('*')
      .order('from_rate_kes', { nullsFirst: false })
      .limit(4),
    /* Every listed area, so the form's "where, roughly?" chips are not
       limited to the four properties that fit on this page. */
    supabase.from('property_public').select('area', { count: 'exact' }),
  ]);

  const teaser = (listed as PropertyCardRow[] | null) ?? [];
  const more = Math.max((listedCount ?? 0) - teaser.length, 0);
  const areas = [
    ...new Set(((allAreas as { area: string | null }[] | null) ?? []).map((a) => a.area)),
  ].filter(Boolean) as string[];

  const packages = Object.values(
    (packageRows ?? []).reduce<
      Record<
        string,
        { id: string; name: string; description: string | null; price: number | null; sort: number }
      >
    >((acc, row) => {
      const seen = acc[row.name];
      if (!seen) {
        acc[row.name] = row;
      } else if (row.price !== null && (seen.price === null || row.price < seen.price)) {
        acc[row.name] = { ...seen, price: row.price };
      }
      return acc;
    }, {}),
  )
    .sort((a, b) => a.sort - b.sort)
    .slice(0, 4);

  return (
    <>
      <SiteHeader
        action={{ label: 'List your Airbnb', href: '#list' }}
        signIn={{ label: 'Sign in', href: '/hosts/sign-in' }}
      />

      <main id="main">
        {/* ───────────────────────────────────────────── hero */}
        {/* Design B · "Cream Editorial": copy on the left, an arched
            photograph with the dark "your unit" card over its lower half
            on the right. Copy, links and the card's placeholders are
            unchanged from the previous hero. */}
        <section className="mx-auto grid max-w-[96rem] gap-12 px-4 pb-16 pt-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-center lg:gap-10 lg:px-10 lg:pt-16 xl:grid-cols-[minmax(0,700px)_500px] xl:justify-between xl:gap-12 xl:px-16">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full border border-[#E3DCC9] bg-white px-3.5 py-2 text-[0.78125rem] font-bold leading-tight">
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-[#D4A72C]" />
              For Airbnb &amp; short-stay hosts · First month free
            </p>

            <h1 className="text-ink mt-6 max-w-[700px] text-[2.5rem] font-extrabold leading-[1.04] tracking-[-0.03em] sm:text-[3.25rem] xl:text-[4.25rem]">
              List your property{' '}
              <span className="bg-[linear-gradient(transparent_62%,#F2C94C_62%,#F2C94C_92%,transparent_92%)] box-decoration-clone">
                free.
              </span>{' '}
              Run every unit from one place.
            </h1>

            <p className="mt-6 max-w-[600px] text-[1.0625rem] font-medium leading-[1.65] text-[#4A4436] sm:text-[1.125rem]">
              NexG puts your units in front of guests, then gives you one dashboard for bookings,
              check-ins, housekeeping, staff and payouts. Your guests get food, rides, laundry and
              local experiences on tap, and you get the 5-star review.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="#list"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#141414] px-7 py-[17px] text-base font-bold leading-none text-white transition-[background-color,transform] hover:-translate-y-px hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#141414] active:translate-y-0 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none"
              >
                Start your free month <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="#how"
                className="text-ink inline-flex items-center justify-center rounded-full border border-[#E1D9C6] bg-white px-7 py-[17px] text-base font-bold leading-none transition-[border-color,transform] hover:-translate-y-px hover:border-[#141414] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#141414] active:translate-y-0 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none"
              >
                See how it works
              </Link>
            </div>

            <dl className="mt-10 grid grid-cols-3 gap-4 sm:flex sm:flex-wrap sm:gap-x-11 sm:gap-y-5 lg:gap-x-8 xl:gap-x-11">
              <Stat value="KES 0" label="to list your property" />
              <Stat value="1 month" label="of management free" />
              <Stat
                value={`${cityCount ?? 0} ${cityCount === 1 ? 'city' : 'cities'}`}
                label="across Kenya &amp; Uganda"
              />
            </dl>
          </div>

          <HeroVisual />
        </section>

        {/* ───────────────────────────────────── benefits to hosts */}
        <section
          id="benefits"
          aria-labelledby="host-benefits-title"
          className="mx-auto max-w-[96rem] px-4 py-16 sm:px-8 lg:px-16 lg:py-20"
        >
          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
            <div>
              <p className="text-[0.75rem] font-extrabold uppercase tracking-[0.14em] text-[#8A6A12]">
                Benefits to hosts
              </p>
              <h2
                id="host-benefits-title"
                className="text-ink mt-2 max-w-[38rem] text-[2rem] font-extrabold leading-[1.1] tracking-[-0.02em] sm:text-[2.5rem]"
              >
                Everything a host needs, in one dashboard.
              </h2>
            </div>
            <p className="max-w-[26rem] text-[1rem] font-medium leading-[1.65] text-[#4A4436]">
              From the first listing to the monthly payout: more bookings, less admin, and income
              from every guest who orders.
            </p>
          </div>

          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {HOST_BENEFITS.map((item, i) => {
              const Icon = item.icon;
              const lead = i === 0;
              return (
                <li
                  key={item.title}
                  className={`group rounded-2xl border p-6 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(60,40,10,0.12)] motion-reduce:transform-none motion-reduce:transition-none ${
                    lead ? 'border-[#D4A72C] bg-[#F2C94C]' : 'border-[#ECE6D8] bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      aria-hidden="true"
                      className={`flex h-11 w-11 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 motion-reduce:transform-none ${
                        lead ? 'bg-[#141414] text-[#F2C94C]' : 'bg-[#F6F1E3] text-[#141414]'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span
                      aria-hidden="true"
                      className={`text-[0.8125rem] font-extrabold tabular-nums ${
                        lead ? 'text-[#3D2F05]' : 'text-[#B5AC96]'
                      }`}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <h3 className="text-ink mt-5 text-[1.0625rem] font-extrabold leading-snug">
                    {item.title}
                  </h3>
                  <p
                    className={`mt-2 text-[0.9375rem] font-medium leading-[1.6] ${
                      lead ? 'text-[#3D2F05]' : 'text-[#5B5548]'
                    }`}
                  >
                    {item.body}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ──────────────────────────────────── benefits to guests */}
        {/* Dark band, edge to edge: the guest's side of the same stay.
            The photographs are the services guests order, decorative
            (empty alt), no captions. */}
        <section
          aria-labelledby="guest-benefits-title"
          className="bg-ink py-16 text-white lg:py-20"
        >
          <div className="mx-auto grid max-w-[96rem] gap-12 px-4 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:items-center lg:gap-16 lg:px-16">
            <div>
              <p className="text-gold text-[0.75rem] font-extrabold uppercase tracking-[0.14em]">
                Benefits to your guests
              </p>
              <h2
                id="guest-benefits-title"
                className="mt-2 max-w-[36rem] text-[2rem] font-extrabold leading-[1.1] tracking-[-0.02em] sm:text-[2.5rem]"
              >
                The whole stay in one app. That&rsquo;s what earns the 5 stars.
              </h2>

              <ul className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-2">
                {GUEST_BENEFITS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.title} className="flex gap-4">
                      <span
                        aria-hidden="true"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[#F2C94C]"
                      >
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span>
                        <span className="block text-[1rem] font-extrabold leading-snug">
                          {item.title}
                        </span>
                        <span className="mt-1 block text-[0.9375rem] font-medium leading-[1.55] text-white/70">
                          {item.body}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div aria-hidden="true" className="grid grid-cols-2 gap-3 sm:gap-4">
              {[restaurants, airport, laundry, experiences].map((src) => (
                <div key={src.src} className="relative aspect-square overflow-hidden rounded-2xl">
                  <Image
                    src={src}
                    alt=""
                    fill
                    placeholder="blur"
                    sizes="(min-width: 1024px) 240px, 50vw"
                    className="object-cover transition-transform duration-500 hover:scale-[1.03] motion-reduce:transform-none"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ──────────────────────────────────────────── packages */}
        <section
          id="pricing"
          aria-labelledby="pricing-title"
          className="mx-auto max-w-[96rem] px-4 py-16 sm:px-8 lg:px-16 lg:py-20"
        >
          <p className="text-[0.75rem] font-extrabold uppercase tracking-[0.14em] text-[#8A6A12]">
            Packages
          </p>
          <h2
            id="pricing-title"
            className="text-ink mt-2 max-w-[40rem] text-[2rem] font-extrabold leading-[1.1] tracking-[-0.02em] sm:text-[2.5rem]"
          >
            Simple pricing. List free, manage from {kes(PRICE.managementKes)} a unit.
          </h2>

          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            {/* Free listing */}
            <article className="flex flex-col rounded-3xl border border-[#ECE6D8] bg-white p-7 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(60,40,10,0.12)] motion-reduce:transform-none motion-reduce:transition-none sm:p-9">
              <h3 className="text-ink text-[1.25rem] font-extrabold">Free listing</h3>
              <p className="mt-1 text-[0.9375rem] font-medium text-[#5B5548]">
                Get your units in front of guests.
              </p>
              <p className="text-ink mt-6 flex items-baseline gap-2">
                <span className="text-[3rem] font-extrabold leading-none tracking-[-0.03em]">
                  KES 0
                </span>
                <span className="text-[0.9375rem] font-semibold text-[#5B5548]">forever</span>
              </p>
              <ul className="mb-9 mt-7 space-y-3">
                {LISTING_FEATURES.map((f) => (
                  <PlanPoint key={f}>{f}</PlanPoint>
                ))}
              </ul>
              <Link
                href="#list"
                className="text-ink mt-auto inline-flex items-center justify-center gap-2 self-start rounded-full border border-[#E1D9C6] bg-white px-6 py-3.5 text-[0.9375rem] font-bold leading-none transition-[border-color,transform] hover:-translate-y-px hover:border-[#141414] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#141414] active:translate-y-0 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none"
              >
                List my property free
              </Link>
            </article>

            {/* Management — the recommended package */}
            <article className="flex flex-col rounded-3xl bg-[#141414] p-7 text-white shadow-[0_30px_60px_rgba(20,15,5,0.25)] transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none sm:p-9">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-[1.25rem] font-extrabold">Listing + Management</h3>
                <span className="rounded-full bg-[#F2C94C] px-3 py-1.5 text-[0.75rem] font-extrabold text-[#141414]">
                  First month free
                </span>
              </div>
              <p className="mt-1 text-[0.9375rem] font-medium text-white/70">
                Free listing included. Run everything from one dashboard.
              </p>
              <p className="mt-6 flex flex-wrap items-baseline gap-x-2">
                <span className="text-[3rem] font-extrabold leading-none tracking-[-0.03em] text-[#F2C94C]">
                  {kes(PRICE.managementKes)}
                </span>
                <span className="text-[0.9375rem] font-semibold text-white/70">
                  per unit / month
                </span>
              </p>
              <ul className="mb-9 mt-7 space-y-3">
                <PlanPoint dark strong>
                  Everything in Free listing, plus:
                </PlanPoint>
                {MANAGEMENT_FEATURES.map((f) => (
                  <PlanPoint key={f} dark>
                    {f}
                  </PlanPoint>
                ))}
              </ul>
              <Link
                href="#list"
                className="mt-auto inline-flex items-center justify-center gap-2 self-start rounded-full bg-[#F2C94C] px-6 py-3.5 text-[0.9375rem] font-bold leading-none text-[#141414] transition-[background-color,transform] hover:-translate-y-px hover:bg-[#F5D46A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#F2C94C] active:translate-y-0 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none"
              >
                Start your free month <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </article>
          </div>

          {/* The commission applies to both packages, so it sits under
              them rather than inside either. */}
          <div className="mt-5 flex flex-col gap-4 rounded-3xl bg-[#F2C94C] p-6 sm:flex-row sm:items-center sm:gap-6 sm:p-7">
            <span
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#141414] text-[#F2C94C]"
            >
              <Percent className="h-5 w-5" />
            </span>
            <p className="text-[1rem] font-medium leading-[1.55] text-[#3D2F05]">
              <strong className="text-[1.125rem] font-extrabold text-[#141414]">
                {PRICE.commissionPct}% commission on bookings made through NexG.
              </strong>{' '}
              On either package, you pay it only when a guest books your unit on NexG. No NexG
              booking, no commission.
            </p>
          </div>
        </section>

        {/* ─────────────────────────────────────── how it works */}
        <section id="how" className="mx-auto max-w-[96rem] px-4 py-12 sm:px-8 lg:px-16">
          <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-[#8A8A8A]">
            How it works
          </p>
          <h2 className="mt-2 text-[1.75rem] font-extrabold tracking-[-0.02em] sm:text-[2rem]">
            Set up once. Every guest is looked after.
          </h2>

          <div className="mt-7 grid gap-8 lg:grid-cols-[1fr_28rem] lg:items-start lg:gap-12">
            <ol className="space-y-3">
              {STEPS.map((step, i) => (
                <li key={step.title}>
                  <Card className="flex gap-4 p-5">
                    <span
                      aria-hidden="true"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#141414] text-[0.75rem] font-extrabold text-white"
                    >
                      {i + 1}
                    </span>
                    <span>
                      <span className="block text-[0.9375rem] font-extrabold">{step.title}</span>
                      <span className="mt-1.5 block text-[0.8125rem] font-semibold leading-[1.75] text-[#5B5B5B]">
                        {step.body}
                      </span>
                    </span>
                  </Card>
                </li>
              ))}
            </ol>

            <HostViewMock />
          </div>
        </section>

        {/* ──────────────────────────────────── welcome packages */}
        {/*
         * Edge to edge, like the featured band on the homepage: the gold
         * is on the section, the container is inside it, so the colour
         * bleeds to the viewport while the content stays on the same
         * 96rem grid as every other section.
         */}
        <section className="my-12 bg-[#D4A72C] py-12 sm:py-16">
          <div className="mx-auto max-w-[96rem] px-4 sm:px-8 lg:px-16">
            <div className="grid gap-8 lg:grid-cols-[1fr_34rem] lg:items-start lg:gap-12">
              <div>
                <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-[#5B4708]">
                  Optional · for hosts who want more
                </p>
                <h2 className="mt-2 text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em] text-[#141414] sm:text-[2rem]">
                  Welcome packages, delivered before check-in.
                </h2>
                <p className="mt-4 max-w-[30rem] text-[0.875rem] font-semibold leading-[1.8] text-[#3D3208]">
                  Water, fruit, breakfast basket, fresh flowers, a local SIM — ordered from your
                  host view, billed to you, placed in the unit before your guest arrives. Great for
                  Superhosts, property managers and long stays.
                </p>
                <ul className="mt-5 space-y-2">
                  {PACKAGE_POINTS.map((point) => (
                    <li key={point} className="flex gap-2.5">
                      <Check
                        aria-hidden="true"
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#141414]"
                      />
                      <span className="text-[0.8125rem] font-bold text-[#3D3208]">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {packages.map((pkg) => (
                  <div key={pkg.id} className="rounded-xl bg-white p-3">
                    <div aria-hidden="true" className="h-16 w-full rounded-lg bg-[#F6F3EC]" />
                    <p className="mt-2.5 text-[0.8125rem] font-extrabold">{pkg.name}</p>
                    <p className="mt-0.5 text-[0.6875rem] font-semibold leading-snug text-[#8A8A8A]">
                      {pkg.description}
                    </p>
                    {/*
                     * Prices are unset. "from KES [—]" is the honest
                     * rendering — a number invented here is one a host
                     * would later be invoiced.
                     */}
                    <p className="mt-1.5 text-[0.75rem] font-extrabold text-[#B8901F]">
                      from KES{' '}
                      {pkg.price === null ? '[—]' : Number(pkg.price).toLocaleString('en-KE')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/*
         * Looking for a place, rather than listing one.
         *
         * Two audiences on one page, so this says plainly which it is
         * for. It sits immediately above the listings because the form
         * and the cards are the same offer approached from two
         * directions: tell us, or look for yourself.
         */}
        <section
          id="find"
          className="mx-auto grid max-w-[96rem] gap-10 px-4 py-12 sm:px-8 lg:grid-cols-[1fr_30rem] lg:items-center lg:gap-14 lg:px-16"
        >
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[#DDD8CC] bg-white px-3 py-1.5 text-[0.6875rem] font-extrabold">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#D4A72C]" />
              Looking for a place, not listing one?
            </p>

            <h2 className="mt-5 text-[2rem] font-extrabold leading-[1.1] tracking-[-0.02em] sm:text-[2.75rem]">
              Tell us what you need. We&rsquo;ll find the{' '}
              <span className="text-[#B8901F]">place</span>.
            </h2>

            <p className="mt-4 max-w-[34rem] text-[0.9375rem] font-semibold leading-[1.8] text-[#5B5B5B]">
              Every place on NexG comes with a concierge already set up: food, laundry, a charger at
              midnight, an airport run at five. Describe the stay and a person comes back with two
              or three that actually fit.
            </p>

            <dl className="mt-7 grid gap-4 sm:grid-cols-3">
              {[
                { title: 'A person, not a filter', body: 'Somebody reads it and picks.' },
                {
                  title: 'Concierge included',
                  body: 'Deliveries follow the host’s rule, not a guess.',
                },
                { title: 'Nothing to pay to ask', body: 'No account, no card, no obligation.' },
              ].map((item) => (
                <div key={item.title}>
                  <dt className="text-[0.8125rem] font-extrabold">{item.title}</dt>
                  <dd className="mt-1 text-[0.75rem] font-semibold leading-snug text-[#8A8A8A]">
                    {item.body}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <TailorForm areas={areas} />
        </section>

        {/* ─────────────────────────────────── already listed */}
        {teaser.length > 0 && (
          /* Dark, so the white listing cards read as the thing being
             shown off rather than as more page. */
          <section className="bg-ink py-14 text-white">
            <div className="mx-auto max-w-[96rem] px-4 sm:px-8 lg:px-16">
              <p className="text-gold text-[0.6875rem] font-extrabold uppercase tracking-[0.14em]">
                How a listing looks
              </p>
              <h2 className="mt-2 text-[1.75rem] font-extrabold tracking-[-0.02em] sm:text-[2rem]">
                This is how your unit looks to guests.
              </h2>
              <p className="mt-3 max-w-[38rem] text-[0.875rem] font-semibold leading-[1.8] text-white/70">
                Verified hosts can have their property shown on NexG, with each unit listed
                separately. Guests browse it, or tell us what they need and we come back with the
                places that fit.
              </p>

              <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {teaser.map((property) => (
                  <PropertyCard key={property.id} property={property} />
                ))}
              </div>

              <div className="mt-8 text-center">
                <Link
                  href="/stays"
                  className="inline-flex items-center gap-2 rounded-lg border border-white/25 px-5 py-2.5 text-[0.8125rem] font-extrabold text-white transition-colors hover:border-white hover:bg-white/5"
                >
                  {/* The count is real, so the link never promises more
                      than there is. */}
                  {more > 0
                    ? `See ${more} more ${more === 1 ? 'listing' : 'listings'}`
                    : 'See every listing'}
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* ─────────────────────────────────────────── the form */}
        <section id="list" className="mx-auto max-w-[96rem] px-4 py-12 sm:px-8 lg:px-16">
          <div className="rounded-2xl border border-[#ECE8DF] bg-white p-6 sm:p-10">
            <div className="grid gap-8 lg:grid-cols-[26rem_1fr] lg:items-start lg:gap-14">
              <div>
                <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-[#B8901F]">
                  List your Airbnb
                </p>
                <h2 className="mt-2 text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em]">
                  Ten minutes now. Better reviews all year.
                </h2>
                <p className="mt-4 text-[0.875rem] font-semibold leading-[1.8] text-[#5B5B5B]">
                  Tell us about your first unit and confirm your email. Then sign in, upload your ID
                  and proof of authority to let, and you&rsquo;re live as soon as NexG approves
                  them.
                </p>
                <ul className="mt-5 space-y-2.5">
                  {[
                    'Free to list · first month of management free',
                    'Manage one flat or a hundred',
                    'Cancel any time',
                  ].map((point) => (
                    <li key={point} className="flex items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#D4A72C]"
                      >
                        <Check className="h-3 w-3 text-[#141414]" />
                      </span>
                      <span className="text-[0.8125rem] font-bold">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <HostRegisterCard />
            </div>
          </div>
        </section>

        {/* ────────────────────────────────────────────── FAQ */}
        <section className="mx-auto max-w-[96rem] px-4 py-12 sm:px-8 lg:px-16">
          <div className="grid gap-8 lg:grid-cols-[26rem_1fr] lg:items-start lg:gap-14">
            <div>
              <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-[#8A8A8A]">
                Host questions
              </p>
              <h2 className="mt-2 text-[1.75rem] font-extrabold tracking-[-0.02em] sm:text-[2rem]">
                Straight answers.
              </h2>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {FAQ.map((item) => (
                <Card key={item.q} className="p-5">
                  <h3 className="text-[0.9375rem] font-extrabold">{item.q}</h3>
                  <p className="mt-2 text-[0.8125rem] font-semibold leading-[1.75] text-[#5B5B5B]">
                    {item.a}
                  </p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ────────────────────────────────────────── CTA band */}
        <section className="mx-auto max-w-[96rem] px-4 pb-16 sm:px-8 lg:px-16">
          <div className="flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-[#141414] p-8 sm:p-10">
            <div>
              <h2 className="text-[1.5rem] font-extrabold tracking-[-0.02em] text-white sm:text-[1.875rem]">
                Your next guest checks in tonight.
              </h2>
              <p className="mt-2 text-[0.875rem] font-semibold text-[#B8B8B8]">
                List a unit now and the QR pack is on its way.
              </p>
            </div>
            <Button asChild>
              <Link href="#list">
                List Your Airbnb <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

/*
 * The value is the term, the caption is the description — so a screen
 * reader hears "KES 0, to list, guests pay per order" once rather than
 * the caption twice, which is what an sr-only duplicate produced.
 */
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink text-[1.375rem] font-extrabold leading-tight tracking-tight sm:text-[1.75rem]">
        {value}
      </dt>
      {/* #6B6453 rather than the reference's #7A7260, which is 4.3:1 on
          the cream ground; this is 5.3:1. */}
      <dd className="mt-1 text-[0.78125rem] font-semibold leading-snug text-[#6B6453]">
        {label.replace('&amp;', '&')}
      </dd>
    </div>
  );
}

function PlanPoint({
  children,
  dark = false,
  strong = false,
}: {
  children: string;
  dark?: boolean;
  strong?: boolean;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
          dark ? 'bg-[#F2C94C] text-[#141414]' : 'bg-[#141414] text-[#F2C94C]'
        }`}
      >
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
      <span
        className={`text-[0.9375rem] leading-[1.5] ${strong ? 'font-extrabold' : 'font-medium'} ${
          dark ? (strong ? 'text-white' : 'text-white/80') : 'text-[#3A352B]'
        }`}
      >
        {children}
      </span>
    </li>
  );
}

/**
 * The arched sunset photograph with the dark "your unit" card laid over
 * its lower part. Both are decorative: the photo has an empty alt and the
 * card is aria-hidden — every value in it is a placeholder, and the
 * review quote says so rather than inventing a happy host.
 *
 * The card sits in normal flow with a negative top margin (not absolute),
 * so it can never be clipped and the column grows to fit it.
 */
function HeroVisual() {
  return (
    <div className="mx-auto w-full max-w-[420px] lg:mx-0 lg:max-w-[400px] lg:justify-self-end xl:max-w-[500px]">
      <div className="relative h-[280px] overflow-hidden rounded-b-[28px] rounded-t-[min(calc(50vw_-_16px),210px)] shadow-[0_30px_60px_rgba(60,40,10,0.25)] sm:h-[470px] sm:rounded-t-[210px] lg:h-[448px] lg:rounded-t-[200px] xl:h-[560px] xl:rounded-t-[250px]">
        <Image
          src={sunset}
          alt=""
          fill
          priority
          placeholder="blur"
          sizes="(min-width: 1280px) 500px, (min-width: 1024px) 400px, 420px"
          className="object-cover"
        />
      </div>

      <div
        aria-hidden="true"
        className="relative z-10 -mt-6 rounded-[24px] bg-[#141311] p-4 shadow-[0_30px_70px_rgba(0,0,0,0.35)] sm:-mt-[194px] lg:-mt-[184px] xl:-mt-[230px]"
      >
        <div className="flex items-center gap-3 rounded-2xl bg-[#222120] p-3.5">
          <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-[#D4A72C]">
            <LayoutDashboard className="h-5 w-5 text-[#141414]" />
          </span>
          <span className="min-w-0">
            <span className="block text-[0.875rem] font-extrabold leading-snug text-white">
              Your host dashboard · 3 units
            </span>
            <span className="mt-0.5 block text-[0.78125rem] font-semibold leading-snug text-[#A8A39A]">
              Bookings, staff, guests and payouts in one view
            </span>
          </span>
        </div>

        <div className="mt-3 rounded-2xl bg-[#0C0B0A] p-4">
          <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-[#9C978E]">
            Today
          </p>
          {[
            ['Apartment 4B · Kilimani', 'Check-in 14:00', 'Ready', 'bg-[#1E5B3A] text-[#7CE0A8]'],
            ['Studio 2 · Westlands', 'Housekeeping', 'In progress', 'bg-[#5B4708] text-[#F0CE6E]'],
            ['Cottage · Karen', 'Check-out 11:00', 'Done', 'bg-white/10 text-[#DADADA]'],
          ].map(([unit, task, state, tone]) => (
            <p key={unit} className="mt-2.5 flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-[0.8125rem] font-extrabold leading-snug text-white">
                  {unit}
                </span>
                <span className="block text-[0.75rem] font-semibold text-[#9C978E]">{task}</span>
              </span>
              <span
                className={`shrink-0 rounded-md px-2 py-1 text-[0.6875rem] font-extrabold ${tone}`}
              >
                {state}
              </span>
            </p>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-[#D4A72C] p-4">
          <Coins className="h-5 w-5 shrink-0 text-[#141414]" />
          {/* #3D2F05 (5.8:1 on the gold) replaces #5B4708, which was 4:1. */}
          <p className="text-[0.84375rem] font-bold leading-snug text-[#141414]">
            Guest ordered dinner to 4B
            <span className="block text-[0.75rem] font-semibold text-[#3D2F05]">
              Eligible commission tracked in your finances
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

function HostViewMock() {
  return (
    <div aria-hidden="true" className="rounded-2xl border border-[#2A2A2A] bg-[#141414] p-5">
      <p className="text-[0.5625rem] font-extrabold uppercase tracking-[0.12em] text-[#D4A72C]">
        Your host view
      </p>
      <p className="mt-1 text-[1rem] font-extrabold text-white">Your units, one place.</p>

      <div className="mt-4 space-y-2">
        {[
          [
            'Apartment 4B · Kilimani',
            'Gate code · call before arriving · leave with askari',
            'LIVE',
          ],
          [
            'Studio 2 · Westlands',
            'Lockbox · rider photo on drop · no deliveries 23:00–06:00',
            'LIVE',
          ],
          ['Cottage · Karen', 'Caretaker [Name] · dogs on site · park outside gate', 'SETTING UP'],
        ].map(([label, rule, state]) => (
          <div key={label} className="rounded-lg bg-[#1E1E1E] p-2.5">
            <p className="flex items-center justify-between gap-2">
              <span className="text-[0.6875rem] font-extrabold text-white">{label}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[0.5rem] font-extrabold ${
                  state === 'LIVE' ? 'bg-[#1E5B3A] text-[#7CE0A8]' : 'bg-[#5B4708] text-[#F0CE6E]'
                }`}
              >
                {state}
              </span>
            </p>
            <p className="mt-0.5 text-[0.5625rem] font-semibold text-[#8A8A8A]">{rule}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          ['[—]', 'orders this month'],
          ['[—]', 'guests served'],
          ['Food', 'most requested'],
        ].map(([v, l]) => (
          <div key={l} className="rounded-lg bg-[#1E1E1E] p-2.5">
            <p className="text-[0.75rem] font-extrabold text-white">{v}</p>
            <p className="text-[0.5rem] font-semibold text-[#8A8A8A]">{l}</p>
          </div>
        ))}
      </div>

      <p className="mt-3 rounded-lg bg-[#D4A72C] py-2 text-center text-[0.6875rem] font-extrabold text-[#141414]">
        + Add a unit
      </p>
    </div>
  );
}
