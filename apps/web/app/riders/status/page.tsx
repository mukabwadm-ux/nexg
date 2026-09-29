import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { RiderOnboardingProvider } from '@/components/rider-onboarding/store';
import { RiderStatusStep, type RiderStatusFacts } from '@/components/rider-onboarding/step-status';
import type { CityOption, RiderDraft, RiderReadiness } from '@/components/rider-onboarding/types';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Your NexG rider application',
  description: 'Where your application has got to, and what is left to do.',
};

export const dynamic = 'force-dynamic';

export default async function RiderStatusPage() {
  const supabase = createClient();

  const { data: row } = await supabase
    .from('rider')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) redirect('/riders/apply/start');
  const draft = row as unknown as RiderDraft;

  const [
    { data: cities },
    { data: readiness },
    { data: requirements },
    { data: documents },
    { data: chases },
    { data: slot },
  ] = await Promise.all([
    supabase.from('city').select('id, name, slug, status').order('sort'),
    supabase.rpc('fn_rider_readiness', { p_rider_id: draft.id }),
    supabase.rpc('fn_rider_required_docs', { p_rider_id: draft.id }),
    supabase
      .from('document')
      .select('requirement_id, side, status, rejection_reason')
      .eq('owner_type', 'rider')
      .eq('owner_id', draft.id)
      .is('superseded_at', null),
    supabase
      .from('document_request')
      .select('requirement_id')
      .eq('owner_type', 'rider')
      .eq('owner_id', draft.id)
      .is('fulfilled_document_id', null),
    draft.onboarding_slot_id
      ? supabase
          .from('onboarding_slot')
          .select('hub_name, starts_at')
          .eq('id', draft.onboarding_slot_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const reqs = (requirements as { id: string; kind: string; label: string }[] | null) ?? [];
  const docs =
    (documents as
      | {
          requirement_id: string;
          side: string | null;
          status: string;
          rejection_reason: string | null;
        }[]
      | null) ?? [];
  const chased = new Set(
    ((chases as { requirement_id: string }[] | null) ?? []).map((c) => c.requirement_id),
  );

  /* An ID counts only with both sides; everything else with one photo. */
  const satisfied = (req: { id: string; kind: string }) =>
    req.kind === 'national_id'
      ? new Set(docs.filter((d) => d.requirement_id === req.id && d.side).map((d) => d.side))
          .size >= 2
      : docs.some((d) => d.requirement_id === req.id);

  const facts: RiderStatusFacts = {
    reference: `NX-R-${draft.id.slice(0, 6)}`,
    outstanding: reqs.filter((r) => !satisfied(r)).length,
    pendingChases: reqs.filter((r) => chased.has(r.id)).map((r) => ({ label: r.label })),
    rejected: reqs
      .filter((r) => docs.some((d) => d.requirement_id === r.id && d.status === 'rejected'))
      .map((r) => ({
        label: r.label,
        reason:
          docs.find((d) => d.requirement_id === r.id && d.status === 'rejected')
            ?.rejection_reason ?? null,
      })),
    slot: slot
      ? {
          hub: (slot as { hub_name: string }).hub_name,
          startsAt: (slot as { starts_at: string }).starts_at,
        }
      : null,
  };

  return (
    <>
      <SiteHeader
        signIn={{ label: 'Rider sign in', href: '/riders/sign-in' }}
        action={{ label: 'Help', href: '/help' }}
      />
      <RiderOnboardingProvider
        initialDraft={draft}
        initialReadiness={(readiness as unknown as RiderReadiness | null) ?? null}
        cities={(cities as CityOption[] | null) ?? []}
        areas={[]}
      >
        <RiderStatusStep facts={facts} />
      </RiderOnboardingProvider>
      <SiteFooter />
    </>
  );
}
