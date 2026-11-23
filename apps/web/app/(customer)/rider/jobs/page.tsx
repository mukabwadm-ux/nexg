import { DASH, Pill, clock, day, kesWhole, plural } from '@/components/partner/bits';
import { riderContext } from '@/components/rider/frame';
import { OffersBoard, type RiderOffer } from '@/components/rider/offers';
import { Nothing, PageHead, PanelTitle, PillTabs, RiderPage, panel } from '@/components/rider/ui';

export const metadata = { title: 'Jobs' };
export const dynamic = 'force-dynamic';

const TONE: Record<string, string> = {
  to_the_merchant: 'bg-gold-soft text-gold-text',
  to_the_guest: 'bg-info-bg text-info',
  done: 'bg-success-bg text-success',
  closed: 'bg-bg text-muted-light',
};

const WORD: Record<string, string> = {
  to_the_merchant: 'TO THE MERCHANT',
  to_the_guest: 'TO THE GUEST',
  done: 'DELIVERED',
  closed: 'CLOSED',
};

/**
 * Jobs: the offers waiting on this rider, with Accept and a map, then
 * the trips they are on and have run.
 *
 * What was collected in cash is its own line, separate from what was
 * earned. On a cash order those are two different numbers and confusing
 * them is how a rider's float goes wrong.
 */
export default async function RiderJobs({ searchParams }: { searchParams?: { show?: string } }) {
  const { me, supabase, h, active } = await riderContext();
  const show = searchParams?.show === 'all' ? 'all' : 'live';

  let q = supabase
    .from('rider_jobs_v')
    .select('*')
    .eq('rider_id', me.id)
    .order('placed_at', { ascending: false })
    .limit(200);
  if (show === 'live') q = q.not('what_now', 'in', '("done","closed")');

  const [{ data, error }, offersRead] = await Promise.all([
    q,
    active ? supabase.rpc('rpc_rider_offers', {}) : Promise.resolve(null),
  ]);
  const rows = (data as Row[] | null) ?? [];
  const offerData = (offersRead?.data ?? null) as {
    rider?: { lat: number; lng: number } | null;
    offers?: RiderOffer[];
  } | null;
  /* Before 20270224000100 is in the database the function is missing;
     the page still shows the trips. */
  const offersMissing = !!offersRead?.error;

  return (
    <RiderPage>
      <PageHead title="Available Jobs" lead="Find and accept nearby jobs" />

      {!active ? (
        <section className={panel}>
          <Nothing
            title="Jobs open once you are active."
            body="Finish your setup and rider ops will activate you. Then offers show here."
          />
        </section>
      ) : offersMissing ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-[13px] font-bold text-amber-800">
          Offers are not shown on the web yet. Answer them in the rider app.
        </p>
      ) : (
        <OffersBoard
          offers={offerData?.offers ?? []}
          online={h?.presence === 'online'}
          rider={offerData?.rider ?? null}
          maps={{
            key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
            mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_ID ?? '',
          }}
        />
      )}

      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-3 py-2 text-[13px] font-bold text-red-700"
        >
          Your trips could not be read: {error.message}
        </p>
      ) : null}

      <section className={panel}>
        <PanelTitle
          title={show === 'live' ? 'Your trips on now' : 'Every trip'}
          note={rows.length > 0 ? plural(rows.length, 'trip') : undefined}
        >
          <PillTabs
            label="Which trips"
            items={[
              { href: '/rider/jobs?show=live', label: 'On now', on: show === 'live' },
              { href: '/rider/jobs?show=all', label: 'Everything', on: show === 'all' },
            ]}
          />
        </PanelTitle>
        {rows.length === 0 ? (
          <Nothing
            title={show === 'live' ? 'Nothing on right now.' : 'No trips yet.'}
            body={
              show === 'live'
                ? 'Once you accept an offer it appears here.'
                : 'Every delivery you make is listed here with what you earned on it.'
            }
          />
        ) : (
          <ul className="divide-y divide-[#eef0f6]">
            {rows.map((j) => (
              <li key={j.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-extrabold">{j.reference}</p>
                  <p className="truncate text-[13px] font-semibold text-slate-600">
                    {j.merchant ?? DASH} → {j.dropoff ?? DASH}
                  </p>
                  <p className="truncate text-[12px] font-semibold text-slate-500">
                    {day(j.placed_at)} {clock(j.placed_at)}
                    {j.delivered_at && ` · delivered ${clock(j.delivered_at)}`}
                    {j.handed_to && ` · handed to ${j.handed_to.replace(/_/g, ' ')}`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <Pill tone={TONE[j.what_now]}>{WORD[j.what_now] ?? j.what_now}</Pill>
                  <p className="mt-1 text-[14px] font-extrabold tabular-nums">
                    {j.earned_cents ? kesWhole(j.earned_cents / 100) : `KES ${DASH}`}
                  </p>
                  {j.collect_cents !== null && (
                    <p className="text-[11px] font-bold text-amber-700">
                      collect {kesWhole(j.collect_cents / 100)} cash
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </RiderPage>
  );
}

interface Row {
  id: string;
  reference: string;
  merchant: string | null;
  dropoff: string | null;
  placed_at: string;
  delivered_at: string | null;
  handed_to: string | null;
  what_now: string;
  earned_cents: number | null;
  collect_cents: number | null;
}
