import { OnboardingProvider } from '@/components/onboarding/store';
import type { CategoryConfig, Draft, Readiness } from '@/components/onboarding/types';
import { createClient } from '@/lib/supabase/server';

/**
 * Hydrates the draft once, on the server, for every step under /apply.
 *
 * Row-level security does the finding: `select * from merchant` returns only
 * the drafts this session owns, so there is no id in the URL to tamper with
 * and no lookup by phone number to guess at. A visitor with no session sees
 * no draft, which is exactly right — step 1 makes one.
 */
export const dynamic = 'force-dynamic';

export default async function ApplyLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();

  const [{ data: categories }, { data: drafts }] = await Promise.all([
    supabase
      .from('category_config')
      .select(
        'category, label, icon, card_kind, eta_style, questions, badge_rules, featured_eligible, requires_ops_mapping, sort',
      )
      .neq('category', 'gift_shop')
      .order('sort'),
    supabase
      .from('merchant')
      .select('*')
      .is('submitted_at', null)
      .order('updated_at', { ascending: false })
      .limit(1),
  ]);

  const draft = (drafts?.[0] as Draft | undefined) ?? null;

  let readiness: Readiness | null = null;
  if (draft) {
    const { data } = await supabase.rpc('fn_merchant_readiness', { p_merchant_id: draft.id });
    readiness = (data as Readiness | null) ?? null;
  }

  return (
    <OnboardingProvider
      initialDraft={draft}
      initialReadiness={readiness}
      categories={(categories as CategoryConfig[] | null) ?? []}
    >
      {children}
    </OnboardingProvider>
  );
}
