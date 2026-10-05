import { maps as mapsCapability } from '@nexg/ui/capabilities';

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

  const maps = mapsCapability();

  const [{ data, error }, { data: zones }, { data: home }] = await Promise.all([
    supabase
      .from('merchant_branch')
      .select(
        'id, name, address_text, latitude, longitude, zone_id, is_primary, closed_at, closed_reason, sort',
      )
      .eq('merchant_id', me.id)
      .order('sort'),
    supabase.from('zone').select('id, name').eq('active', true),
    supabase.from('merchant_home_v').select('city_id').eq('merchant_id', me.id).maybeSingle(),
  ]);

  const rows = (data as StoreRow[] | null) ?? [];

  /*
   * Where a new pin starts: their existing main store if they have
   * one, otherwise the middle of their city. A map that opens over
   * the Atlantic makes somebody pan across a continent before they
   * can do anything.
   */
  const main = rows.find((r) => r.is_primary && r.latitude !== null);
  const cityId = (home as { city_id: string } | null)?.city_id ?? null;
  const { data: bounds } = cityId
    ? await supabase.from('city_bounds_v').select('*').eq('city_id', cityId).maybeSingle()
    : { data: null };
  const box = bounds as { north: number; south: number; east: number; west: number } | null;

  const centre =
    main?.latitude !== undefined && main?.latitude !== null && main.longitude !== null
      ? { lat: main.latitude, lng: main.longitude }
      : box
        ? { lat: (box.north + box.south) / 2, lng: (box.east + box.west) / 2 }
        : { lat: -1.2864, lng: 36.8172 };
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
        maps={maps}
        cityCentre={centre}
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
