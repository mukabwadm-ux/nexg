import { RiderOnboardingProvider } from '@/components/rider-onboarding/store';
import type { CityOption, RiderDraft, RiderReadiness } from '@/components/rider-onboarding/types';
import { createClient } from '@/lib/supabase/server';

/**
 * Hydrates the rider draft once, on the server, for every step under /apply.
 *
 * Row-level security does the finding: `select * from rider` returns only
 * the application this session owns, so there is no id in the URL to tamper
 * with. A visitor with no session sees no draft, which is right — step 1
 * makes one.
 */
export const dynamic = 'force-dynamic';

export default async function RiderApplyLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();

  const [{ data: cities }, { data: drafts }] = await Promise.all([
    supabase.from('city').select('id, name, slug, status').order('sort'),
    supabase
      .from('rider')
      .select('*')
      .is('submitted_at', null)
      .order('updated_at', { ascending: false })
      .limit(1),
  ]);

  const draft = (drafts?.[0] as unknown as RiderDraft | undefined) ?? null;

  let readiness: RiderReadiness | null = null;
  /* The areas a rider can claim to know are the zones we actually deliver
     from, in their own city — not a list typed into the component. */
  let areas: string[] = [];

  if (draft) {
    const [{ data: r }, { data: zones }] = await Promise.all([
      supabase.rpc('fn_rider_readiness', { p_rider_id: draft.id }),
      draft.city_id
        ? supabase.from('zone_bounds').select('name').eq('city_id', draft.city_id).order('name')
        : Promise.resolve({ data: null }),
    ]);
    readiness = (r as unknown as RiderReadiness | null) ?? null;
    areas = ((zones as { name: string }[] | null) ?? []).map((z) => z.name);
  }

  return (
    <RiderOnboardingProvider
      initialDraft={draft}
      initialReadiness={readiness}
      cities={(cities as CityOption[] | null) ?? []}
      areas={areas}
    >
      {children}
    </RiderOnboardingProvider>
  );
}
