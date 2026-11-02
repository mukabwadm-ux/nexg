import { OnboardingProvider } from '@/components/onboarding/store';
import type { CategoryConfig, Draft, Readiness } from '@/components/onboarding/types';
import { createClient } from '@/lib/supabase/server';
import { getCategoryById, MERCHANT_TAXONOMY } from '@nexg/contracts';

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

  const [{ data: configuredCategories, error: categoryError }, { data: drafts }] =
    await Promise.all([
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

  const databaseCategories = (configuredCategories as CategoryConfig[] | null) ?? [];
  const categories: CategoryConfig[] = MERCHANT_TAXONOMY.map((taxonomyCategory) => {
    const configured = databaseCategories.find(
      (category) => category.category === taxonomyCategory.id,
    );
    const legacy = databaseCategories.find(
      (category) => getCategoryById(category.category)?.id === taxonomyCategory.id,
    );
    const requirements = configured?.questions.length ? configured : (legacy ?? configured);
    const badgeRules = configured?.badge_rules;

    return {
      category: taxonomyCategory.id,
      label: taxonomyCategory.name,
      icon: taxonomyCategory.icon,
      color: taxonomyCategory.color,
      bg: taxonomyCategory.bg,
      description: taxonomyCategory.desc,
      card_kind: taxonomyCategory.cardKind,
      eta_style: taxonomyCategory.etaStyle,
      questions: requirements?.questions ?? [],
      subcategories: taxonomyCategory.subcategories,
      badge_rules:
        badgeRules && Object.keys(badgeRules).length > 0
          ? badgeRules
          : (legacy?.badge_rules ?? badgeRules ?? {}),
      featured_eligible: configured?.featured_eligible ?? legacy?.featured_eligible ?? true,
      requires_ops_mapping:
        configured?.requires_ops_mapping ?? legacy?.requires_ops_mapping ?? false,
      sort: taxonomyCategory.sort,
    };
  });

  const configuredCategoryIds = new Set(databaseCategories.map((category) => category.category));
  const taxonomyIsIncomplete =
    !!categoryError ||
    MERCHANT_TAXONOMY.some((category) => !configuredCategoryIds.has(category.id));
  const categoryNotice = categoryError
    ? 'We could not load the category setup. The full category list is shown, but some choices may not save yet.'
    : taxonomyIsIncomplete
      ? 'The full category list is shown. Some category-specific setup may not be available until the business category catalogue is updated.'
      : null;

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
      categories={categories}
      categoryNotice={categoryNotice}
    >
      {children}
    </OnboardingProvider>
  );
}
