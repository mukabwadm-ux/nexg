import { Card } from '@nexg/ui';
import { Clock, UserRound, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
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

  /* The last word of the title carries the marker highlight, whatever the
     language: "experience." in English, "yako." in Kiswahili. */
  const title = t('xp.title');
  const split = title.lastIndexOf(' ');
  const titleLead = split > 0 ? title.slice(0, split) : '';
  const titleMark = split > 0 ? title.slice(split + 1) : title;

  return (
    <>
      <SiteHeader />

      <main>
        {/* ─────────────────────────────────────────────────── hero */}
        {/* Design B, "Cream Editorial": copy on the left, an arched
            photograph on the right, three promise cards underneath. */}
        <section className="mx-auto max-w-[96rem] px-4 pb-14 pt-12 sm:px-8 lg:px-16 lg:pt-16">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,55fr)_minmax(0,45fr)] lg:gap-12">
            <div className="min-w-0">
              <span className="inline-block rounded-full border border-[#E3CF95] bg-[#FBF3D6] px-3.5 py-1.5 text-xs font-bold tracking-[0.02em] text-[#86650D]">
                {t('xp.eyebrow')}
              </span>
              <h1 className="text-ink mt-6 max-w-[11ch] break-words text-[2.75rem] font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-[4rem] lg:text-[5rem]">
                {titleLead}
                {titleLead && ' '}
                <span className="bg-[linear-gradient(transparent_62%,#F2C94C_62%,#F2C94C_92%,transparent_92%)] box-decoration-clone">
                  {titleMark}
                </span>
              </h1>
              <p className="mt-6 max-w-[600px] text-base leading-[1.65] text-[#4A4436] sm:text-lg">
                {t('xp.body')}
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link
                  href="/experience/build"
                  className="bg-ink hover:bg-ink/90 focus-visible:outline-gold-text inline-flex items-center justify-center gap-2 rounded-full px-7 py-[17px] text-base font-bold text-white transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px]"
                >
                  {t('xp.build')}
                  <span aria-hidden="true">→</span>
                </Link>
                <Link
                  href="/help#concierge"
                  className="text-ink hover:border-ink focus-visible:outline-gold-text inline-flex items-center justify-center rounded-full border border-[#E1D9C6] bg-white px-7 py-[17px] text-base font-bold transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px]"
                >
                  {t('xp.orTell')}
                </Link>
              </div>
            </div>

            {/* The arch. On a phone the note card drops below the photo
                instead of covering it. It repeats the "One concierge"
                card, so assistive technology skips it. */}
            <div className="relative mx-auto w-full max-w-[420px] lg:mx-0 lg:ml-auto lg:max-w-[520px]">
              <div className="relative h-[300px] overflow-hidden rounded-b-[28px] rounded-t-[160px] shadow-[0_30px_60px_rgba(60,40,10,.25)] sm:h-[460px] sm:rounded-t-[210px] lg:h-[560px] lg:rounded-t-[260px]">
                <Image
                  src="/images/hero/stay-sunset.jpg"
                  alt="A guest relaxing on a rooftop terrace above the city at sunset"
                  fill
                  priority
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 420px, 520px"
                  className="object-cover object-[67%_center]"
                />
              </div>
              <div
                aria-hidden="true"
                className="mt-4 flex items-start gap-3 rounded-2xl bg-white p-4 shadow-[0_16px_40px_rgba(60,40,10,.16)] sm:absolute sm:-left-8 sm:bottom-8 sm:mt-0 sm:max-w-[280px]"
              >
                <span className="bg-ink text-gold flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                  <UserRound className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="text-ink block text-sm font-extrabold">
                    {t('xp.tile.concierge')}
                  </span>
                  <span className="mt-1 block text-[0.8125rem] font-semibold leading-[1.5] text-[#6A6350]">
                    {t('xp.tile.concierge.body')}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/*
           * Three facts about how it works, not three statistics. The
           * artboard's tiles carry figures; none of them exist yet, and a
           * made-up "2,000 days booked" on a service that has booked none
           * is the worst thing this page could say (ground rule 3).
           */}
          <ul className="mt-14 grid gap-5 md:grid-cols-3">
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
              <li
                key={tile.title}
                className="h-full rounded-[20px] border border-t-4 border-[#ECE5D3] border-t-[#E8B422] bg-white p-6 shadow-[0_10px_30px_rgba(60,40,10,.07)]"
              >
                <span
                  aria-hidden="true"
                  className="bg-ink text-gold flex h-11 w-11 items-center justify-center rounded-xl"
                >
                  <tile.icon className="h-5 w-5" />
                </span>
                <p className="text-ink mt-4 text-lg font-bold">{tile.title}</p>
                <p className="mt-1.5 text-[0.84375rem] font-medium leading-[1.65] text-[#6A6350]">
                  {tile.body}
                </p>
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
