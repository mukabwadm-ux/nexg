import { Card, cn } from '@nexg/ui';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import Link from 'next/link';

import { OrdersByHourChart, SalesTrendChart } from '@/components/merchants/performance-charts';
import { change, RANGES, type Figure, type Performance } from '@/lib/merchant-performance';

/**
 * The Performance section of the merchant page, laid out as shadcn's
 * dashboard: headline cards with the change against the previous window,
 * the sales trend, when orders arrive, top items and how orders ended.
 *
 * A missing figure reads "No data" rather than 0: a merchant with no rated
 * orders has no rating, not a rating of zero.
 */

const NO_DATA = 'No data';

const kes = (value: number | null) =>
  value === null ? NO_DATA : `KES ${Math.round(value).toLocaleString('en-KE')}`;
const count = (value: number | null) => (value === null ? NO_DATA : value.toLocaleString('en-KE'));
const pct = (value: number | null) => (value === null ? NO_DATA : `${Math.round(value)}%`);
const minutes = (value: number | null) => (value === null ? NO_DATA : `${Math.round(value)} min`);
const stars = (value: number | null) => (value === null ? NO_DATA : `${value.toFixed(1)} / 5`);

/** The change badge. `goodWhenDown` for figures where lower is better. */
function Delta({ figure, goodWhenDown = false }: { figure: Figure; goodWhenDown?: boolean }) {
  const delta = change(figure);
  if (delta === null) {
    return (
      <span className="border-border text-muted-light inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-bold">
        <Minus aria-hidden="true" className="h-3 w-3" />
        No comparison
      </span>
    );
  }
  const up = delta > 0;
  const flat = Math.abs(delta) < 0.5;
  const good = flat ? null : up !== goodWhenDown;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold tabular-nums',
        good === null && 'bg-bg text-muted',
        good === true && 'bg-success-bg text-success',
        good === false && 'bg-danger-bg text-danger',
      )}
    >
      <Icon aria-hidden="true" className="h-3 w-3" />
      {flat ? 'Level' : `${up ? '+' : ''}${Math.round(delta)}%`}
    </span>
  );
}

function StatCard({
  label,
  value,
  figure,
  note,
  goodWhenDown,
}: {
  label: string;
  value: string;
  figure: Figure;
  note: string;
  goodWhenDown?: boolean;
}) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted text-[0.8125rem] font-bold">{label}</p>
        <Delta figure={figure} goodWhenDown={goodWhenDown} />
      </div>
      <p
        className={cn(
          'text-[1.75rem] font-extrabold tabular-nums leading-none tracking-tight',
          value === NO_DATA && 'text-muted-light text-xl',
        )}
      >
        {value}
      </p>
      <p className="text-muted-light text-[0.6875rem] font-semibold leading-snug">{note}</p>
    </Card>
  );
}

function MiniStat({
  label,
  value,
  figure,
  note,
  goodWhenDown,
}: {
  label: string;
  value: string;
  figure: Figure;
  note: string;
  goodWhenDown?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4">
      <div className="min-w-0">
        <p className="text-muted text-[0.75rem] font-bold">{label}</p>
        <p
          className={cn(
            'mt-1 text-lg font-extrabold tabular-nums',
            value === NO_DATA && 'text-muted-light text-base',
          )}
        >
          {value}
        </p>
        <p className="text-muted-light text-[0.6875rem] font-semibold">{note}</p>
      </div>
      <Delta figure={figure} goodWhenDown={goodWhenDown} />
    </div>
  );
}

const OUTCOME = {
  delivered: { label: 'Delivered', bar: 'bg-success' },
  in_progress: { label: 'In progress', bar: 'bg-gold' },
  cancelled: { label: 'Cancelled or refunded', bar: 'bg-danger' },
} as const;

