import { Empty, Panel, Pill, day, kes, kesWhole } from '@/components/partner/bits';
import { PageHead } from '@/components/merchant/frame';
import { requireMerchant } from '@/lib/partner';
import { createClient } from '@/lib/supabase/server';

import type { MerchantHome } from '../layout';

export const metadata = { title: 'Money' };
export const dynamic = 'force-dynamic';

const TONE: Record<string, string> = {
  paid: 'bg-success-bg text-success',
  sent: 'bg-info-bg text-info',
  ready: 'bg-gold-soft text-gold-text',
  draft: 'bg-bg text-muted-light',
  disputed: 'bg-danger-bg text-danger',
};

/**
 * Money.
 *
 * A statement reads as a subtraction, in the order it happens:
 * what guests paid, what NexG took, what is left. A merchant who
 * cannot follow that arithmetic on the page will not trust the
 * number at the bottom.
 */
export default async function MerchantMoney() {
  const me = await requireMerchant();
  const supabase = createClient();

  const [{ data: home }, { data: statements, error }] = await Promise.all([
    supabase.from('merchant_home_v').select('*').eq('merchant_id', me.id).maybeSingle(),
    supabase
      .from('merchant_statement')
      .select('*')
      .eq('merchant_id', me.id)
      .order('period_end', { ascending: false })
      .limit(26),
  ]);

  const m = home as MerchantHome | null;
  const rows = (statements as Row[] | null) ?? [];

  return (
    <div className="space-y-5 px-4 py-7 sm:px-6 lg:px-8">
      <PageHead
        title="Money"
        lead="Statements, payouts, fees and refunds, all from Finance; nothing here is computed on this page."
      />
      <Panel title="Where we pay you">
        {m?.payout_rail ? (
          <p className="text-[0.875rem] font-semibold">
            {m.payout_rail === 'mpesa_paybill'
              ? 'M-Pesa paybill'
              : m.payout_rail === 'mpesa_till'
                ? 'M-Pesa till'
                : 'Bank transfer'}{' '}
            · settled weekly.
          </p>
        ) : (
          <p className="text-danger text-[0.875rem] font-bold">
            No payout account on file. Nothing can be paid out until there is one.
          </p>
        )}
        <p className="text-muted-light mt-1 text-[0.75rem] font-semibold">
          Changing where money goes is a conversation rather than a form — message us and we will
          verify it properly.
        </p>
      </Panel>

      {error && (
        <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-[0.8125rem] font-bold">
          Your statements could not be read: {error.message}
        </p>
      )}

      <Panel title="Statements" note={rows.length > 0 ? 'Weekly, Monday to Sunday' : undefined}>
        {rows.length === 0 ? (
          <Empty
            title="No statements yet."
            body="The first one lands at the end of your first full week of trading."
          />
        ) : (
          <ul className="divide-border divide-y">
            {rows.map((s) => (
              <li key={s.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[0.875rem] font-extrabold">
                    {day(s.period_start)} – {day(s.period_end)}
                  </p>
                  <Pill tone={TONE[s.status]}>{s.status.toUpperCase()}</Pill>
                </div>
                <dl className="mt-1.5 space-y-0.5">
                  <Line label="Guests paid" value={kesWhole(s.gross_kes)} />
                  <Line label="Our commission" value={`− ${kesWhole(s.commission_kes)}`} muted />
                  {s.adjustments_kes !== 0 && (
                    <Line label="Adjustments" value={kesWhole(s.adjustments_kes)} muted />
                  )}
                  {s.penalties_kes !== 0 && (
                    <Line label="Penalties" value={`− ${kesWhole(s.penalties_kes)}`} muted />
                  )}
                  {s.tax_withheld_kes !== 0 && (
                    <Line label="Tax withheld" value={`− ${kesWhole(s.tax_withheld_kes)}`} muted />
                  )}
                  <Line label="To you" value={kesWhole(s.net_kes)} strong />
                </dl>
                {s.status === 'paid' && s.paid_at && (
                  <p className="text-success mt-1 text-[0.75rem] font-bold">
                    Paid {day(s.paid_at)}
                    {s.provider_ref && ` · ${s.provider_ref}`}
                  </p>
                )}
                {s.status === 'sent' && (
                  <p className="text-muted mt-1 text-[0.75rem] font-semibold">
                    With you to check. If something looks wrong, say so before it is paid.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Today">
        <p className="text-2xl font-extrabold tracking-tight">{kes(m?.earned_today_cents ?? 0)}</p>
        <p className="text-muted mt-0.5 text-[0.8125rem] font-semibold">
          Kept on delivered orders so far today, after commission. It lands in a statement at the
          end of the week.
        </p>
      </Panel>
    </div>
  );
}

function Line({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={`text-[0.8125rem] ${muted ? 'text-muted-light' : 'text-muted'} font-semibold`}>
        {label}
      </dt>
      <dd
        className={`shrink-0 tabular-nums ${
          strong ? 'text-[0.9375rem] font-extrabold' : 'text-[0.8125rem] font-bold'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

interface Row {
  id: string;
  period_start: string;
  period_end: string;
  gross_kes: number;
  commission_kes: number;
  adjustments_kes: number;
  penalties_kes: number;
  tax_withheld_kes: number;
  net_kes: number;
  status: string;
  paid_at: string | null;
  provider_ref: string | null;
}
