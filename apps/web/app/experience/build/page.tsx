import type { Metadata } from 'next';

import { Builder } from '@/components/experience/builder';
import type { EventCard, MoodChip } from '@/components/experience/types';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { getCityPreference } from '@/lib/i18n';
import { createPublicClient } from '@/lib/supabase/public';

export const metadata: Metadata = {
  title: 'Build my day',
  description:
    'Pick how long, how much and who. Tap the moods you want and watch the day arrange itself against your budget.',
};

/*
 * The catalogue is the same for everyone, but the city it is read for
 * comes from the visitor's own cookie, so this cannot be shared across
 * them. Their plan is loaded in the browser against their session.
 */
export const dynamic = 'force-dynamic';

export default async function BuildPage({
  searchParams,
}: {
  searchParams?: { event?: string; from?: string; city?: string };
}) {
  const supabase = createPublicClient();
  const slug = searchParams?.city ?? getCityPreference() ?? 'nairobi';

  const { data: city } = await supabase
    .from('city')
    .select('id, name')
    .eq('slug', slug)
    .maybeSingle();

  if (!city) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-8">
          <h1 className="text-3xl font-extrabold tracking-tight">We are not there yet.</h1>
          <p className="text-muted mt-3 text-[0.9375rem] leading-[1.8]">
            Experiences run in the cities where we have concierges on the ground. Tell us where you
            are and we will say when.
          </p>
        </main>
        <SiteFooter />
      </>
    );
  }

  const [{ data: chips }, { data: events }, { data: settings }] = await Promise.all([
    supabase.rpc('fn_mood_chips', { p_city_id: city.id }),
    supabase
      .from('event_public')
      .select('*')
      .eq('city_id', city.id)
      .order('starts_at')
      .limit(8),
    supabase
      .from('setting')
      .select('key, value')
      .in('key', [
        'experience_budget_min_kes',
        'experience_budget_max_kes',
        'experience_first_reply_min',
      ]),
  ]);

  const setting = Object.fromEntries(
    ((settings ?? []) as { key: string; value: unknown }[]).map((s) => [s.key, s.value]),
  );
  const num = (key: string, fallback: number | null) => {
    const raw = setting[key];
    return raw === null || raw === undefined ? fallback : Number(raw);
  };

  return (
    <>
      <SiteHeader />
      <Builder
        chips={(chips as MoodChip[] | null) ?? []}
        events={(events as EventCard[] | null) ?? []}
        budgetMin={num('experience_budget_min_kes', 5000)!}
        budgetMax={num('experience_budget_max_kes', 150000)!}
        /*
         * Null until there are paid days to take a median of. The builder
         * renders [—] rather than a plausible range, because the hint
         * under a budget slider is the most persuasive number on the page
         * and inventing it would steer what people spend (ground rule 3).
         */
        medianHint={null}
        replyMinutes={num('experience_first_reply_min', null)}
        preselectEvent={searchParams?.event ?? null}
        preselectCuratedDay={searchParams?.from ?? null}
      />
      <SiteFooter />
    </>
  );
}