export function MerchantPerformance({
  merchantId,
  range,
  data,
  failed,
}: {
  merchantId: string;
  range: string;
  data: Performance;
  /** The orders could not be read: say so, rather than show an empty dashboard as if it were true. */
  failed: boolean;
}) {
  const period = `last ${data.days} days`;
  const versus = `vs the ${data.days} days before`;
  const peakHour = data.byHour.reduce((best, row) => (row.orders > best.orders ? row : best));
  const empty = data.placedCount === 0;

  return (
    <section aria-labelledby="performance-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="performance-heading" className="text-lg font-extrabold tracking-tight">
            Performance
          </h2>
          <p className="text-muted mt-1 text-sm font-semibold">
            From this merchant&apos;s orders, {period}, Nairobi time. Changes are {versus}.
          </p>
        </div>
        <nav
          aria-label="Period"
          className="border-border bg-surface inline-flex rounded-lg border p-1"
        >
          {RANGES.map((option) => (
            <Link
              key={option.key}
              href={`/merchants/${merchantId}?range=${option.key}`}
              scroll={false}
              aria-current={option.key === range ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-bold transition-colors',
                option.key === range ? 'bg-ink text-white' : 'text-muted hover:text-ink',
              )}
            >
              {option.label}
            </Link>
          ))}
        </nav>
      </div>

      {failed && (
        <Card tone="muted" className="mt-4 p-5">
          <p className="text-danger text-sm font-bold">
            The orders could not be read just now, so these figures are not shown. Reload to try
            again.
          </p>
        </Card>
      )}

      {!failed && (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Sales"
              value={kes(data.sales.value)}
              figure={data.sales}
              note="Item subtotal of orders not cancelled or refunded. Fees excluded."
            />
            <StatCard
              label="Orders"
              value={count(data.orders.value)}
              figure={data.orders}
              note={`${count(data.placedCount)} placed in all, cancelled ones included.`}
            />
            <StatCard
              label="Average order"
              value={kes(data.averageOrder.value)}
              figure={data.averageOrder}
              note="Sales divided by orders."
            />
            <StatCard
              label="On-time ready"
              value={pct(data.onTimeReady.value)}
              figure={data.onTimeReady}
              note="Marked ready by the promised time, of orders that had both."
            />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <Card className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[0.9375rem] font-extrabold">Sales and orders by day</h3>
                <p className="text-muted-light text-xs font-semibold">{period}</p>
              </div>
              {empty ? (
                <EmptyChart>No orders in this period.</EmptyChart>
              ) : (
                <div className="mt-3">
                  <SalesTrendChart data={data.daily} />
                </div>
              )}
            </Card>

            <Card className="divide-border divide-y p-0">
              <MiniStat
                label="Cancellation rate"
                value={pct(data.cancellationRate.value)}
                figure={data.cancellationRate}
                note="Cancelled or refunded, of all placed"
                goodWhenDown
              />
              <MiniStat
                label="Prep time"
                value={minutes(data.prepMinutes.value)}
                figure={data.prepMinutes}
                note="Median, confirmed to ready"
                goodWhenDown
              />
              <MiniStat
                label="Rating"
                value={stars(data.rating.value)}
                figure={data.rating}
                note={
                  data.rating.count
                    ? `${data.rating.count} rated order${data.rating.count === 1 ? '' : 's'}`
                    : 'No rated orders'
                }
              />
              <MiniStat
                label="Returning guests"
                value={pct(data.repeatGuests.value)}
                figure={data.repeatGuests}
                note="Guests who ordered more than once"
              />
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[0.9375rem] font-extrabold">When orders come in</h3>
                {!empty && (
                  <p className="text-muted-light text-xs font-semibold">
                    Busiest {String(peakHour.hour).padStart(2, '0')}:00
                  </p>
                )}
              </div>
              {empty ? (
                <EmptyChart>No orders in this period.</EmptyChart>
              ) : (
                <div className="mt-3">
                  <OrdersByHourChart data={data.byHour} />
                </div>
              )}
            </Card>

            <Card className="p-5">
              <h3 className="text-[0.9375rem] font-extrabold">Top items</h3>
              {data.topItems.length === 0 ? (
                <EmptyChart>No items sold in this period.</EmptyChart>
              ) : (
                <table className="mt-3 w-full text-left">
                  <thead>
                    <tr className="text-muted-light border-border border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                      <th className="py-2 pr-2">Item</th>
                      <th className="py-2 pr-2 text-right">Sold</th>
                      <th className="py-2 text-right">Sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topItems.map((item) => (
                      <tr key={item.name} className="border-border border-b last:border-b-0">
                        <td className="max-w-0 truncate py-2.5 pr-2 text-[0.8125rem] font-bold">
                          {item.name}
                        </td>
                        <td className="py-2.5 pr-2 text-right text-[0.8125rem] font-semibold tabular-nums">
                          {item.quantity}
                        </td>
                        <td className="py-2.5 text-right text-[0.8125rem] font-bold tabular-nums">
                          {kes(item.sales)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card className="p-5">
              <h3 className="text-[0.9375rem] font-extrabold">How orders ended</h3>
              {empty ? (
                <EmptyChart>No orders in this period.</EmptyChart>
              ) : (
                <ul className="mt-4 space-y-4">
                  {data.outcomes.map((outcome) => {
                    const share = (outcome.count / data.placedCount) * 100;
                    return (
                      <li key={outcome.key}>
                        <div className="flex items-baseline justify-between gap-2 text-[0.8125rem]">
                          <span className="font-bold">{OUTCOME[outcome.key].label}</span>
                          <span className="text-muted font-semibold tabular-nums">
                            {outcome.count} · {Math.round(share)}%
                          </span>
                        </div>
                        <div className="bg-bg mt-1.5 h-2 overflow-hidden rounded-full">
                          <div
                            className={cn('h-full rounded-full', OUTCOME[outcome.key].bar)}
                            style={{ width: `${share}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </section>
  );
}

function EmptyChart({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-bg text-muted-light mt-3 flex h-[11rem] items-center justify-center rounded-lg text-sm font-semibold">
      {children}
    </div>
  );
}
