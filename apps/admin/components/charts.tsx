'use client';

import * as React from 'react';
import { Area, AreaChart, CartesianGrid, Cell, Label, Pie, PieChart, XAxis, YAxis } from 'recharts';

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

/**
 * The console's two chart shapes, on shadcn/ui's chart primitives
 * (Recharts): a trend over days and a share-of-total donut, styled as the
 * admin portal designs draw them — gold leading, ink second, then green,
 * blue and purple.
 *
 * Pages hand over numbers already summed on the server and say what unit
 * they are in; the client only draws.
 */

export type Unit = 'kes' | 'count';

export const PALETTE = [
  '#F5B800',
  '#141414',
  '#1F9D55',
  '#2F6FDB',
  '#A855F7',
  '#E8730C',
  '#C9C4B8',
];

const compact = (n: number) =>
  Math.abs(n) >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : Math.abs(n) >= 1_000
      ? `${(n / 1_000).toFixed(Math.abs(n) >= 10_000 ? 0 : 1)}K`
      : String(Math.round(n));

const formatter = (unit: Unit) => (value: number | string) =>
  unit === 'kes'
    ? `KES ${Number(value).toLocaleString('en-KE')}`
    : Number(value).toLocaleString('en-KE');

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export interface Series {
  key: string;
  label: string;
  color?: string;
  /** Filled under the line (the first series usually is). */
  fill?: boolean;
}

/** Days along the bottom (ISO yyyy-mm-dd in `day`), one line per series. */
export function TrendArea({
  data,
  series,
  unit = 'count',
  height = 240,
}: {
  data: ({ day: string } & Record<string, number | string>)[];
  series: Series[];
  unit?: Unit;
  height?: number;
}) {
  const id = React.useId().replace(/:/g, '');
  const config: ChartConfig = Object.fromEntries(
    series.map((s, i) => [s.key, { label: s.label, color: s.color ?? PALETTE[i] }]),
  );

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs font-semibold" aria-hidden="true">
        {series.map((s, i) => (
          <li key={s.key} className="text-muted flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: s.color ?? PALETTE[i] }}
            />
            {s.label}
          </li>
        ))}
      </ul>
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`fill-${id}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`var(--color-${s.key})`} stopOpacity={0.38} />
                <stop offset="100%" stopColor={`var(--color-${s.key})`} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 4" />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            minTickGap={28}
            tickFormatter={dayLabel}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={unit === 'kes' ? 46 : 32}
            tickMargin={6}
            allowDecimals={false}
            tickFormatter={(v: number) => compact(v)}
          />
          <ChartTooltip
            cursor={{ strokeDasharray: '4 4' }}
            content={
              <ChartTooltipContent
                indicator="dot"
                labelFormatter={(label) => dayLabel(String(label))}
                formatter={formatter(unit)}
              />
            }
          />
          {series.map((s, i) => (
            <Area
              key={s.key}
              dataKey={s.key}
              type="monotone"
              stroke={`var(--color-${s.key})`}
              strokeWidth={i === 0 ? 2.5 : 2}
              fill={(s.fill ?? i === 0) ? `url(#fill-${id}-${s.key})` : 'transparent'}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
            />
          ))}
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

export interface Slice {
  key: string;
  label: string;
  value: number;
}

/** A share-of-total donut with its legend; the total in the middle. */
export function ShareDonut({
  data,
  centre,
  caption,
  unit = 'count',
  stacked = false,
}: {
  /** Legend under the ring instead of beside it, for narrow panels. */
  stacked?: boolean;
  data: Slice[];
  /** The big figure in the middle. */
  centre: string;
  /** The small line under it ("Tickets", "Revenue"). */
  caption?: string;
  unit?: Unit;
}) {
  const total = data.reduce((sum, s) => sum + s.value, 0);
  const config: ChartConfig = Object.fromEntries(
    data.map((s, i) => [s.key, { label: s.label, color: PALETTE[i % PALETTE.length] }]),
  );

  return (
    <div
      className={
        stacked
          ? 'grid items-center gap-4'
          : 'grid items-center gap-5 sm:grid-cols-[11rem_minmax(0,1fr)]'
      }
    >
      <ChartContainer config={config} className="mx-auto aspect-square h-[11rem]">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent hideLabel formatter={formatter(unit)} />} />
          <Pie
            data={data}
            dataKey="value"
            nameKey="key"
            innerRadius="62%"
            outerRadius="100%"
            paddingAngle={data.length > 1 ? 2 : 0}
            cornerRadius={4}
            stroke="none"
          >
            {data.map((s, i) => (
              <Cell key={s.key} fill={PALETTE[i % PALETTE.length]} />
            ))}
            <Label
              content={({ viewBox }) => {
                if (!viewBox || !('cx' in viewBox)) return null;
                const { cx, cy } = viewBox as { cx: number; cy: number };
                return (
                  <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                    {unit === 'kes' && (
                      <tspan
                        x={cx}
                        y={cy - 18}
                        className="fill-muted text-[0.6875rem] font-semibold"
                      >
                        KES
                      </tspan>
                    )}
                    <tspan x={cx} y={cy + 2} className="fill-ink text-[1.375rem] font-extrabold">
                      {centre}
                    </tspan>
                    {caption && (
                      <tspan
                        x={cx}
                        y={cy + 22}
                        className="fill-muted text-[0.6875rem] font-semibold"
                      >
                        {caption}
                      </tspan>
                    )}
                  </text>
                );
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>

      <ul className="space-y-2">
        {data.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2.5 text-[0.8125rem]">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: PALETTE[i % PALETTE.length] }}
            />
            <span className="min-w-0 flex-1 truncate font-semibold">{s.label}</span>
            <span className="text-muted-light tabular-nums">
              {unit === 'count' ? s.value.toLocaleString('en-KE') : ''}
            </span>
            <span className="w-12 text-right font-extrabold tabular-nums">
              {total > 0 ? `${((s.value / total) * 100).toFixed(1)}%` : '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
