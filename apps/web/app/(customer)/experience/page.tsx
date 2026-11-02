import { Card } from '@nexg/ui';
import { Clock, UserRound, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import type { CuratedDay, EventCard } from '@/components/experience/types';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { getCityPreference, getTranslations } from '@/lib/i18n';
import { createPublicClient } from '@/lib/supabase/public';

export const metadata: Metadata = {
  title: 'Customize your experience',
  description:
    'Pick how long, how much and who. Tap the moods you want and watch a day arrange itself against your budget. A concierge confirms every booking before you pay once.',
};

/*
 * Cookies decide the language and the city, so this cannot be cached
 * across visitors. The catalogue underneath is still cheap.
 */
export const dynamic = 'force-dynamic';

/**
 * Customize Your Experience · the front door.
 *
 * The X1 artboard was not supplied with this build, so this follows the
 * prose spec and the visual language of the rest of the site rather than
 * guessing at a layout. What it will not do is invent numbers: the three
 * promise tiles state facts about how the service works, not figures,
 * and the curated-day and event sections show what is actually published
 * — which in a city with no partners signed yet is nothing, said plainly.
 */
export default async function ExperienceHome({
  searchParams,
}: {
  searchParams?: { city?: string };
}) {
  const supabase = createPublicClient();
  const { t } = await getTranslations();

  /* A city in the URL beats the one we detected, which beats the default:
     a link somebody was sent is a stronger signal than where they are. */
  const slug = searchParams?.city ?? getCityPreference() ?? 'nairobi';

  const { data: city } = await supabase
    .from('city')
    .select('id, name')
    .eq('slug', slug)
    .maybeSingle();

  const [{ data: days }, { data: events }] = city
    ? await Promise.all([
        supabase
          .from('curated_day_public')
          .select('*')
          .eq('city_id', city.id)
          .order('featured', { ascending: false })
          .order('sort')
          .limit(6),
        supabase
          .from('event_public')
          .select('*')
          .eq('city_id', city.id)
          .order('featured', { ascending: false })
          .order('starts_at')
          .limit(6),
      ])
    : [{ data: null }, { data: null }];

  const curated = (days as CuratedDay[] | null) ?? [];
  const upcoming = (events as EventCard[] | null) ?? [];
  const where = city?.name ?? 'your city';

  return (
    <>
      <SiteHeader />

      <main>
        {/* ─────────────────────────────────────────────────── hero */}
        <section className="mx-auto max-w-[96rem] px-4 pb-12 pt-14 sm:px-8 lg:px-16">
          <span className="border-gold/40 text-gold-text inline-block rounded-full border px-3 py-1 text-[0.6875rem] font-extrabold">
            {t('xp.eyebrow')}
          </span>
          <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl">
            {t('xp.title')}
          </h1>
          <p className="text-muted mt-5 max-w-2xl text-base leading-[1.9] sm:text-lg">
            {t('xp.body')}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/experience/build"
              className="bg-ink hover:bg-ink/90 inline-flex h-12 items-center gap-2 rounded-lg px-6 text-base font-bold text-white transition-colors"
            >
              {t('xp.build')}
              <span aria-hidden="true" className="text-gold">
                →
              </span>
            </Link>
            <Link
              href="/help#concierge"
              className="border-border-strong bg-surface text-ink hover:border-ink inline-flex h-12 items-center rounded-lg border px-6 text-base font-bold transition-colors"
            >
              {t('xp.orTell')}
            </Link>
          </div>

          {/*
           * Three facts about how it works, not three statistics. The
           * artboard's tiles carry figures; none of them exist yet, and a
           * made-up "2,000 days booked" on a service that has booked none
           * is the worst thing this page could say (ground rule 3).
           */}
          <ul className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: Wallet,
                title: t('xp.tile.budget'),
                body: t('xp.tile.budget.body'),
              },
              {
                icon: UserRound,
                title: t('xp.tile.concierge'),
                body: t('xp.tile.concierge.body'),
              },
              {
                icon: Clock,
                title: t('xp.tile.pay'),
                body: t('xp.tile.pay.body'),
              },
            ].map((tile) => (
              <li key={tile.title}>
                <Card className="h-full p-5">
                  <span
                    aria-hidden="true"
                    className="bg-ink text-gold flex h-10 w-10 items-center justify-center rounded-xl"
                  >
                    <tile.icon className="h-4 w-4" />
                  </span>
                  <p className="mt-4 text-[0.9375rem] font-extrabold">{tile.title}</p>
                  <p className="text-muted-light mt-1.5 text-[0.8125rem] font-semibold leading-[1.7]">
                    {tile.body}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        {/* ──────────────────────────────────────────── curated days */}
        <section className="mx-auto max-w-[96rem] px-4 pb-14 sm:px-8 lg:px-16">
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            {t('xp.curated.heading', { city: where })}
          </h2>

          {curated.length === 0 ? (
            <Card tone="muted" className="mt-5 p-6">
              <p className="text-muted text-[0.9375rem] leading-[1.8]">
                {t('xp.curated.empty', { city: where })}
              </p>
            </Card>
          ) : (
            <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {curated.map((day) => (
                <li key={day.id}>
                  <Link href={`/experience/build?from=${day.slug}`} className="group block h-full">
                    <Card className="group-hover:border-border-strong h-full p-5 transition-colors">
                      {day.badge && (
                        <span className="bg-gold-soft text-gold-text inline-block rounded-full px-2.5 py-1 text-[0.5625rem] font-extrabold uppercase tracking-wide">
                          {day.badge}
                        </span>
                      )}
                      <p className="mt-3 text-lg font-extrabold tracking-tight">{day.title}</p>
                      <p className="text-muted mt-1.5 text-[0.8125rem] font-semibold leading-[1.7]">
                        {day.tagline}
                      </p>
                      <p className="border-border mt-4 border-t pt-3 text-[0.8125rem] font-extrabold">
                        {t('xp.curated.from')}{' '}
                        {day.price_per_person_kes === null
                          ? 'KES [—]'
                          : `KES ${day.price_per_person_kes.toLocaleString('en-KE')}`}
                        <span className="text-muted-light ml-1 font-semibold">
                          {t('xp.curated.perPerson')}
                        </span>
                      </p>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ───────────────────────────────────────────────── events */}
        <section className="mx-auto max-w-[96rem] px-4 pb-20 sm:px-8 lg:px-16">
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            {t('xp.events.heading', { city: where })}
          </h2>

          {upcoming.length === 0 ? (
            <Card tone="muted" className="mt-5 p-6">
              <p className="text-muted text-[0.9375rem] leading-[1.8]">{t('xp.events.empty')}</p>
            </Card>
          ) : (
            <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((event) => {
                const when = new Date(event.starts_at);
                return (
                  <li key={event.id}>
                    <Link
                      href={`/experience/build?event=${event.id}`}
                      className="group block h-full"
                    >
                      <Card className="group-hover:border-border-strong h-full p-5 transition-colors">
                        <span className="flex items-start gap-3">
                          <span
                            aria-hidden="true"
                            className="bg-ink flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl text-white"
                          >
                            <span className="text-base font-extrabold leading-none">
                              {when.toLocaleDateString('en-GB', { day: 'numeric' })}
                            </span>
                            <span className="text-gold text-[0.5625rem] font-extrabold uppercase">
                              {when.toLocaleDateString('en-GB', { month: 'short' })}
                            </span>
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[0.9375rem] font-extrabold leading-snug">
                              {event.name}
                            </span>
                            <span className="text-muted-light block text-[0.75rem] font-semibold">
                              {event.venue_name ?? ''}
                              {event.venue_address ? ` · ${event.venue_address}` : ''}
                            </span>
                          </span>
                        </span>

                        {event.practical_note && (
                          <p className="text-muted mt-3 text-[0.75rem] font-semibold leading-[1.7]">
                            {event.practical_note}
                          </p>
                        )}

                        <p className="border-border text-muted-light mt-3 border-t pt-3 text-[0.6875rem] font-semibold leading-[1.6]">
                          {event.nexg_can_hold_tickets
                            ? t('xp.events.held')
                            : t('xp.events.organiser')}
                        </p>
                        <p className="text-gold-text mt-2 text-[0.8125rem] font-extrabold">
                          {t('xp.events.buildAround')}
                        </p>
                      </Card>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="text-muted-light mt-6 text-xs font-semibold leading-[1.7]">
            {t('xp.events.noMarkup')}
          </p>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
