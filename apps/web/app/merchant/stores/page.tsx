import { maps as mapsCapability } from '@nexg/ui/capabilities';

import { AddBranch, OpenBranch, type BranchRow } from '@/components/merchant/branch-client';
import { Empty, Panel } from '@/components/partner/bits';
import { Stores, type StoreRow } from '@/components/partner/merchant-stores';
import { PageHead } from '@/components/merchant/frame';
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
   * The branch list, from the view that knows what each one has
   * actually been doing. The query above reads `merchant_branch`
   * directly because the map component wants the raw columns;
   * this reads the view because a card shows orders and prep
   * time, which the table does not carry.
   */
  const { data: detail } = await supabase
    .from('merchant_branch_list_v')
    .select('*')
    .eq('merchant_id', me.id)
    .order('is_primary', { ascending: false })
    .order('name');
  const branches = (detail as BranchRow[] | null) ?? [];

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
    <div className="space-y-5 px-4 py-7 sm:px-6 lg:px-8">
      <PageHead
        title="Branches"
        lead="Each branch has its own hours, catalogue overrides, counter device and readiness, and goes live on its own."
      />
      {error && (
        <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-[0.8125rem] font-bold">
          Your stores could not be read, so this page is incomplete: {error.message}
        </p>
      )}

      {/*
        Branch cards, as the board draws them: what each one is
        doing today, and a way in. The map component below is
        still how a new pin gets placed — this is the layer that
        was missing, which is everything about a branch that is
        not its coordinates.
      */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[1.0625rem] font-extrabold tracking-tight">Your branches</h2>
            <p className="text-muted-light text-[0.75rem] font-semibold">
              {branches.length} branch{branches.length === 1 ? '' : 'es'} ·{' '}
              {branches.filter((b) => b.state === 'live').length} live
            </p>
          </div>
          <AddBranch merchantId={me.id} />
        </div>

        {branches.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {branches.map((b) => (
              <article
                key={b.id}
                className="border-border bg-surface overflow-hidden rounded-xl border"
              >
                <div className="bg-ink relative flex h-24 items-end p-3">
                  <span className="absolute inset-0 bg-gradient-to-br from-white/[0.07] to-transparent" />
                  <span className="absolute right-2.5 top-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${
                        b.state === 'live'
                          ? 'bg-success/10 text-success'
                          : b.state === 'paused'
                            ? 'bg-warning-bg text-warning'
                            : 'bg-white/15 text-white'
                      }`}
                    >
                      {b.state === 'live'
                        ? 'Open · accepting'
                        : b.state === 'paused'
                          ? 'Paused'
                          : b.state === 'closed'
                            ? 'Closed'
                            : 'Setup in progress'}
                    </span>
                  </span>
                  <div className="relative">
                    <h3 className="text-[1rem] font-extrabold tracking-tight text-white">
                      {b.name}
                      {b.is_primary ? (
                        <span className="text-gold ml-1.5 text-[0.625rem] font-extrabold uppercase">
                          main
                        </span>
                      ) : null}
                    </h3>
                    <p className="text-[0.6875rem] font-semibold text-white/60">
                      {b.address_text ?? 'Address not set'}
                    </p>
                  </div>
                </div>
                <div className="text-muted-light flex flex-wrap gap-x-3 gap-y-1 px-3 py-2.5 text-[0.6875rem] font-extrabold uppercase tracking-wide">
                  <span>{b.orders_today} today</span>
                  <span>
                    {b.prep_avg_minutes === null ? 'prep —' : `prep ${b.prep_avg_minutes} min`}
                  </span>
                  <span>{b.zone_name ?? 'no zone'}</span>
                </div>
                <div className="border-border border-t px-3 py-2.5">
                  <OpenBranch merchantId={me.id} branch={b} />
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

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
