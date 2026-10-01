import { Button, Card } from '@nexg/ui';
import { ArrowRight, Check, QrCode } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { HostRegisterCard } from '@/components/hosts/host-register-card';
import { PropertyCard, type PropertyCardRow } from '@/components/stays/listing';
import { TailorForm } from '@/components/stays/tailor-form';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { createPublicClient } from '@/lib/supabase/public';

export const metadata: Metadata = {
  title: 'List your Airbnb',
  description:
    'Your guests land at midnight needing food, a charger, laundry or a ride to the airport. NexG handles it — delivered to your door with your access rules — and you get the 5-star review.',
};

export const dynamic = 'force-dynamic';

/* Copy verbatim from the `Hosts` artboard (ground rule 6). */

const WHY = [
  {
    title: 'Better reviews',
    body: 'Guests remember the host who solved the midnight problem. NexG solves it under your name.',
  },
  {
    title: 'Nothing to manage',
    body: 'No calls at 2am. The concierge desk, riders and merchants handle every request end to end.',
  },
  {
    title: 'Your rules, every time',
    body: 'Gate code, askari, lockbox, "call before arriving" — set once per unit, followed on every delivery.',
  },
  {
    title: 'Free for hosts',
    body: 'Guests pay per order like anyone else. You pay nothing to list. Optional welcome packages are billed to you only if you order them.',
  },
  {
    title: 'Works with any platform',
    body: 'Airbnb, Booking.com, direct bookings — the QR and link go in your welcome message and house manual.',
  },
  {
    title: 'See what your guests need',
    body: 'A simple host view: orders from your units, what was popular, and what to stock next time.',
  },
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
    q: 'Does NexG charge hosts?',
    a: 'No. Guests pay per order. Hosts pay only if they order welcome packages for their units.',
  },
  {
    q: 'What if my guest has no Kenyan number?',
    a: 'They order with any phone number and pay by card or M-Pesa. Foreign SIMs work fine.',
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
      Record<string, { id: string; name: string; description: string | null; price: number | null; sort: number }>
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
        signIn={{ label: 'Host sign in', href: '/sign-in' }}
      />

      <main id="main">
        {/* ───────────────────────────────────────────── hero */}
        <section className="mx-auto grid max-w-[96rem] gap-10 px-4 pb-16 pt-10 sm:px-8 lg:grid-cols-[1fr_32rem] lg:items-center lg:gap-12 lg:px-16 lg:pt-16">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[#DDD8CC] bg-white px-3 py-1.5 text-[0.6875rem] font-extrabold">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#D4A72C]" />
              For Airbnb &amp; short-stay hosts · Free to join
            </p>

            <h1 className="mt-5 text-[2.5rem] font-extrabold leading-[1.08] tracking-[-0.02em] sm:text-[3.25rem]">
              Give your guests a <span className="text-[#B8901F]">concierge</span>. Without hiring
              one.
            </h1>

            <p className="mt-5 max-w-[34rem] text-[0.9375rem] font-semibold leading-[1.8] text-[#5B5B5B]">
              Your guests land at midnight needing food, a charger, laundry or a ride to the
              airport. NexG handles it — delivered to your door with your access rules — and you
              get the 5-star review.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="#list">
                  List Your Airbnb <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="#how">See how it works</Link>
              </Button>
            </div>

            <dl className="mt-9 flex flex-wrap gap-x-10 gap-y-4">
              <Stat value="KES 0" label="to list · guests pay per order" />
              <Stat value="10 min" label="to set up a unit" />
              <Stat
                value={`${cityCount ?? 0} ${cityCount === 1 ? 'city' : 'cities'}`}
                label="across Kenya &amp; Uganda"
              />
            </dl>
          </div>

          <PhoneMock />
        </section>

        {/* ──────────────────────────────────────── why hosts list */}
        <section className="mx-auto max-w-[96rem] px-4 py-12 sm:px-8 lg:px-16">
          <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.14em] text-[#8A8A8A]">
            Why hosts list
          </p>
          <h2 className="mt-2 text-[1.75rem] font-extrabold tracking-[-0.02em] sm:text-[2rem]">
            The amenity that shows up in reviews.
          </h2>

          <div className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {WHY.map((item) => (
              <Card key={item.title} className="p-5">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F6F3EC]"
                >
                  <Check className="h-4 w-4 text-[#141414]" />
                </span>
                <h3 className="mt-3.5 text-[0.9375rem] font-extrabold">{item.title}</h3>
                <p className="mt-2 text-[0.8125rem] font-semibold leading-[1.75] text-[#5B5B5B]">
                  {item.body}
                </p>
              </Card>
            ))}
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
                    <div
                      aria-hidden="true"
                      className="h-16 w-full rounded-lg bg-[#F6F3EC]"
                    />
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
                      {pkg.price === null
                        ? '[—]'
                        : Number(pkg.price).toLocaleString('en-KE')}
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
              Every place on NexG comes with a concierge already set up: food, laundry, a charger
              at midnight, an airport run at five. Describe the stay and a person comes back with
              two or three that actually fit.
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
                Already listed
              </p>
              <h2 className="mt-2 text-[1.75rem] font-extrabold tracking-[-0.02em] sm:text-[2rem]">
                Your unit, in front of guests looking now.
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
                  Tell us about your first unit. We verify you&rsquo;re the host or manager, send
                  your QR pack within two working days, and you&rsquo;re live.
                </p>
                <ul className="mt-5 space-y-2.5">
                  {[
                    'Free to list · no monthly fee',
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
    <div>
      <dt className="text-[1.5rem] font-extrabold tracking-tight">{value}</dt>
      <dd className="mt-0.5 text-[0.6875rem] font-semibold text-[#8A8A8A]">
        {label.replace('&amp;', '&')}
      </dd>
    </div>
  );
}

/**
 * The dark hero mock. Decorative — every number in it is a placeholder,
 * and the review quote says so rather than inventing a happy host.
 */
function PhoneMock() {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-2xl border border-[#2A2A2A] bg-[#141414] p-4"
    >
      <div className="rounded-xl bg-[#1E1E1E] p-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#D4A72C]">
            <QrCode className="h-4 w-4 text-[#141414]" />
          </span>
          <span>
            <span className="block text-[0.75rem] font-extrabold text-white">
              Your unit&rsquo;s QR · [Apartment 4B, Kilimani]
            </span>
            <span className="block text-[0.625rem] font-semibold text-[#8A8A8A]">
              Guest scans → unit, gate code and hand-off rule pre-filled
            </span>
          </span>
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-[#0E0E0E] p-3">
        <p className="text-[0.5625rem] font-extrabold uppercase tracking-[0.12em] text-[#8A8A8A]">
          Tonight · your guests
        </p>
        <p className="mt-2 text-[0.6875rem] font-semibold text-[#DADADA]">
          23:14 · Dinner to 4B · delivered · left with askari as per your rule
        </p>
        <p className="mt-1 text-[0.6875rem] font-semibold text-[#DADADA]">
          06:10 · Airport transfer from 4B · booked for Thursday
        </p>
      </div>

      <div className="mt-3 rounded-xl bg-[#D4A72C] p-3">
        <p className="text-[0.5625rem] font-extrabold uppercase tracking-[0.12em] text-[#5B4708]">
          What guests say
        </p>
        <p className="mt-1.5 text-[0.6875rem] font-bold leading-relaxed text-[#141414]">
          &ldquo;Host had a concierge service set up — ordered breakfast at 7 and it was at the
          gate by 7:30.&rdquo; — [Review placeholder]
        </p>
      </div>
    </div>
  );
}

function HostViewMock() {
  return (
    <div
      aria-hidden="true"
      className="rounded-2xl border border-[#2A2A2A] bg-[#141414] p-5"
    >
      <p className="text-[0.5625rem] font-extrabold uppercase tracking-[0.12em] text-[#D4A72C]">
        Your host view
      </p>
      <p className="mt-1 text-[1rem] font-extrabold text-white">Your units, one place.</p>

      <div className="mt-4 space-y-2">
        {[
          ['Apartment 4B · Kilimani', 'Gate code · call before arriving · leave with askari', 'LIVE'],
          ['Studio 2 · Westlands', 'Lockbox · rider photo on drop · no deliveries 23:00–06:00', 'LIVE'],
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
