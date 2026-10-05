import { Empty, Panel, kesWhole, plural } from '@/components/partner/bits';
import { Menu, type ItemRow } from '@/components/partner/merchant-menu';
import { requireMerchant } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Menu' };
export const dynamic = 'force-dynamic';

/**
 * The menu.
 *
 * Switching something off is the move a kitchen makes twenty times
 * a week and the one worth making instant. Adding and pricing is
 * slower, more deliberate work, and it stays where the onboarding
 * flow already does it well — a second half-built editor here
 * would be a second place for a price to be wrong.
 */
export default async function MerchantMenu() {
  const me = await requireMerchant();
  const supabase = createClient();

  const { data, error } = await supabase
    .from('catalogue_item')
    .select('id, name, description, price_kes, available, age_restricted, sort')
    .eq('merchant_id', me.id)
    .order('sort');

  const items = (data as ItemRow[] | null) ?? [];
  const on = items.filter((i) => i.available);

  return (
    <div className="space-y-5">
      {error && (
        <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-[0.8125rem] font-bold">
          Your menu could not be read: {error.message}
        </p>
      )}

      {items.length === 0 ? (
        <Panel title="Your menu">
          <Empty
            title="Nothing on the menu yet."
            body="Guests cannot order until there are at least five things here. Add them in your registration and they appear on this page."
          />
        </Panel>
      ) : (
        <Menu items={items} available={on.length} />
      )}

      <Panel title="Prices and new items">
        <p className="text-muted text-[0.8125rem] font-semibold">
          Changing a price or adding something new goes through your registration, where the
          category questions and the price band are set together.{' '}
          {plural(items.length, 'item')} on file, {on.length} of them orderable right now —{' '}
          {kesWhole(Math.min(...items.map((i) => i.price_kes)))} to{' '}
          {kesWhole(Math.max(...items.map((i) => i.price_kes)))}.
        </p>
        <a
          href="/merchants/apply"
          className="bg-ink mt-3 inline-block rounded-lg px-3 py-2 text-[0.75rem] font-extrabold text-white"
        >
          Open your registration
        </a>
      </Panel>
    </div>
  );
}
