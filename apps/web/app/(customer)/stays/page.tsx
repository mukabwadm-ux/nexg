import type { Metadata } from 'next';
import Image from 'next/image';

import { PropertyCard, type PropertyCardRow } from '@/components/stays/listing';
import midnight from '@/components/stays/midnight.module.css';
import { TailorForm } from '@/components/stays/tailor-form';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { createPublicClient } from '@/lib/supabase/public';
import sunset from '@/public/images/hero/stay-sunset.jpg';

export const metadata: Metadata = {
  title: 'Stays with a concierge',
  description:
    'Apartments, cottages and townhouses in Nairobi, each with a NexG concierge already set up. Tell us what you need and a person comes back with two or three that fit.',
};

export const dynamic = 'force-dynamic';

/**
 * The guest side of the Airbnb module.
 *
 * Two ways in, because people arrive in two moods: browse what is
 * listed, or describe what you need and let somebody come back. The
 * second is the one NexG is actually good at, so it gets the hero.
 */
export default async function StaysPage() {
  const supabase = createPublicClient();

  const { data: properties } = await supabase
    .from('property_public')
    .select('*')
    .order('from_rate_kes', { nullsFirst: false });

  const rows = (properties as PropertyCardRow[] | null) ?? [];
  const areas = [...new Set(rows.map((p) => p.area).filter(Boolean))] as string[];

  return (
    <>
      <SiteHeader
        action={{ label: 'Find me a place', href: '#tailor' }}
        signIn={{ label: 'List your Airbnb', href: '/hosts' }}
      />

      <main id="main">
        {/*
         * Design A, "Midnight Hero". One dark ground for the hero and the
         * listings: the homepage's sunset photograph on the right, fading
         * to black on the left where the copy sits, and into solid black
         * at the bottom so the cards sit on a clean background.
         */}
        <div className="relative isolate overflow-hidden bg-[#0B0906] text-white">
          <div className="relative isolate">
            <div aria-hidden="true" className="absolute inset-0 -z-10">
              <div className={`absolute inset-0 ${midnight.photo}`}>
                <Image
                  src={sunset}
                  alt=""
                  fill
                  priority
                  placeholder="blur"
                  sizes="100vw"
                  className="object-cover object-[70%_30%]"
                />
                <div className="absolute inset-0 bg-black/30" />
              </div>
              <div className={`absolute inset-0 ${midnight.glow}`} />
              <div className={`absolute inset-0 ${midnight.fade}`} />
            </div>

            {/* ───────────────────────────────────────────── hero */}
            <section
              id="tailor"
              className="mx-auto grid max-w-[96rem] gap-10 px-4 pb-16 pt-10 sm:px-8 lg:grid-cols-[minmax(0,660px)_minmax(0,540px)] lg:items-start lg:justify-between lg:gap-14 lg:px-16 lg:pt-20"
            >
              <div className="lg:pt-4">
                <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-[0.78125rem] font-bold text-white">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#E8B422]" />
                  Stays with a concierge already set up
                </p>

                <h1 className="mt-6 text-[2.5rem] font-extrabold leading-[1.04] tracking-[-0.03em] text-white sm:text-[3.5rem] lg:text-[4.375rem]">
                  Tell us what you need. We&rsquo;ll find the{' '}
                  <span className="text-[#E8B422]">place</span>.
                </h1>

                <p className="mt-6 max-w-[600px] text-[1.0625rem] leading-[1.65] text-white/[0.78]">
                  Every place here comes with a NexG concierge: food, laundry, a charger at
                  midnight, an airport run at five. Browse what&rsquo;s listed, or describe the stay
                  and a person comes back with two or three that actually fit.
                </p>

                <ul className="mt-9 grid gap-5 sm:grid-cols-3">
                  {[
                    {
                      title: 'A person, not a filter',
                      body: 'Somebody reads your request and picks.',
                    },
                    {
                      title: 'Concierge included',
                      body: 'Deliveries follow the host’s rule, not a guess.',
                    },
                    { title: 'Nothing to pay to ask', body: 'No account, no card, no obligation.' },
                  ].map((item) => (
                    <li key={item.title}>
                      <p className="text-sm font-bold text-white">{item.title}</p>
                      <p className="mt-1 text-[0.8125rem] leading-snug text-white/70">
                        {item.body}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mx-auto w-full max-w-[560px] lg:mx-0 lg:max-w-none">
                <TailorForm areas={areas} tone="midnight" />
              </div>
            </section>
          </div>

          {/* ─────────────────────────────────────────── listings */}
          <section className="mx-auto max-w-[96rem] px-4 pb-20 sm:px-8 lg:px-16">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[0.75rem] font-extrabold uppercase tracking-[0.14em] text-white/65">
                  Listed now
                </p>
                <h2 className="mt-2 text-[1.875rem] font-extrabold tracking-[-0.02em] text-white sm:text-[2.375rem]">
                  {rows.length === 0
                    ? 'Nothing listed yet.'
                    : `${rows.length} ${rows.length === 1 ? 'place' : 'places'}, each with its units.`}
                </h2>
              </div>
              {rows.length > 0 && (
                <p className="max-w-[26rem] text-[0.8125rem] font-semibold leading-relaxed text-white/70 sm:text-right">
                  Open one to see the individual flats, what each sleeps and what it costs.
                </p>
              )}
            </div>

            {rows.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-white/15 bg-white/[0.06] p-8 text-center">
                <p className="text-[0.9375rem] font-extrabold text-white">
                  No places are listed yet.
                </p>
                <p className="mx-auto mt-2 max-w-[32rem] text-[0.8125rem] font-semibold leading-[1.8] text-white/75">
                  We only list a property once the host is verified and the hand-off rule is set, so
                  this page stays empty rather than showing you somewhere nobody can actually let
                  you in. Leave a request above and we will go and find you one.
                </p>
              </div>
            ) : (
              <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {rows.map((p) => (
                  <PropertyCard key={p.id} property={p} tone="midnight" />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ─────────────────────────────────────── how this works */}
        <section className="bg-ink py-14 text-white">
          <div className="mx-auto max-w-[96rem] px-4 sm:px-8 lg:px-16">
            <h2 className="text-[1.75rem] font-extrabold tracking-[-0.02em] sm:text-[2rem]">
              What happens after you ask.
            </h2>
            <ol className="mt-7 grid gap-5 sm:grid-cols-3">
              {[
                [
                  'You describe the stay',
                  'Dates, how many of you, the area, and the two or three things that would make a place wrong.',
                ],
                [
                  'A person picks',
                  'Not a search. Somebody who knows these buildings picks two or three and writes down why.',
                ],
                [
                  'You choose, we set it up',
                  'Once you pick, the concierge is already arranged — the hand-off rule, the delivery hours, the lot.',
                ],
              ].map(([title, body], i) => (
                <li key={title} className="border-t border-white/15 pt-4">
                  <span
                    aria-hidden="true"
                    className="bg-gold text-ink flex h-7 w-7 items-center justify-center rounded-full text-[0.75rem] font-extrabold"
                  >
                    {i + 1}
                  </span>
                  <p className="mt-3 text-[1rem] font-extrabold">{title}</p>
                  <p className="mt-1.5 text-[0.8125rem] font-semibold leading-[1.75] text-white/70">
                    {body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
