'use client';

import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

const month = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short' });

const compact = (v: number) =>
  Math.abs(v) >= 1_000_000
    ? `${(v / 1_000_000).toFixed(1)}M`
    : Math.abs(v) >= 1_000
      ? `${Math.round(v / 1_000)}K`
      : String(Math.round(v));

/**
 * The designs' monthly bars with a line over them on a second axis:
 * Bookings & Revenue, Case Trend, Unit Acquisition, Booking & Commission.
 */
export function BarLineChart({
  data,
  bar,
  line,
  height = 240,
}: {
  data: { month: string; bar: number; line: number }[];
  bar: { label: string; kes?: boolean };
  line: { label: string; kes?: boolean };
  height?: number;
}) {
  const config = {
    bar: { label: bar.label, color: '#F5A623' },
    line: { label: line.label, color: '#E8C547' },
  } satisfies ChartConfig;
  const format = (kes: boolean | undefined) => (v: unknown) =>
    kes
      ? `KES ${Math.round(Number(v)).toLocaleString('en-KE')}`
      : Number(v).toLocaleString('en-KE');
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={month}
        />
        <YAxis yAxisId="bar" tickLine={false} axisLine={false} width={40} tickFormatter={compact} />
        <YAxis
          yAxisId="line"
          orientation="right"
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={compact}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(l) =>
                new Date(`${String(l).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', {
                  month: 'long',
                  year: 'numeric',
                })
              }
              formatter={(value, name) =>
                name === 'bar' ? format(bar.kes)(value) : format(line.kes)(value)
              }
            />
          }
        />
        <Bar
          yAxisId="bar"
          dataKey="bar"
          fill="var(--color-bar)"
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        />
        <Line
          yAxisId="line"
          dataKey="line"
          type="monotone"
          stroke="var(--color-line)"
          strokeWidth={2.5}
          dot={{ r: 3.5, fill: 'var(--color-line)' }}
          isAnimationActive={false}
        />
        <ChartLegend content={<ChartLegendContent />} />
      </ComposedChart>
    </ChartContainer>
  );
}
