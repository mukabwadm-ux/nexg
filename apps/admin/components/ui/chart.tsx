'use client';

/**
 * shadcn/ui's chart primitives (ui.shadcn.com/charts), on Recharts: a
 * container that turns a config into --color-<key> CSS variables, and the
 * tooltip and legend that read the same config. Adapted to the console's
 * tokens; otherwise as shadcn ships it, so their chart examples drop in.
 */
import { cn } from '@nexg/ui';
import * as React from 'react';
import * as RechartsPrimitive from 'recharts';

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType;
    color?: string;
  };
};

type ChartContextProps = { config: ChartConfig };

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) throw new Error('useChart must be used within a <ChartContainer />');
  return context;
}

export const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    config: ChartConfig;
    children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children'];
  }
>(({ id, className, children, config, ...props }, ref) => {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, '')}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        ref={ref}
        className={cn(
          "[&_.recharts-cartesian-axis-tick_text]:fill-muted-light [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border-strong [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-bg flex aspect-video justify-center text-xs [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
});
ChartContainer.displayName = 'Chart';

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colorConfig = Object.entries(config).filter(([, item]) => item.color);
  if (!colorConfig.length) return null;
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `[data-chart=${id}] {\n${colorConfig
          .map(([key, item]) => `  --color-${key}: ${item.color};`)
          .join('\n')}\n}`,
      }}
    />
  );
}

export const ChartTooltip = RechartsPrimitive.Tooltip;

type TooltipPayloadItem = {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown> & { fill?: string };
};

export const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  {
    active?: boolean;
    payload?: TooltipPayloadItem[];
    label?: React.ReactNode;
    className?: string;
    hideLabel?: boolean;
    indicator?: 'line' | 'dot' | 'dashed';
    labelFormatter?: (label: React.ReactNode) => React.ReactNode;
    formatter?: (value: number | string, name: string) => React.ReactNode;
  }
>(
  (
    {
      active,
      payload,
      label,
      className,
      hideLabel = false,
      indicator = 'dot',
      labelFormatter,
      formatter,
    },
    ref,
  ) => {
    const { config } = useChart();
    if (!active || !payload?.length) return null;

    return (
      <div
        ref={ref}
        className={cn(
          'border-border bg-surface grid min-w-[9rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-[0_12px_30px_-12px_rgb(20_20_20/0.35)]',
          className,
        )}
      >
        {!hideLabel && (
          <div className="font-extrabold">{labelFormatter ? labelFormatter(label) : label}</div>
        )}
        <div className="grid gap-1.5">
          {payload.map((item) => {
            const key = String(item.dataKey ?? item.name ?? 'value');
            const itemConfig = config[key];
            const color = item.payload?.fill ?? item.color;
            return (
              <div key={key} className="flex w-full items-center gap-2">
                <span
                  className={cn(
                    'shrink-0 rounded-[2px]',
                    indicator === 'dot' && 'h-2.5 w-2.5',
                    indicator === 'line' && 'h-3 w-1',
                    indicator === 'dashed' && 'h-0 w-3 border-[1.5px] border-dashed bg-transparent',
                  )}
                  style={{
                    backgroundColor: indicator === 'dashed' ? undefined : color,
                    borderColor: color,
                  }}
                />
                <span className="text-muted flex-1 font-semibold">
                  {itemConfig?.label ?? item.name}
                </span>
                <span className="font-extrabold tabular-nums">
                  {formatter && item.value !== undefined
                    ? formatter(item.value, key)
                    : typeof item.value === 'number'
                      ? item.value.toLocaleString('en-KE')
                      : item.value}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
);
ChartTooltipContent.displayName = 'ChartTooltip';

export const ChartLegend = RechartsPrimitive.Legend;

export const ChartLegendContent = React.forwardRef<
  HTMLDivElement,
  { className?: string; payload?: { dataKey?: string | number; value?: string; color?: string }[] }
>(({ className, payload }, ref) => {
  const { config } = useChart();
  if (!payload?.length) return null;
  return (
    <div ref={ref} className={cn('flex items-center justify-center gap-4 pt-3', className)}>
      {payload.map((item) => {
        const key = String(item.dataKey ?? item.value ?? 'value');
        return (
          <div key={key} className="text-muted flex items-center gap-1.5 text-xs font-semibold">
            <span
              className="h-2 w-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: item.color }}
            />
            {config[key]?.label ?? item.value}
          </div>
        );
      })}
    </div>
  );
});
ChartLegendContent.displayName = 'ChartLegend';
