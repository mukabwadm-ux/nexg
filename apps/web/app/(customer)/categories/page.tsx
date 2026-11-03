import type { Metadata } from 'next';

import { CategoryExplorer } from '@/components/categories/category-explorer';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { createPublicClient } from '@/lib/supabase/public';

export const metadata: Metadata = {
  title: 'All Categories · NexG',
  description: 'Browse all categories and services across Nairobi on NexG.',
};
export const dynamic = 'force-dynamic';

/**
 * All categories explorer.
 */
export default async function CategoriesPage() {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from('category_config')
    .select(
      'category, label, description, icon, card_kind, sort, color, image_path, subcategories',
    )
    .eq('is_active', true)
    .order('sort')
    .order('label');
  if (error) {
    throw new Error(`Could not load categories: ${error.message}`);
  }

  const categories = (data ?? []).map((category) => ({
    id: category.category,
    name: category.label,
    desc: category.description ?? '',
    icon: category.icon,
    cardKind: category.card_kind,
    sort: category.sort,
    color: category.color,
    imageUrl: category.image_path
      ? supabase.storage.from('category-images').getPublicUrl(category.image_path).data.publicUrl
      : null,
    subcategories: Array.isArray(category.subcategories)
      ? category.subcategories.flatMap((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
          const subcategory = item as Record<string, unknown>;
          if (typeof subcategory.id !== 'string' || typeof subcategory.name !== 'string') return [];
          return [
            {
              id: subcategory.id,
              name: subcategory.name,
              fields: Array.isArray(subcategory.fields)
                ? subcategory.fields.filter((field): field is string => typeof field === 'string')
                : [],
              fulfillmentHint:
                typeof subcategory.fulfillmentHint === 'string'
                  ? subcategory.fulfillmentHint
                  : '',
            },
          ];
        })
      : [],
  }));

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-[96rem] px-4 py-12 sm:px-8 lg:px-16 lg:py-16">
        <CategoryExplorer categories={categories} />
      </main>
      <SiteFooter />
    </>
  );
}
