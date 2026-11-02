'use client';

import * as React from 'react';

/** Adapted from Admin-panel by Maniruzzaman Jubayer (MIT). See docs/third-party/admin-panel-MIT.txt. */
export type HomeChartPoint = { label: string; date: string; value: number; display: string };

/** The positions use the dates provided by the reporting view; missing days are not invented. */
export function HomeColumnChart({
  points,
  measure,
  period = 'this week',
  format = 'number',
}: {
  points: HomeChartPoint[];
  measure: string;
  period?: string;
  format?: 'number' | 'currency';
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);
  const [focused, setFocused] = React.useState<number | null>(null);

  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setWidth(Math.floor(element.getBoundingClientRect().width));
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Keep the overview graph compact; its data and focus targets remain available.
  const height = 104;
  const left = 34;
  const right = 12;
  const top = 7;
  const bottom = 22;
  const plotWidth = Math.max(0, width - left - right);
  const plotHeight = height - top - bottom;
  const max = Math.max(0, ...points.map((point) => point.value));
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(max, 1))));
  const scale = Math.ceil(Math.max(max, 1) / magnitude) * magnitude;
  const dates = points.map((point) => Date.parse(`${point.date}T00:00:00Z`));
  const first = dates[0] ?? 0;
  const last = dates[dates.length - 1] ?? first;
  const x = (index: number) =>
    left +
    (last > first && Number.isFinite(dates[index])
      ? (((dates[index] ?? first) - first) / (last - first)) * plotWidth
      : points.length > 1
        ? (index / (points.length - 1)) * plotWidth
        : plotWidth / 2);
  const y = (value: number) => top + plotHeight - (value / scale) * plotHeight;
  const paths: string[] = [];
  const segments: Array<Array<{ x: number; y: number }>> = [];
  points.forEach((point, index) => {
    const gap = index > 0 && (dates[index] ?? 0) - (dates[index - 1] ?? 0) > 86_400_000;
    paths.push(
      `${index === 0 || gap ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`,
    );
    if (index === 0 || gap) segments.push([]);
    segments[segments.length - 1]?.push({ x: x(index), y: y(point.value) });
  });
  const formatTick = (value: number) =>
    format === 'currency'
      ? new Intl.NumberFormat('en-KE', { notation: 'compact', maximumFractionDigits: 1 }).format(
          value / 100,
        )
      : new Intl.NumberFormat('en-KE', { maximumFractionDigits: 1 }).format(value);

  return (
    <div className="relative mt-1">
      <div ref={ref} className="w-full">
        {width > 0 && points.length > 0 ? (
          <svg
            width={width}
            height={height}
            role="group"
            aria-label={`${measure} by day ${period}`}
          >
            {[0, 1, 2, 3, 4].map((tick) => {
              const value = (scale * tick) / 4;
              return (
                <g key={tick}>
                  <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="#ece9e3" />
                  <text x={left - 8} y={y(value) + 3} textAnchor="end" fill="#77849a" fontSize="10">
                    {formatTick(value)}
                  </text>
                </g>
              );
            })}
            {segments.map((segment, index) => {
              if (segment.length < 2) return null;
              const firstPoint = segment[0];
              const lastPoint = segment[segment.length - 1];
              if (!firstPoint || !lastPoint) return null;
              const shape = segment
                .map((point, i) => `${i ? 'L' : 'M'}${point.x},${point.y}`)
                .join(' ');
              return (
                <path
                  key={index}
                  d={`${shape} L${lastPoint.x},${top + plotHeight} L${firstPoint.x},${top + plotHeight} Z`}
                  fill="#faf4e6"
                />
              );
            })}
            <path
              d={paths.join(' ')}
              fill="none"
              stroke="#d39b36"
              strokeWidth={2}
              strokeLinejoin="round"
            />
            {points.map((point, index) => (
              <g key={point.date}>
                <circle cx={x(index)} cy={y(point.value)} r={4} fill="#d39b36" />
                <text
                  x={x(index)}
                  y={height - 4}
                  textAnchor={
                    index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'
                  }
                  fill="#77849a"
                  fontSize="10"
                >
                  {point.label}
                </text>
                <circle
                  cx={x(index)}
                  cy={y(point.value)}
                  r={12}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${point.date}: ${point.display} ${measure}`}
                  onPointerEnter={() => setFocused(index)}
                  onPointerLeave={() => setFocused(null)}
                  onFocus={() => setFocused(index)}
                  onBlur={() => setFocused(null)}
                  className="focus-visible:outline focus-visible:outline-2"
                />
              </g>
            ))}
          </svg>
        ) : null}
      </div>
      <p
        className={
          focused === null
            ? 'sr-only'
            : 'text-muted absolute right-2 top-0 rounded bg-white px-2 py-1 text-xs shadow'
        }
        aria-live="polite"
      >
        {focused !== null && points[focused]
          ? `${points[focused].date}: ${points[focused].display} ${measure}`
          : 'Focus a point for its value.'}
      </p>
    </div>
  );
}
