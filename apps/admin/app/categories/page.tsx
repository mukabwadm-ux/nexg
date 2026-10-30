import type { Metadata } from 'next';

import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { CategoryManager } from '@/components/categories/category-manager';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Categories' };
export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  const staff = await requireStaff();
  requireModule(staff, 'categories');
  const supabase = createClient();

  const [{ data: categories, error: categoriesError }, { data: requirements, error: docsError }] =
    await Promise.all([
      supabase.from('category_config').select('*').order('sort').order('label'),
      supabase
        .from('document_requirement')
        .select('kind, label')
        .eq('owner_type', 'merchant')
        .eq('required', true)
        .order('sort'),
    ]);

  if (categoriesError) {
    throw new Error(`Could not load category configuration: ${categoriesError.message}`);
  }
  if (docsError) {
    throw new Error(`Could not load merchant document requirements: ${docsError.message}`);
  }

  return (
    <ConsoleShell staff={staff} current="/categories">
      <ConsoleHeader
        title="Categories"
        breadcrumb={`${categories.length} configured · changes apply to new and in-progress applications`}
      />
      <main className="px-4 py-6 sm:px-8">
        <CategoryManager categories={categories} requirements={requirements ?? []} />
      </main>
    </ConsoleShell>
  );
}
