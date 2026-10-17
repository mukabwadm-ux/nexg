import type { Metadata } from 'next';

import { CategoryExplorer } from '@/components/categories/category-explorer';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

export const metadata: Metadata = {
  title: 'Merchant Verticals & Categories · NexG',
  description: 'Browse all 21 categories and 128 subcategories across Nairobi on NexG.',
};

/**
 * All categories explorer.
 */
export default function CategoriesPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-[96rem] px-4 py-12 sm:px-8 lg:px-16 lg:py-16">
        <CategoryExplorer />
      </main>
      <SiteFooter />
    </>
  );
}
