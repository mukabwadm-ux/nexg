'use client';

import { cn } from '@nexg/ui';

import { ExportButton } from '@/components/portal/client-kit';
import { PanelHead } from '@/components/portal/kit';
import { EXPENSE_CATEGORIES } from '@/lib/office-finance';
import { shillings } from '@/lib/portal';

/**
 * Office spend by category and month: the table finance closes the month
 * with, and the same numbers as a CSV.
 */
export function OfficeReport({
  months,
  matrix,
  budgets,
}: {
  /** First days of the months shown, oldest first. */
  months: string[];
  /** Spend in cents: matrix[category][month]. */
  matrix: Record<string, Record<string, number>>;
  /** Budget in cents per month (all categories). */
  budgets: Record<string, number>;
}) {
  const label = (m: string) =>
    new Date(`${m}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  const categories = Object.keys(EXPENSE_CATEGORIES).filter((c) =>
    months.some((m) => (matrix[c]?.[m] ?? 0) > 0),
  );
  const monthTotal = (m: string) => categories.reduce((s, c) => s + (matrix[c]?.[m] ?? 0), 0);
  const rowTotal = (c: string) => months.reduce((s, m) => s + (matrix[c]?.[m] ?? 0), 0);
  const grand = months.reduce((s, m) => s + monthTotal(m), 0);

  return (
    <div className="flex flex-col gap-4">
      <PanelHead title="Office Spend by Month" aside="recorded and paid">
        <ExportButton
          label="Export CSV"
          filename="office-expenses-by-month.csv"
          rows={() => [
            ['Category', ...months.map(label), 'Total (KES)'],
            ...categories.map((c) => [
              EXPENSE_CATEGORIES[c]?.label ?? c,
              ...months.map((m) => Math.round((matrix[c]?.[m] ?? 0) / 100)),
              Math.round(rowTotal(c) / 100),
            ]),
            [
              'Total',
              ...months.map((m) => Math.round(monthTotal(m) / 100)),
              Math.round(grand / 100),
            ],
            ['Budget', ...months.map((m) => Math.round((budgets[m] ?? 0) / 100)), ''],
          ]}
        />
      </PanelHead>
      {categories.length === 0 ? (
        <p className="text-muted-light py-8 text-center text-sm">
          No office expenses recorded in these months yet.
        </p>
      ) : (
        <div className="border-border overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[44rem] text-right text-sm">
            <caption className="sr-only">Office spend by category and month, in shillings</caption>
            <thead className="bg-bg text-muted text-xs font-bold">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left">
                  Category
                </th>
                {months.map((m) => (
                  <th key={m} scope="col" className="px-3 py-2.5">
                    {label(m)}
                  </th>
                ))}
                <th scope="col" className="px-4 py-2.5">
                  Total (KES)
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y tabular-nums">
              {categories.map((c) => (
                <tr key={c}>
                  <th scope="row" className="px-4 py-2.5 text-left font-semibold">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: EXPENSE_CATEGORIES[c]?.color }}
                      />
                      {EXPENSE_CATEGORIES[c]?.label ?? c}
                    </span>
                  </th>
                  {months.map((m) => (
                    <td
                      key={m}
                      className={cn('px-3 py-2.5', !matrix[c]?.[m] && 'text-muted-light')}
                    >
                      {matrix[c]?.[m] ? shillings(matrix[c]![m]!) : '—'}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 font-bold">{shillings(rowTotal(c))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-border border-t-2 tabular-nums">
              <tr>
                <th scope="row" className="px-4 py-2.5 text-left font-extrabold">
                  Total
                </th>
                {months.map((m) => (
                  <td key={m} className="px-3 py-2.5 font-extrabold">
                    {shillings(monthTotal(m))}
                  </td>
                ))}
                <td className="px-4 py-2.5 font-extrabold">{shillings(grand)}</td>
              </tr>
              <tr className="text-muted">
                <th scope="row" className="px-4 py-2 text-left font-semibold">
                  Budget
                </th>
                {months.map((m) => (
                  <td
                    key={m}
                    className={cn(
                      'px-3 py-2',
                      budgets[m] && monthTotal(m) > budgets[m]! && 'text-danger font-bold',
                    )}
                  >
                    {budgets[m] ? shillings(budgets[m]!) : '—'}
                  </td>
                ))}
                <td className="px-4 py-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
