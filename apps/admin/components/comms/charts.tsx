'use client';

import { Bar, BarChart, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts';

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

/*
 * The Communications charts: volume bars with the delivery rate over them,
 * stacked outcome bars (by hour or day), and plain bars. Pages hand over
 * figures already counted on the server; these only draw.
 */

const compact = (v: number) =>
  Math.abs(v) >= 1_000_000
    ? `${(v / 1_000_000).toFixed(1)}M`
    : Math.abs(v) >= 1_000
      ? `${(v / 1_000).toFixed(Math.abs(v) >= 10_000 ? 0 : 1)}K`
      : String(Math.round(v));

/** "Jan 5" for a day, "10 AM" for an hour. */
function tick(at: string): string {
  if (at.length > 10 && !at.slice(11, 19).startsWith('00:00')) {
    const h = Number(at.slice(11, 13));
    return `${h % 12 === 0 ? 12 : h % 12} ${h >= 12 ? 'PM' : 'AM'}`;
  }
  return new Date(`${at.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/** Messages sent as bars, the share delivered as a line on its own axis. */
export function VolumeRateChart({
  data,
  height = 260,
}: {
  data: { at: string; sent: number; total: number }[];
  height?: number;
}) {
  const rows = data.map((d) => ({
    at: d.at,
    total: d.total,
    rate: d.total > 0 ? Math.round((1000 * d.sent) / d.total) / 10 : null,
  }));
  const config = {
    total: { label: 'Messages Sent', color: '#F5A623' },
    rate: { label: 'Delivery Rate', color: '#1F9D55' },
  } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <ComposedChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="at"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={tick}
          minTickGap={16}
        />
        <YAxis
          yAxisId="n"
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={compact}
          allowDecimals={false}
        />
        <YAxis
          yAxisId="r"
          orientation="right"
          tickLine={false}
          axisLine={false}
          width={44}
          domain={[0, 100]}
          tickFormatter={(v: number) => `${v}%`}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(l) => tick(String(l))}
              formatter={(value, name) =>
                name === 'rate'
                  ? `${value}% delivered`
                  : `${Number(value).toLocaleString('en-KE')} messages`
              }
            />
          }
        />
        <Bar
          yAxisId="n"
          dataKey="total"
          fill="var(--color-total)"
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        />
        <Line
          yAxisId="r"
          dataKey="rate"
          type="monotone"
          stroke="var(--color-rate)"
          strokeWidth={2.5}
          dot={{ r: 3, fill: 'var(--color-rate)' }}
          connectNulls
          isAnimationActive={false}
        />
        <ChartLegend content={<ChartLegendContent />} />
      </ComposedChart>
    </ChartContainer>
  );
}

/** Bars stacked by outcome or channel, one bar per hour or day. */
export function StackedBars({
  data,
  series,
  height = 240,
  legend = true,
}: {
  data: ({ at: string } & Record<string, number | string>)[];
  series: { key: string; label: string; color: string }[];
  height?: number;
  legend?: boolean;
}) {
  const config: ChartConfig = Object.fromEntries(
    series.map((s) => [s.key, { label: s.label, color: s.color }]),
  );
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="at"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={tick}
          minTickGap={12}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={compact}
          allowDecimals={false}
        />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent labelFormatter={(l) => tick(String(l))} />}
        />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            stackId="a"
            fill={`var(--color-${s.key})`}
            radius={i === series.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
            isAnimationActive={false}
          />
        ))}
        {legend && <ChartLegend content={<ChartLegendContent />} />}
      </BarChart>
    </ChartContainer>
  );
}
