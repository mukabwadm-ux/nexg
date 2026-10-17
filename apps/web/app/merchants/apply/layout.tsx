import { OnboardingProvider } from '@/components/onboarding/store';
import type { CategoryConfig, Draft, Readiness } from '@/components/onboarding/types';
import { createClient } from '@/lib/supabase/server';
import { MERCHANT_TAXONOMY } from '@nexg/contracts';

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

  const [{ data: categories, error: categoryError }, { data: drafts }] = await Promise.all([
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
  const configuredCategories = (categories ?? []) as unknown as CategoryConfig[];
  const categoryIds = new Set(configuredCategories.map((category) => category.category));
  const taxonomyIds = new Set(MERCHANT_TAXONOMY.map((category) => category.id));
  const hasUpdatedCategories = configuredCategories.some((category) =>
    taxonomyIds.has(category.category),
  );
  const categoryNotice = categoryError
    ? 'Business types could not be loaded. Refresh this page; if the problem continues, contact our team.'
    : configuredCategories.length === 0
      ? 'No business types are available right now. Please refresh this page or contact our team.'
      : MERCHANT_TAXONOMY.some((category) => !categoryIds.has(category.id))
        ? 'Some newer business types are not available yet. Choose a listed type or contact our team for help.'
        : null;
  const availableCategories = hasUpdatedCategories
    ? configuredCategories.filter(
        (category) => taxonomyIds.has(category.category) || category.category === draft?.category,
      )
    : configuredCategories;
  const categoryConfigs: CategoryConfig[] = availableCategories.map((category) => {
    const taxonomy = MERCHANT_TAXONOMY.find((item) => item.id === category.category);
    return {
      ...category,
      ...(taxonomy
        ? {
            icon: taxonomy.icon,
            card_kind: taxonomy.cardKind,
            eta_style: taxonomy.etaStyle,
            color: taxonomy.color,
            bg: taxonomy.bg,
            description: taxonomy.desc,
            subcategories: taxonomy.subcategories,
          }
        : {}),
    };
  });

  let readiness: Readiness | null = null;
  if (draft) {
    const { data } = await supabase.rpc('fn_merchant_readiness', { p_merchant_id: draft.id });
    readiness = (data as Readiness | null) ?? null;
  }

  return (
    <OnboardingProvider
      initialDraft={draft}
      initialReadiness={readiness}
      categories={categoryConfigs}
      categoryNotice={categoryNotice}
    >
      {children}
    </OnboardingProvider>
  );
}
