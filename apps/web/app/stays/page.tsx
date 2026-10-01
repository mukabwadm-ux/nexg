import { Card } from '@nexg/ui';
import type { Metadata } from 'next';

import { PropertyCard, type PropertyCardRow } from '@/components/stays/listing';
import { TailorForm } from '@/components/stays/tailor-form';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { createPublicClient } from '@/lib/supabase/public';

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
        {/* ───────────────────────────────────────────── hero */}
        <section
          id="tailor"
          className="mx-auto grid max-w-[96rem] gap-10 px-4 pb-14 pt-10 sm:px-8 lg:grid-cols-[1fr_34rem] lg:items-start lg:gap-14 lg:px-16 lg:pt-16"
        >
          <div className="lg:pt-6">
            <p className="border-border-strong bg-surface inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.6875rem] font-extrabold">
              <span aria-hidden="true" className="bg-gold h-1.5 w-1.5 rounded-full" />
              Stays with a concierge already set up
            </p>

            <h1 className="mt-5 text-[2.5rem] font-extrabold leading-[1.08] tracking-[-0.02em] sm:text-[3.25rem]">
              Tell us what you need. We&rsquo;ll find the <span className="text-gold-text">place</span>.
            </h1>

            <p className="text-muted mt-5 max-w-[34rem] text-[0.9375rem] font-semibold leading-[1.8]">
              Every place here comes with a NexG concierge: food, laundry, a charger at midnight,
              an airport run at five. Browse what&rsquo;s listed, or describe the stay and a
              person comes back with two or three that actually fit.
            </p>

            <ul className="mt-7 grid gap-3 sm:grid-cols-3">
              {[
                { title: 'A person, not a filter', body: 'Somebody reads your request and picks.' },
                {
                  title: 'Concierge included',
                  body: 'Deliveries follow the host’s rule, not a guess.',
                },
                { title: 'Nothing to pay to ask', body: 'No account, no card, no obligation.' },
              ].map((item) => (
                <li key={item.title}>
                  <p className="text-[0.8125rem] font-extrabold">{item.title}</p>
                  <p className="text-muted-light mt-1 text-[0.75rem] font-semibold leading-snug">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <TailorForm areas={areas} />
        </section>

        {/* ─────────────────────────────────────────── listings */}
        <section className="mx-auto max-w-[96rem] px-4 pb-16 sm:px-8 lg:px-16">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-muted-light text-[0.6875rem] font-extrabold uppercase tracking-[0.14em]">
                Listed now
              </p>
              <h2 className="mt-2 text-[1.75rem] font-extrabold tracking-[-0.02em] sm:text-[2rem]">
                {rows.length === 0
                  ? 'Nothing listed yet.'
                  : `${rows.length} ${rows.length === 1 ? 'place' : 'places'}, each with its units.`}
              </h2>
            </div>
            {rows.length > 0 && (
              <p className="text-muted-light max-w-[26rem] text-[0.75rem] font-semibold leading-relaxed">
                Open one to see the individual flats, what each sleeps and what it costs.
              </p>
            )}
          </div>

          {rows.length === 0 ? (
            <Card className="mt-6 p-8 text-center">
              <p className="text-[0.9375rem] font-extrabold">No places are listed yet.</p>
              <p className="text-muted mx-auto mt-2 max-w-[32rem] text-[0.8125rem] font-semibold leading-[1.8]">
                We only list a property once the host is verified and the hand-off rule is set, so
                this page stays empty rather than showing you somewhere nobody can actually let
                you in. Leave a request above and we will go and find you one.
              </p>
            </Card>
          ) : (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {rows.map((p) => (
                <PropertyCard key={p.id} property={p} />
              ))}
            </div>
          )}
        </section>

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
                <li key={title} className="border-white/15 border-t pt-4">
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
