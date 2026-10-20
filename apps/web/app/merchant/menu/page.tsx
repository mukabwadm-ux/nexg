import { PageHead } from '@/components/merchant/frame';
import { Menu, type ItemRow, type SectionRow } from '@/components/partner/merchant-menu';
import { requireMerchant } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Menu' };
export const dynamic = 'force-dynamic';

/**
 * The menu.
 *
 * Merchants set and change their own prices here. Checkout reads the price
 * from the same row, so an edit is live for the next order.
 */
export default async function MerchantMenu() {
  const me = await requireMerchant();
  const supabase = createClient();

  const [{ data, error }, { data: sectionData }] = await Promise.all([
    supabase
      .from('catalogue_item')
      .select('id, name, description, price_kes, available, age_restricted, sort')
      .eq('merchant_id', me.id)
      .order('sort'),
    supabase.from('catalogue_section').select('id, name').eq('merchant_id', me.id).order('sort'),
  ]);

  const items = (data as ItemRow[] | null) ?? [];
  const sections = (sectionData as SectionRow[] | null) ?? [];
  const on = items.filter((i) => i.available);

  return (
    <div className="space-y-5 px-4 py-7 sm:px-6 lg:px-8">
      <PageHead
        title="Catalogue"
        lead="Everything guests can order from you. Set your own prices, add items, and switch things off when they run out; changes are live for the next order."
      />
      {error && (
        <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-[0.8125rem] font-bold">
          Your menu could not be read: {error.message}
        </p>
      )}
      <Menu items={items} available={on.length} merchantId={me.id} sections={sections} />
    </div>
  );
}
