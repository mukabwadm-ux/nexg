'use client';

import { Download } from 'lucide-react';
import * as React from 'react';

import { TrendArea } from '@/components/charts';
import { rollUp, type Performance, type Step } from '@/lib/performance';

const STEPS: { key: Step; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

/** The Performance Trend card's body: sales and commission, by day, week or month. */
export function PerformanceTrend({ series }: { series: Performance['series'] }) {
  const [step, setStep] = React.useState<Step>(series.length > 62 ? 'weekly' : 'daily');
  const data = React.useMemo(() => rollUp(series, step), [series, step]);
  const empty = data.every((d) => d.gmv === 0 && d.commission === 0);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[1.25rem] font-extrabold tracking-[-0.01em]">Performance Trend</h2>
        <div
          role="group"
          aria-label="Group the trend by"
          className="border-border bg-bg flex gap-1 rounded-xl border p-1"
        >
          {STEPS.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={step === s.key}
              onClick={() => setStep(s.key)}
              className={`h-8 rounded-lg px-3 text-[0.8125rem] font-bold transition-colors ${
                step === s.key ? 'bg-ink text-[#F5B400]' : 'text-ink hover:bg-surface'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      {empty ? (
        <p className="text-muted py-16 text-center text-[0.875rem] font-semibold">
          No sales in this period.
        </p>
      ) : (
        <TrendArea
          data={data}
          unit="kes"
          height={220}
          step={step === 'monthly' ? 'month' : 'day'}
          series={[
            { key: 'gmv', label: 'GMV (Sales)', color: '#F5B800', fill: true },
            { key: 'commission', label: 'Commission (NEXG)', color: '#1A1A1A' },
          ]}
        />
      )}
    </div>
  );
}

function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Export: every merchant that sold in the period, as a spreadsheet. */
export function ExportPerformance({
  rows,
  period,
}: {
  rows: {
    name: string;
    category: string;
    gmv: number;
    commission: number;
    orders: number;
    prevGmv: number;
    rating: string;
  }[];
  period: string;
}) {
  function download() {
    const head = [
      'Merchant',
      'Category',
      'GMV (KES)',
      'Commission ex VAT (KES)',
      'Orders',
      'GMV period before (KES)',
      'Rating',
    ];
    const body = rows.map((r) => [
      r.name,
      r.category,
      String(r.gmv),
      String(r.commission),
      String(r.orders),
      String(r.prevGmv),
      r.rating,
    ]);
    const csv = [head, ...body].map((line) => line.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}\r\n`], { type: 'text/csv;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `merchant-performance-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <button
      type="button"
      onClick={download}
      className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-xl border border-white/40 px-4 text-[0.9375rem] font-bold text-white transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFE07A]"
    >
      <Download aria-hidden="true" className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.9} />
      Export
    </button>
  );
}
