import { Empty, Panel, Pill, clock, day, kes, plural } from '@/components/partner/bits';
import { requireMerchant } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Orders' };
export const dynamic = 'force-dynamic';

const TONE: Record<string, string> = {
  to_cook: 'bg-gold-soft text-gold-text',
  cooking: 'bg-info-bg text-info',
  you_are_late: 'bg-danger-bg text-danger',
  waiting_for_a_rider: 'bg-info-bg text-info',
  rider_coming: 'bg-info-bg text-info',
  on_the_way: 'bg-success-bg text-success',
  done: 'bg-success-bg text-success',
  closed: 'bg-bg text-muted-light',
};

const WORD: Record<string, string> = {
  to_cook: 'START IT',
  cooking: 'COOKING',
  you_are_late: 'YOU ARE LATE',
  waiting_for_a_rider: 'WAITING FOR A RIDER',
  rider_coming: 'RIDER COMING',
  on_the_way: 'ON THE WAY',
  done: 'DELIVERED',
  closed: 'CLOSED',
};

/**
 * Orders.
 *
 * The money column is what the merchant keeps, not what the guest
 * paid. Showing the guest's total as "your" number is how a weekly
 * statement comes as a shock.
 */
export default async function MerchantOrders({
  searchParams,
}: {
  searchParams?: { show?: string };
}) {
  const me = await requireMerchant();
  const show = searchParams?.show === 'all' ? 'all' : 'live';
  const supabase = createClient();

  let q = supabase
    .from('merchant_orders_v')
    .select('*')
    .eq('merchant_id', me.id)
    .order('placed_at', { ascending: false })
    .limit(200);

  if (show === 'live') q = q.not('what_now', 'in', '("done","closed")');

  const { data, error } = await q;
  const rows = (data as Row[] | null) ?? [];
  const kept = rows
    .filter((r) => r.what_now === 'done')
    .reduce((t, r) => t + (r.merchant_keeps_cents ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        {(['live', 'all'] as const).map((v) => (
          <a
            key={v}
            href={`/merchant/orders?show=${v}`}
            className={`rounded-full px-4 py-2 text-[0.8125rem] font-extrabold ${
              show === v
                ? 'bg-ink text-white'
                : 'border-border-strong bg-surface border'
            }`}
          >
            {v === 'live' ? 'On now' : 'Everything'}
          </a>
        ))}
      </div>

      {error && (
        <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-[0.8125rem] font-bold">
          Your orders could not be read: {error.message}
        </p>
      )}

      <Panel
        title={show === 'live' ? 'On now' : 'Every order'}
        note={
          rows.length > 0
            ? show === 'all'
              ? `${plural(rows.length, 'order')} · you kept ${kes(kept)} of the delivered ones`
              : plural(rows.length, 'order')
            : undefined
        }
      >
        {rows.length === 0 ? (
          <Empty
            title={show === 'live' ? 'Nothing on right now.' : 'No orders yet.'}
            body={
              show === 'live'
                ? 'New orders appear here the moment they are placed.'
                : 'Once guests start ordering, every one of them is listed here with what you kept.'
            }
          />
        ) : (
          <ul className="divide-border divide-y">
            {rows.map((o) => (
              <li key={o.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[0.875rem] font-extrabold">
                    {o.reference}
                    <span className="text-muted ml-2 font-semibold">
                      {o.item_count} {o.item_count === 1 ? 'item' : 'items'}
                      {o.store && ` · ${o.store}`}
                    </span>
                  </p>
                  <p className="text-muted-light truncate text-[0.75rem] font-semibold">
                    {day(o.placed_at)} {clock(o.placed_at)} · {o.dropoff_label ?? '[—]'}
                    {o.rider && ` · ${o.rider}`}
                  </p>
                  <p className="text-muted-light text-[0.75rem] font-semibold">
                    {o.payment_method === 'cash_on_delivery'
                      ? 'Pay on delivery'
                      : o.payment_method === 'mpesa_stk'
                        ? 'M-Pesa'
                        : o.payment_method}{' '}
                    · {o.payment_status}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <Pill tone={TONE[o.what_now]}>{WORD[o.what_now] ?? o.what_now}</Pill>
                  <p className="mt-1 text-[0.875rem] font-extrabold tabular-nums">
                    {kes(o.merchant_keeps_cents)}
                  </p>
                  <p className="text-muted-light text-[0.625rem] font-semibold">
                    you keep · guest paid {kes(o.total_cents)}
                  </p>
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
  what_now: string;
  store: string | null;
  dropoff_label: string | null;
  placed_at: string;
  rider: string | null;
  item_count: number;
  merchant_keeps_cents: number;
  total_cents: number;
  payment_method: string;
  payment_status: string;
}
