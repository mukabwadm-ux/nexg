'use client';

import { Check, ChevronDown, ChevronUp, FileText, Package } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { kes } from './bits';
import { HomeColumnChart } from './home-column-chart';
import type { WeekBar } from './types';

export type HomePerformanceDemo = {
  activityLabel: string;
  activitySeries: number[];
  secondaryLabel: string;
  secondarySeries: number[];
  revenueLabel: string;
  revenueSeriesCents: number[];
  completedLabel: string;
  completedCount: number;
  openLabel: string;
  openCount: number;
  secondaryCount: number;
};

/** Demo-only metrics are explicit; the live view never invents a booking or stock count. */
export function HomePerformance({
  bars,
  unavailable,
  insightsHref = '/merchant/analytics',
  workHref = '/merchant-live-preview/work',
  demo,
  defaultExpanded = false,
}: {
  bars: WeekBar[];
  unavailable: boolean;
  insightsHref?: string;
  workHref?: string;
  demo?: HomePerformanceDemo;
  /** Starts with the extra metrics open. Home leaves it closed; tests open it. */
  defaultExpanded?: boolean;
}) {
  const [measure, setMeasure] = React.useState<
    'orders' | 'sales' | 'bookings' | 'activity' | 'secondary' | 'revenue'
  >('orders');
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const liveMeasures = ['orders', 'sales'] as const;
  const demoMeasures = ['activity', 'secondary', 'revenue'] as const;
  const activeMeasure = demo
    ? demoMeasures.includes(measure as (typeof demoMeasures)[number])
      ? (measure as (typeof demoMeasures)[number])
      : 'activity'
    : liveMeasures.includes(measure as (typeof liveMeasures)[number])
      ? (measure as (typeof liveMeasures)[number])
      : 'orders';
  const measureOptions = demo
    ? [
        { id: 'activity' as const, label: demo.activityLabel },
        { id: 'secondary' as const, label: demo.secondaryLabel },
        { id: 'revenue' as const, label: demo.revenueLabel },
      ]
    : [
        { id: 'orders' as const, label: 'Orders' },
        { id: 'sales' as const, label: 'Sales' },
      ];
  const isCurrency = demo ? activeMeasure === 'revenue' : activeMeasure === 'sales';
  const label = demo
    ? activeMeasure === 'activity'
      ? demo.activityLabel.toLowerCase()
      : activeMeasure === 'secondary'
        ? demo.secondaryLabel.toLowerCase()
        : demo.revenueLabel.toLowerCase()
    : activeMeasure === 'orders'
      ? 'delivered orders'
      : 'gross sales';
  const visibleMeasureLabel = demo
    ? activeMeasure === 'activity'
      ? demo.activityLabel
      : activeMeasure === 'secondary'
        ? demo.secondaryLabel
        : demo.revenueLabel
    : activeMeasure === 'orders'
      ? 'Orders'
      : 'Sales';
  const rawValues = bars.map((day, index) => {
    if (!demo) return activeMeasure === 'sales' ? day.gross_cents : day.delivered;
    if (activeMeasure === 'activity') return demo.activitySeries[index];
    if (activeMeasure === 'secondary') return demo.secondarySeries[index];
    return demo.revenueSeriesCents[index];
  });
  const values = rawValues.map((value) => Number(value));
  const valid = rawValues.every(
    (raw, index) =>
      raw !== null &&
      raw !== undefined &&
      Number.isFinite(values[index]) &&
      (values[index] ?? -1) >= 0,
  );
  const points = bars.map((day, index) => {
    const date = new Date(`${day.day}T00:00:00Z`);
    const dateLabel = Number.isNaN(date.getTime())
      ? day.dow
      : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    return {
      label: dateLabel,
      date: day.day,
      value: values[index] ?? 0,
      display: isCurrency ? kes(values[index]) : String(values[index]),
    };
  });

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[0.9375rem] font-extrabold leading-tight">Performance</h3>
          <p className="text-muted text-xs">
            {visibleMeasureLabel} · {demo ? 'Last 7 days' : 'This week'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="bg-bg flex rounded-full p-0.5"
            role="group"
            aria-label="Performance measure"
          >
            {measureOptions.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={activeMeasure === item.id}
                onClick={() => setMeasure(item.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize focus-visible:outline focus-visible:outline-2 ${activeMeasure === item.id ? 'bg-gold-soft text-ink' : 'text-muted'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <details className="relative">
            <summary className="border-border flex cursor-pointer list-none items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-bold focus-visible:outline focus-visible:outline-2">
              {demo ? 'Last 7 days' : 'This week'}{' '}
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            </summary>
            <p className="border-border bg-surface text-muted absolute right-0 z-20 mt-1 w-52 rounded-lg border p-3 text-xs shadow-lg">
              {demo
                ? 'The preview shows seven sample days.'
                : 'This week is the available reporting period.'}
            </p>
          </details>
        </div>
      </div>

      {unavailable ? (
        <p className="text-muted py-5 text-sm" role="status">
          Performance data could not be loaded. Refresh the page to try again.
        </p>
      ) : bars.length === 0 ? (
        <p className="text-muted py-5 text-sm">Performance data is not available yet.</p>
      ) : !valid ? (
        <p className="text-muted py-5 text-sm" role="status">
          Performance data could not be displayed. Refresh the page to try again.
        </p>
      ) : (
        <>
          <HomeColumnChart
            points={points}
            measure={label}
            period={demo ? 'last 7 days' : 'this week'}
            format={isCurrency ? 'currency' : 'number'}
          />
          {!demo ? (
            <p className="text-muted text-[0.625rem]">
              Only days with recorded orders are shown. Sales amounts are KES.
            </p>
          ) : null}
        </>
      )}

      {expanded ? (
        <div className="mt-2">
          {demo ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <DemoMetric
                title={demo.completedLabel}
                value={demo.completedCount}
                href={workHref}
                icon={<Check className="h-4 w-4" />}
                tone="bg-green-100 text-green-700"
              />
              <DemoMetric
                title={demo.openLabel}
                value={demo.openCount}
                icon={<FileText className="h-4 w-4" />}
                tone="bg-blue-100 text-blue-700"
              />
              <DemoMetric
                title={demo.secondaryLabel}
                value={demo.secondaryCount}
                href={workHref}
                icon={<Package className="h-4 w-4" />}
                tone="bg-orange-100 text-orange-700"
              />
            </div>
          ) : null}
          {!unavailable && valid && bars.length > 0 ? (
            <details className="mt-2 text-xs">
              <summary className="text-gold-text cursor-pointer font-bold">
                Show daily figures
              </summary>
              <ul className="mt-2 space-y-1">
                {points.map((point) => (
                  <li key={point.date} className="flex justify-between gap-2">
                    <span>{point.date}</span>
                    <span className="font-semibold tabular-nums">{point.display}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1 text-xs font-bold focus-visible:outline focus-visible:outline-2"
        >
          {expanded ? 'Show fewer metrics' : 'Show more metrics'}{' '}
          {expanded ? (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
        <Link
          href={insightsHref}
          className="text-gold-text text-xs font-extrabold hover:underline focus-visible:outline focus-visible:outline-2"
        >
          View insights →
        </Link>
      </div>
    </div>
  );
}

function DemoMetric({
  title,
  value,
  icon,
  tone,
  href,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  tone: string;
  href?: string;
}) {
  const contents = (
    <>
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone}`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="text-muted block text-[0.625rem] font-bold">{title}</span>
        <span className="text-sm font-extrabold">{value}</span>
      </span>
      {href ? <span className="ml-auto">›</span> : null}
    </>
  );
  const style = 'border-border flex min-w-0 items-center gap-2 rounded-lg border p-2';
  return href ? (
    <Link href={href} className={`${style} hover:border-gold`}>
      {contents}
    </Link>
  ) : (
    <div className={style}>{contents}</div>
  );
}
