import { DASH, Empty, Panel, Pill, clock, day, kesWhole, plural } from '@/components/partner/bits';
import { RiderPageHead } from '@/components/rider/frame';
import { requireRider } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Trips' };
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
 * Trips.
 *
 * What was collected in cash is its own line, separate from what
 * was earned. On a cash order those are two different numbers and
 * confusing them is how a rider's float goes wrong.
 */
export default async function RiderJobs({ searchParams }: { searchParams?: { show?: string } }) {
  const me = await requireRider();
  const show = searchParams?.show === 'all' ? 'all' : 'live';
  const supabase = createClient();

  let q = supabase
    .from('rider_jobs_v')
    .select('*')
    .eq('rider_id', me.id)
    .order('placed_at', { ascending: false })
    .limit(200);
  if (show === 'live') q = q.not('what_now', 'in', '("done","closed")');

  const { data, error } = await q;
  const rows = (data as Row[] | null) ?? [];

  return (
    <div className="space-y-5 px-4 py-7 sm:px-6 lg:px-8">
      <RiderPageHead
        title="Jobs"
        lead="Offers waiting on you and the trips you have run. Accept within the countdown; the guest and the merchant are told the moment you do."
      />
      <div className="flex gap-2">
        {(['live', 'all'] as const).map((v) => (
          <a
            key={v}
            href={`/rider/jobs?show=${v}`}
            className={`rounded-full px-4 py-2 text-[0.8125rem] font-extrabold ${
              show === v ? 'bg-ink text-white' : 'border-border-strong bg-surface border'
            }`}
          >
            {v === 'live' ? 'On now' : 'Everything'}
          </a>
        ))}
      </div>

      {error && (
        <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-[0.8125rem] font-bold">
          Your trips could not be read: {error.message}
        </p>
      )}

      <Panel
        title={show === 'live' ? 'On now' : 'Every trip'}
        note={rows.length > 0 ? plural(rows.length, 'trip') : undefined}
      >
        {rows.length === 0 ? (
          <Empty
            title={show === 'live' ? 'Nothing on right now.' : 'No trips yet.'}
            body={
              show === 'live'
                ? 'Offers arrive in the rider app. Once you accept one it appears here.'
                : 'Every delivery you make is listed here with what you earned on it.'
            }
          />
        ) : (
          <ul className="divide-border divide-y">
            {rows.map((j) => (
              <li key={j.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[0.875rem] font-extrabold">{j.reference}</p>
                  <p className="text-muted truncate text-[0.8125rem] font-semibold">
                    {j.merchant ?? DASH} → {j.dropoff ?? DASH}
                  </p>
                  <p className="text-muted-light truncate text-[0.75rem] font-semibold">
                    {day(j.placed_at)} {clock(j.placed_at)}
                    {j.delivered_at && ` · delivered ${clock(j.delivered_at)}`}
                    {j.handed_to && ` · handed to ${j.handed_to.replace(/_/g, ' ')}`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <Pill tone={TONE[j.what_now]}>{WORD[j.what_now] ?? j.what_now}</Pill>
                  <p className="mt-1 text-[0.875rem] font-extrabold tabular-nums">
                    {j.earned_cents ? kesWhole(j.earned_cents / 100) : `KES ${DASH}`}
                  </p>
                  {j.collect_cents !== null && (
                    <p className="text-gold-text text-[0.625rem] font-bold">
                      collect {kesWhole(j.collect_cents / 100)} cash
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
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
