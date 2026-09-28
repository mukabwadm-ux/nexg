import { Button, VALUE_PLACEHOLDER } from '@nexg/ui';
import { Check } from 'lucide-react';
import Link from 'next/link';

/**
 * The "Get featured" block from the `Merchants` artboard — an inset ink card
 * (content width, 728px tall) rather than a full-bleed band.
 *
 * Every price and count is [—]: featured slots are not priced yet, and
 * `setting.homepage_featured_slots_per_city` is seeded null on purpose
 * (ground rule 3).
 */

const ASSURANCES = [
  'Always labelled Sponsored — guests know',
  'Weekly billing, pause or stop any time',
  'Views, taps and orders reported weekly',
  'Concierge picks stay unpaid and separate',
] as const;

const SLOTS = [
  {
    tag: 'Most visible',
    name: 'Homepage spot',
    body: 'Featured Merchants band on the homepage, in your city.',
    limit: `Only ${VALUE_PLACEHOLDER} slots per city`,
    highlight: true,
  },
  {
    tag: 'Sponsored slot',
    name: 'Category top',
    body: 'First result when guests browse your category in Explore.',
    limit: `Only ${VALUE_PLACEHOLDER} per category per city`,
    highlight: false,
  },
  {
    tag: 'Sponsored slot',
    name: 'Popular request',
    body: 'Your best-seller pinned in the Popular Requests strip.',
    limit: 'Limited per city',
    highlight: false,
  },
] as const;

export function FeaturedSlots() {
  return (
    <section id="featured" className="mx-auto max-w-[96rem] px-4 pb-14 sm:px-8 lg:px-16">
      <div className="bg-ink rounded-2xl px-6 py-10 text-white sm:px-10 sm:py-[4.6875rem]">
        <div className="grid gap-8 lg:grid-cols-[1fr_31rem] lg:items-start">
          <div>
            <span className="bg-gold text-ink inline-block rounded-full px-3 py-1.5 text-[0.6875rem] font-extrabold uppercase tracking-[0.12em]">
              Get featured
            </span>

            <h2 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.375rem]">
              Put your store on the <span className="text-gold">homepage.</span>
            </h2>

            <p className="mt-3 max-w-xl text-[0.9375rem] font-semibold leading-[1.7] text-white/60">
              Once you&apos;re live, you can buy a featured slot and be the first store guests see
              when they open NexG. Slots are limited per city, so every featured merchant actually
              gets seen.
            </p>

            <ul className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {ASSURANCES.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className="bg-gold text-ink mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                  >
                    <Check className="h-3 w-3" />
                  </span>
                  <span className="text-[0.8125rem] font-semibold leading-snug">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* How a featured slot looks on the homepage. Decorative: the copy
              beside it says the same thing. */}
          <div aria-hidden="true" className="bg-bg text-ink rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <p className="text-micro text-muted font-bold uppercase tracking-[0.12em]">
                Featured merchants · Homepage
              </p>
              <p className="text-muted-light text-[0.6875rem] font-semibold">Nairobi</p>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="border-gold bg-surface rounded-xl border-2 p-2.5">
                <div className="bg-bg flex h-16 items-center justify-center rounded-lg">
                  <span className="text-muted-light text-[0.625rem] uppercase tracking-widest">
                    Your cover photo
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[0.8125rem] font-extrabold">Your store here</span>
                  <span className="bg-ink rounded-full px-2 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide text-white">
                    Sponsored
                  </span>
                </div>
                <p className="text-muted-light mt-1 text-[0.6875rem] font-semibold">
                  [Category] · {VALUE_PLACEHOLDER} min
                </p>
              </div>

              <div className="border-border bg-bg/60 rounded-xl border p-2.5">
                <div className="bg-border/50 h-16 rounded-lg" />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-muted text-[0.8125rem] font-extrabold">[Merchant]</span>
                  <span className="bg-muted-light/70 rounded-full px-2 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide text-white">
                    Sponsored
                  </span>
                </div>
                <p className="text-muted-light mt-1 text-[0.6875rem] font-semibold">
                  [Category] · {VALUE_PLACEHOLDER} min
                </p>
              </div>
            </div>

            <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-snug">
              Shown to every guest who opens NexG in your city. Always labelled Sponsored — separate
              from Concierge picks, which can&apos;t be bought.
            </p>
          </div>
        </div>

        <ul className="mt-8 grid gap-4 lg:grid-cols-3">
          {SLOTS.map((slot) => (
            <li
              key={slot.name}
              className={
                slot.highlight
                  ? 'bg-gold text-ink rounded-2xl p-5'
                  : 'rounded-2xl border border-white/10 bg-white/[0.03] p-5'
              }
            >
              <span
                className={
                  slot.highlight
                    ? 'bg-ink text-gold inline-block rounded-full px-2.5 py-1 text-[0.5625rem] font-extrabold uppercase tracking-[0.12em]'
                    : 'inline-block rounded-full border border-white/25 px-2.5 py-1 text-[0.5625rem] font-extrabold uppercase tracking-[0.12em] text-white/70'
                }
              >
                {slot.tag}
              </span>

              <p className="mt-3 text-[1.0625rem] font-extrabold">{slot.name}</p>
              <p
                className={`mt-1.5 text-[0.8125rem] font-semibold leading-snug ${
                  slot.highlight ? 'text-ink/80' : 'text-white/55'
                }`}
              >
                {slot.body}
              </p>

              <p className="mt-4 text-[2rem] font-extrabold leading-none tracking-tight">
                KES {VALUE_PLACEHOLDER}
                <span className="ml-1 text-sm font-bold">/ week</span>
              </p>
              <p
                className={`mt-2 text-[0.75rem] font-semibold ${
                  slot.highlight ? 'text-ink/70' : 'text-white/45'
                }`}
              >
                {slot.limit}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button variant="gold" size="lg" asChild className="rounded-xl">
            <Link href="/help">Ask about featured placement</Link>
          </Button>
          <p className="text-[0.8125rem] font-semibold text-white/45">
            Available to live merchants in good standing.
          </p>
        </div>
      </div>
    </section>
  );
}
