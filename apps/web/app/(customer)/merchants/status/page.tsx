import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { OnboardingProvider } from '@/components/onboarding/store';
import { StatusStep, type CallSlot, type StatusFacts } from '@/components/onboarding/step-status';
import type { CategoryConfig, Draft, Readiness } from '@/components/onboarding/types';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Your NexG registration',
  description: 'Where your application has got to, and what is left to do.',
};

export const dynamic = 'force-dynamic';

export default async function StatusPage() {
  const supabase = createClient();

  const { data: merchant } = await supabase
    .from('merchant')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!merchant) redirect('/merchants/apply/start');
  const draft = merchant as Draft;

  const [
    { data: categories },
    { data: readiness },
    { data: requirements },
    { data: documents },
    { data: chases },
    { count: itemCount },
    { count: branchCount },
    { data: callTimes },
  ] = await Promise.all([
    supabase
      .from('category_config')
      .select(
        'category, label, icon, card_kind, eta_style, questions, badge_rules, featured_eligible, requires_ops_mapping, sort',
      )
      .order('sort'),
    supabase.rpc('fn_merchant_readiness', { p_merchant_id: draft.id }),
    supabase.rpc('fn_merchant_required_docs', { p_merchant_id: draft.id }),
    supabase
      .from('document')
      .select('requirement_id, status, rejection_reason')
      .eq('owner_type', 'merchant')
      .eq('owner_id', draft.id),
    supabase
      .from('document_request')
      .select('id')
      .eq('owner_type', 'merchant')
      .eq('owner_id', draft.id)
      .is('fulfilled_document_id', null),
    supabase
      .from('catalogue_item')
      .select('id', { count: 'exact', head: true })
      .eq('merchant_id', draft.id),
    supabase
      .from('merchant_branch')
      .select('id', { count: 'exact', head: true })
      .eq('merchant_id', draft.id),
    supabase.from('setting').select('value').eq('key', 'onboarding_call_times').maybeSingle(),
  ]);

  const reqs = (requirements as { id: string; label: string }[] | null) ?? [];
  const docs =
    (documents as
      | { requirement_id: string; status: string; rejection_reason: string | null }[]
      | null) ?? [];
  const byRequirement = new Map(docs.map((d) => [d.requirement_id, d]));

  const facts: StatusFacts = {
    /* The short reference a merchant reads out on the phone. */
    reference: `NX-M-${draft.id.slice(0, 6)}`,
    outstandingDocs: reqs.filter((r) => {
      const doc = byRequirement.get(r.id);
      return !doc || doc.status === 'rejected';
    }).length,
    pendingChases: ((chases as unknown[] | null) ?? []).length,
    itemCount: itemCount ?? 0,
    branchCount: branchCount ?? 0,
    hasCover: !!draft.cover_photo_path,
    rejected: reqs
      .filter((r) => byRequirement.get(r.id)?.status === 'rejected')
      .map((r) => ({
        label: r.label,
        reason: byRequirement.get(r.id)?.rejection_reason ?? null,
      })),
  };

  return (
    <>
      <SiteHeader
        signIn={{ label: 'Merchant sign in', href: '/merchants/sign-in' }}
        action={{ label: 'Help', href: '/help' }}
      />
      <OnboardingProvider
        initialDraft={draft}
        initialReadiness={(readiness as Readiness | null) ?? null}
        categories={(categories as CategoryConfig[] | null) ?? []}
      >
        <StatusStep
          slots={nextCallSlots((callTimes?.value as string[] | null) ?? [])}
          facts={facts}
        />
      </OnboardingProvider>
      <SiteFooter />
    </>
  );
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * The next two working days at the times the merchant team keeps open.
 *
 * A pattern rather than a calendar, because there is no calendar to read yet
 * and inventing four fixed appointments would mean promising slots nobody is
 * holding. The team confirms the time on the call, which the screen says.
 *
 * Nairobi is UTC+3 year round, so the offset is a constant.
 */
function nextCallSlots(times: string[]): CallSlot[] {
  if (times.length === 0) return [];

  const slots: CallSlot[] = [];
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000);

  for (let ahead = 1; ahead <= 7 && slots.length < 4; ahead += 1) {
    const day = new Date(now.getTime() + ahead * 24 * 60 * 60 * 1000);
    const dow = day.getUTCDay();
    if (dow === 0 || dow === 6) continue;

    for (const time of times) {
      if (slots.length >= 4) break;
      const [hh, mm] = time.split(':');
      const at = Date.UTC(
        day.getUTCFullYear(),
        day.getUTCMonth(),
        day.getUTCDate(),
        Number(hh) - 3,
        Number(mm ?? 0),
      );
      slots.push({
        iso: new Date(at).toISOString(),
        label: `${WEEKDAY[dow]} ${time}`,
      });
    }
  }

  return slots;
}
