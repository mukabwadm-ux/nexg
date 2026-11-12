'use client';

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts';

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

const kes = (value: number) => `KES ${Math.round(value).toLocaleString('en-KE')}`;

const shortDay = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

const trendConfig = {
  sales: { label: 'Sales', color: '#E2B400' },
  orders: { label: 'Orders', color: '#141414' },
} satisfies ChartConfig;

/** Daily sales (area, left axis) and orders (line, right axis), shadcn's interactive area chart. */
export function SalesTrendChart({
  data,
}: {
  data: { date: string; sales: number; orders: number }[];
}) {
  return (
    <ChartContainer config={trendConfig} className="aspect-auto h-[16.5rem] w-full">
      <AreaChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
        <defs>
          <linearGradient id="fillSales" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-sales)" stopOpacity={0.45} />
            <stop offset="95%" stopColor="var(--color-sales)" stopOpacity={0.04} />
          </linearGradient>
          <linearGradient id="fillOrders" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-orders)" stopOpacity={0.14} />
            <stop offset="95%" stopColor="var(--color-orders)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={28}
          tickFormatter={shortDay}
        />
        <YAxis yAxisId="sales" hide />
        <YAxis yAxisId="orders" orientation="right" hide allowDecimals={false} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              indicator="dot"
              labelFormatter={(label) =>
                new Date(`${label}T12:00:00Z`).toLocaleDateString('en-GB', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })
              }
              formatter={(value, name) => (name === 'sales' ? kes(Number(value)) : value)}
            />
          }
        />
        <Area
          yAxisId="orders"
          dataKey="orders"
          type="monotone"
          isAnimationActive={false}
          fill="url(#fillOrders)"
          stroke="var(--color-orders)"
          strokeWidth={1.5}
        />
        <Area
          yAxisId="sales"
          dataKey="sales"
          type="monotone"
          isAnimationActive={false}
          fill="url(#fillSales)"
          stroke="var(--color-sales)"
          strokeWidth={2}
        />
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer>
  );
}

const hourConfig = {
  orders: { label: 'Orders', color: '#141414' },
  peak: { label: 'Busiest hour', color: '#E2B400' },
} satisfies ChartConfig;

const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

/** When orders come in, by hour of the day in Nairobi. */
export function OrdersByHourChart({ data }: { data: { hour: number; orders: number }[] }) {
  const peak = Math.max(...data.map((row) => row.orders));
  return (
    <ChartContainer config={hourConfig} className="aspect-auto h-[13rem] w-full">
      <BarChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="hour"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval={2}
          tickFormatter={hourLabel}
        />
        <YAxis hide allowDecimals={false} />
        <ChartTooltip
          cursor
          content={<ChartTooltipContent labelFormatter={(label) => hourLabel(Number(label))} />}
        />
        <Bar
          dataKey="orders"
          radius={[4, 4, 0, 0]}
          fill="var(--color-orders)"
          isAnimationActive={false}
        >
          {data.map((row) => (
            <Cell
              key={row.hour}
              fill={row.orders === peak && peak > 0 ? 'var(--color-peak)' : 'var(--color-orders)'}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
