import type { Metadata } from 'next';

import { PopularCategories } from '@/components/home/popular-categories';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { categoryTiles } from '@/lib/categories';
import { getTranslations } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'All categories',
  description: 'Everything NexG brings to your door, by category — from the merchants near you.',
};

/**
 * All categories.
 *
 * A holding page so the homepage's "All categories" link lands somewhere
 * real: the same tiles, each opening Explore near the visitor. To be
 * rebuilt from its own design, and to grow with the merchant catalogue.
 */
export default async function CategoriesPage() {
  const { t } = await getTranslations();

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-[96rem] px-4 py-14 sm:px-8 lg:px-16 lg:py-20">
        <PopularCategories
          heading={t('home.popular.all')}
          sub={t('home.popular.sub')}
          items={categoryTiles(t)}
          layout="grid"
        />
      </main>
      <SiteFooter />
    </>
  );
}
