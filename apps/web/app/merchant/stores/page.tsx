import { Empty, Panel } from '@/components/partner/bits';
import { Stores, type StoreRow } from '@/components/partner/merchant-stores';
import { requireMerchant } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Stores' };
export const dynamic = 'force-dynamic';

/**
 * Stores.
 *
 * A merchant who opens a second branch should not have to email
 * anybody. But a store NexG cannot deliver from is worse than no
 * store, so the address is checked against the delivery map before
 * it is saved, and a refusal says what to do about it rather than
 * just saying no.
 */
export default async function StoresPage() {
  const me = await requireMerchant();
  const supabase = createClient();

  const [{ data, error }, { data: zones }] = await Promise.all([
    supabase
      .from('merchant_branch')
      .select(
        'id, name, address_text, latitude, longitude, zone_id, is_primary, closed_at, closed_reason, sort',
      )
      .eq('merchant_id', me.id)
      .order('sort'),
    supabase.from('zone').select('id, name').eq('active', true),
  ]);

  const rows = (data as StoreRow[] | null) ?? [];
  const open = rows.filter((r) => !r.closed_at);
  const closed = rows.filter((r) => r.closed_at);
  const zoneNames = new Map(
    ((zones as { id: string; name: string }[] | null) ?? []).map((z) => [z.id, z.name]),
  );

  return (
    <div className="space-y-5">
      {error && (
        <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-[0.8125rem] font-bold">
          Your stores could not be read, so this page is incomplete: {error.message}
        </p>
      )}

      <Stores
        merchantId={me.id}
        stores={open.map((s) => ({
          ...s,
          zone_name: s.zone_id ? (zoneNames.get(s.zone_id) ?? null) : null,
        }))}
      />

      {closed.length > 0 && (
        <Panel title="Closed" note={`${closed.length} kept on file`}>
          <ul className="divide-border divide-y">
            {closed.map((s) => (
              <li key={s.id} className="py-2.5">
                <p className="text-[0.875rem] font-bold line-through opacity-60">{s.name}</p>
                <p className="text-muted-light text-[0.75rem] font-semibold">
                  {s.closed_reason ?? 'Closed'}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-muted-light mt-3 text-[0.75rem] font-semibold">
            A closed store keeps its record, because orders were delivered from it and your
            statements refer to it. Nothing is deleted.
          </p>
        </Panel>
      )}

      {open.length === 0 && !error && (
        <Empty
          title="No stores on file."
          body="That should not be possible once you are registered. Message us and we will look at it."
        />
      )}
    </div>
  );
}
