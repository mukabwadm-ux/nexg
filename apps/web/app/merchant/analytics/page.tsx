import { DASH, Panel, Row, kes } from '@/components/merchant/bits';
import { MerchantPage, merchantContext } from '@/components/merchant/frame';
import type { BranchCard } from '@/components/merchant/types';

export const metadata = { title: 'Analytics' };
export const dynamic = 'force-dynamic';

/**
 * Analytics, across branches.
 *
 * One rule shapes this page and is stated on it: every number
 * here comes from the same views as the statements and the
 * order history. A merchant who finds Analytics saying one
 * thing and their statement another will believe neither again,
 * and they would be right to.
 *
 * The design also carries a Company standing percentile against
 * anonymised peers. That is deliberately absent here rather
 * than approximated: it needs at least ten merchants in a
 * category before a percentile means anything, and inventing
 * one from the four on this database would be the exact kind of
 * confident-looking number this product refuses to print.
 */
export default async function MerchantAnalytics() {
  const { m, live, nav, supabase, me } = await merchantContext();
  if (!m) return null;

  const since = new Date(Date.now() - 30 * 86400000).toISOString();

  const [branchRes, orderRes] = await Promise.all([
    supabase.from('merchant_branch_live_v').select('*').eq('merchant_id', me.id).order('name'),
    supabase
      .from('merchant_orders_v')
      .select('id, branch_id, stage, total_cents, commission_cents, placed_at, store')
      .eq('merchant_id', me.id)
      .gte('placed_at', since),
  ]);

  const branches = (branchRes.data as BranchCard[] | null) ?? [];
  const orders =
    (orderRes.data as
      | {
          id: string;
          branch_id: string | null;
          stage: string;
          total_cents: number | null;
          commission_cents: number | null;
          placed_at: string;
          store: string | null;
        }[]
      | null) ?? [];

  const delivered = orders.filter((o) => o.stage === 'delivered');
  const gross = delivered.reduce((a, o) => a + Number(o.total_cents ?? 0), 0);
  const commission = delivered.reduce((a, o) => a + Number(o.commission_cents ?? 0), 0);
  const aov = delivered.length > 0 ? Math.round(gross / delivered.length) : null;

  /* Per branch, from the same rows as the totals above — so the
     branch column and the All row cannot disagree. */
  const perBranch = branches.map((b) => {
    const mine = delivered.filter((o) => o.branch_id === b.branch_id);
    const g = mine.reduce((a, o) => a + Number(o.total_cents ?? 0), 0);
    return {
      name: b.name,
      orders: mine.length,
      gross: g,
      aov: mine.length > 0 ? Math.round(g / mine.length) : null,
      state: b.state,
    };
  });

  /* Orders by hour of the Nairobi day. The one chart here that
     changes a rota rather than describing one. */
  const byHour = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    n: delivered.filter(
      (o) =>
        Number(
          new Date(o.placed_at).toLocaleString('en-GB', {
            hour: '2-digit',
            hour12: false,
            timeZone: 'Africa/Nairobi',
          }),
        ) === h,
    ).length,
  }));
  const peakHour = byHour.reduce((mx, h) => Math.max(mx, h.n), 0);

  const ENOUGH = 10;

  return (
    <MerchantPage
      m={m}
      live={live}
      nav={nav}
      current="/merchant/analytics"
      title={`Analytics · ${m.name}`}
      lead="All branches combined, with each one side by side. Every number here comes from the same views as your statements and order history, so it will always match them."
    >
      {/* ───────────────────────────────────── the KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Orders delivered" value={String(delivered.length)} note="Last 30 days" />
        <Kpi label="Gross sales" value={kes(gross)} note="Before fees and refunds" />
        <Kpi label="NexG fees" value={kes(commission)} note="Commission on delivered orders" />
        <Kpi
          label="Average order"
          value={aov === null ? `KES ${DASH}` : kes(aov)}
          note={
            delivered.length < ENOUGH
              ? `Too few orders to be meaningful (${delivered.length})`
              : 'Delivered orders only'
          }
        />
      </div>

      {/* ───────────────────────────── branch comparison */}
      <section className="border-border bg-surface overflow-x-auto rounded-xl border">
        <div className="border-border border-b px-4 py-3">
          <h2 className="text-[0.9375rem] font-extrabold tracking-tight">Branch comparison</h2>
          <p className="text-muted-light mt-0.5 text-[0.75rem] font-semibold">
            Last 30 days. The All row is the same rows summed, not a separate query.
          </p>
        </div>
        <table className="w-full text-left">
          <thead className="border-border bg-bg border-b">
            <tr className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
              <th className="px-4 py-2">Branch</th>
              <th className="px-4 py-2">State</th>
              <th className="px-4 py-2 text-right">Orders</th>
              <th className="px-4 py-2 text-right">Gross sales</th>
              <th className="px-4 py-2 text-right">Average order</th>
            </tr>
          </thead>
          <tbody>
            {perBranch.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <p className="text-muted-light px-4 py-8 text-center text-[0.8125rem] font-semibold">
                    No branches yet.
                  </p>
                </td>
              </tr>
            ) : (
              perBranch.map((b) => (
                <tr
                  key={b.name}
                  className="border-border border-b text-[0.8125rem] font-semibold last:border-0"
                >
                  <td className="px-4 py-3 font-extrabold">{b.name}</td>
                  <td className="text-muted px-4 py-3 capitalize">{b.state.replace('_', ' ')}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{b.orders}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{kes(b.gross)}</td>
                  <td className="text-muted px-4 py-3 text-right tabular-nums">
                    {b.aov === null ? DASH : kes(b.aov)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {perBranch.length > 0 ? (
            <tfoot className="border-border bg-bg border-t">
              <tr className="text-[0.8125rem] font-extrabold">
                <td className="px-4 py-3">All</td>
                <td />
                <td className="px-4 py-3 text-right tabular-nums">{delivered.length}</td>
                <td className="px-4 py-3 text-right tabular-nums">{kes(gross)}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {aov === null ? DASH : kes(aov)}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </section>

      {/* ─────────────────────────────── when orders come in */}
      <section className="border-border bg-surface rounded-xl border p-4">
        <h2 className="text-[0.9375rem] font-extrabold tracking-tight">When orders come in</h2>
        <p className="text-muted-light mt-0.5 text-[0.75rem] font-semibold">
          Hour of the Nairobi day, last 30 days. This is the one here that sets a rota rather than
          describing one.
        </p>
        {peakHour === 0 ? (
          <p className="text-muted-light py-8 text-center text-[0.8125rem] font-semibold">
            Nothing to plot yet.
          </p>
        ) : (
          <div className="mt-4 flex items-end gap-[2px]" style={{ height: '6rem' }}>
            {byHour.map((h) => (
              <div key={h.hour} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={`w-full rounded-t ${h.n > 0 ? 'bg-gold' : 'bg-border'}`}
                  style={{ height: `${Math.max(2, (h.n / peakHour) * 100)}%` }}
                  title={`${String(h.hour).padStart(2, '0')}:00 — ${h.n} order${h.n === 1 ? '' : 's'}`}
                />
                {h.hour % 3 === 0 ? (
                  <span className="text-muted-light text-[0.5625rem] font-extrabold">{h.hour}</span>
                ) : (
                  <span className="text-[0.5625rem]">&nbsp;</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Money · last 30 days">
          <Row label="Gross sales" value={kes(gross)} />
          <Row label="NexG fees" value={`− ${kes(commission)}`} />
          <Row label="Net before refunds" value={kes(gross - commission)} />
          <div className="px-4 py-2.5">
            <p className="text-muted-light text-[0.6875rem] font-semibold leading-[1.6]">
              Reconciles to your statements line for line, because both read the same order rows.
              Refunds and adjustments appear on the statement.
            </p>
          </div>
        </Panel>

        <Panel title="Company standing">
          <div className="px-4 py-4">
            <p className="text-[0.8125rem] font-semibold leading-[1.7]">
              Where you sit against other businesses in your category and zones.
            </p>
            <p className="text-muted mt-2 text-[0.75rem] font-semibold leading-[1.7]">
              Not shown yet. A percentile needs at least {ENOUGH} merchants in a category before it
              means anything, and showing one derived from fewer would be a confident number
              standing on nothing. It appears on its own once the category is large enough.
            </p>
            <p className="text-muted-light mt-2 text-[0.6875rem] font-semibold">
              Standing is shown only to you. We never publish rankings.
            </p>
          </div>
        </Panel>
      </div>

      <section className="border-border bg-surface rounded-xl border p-5">
        <h2 className="text-[0.9375rem] font-extrabold tracking-tight">Export this view</h2>
        <p className="text-muted mt-1.5 text-[0.8125rem] font-semibold leading-[1.7]">
          Everything on this page for the selected period, with the order-level detail behind it
          and guest data masked. Excel, CSV or PDF, and a scheduled weekly or monthly copy to you
          or your accountant.
        </p>
        <p className="text-muted-light mt-2 text-[0.75rem] font-semibold leading-[1.7]">
          The export builder is the next piece of this page. Merchant ops can produce the same
          figures today — the numbers are the ones on this screen.
        </p>
      </section>
    </MerchantPage>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="border-border bg-surface rounded-xl border p-4">
      <p className="text-muted-light text-[0.6875rem] font-extrabold uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1.5 text-[1.5rem] font-extrabold leading-none tracking-tight tabular-nums">
        {value}
      </p>
      <p className="text-muted-light mt-1.5 text-[0.6875rem] font-semibold">{note}</p>
    </div>
  );
}
