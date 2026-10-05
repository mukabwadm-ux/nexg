import { DASH, Panel, Pill } from '@/components/partner/bits';
import { RiderProfile } from '@/components/partner/rider-profile';
import { requireRider } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

import type { RiderHome } from '../layout';

export const metadata = { title: 'You' };
export const dynamic = 'force-dynamic';

/**
 * You.
 *
 * Areas, shifts and the furthest you ride. The last one has teeth —
 * the dispatch cascade reads it to decide whether to offer a job at
 * all — so the page says so rather than letting a rider widen it
 * and wonder why the evening changed.
 */
export default async function RiderProfilePage() {
  const me = await requireRider();
  const supabase = createClient();

  const [{ data: home }, { data: zones }] = await Promise.all([
    supabase.from('rider_home_v').select('*').eq('rider_id', me.id).maybeSingle(),
    supabase.from('zone').select('name').eq('active', true).order('name'),
  ]);

  const r = home as RiderHome | null;
  if (!r) {
    return (
      <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-[0.8125rem] font-bold">
        We could not load your account.
      </p>
    );
  }

  const areaOptions = [
    ...new Set([
      ...((zones as { name: string }[] | null) ?? []).map((z) => z.name),
      ...(r.areas ?? []),
    ]),
  ].sort();

  return (
    <div className="space-y-5">
      <Panel title="Your ride">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Fact label="Vehicle" value={r.vehicle ?? DASH} />
          <Fact label="Plate" value={r.plate_no ?? DASH} />
          <Fact label="City" value={r.city} />
          <Fact label="Paid to" value={r.payout_msisdn ?? DASH} />
        </dl>
        <p className="text-muted-light mt-3 text-[0.75rem] font-semibold">
          Changing your bike, your plate or where you are paid needs a person — they are checked
          against your documents. Message us and it is a quick call.
        </p>
      </Panel>

      <Panel title="What you are cleared to carry">
        <div className="flex flex-wrap gap-2">
          <Pill tone={r.alcohol_eligible ? 'bg-success-bg text-success' : 'bg-bg text-muted-light'}>
            {r.alcohol_eligible ? 'ALCOHOL · CLEARED' : 'ALCOHOL · NOT CLEARED'}
          </Pill>
          <Pill
            tone={r.large_items_eligible ? 'bg-success-bg text-success' : 'bg-bg text-muted-light'}
          >
            {r.large_items_eligible ? 'LARGE ITEMS · CLEARED' : 'LARGE ITEMS · NOT CLEARED'}
          </Pill>
        </div>
        <p className="text-muted mt-2 text-[0.8125rem] font-semibold">
          These decide which jobs reach you at all. They are ours to set, not yours — an alcohol run
          is a licensing matter and a large-item run is a question of what fits on the bike.
        </p>
      </Panel>

      <RiderProfile
        riderId={me.id}
        areas={r.areas ?? []}
        shifts={r.shifts ?? []}
        maxKm={r.bike_max_km}
        areaOptions={areaOptions}
      />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-[0.08em]">
        {label}
      </dt>
      <dd className="text-[0.9375rem] font-extrabold capitalize">{value}</dd>
    </div>
  );
}
