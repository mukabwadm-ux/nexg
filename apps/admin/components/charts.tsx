'use client';

import * as React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Label,
  LabelList,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';

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

const monthLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { month: 'short' });

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
  step = 'day',
}: {
  data: ({ day: string } & Record<string, number | string>)[];
  series: Series[];
  unit?: Unit;
  height?: number;
  /** `month` when each point is a month (the first day of it): "Jun", "Jul". */
  step?: 'day' | 'month';
}) {
  const label = step === 'month' ? monthLabel : dayLabel;
  const id = React.useId().replace(/:/g, '');
  const config: ChartConfig = Object.fromEntries(
    series.map((s, i) => [s.key, { label: s.label, color: s.color ?? PALETTE[i] }]),
  );
  /* The designs mark each point and pin the latest figure above it. */
  const lead = series[0]?.key;
  let pinned = -1;
  if (lead) {
    for (let i = data.length - 1; i >= 0; i--) {
      if (Number(data[i]![lead]) > 0) {
        pinned = i;
        break;
      }
    }
  }
  const dots = data.length <= 45;

  return (
    <div>
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
        <AreaChart data={data} margin={{ top: 34, right: 24, bottom: 0, left: 0 }}>
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
            tickFormatter={label}
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
                labelFormatter={(value) => label(String(value))}
                formatter={formatter(unit)}
              />
            }
          />
          {series.map((s, i) => (
            <Area
              key={s.key}
              dataKey={s.key}
              type="linear"
              stroke={`var(--color-${s.key})`}
              strokeWidth={i === 0 ? 2.5 : 2}
              fill={(s.fill ?? i === 0) ? `url(#fill-${id}-${s.key})` : 'transparent'}
              dot={
                dots
                  ? { r: 3.5, fill: `var(--color-${s.key})`, stroke: '#fff', strokeWidth: 1.5 }
                  : false
              }
              activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
            >
              {i === 0 && pinned >= 0 && (
                <LabelList
                  dataKey={s.key}
                  content={(props) => (
                    <PinnedFigure
                      {...(props as PinProps)}
                      pinned={pinned}
                      edge={pinned >= data.length * 0.85}
                      text={formatter(unit)(Number(data[pinned]![s.key]))}
                    />
                  )}
                />
              )}
            </Area>
          ))}
        </AreaChart>
      </ChartContainer>
      <ul
        className="mt-2 flex flex-wrap justify-center gap-x-6 gap-y-1 text-[0.8125rem] font-semibold"
        aria-hidden="true"
      >
        {series.map((s, i) => (
          <li key={s.key} className="text-ink/80 flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: s.color ?? PALETTE[i] }} />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface PinProps {
  x?: number | string;
  y?: number | string;
  index?: number;
}

/** The latest figure in a dark pill above its point, as the designs draw it. */
function PinnedFigure({
  x,
  y,
  index,
  pinned,
  text,
  edge,
}: PinProps & { pinned: number; text: string; edge: boolean }) {
  if (index !== pinned || x == null || y == null) return null;
  const cx = Number(x);
  const cy = Number(y);
  const width = text.length * 6.6 + 18;
  /* Near the right edge the pill ends at the point instead of straddling it. */
  const left = edge ? cx - width + 12 : cx - width / 2;
  return (
    <g pointerEvents="none">
      <rect x={left} y={cy - 32} width={width} height={22} rx={7} fill="#141414" />
      <text
        x={left + width / 2}
        y={cy - 17}
        textAnchor="middle"
        className="fill-white text-[0.6875rem] font-extrabold"
      >
        {text}
      </text>
      <circle cx={cx} cy={cy} r={5.5} fill="#141414" stroke="#fff" strokeWidth={2} />
    </g>
  );
}

export interface Slice {
  key: string;
  label: string;
  value: number;
  /** A colour that means something (green for in stock); the palette otherwise. */
  color?: string;
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
    data.map((s, i) => [s.key, { label: s.label, color: s.color ?? PALETTE[i % PALETTE.length] }]),
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
              <Cell key={s.key} fill={s.color ?? PALETTE[i % PALETTE.length]} />
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

      {/* One line per slice, as drawn: the name, its share, then the amount. */}
      <ul className="space-y-2.5">
        {data.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2.5 text-[0.875rem]">
            <span
              aria-hidden="true"
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ background: s.color ?? PALETTE[i % PALETTE.length] }}
            />
            <span className="min-w-0 flex-1 font-semibold leading-snug">{s.label}</span>
            <span className="w-12 shrink-0 text-right font-semibold tabular-nums">
              {total > 0 ? `${((s.value / total) * 100).toFixed(1)}%` : '—'}
            </span>
            <span className="shrink-0 whitespace-nowrap text-right font-semibold tabular-nums">
              {unit === 'kes'
                ? `KES ${s.value.toLocaleString('en-KE')}`
                : s.value.toLocaleString('en-KE')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
