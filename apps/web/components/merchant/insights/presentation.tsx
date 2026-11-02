'use client';

import { DataTable, type ColumnDef } from '@nexg/ui';
import { TableViewport } from '@nexg/ui/table-viewport';
import { ArrowDown, ArrowRight, ArrowUp, Info, Table2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { compareMetric, formatInsightValue } from './model';
import type { InsightMetric } from './types';

export function ReportPanel({
  title,
  description,
  children,
  onReport,
  actions,
  className = '',
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onReport?: () => void;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`in-panel ${className}`}>
      <header className="in-panel-heading">
        <div>
          <h2>{title}</h2>
          {description && <p title={description}>{description}</p>}
        </div>
        <div className="in-panel-actions">
          {actions}
          {onReport && (
            <button className="in-text-button" onClick={onReport} type="button">
              View full report <ArrowRight size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </header>
      {children}
    </section>
  );
}

export function MetricCards({
  metrics,
  previous,
  compare,
  onDefinition,
  currency,
  notes,
}: {
  metrics: (InsightMetric | undefined)[];
  previous?: Record<string, InsightMetric>;
  compare: boolean;
  onDefinition: (metric: InsightMetric) => void;
  currency: string;
  notes?: Record<string, ReactNode>;
}) {
  return (
    <div className="in-metrics">
      {metrics
        .filter((metric): metric is InsightMetric => Boolean(metric))
        .map((metric) => {
          const change =
            compare && previous?.[metric.id] ? compareMetric(metric, previous[metric.id]!) : null;
          return (
            <article
              key={metric.id}
              className="in-metric"
              data-metric={metric.id}
              data-status={metric.status}
            >
              <div className="in-metric-label">
                <span>{metric.label}</span>
                <button
                  type="button"
                  className="in-info"
                  aria-label={`Definition: ${metric.label}`}
                  onClick={() => onDefinition(metric)}
                >
                  <Info size={15} aria-hidden="true" />
                </button>
              </div>
              <strong
                title={formatInsightValue(metric, currency)}
                className={metric.value === null ? 'in-metric-unavailable' : ''}
              >
                {formatInsightValue(metric, currency)}
              </strong>
              {metric.format === 'percent' &&
                metric.numerator != null &&
                metric.denominator != null && (
                  <p>
                    {number(metric.numerator)} of {number(metric.denominator)} eligible
                    {notes?.[metric.id]}
                  </p>
                )}
              {metric.status !== 'ready' && (
                <p className="in-metric-reason">
                  {metric.status === 'partial'
                    ? 'Partial evidence'
                    : metric.reason || 'Required evidence is not available.'}
                </p>
              )}
              {change && (
                <p className="in-comparison">
                  {change.status === 'ready' && change.absoluteChange !== null ? (
                    <>
                      {change.absoluteChange >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                      {metric.format === 'percent'
                        ? `${Math.abs(change.absoluteChange).toFixed(1)} pp`
                        : change.percentChange == null
                          ? 'Prior value was zero'
                          : `${Math.abs(change.percentChange).toFixed(1)}%`}{' '}
                      vs previous period
                    </>
                  ) : (
                    'Comparison unavailable'
                  )}
                </p>
              )}
            </article>
          );
        })}
    </div>
  );
}

export const number = (value: number | null | undefined) =>
  value == null
    ? 'Unavailable'
    : new Intl.NumberFormat('en-KE', { maximumFractionDigits: 1 }).format(value);
export const money = (minor: number | null | undefined, currency = 'KES') =>
  minor == null
    ? 'Unavailable'
    : new Intl.NumberFormat('en-KE', {
        style: 'currency',
        currency,
        currencyDisplay: 'code',
        maximumFractionDigits: 2,
      }).format(minor / 100);

export function BarReport({
  title,
  description,
  data,
  unit,
  vertical = false,
  donut = false,
  onReport,
}: {
  title: string;
  description?: string;
  data: { label: string; value: number | null }[];
  unit: string;
  vertical?: boolean;
  donut?: boolean;
  onReport?: () => void;
}) {
  const [table, setTable] = useState(false);
  const maximum = Math.max(1, ...data.map((item) => item.value ?? 0));
  return (
    <ReportPanel
      title={title}
      description={description}
      onReport={onReport}
      actions={
        <button
          type="button"
          className="in-table-toggle"
          aria-pressed={table}
          onClick={() => setTable(!table)}
        >
          <Table2 size={14} aria-hidden="true" />
          {table ? 'Chart view' : 'Table view'}
        </button>
      }
    >
      {data.length === 0 ? (
        <div className="in-empty-chart">No matching evidence for this scope.</div>
      ) : table ? (
        <TableViewport className="in-chart-table" label={`${title} values`}>
          <table>
            <caption className="sr-only">
              {title}, {unit}
            </caption>
            <thead>
              <tr>
                <th scope="col">Group</th>
                <th scope="col">{unit}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.label}>
                  <th scope="row">{item.label}</th>
                  <td>{number(item.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableViewport>
      ) : donut ? (
        <Donut data={data} unit={unit} title={title} />
      ) : (
        <figure
          aria-label={`${title}. Values in ${unit}. Use Table view for the same data.`}
          className={vertical ? 'in-vertical-chart' : 'in-bars'}
        >
          {vertical ? (
            <>
              <div className="in-chart-axis" aria-hidden="true">
                <span>{number(maximum)}</span>
                <span>{number(maximum / 2)}</span>
                <span>0</span>
              </div>
              <div className="in-chart-columns">
                {data.map((item) => (
                  <div className="in-chart-column" key={item.label}>
                    <div className="in-column-space">
                      <span
                        className="in-column-value"
                        style={{
                          bottom: `${item.value == null ? 0 : Math.max(0, (item.value / maximum) * 100)}%`,
                        }}
                      >
                        {number(item.value)}
                      </span>
                      <span
                        className="in-column-bar"
                        style={{
                          height: `${item.value == null ? 0 : Math.max(0, (item.value / maximum) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="in-column-label">{item.label}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            data.map((item) => (
              <div className="in-bar-row" key={item.label}>
                <span>{item.label}</span>
                <span className="in-bar-track">
                  <span
                    style={{
                      width: `${item.value == null ? 0 : Math.max(0, (item.value / maximum) * 100)}%`,
                    }}
                  />
                </span>
                <strong>{number(item.value)}</strong>
              </div>
            ))
          )}
          <figcaption>{unit}</figcaption>
        </figure>
      )}
    </ReportPanel>
  );
}

function Donut({
  data,
  unit,
  title,
}: {
  data: { label: string; value: number | null }[];
  unit: string;
  title: string;
}) {
  const total = data.reduce((sum, row) => sum + Math.max(0, row.value ?? 0), 0);
  const colors = ['var(--gold)', 'var(--ink)', '#a9a69d', '#e5cc83', '#d9d6cf'];
  let offset = 0;
  return (
    <figure
      className="in-donut"
      aria-label={`${title}. Values in ${unit}. Use Table view for the same data.`}
    >
      <svg
        viewBox="0 0 128 128"
        role="img"
        aria-label={
          data.every((row) => row.value === null)
            ? 'Evidence unavailable'
            : `${number(total)} ${unit}`
        }
      >
        <circle cx="64" cy="64" r="48" fill="none" stroke="var(--border)" strokeWidth="18" />
        {data.map((row, index) => {
          const length = total ? (Math.max(0, row.value ?? 0) / total) * 100 : 0;
          const start = offset;
          offset += length;
          return (
            <circle
              key={row.label}
              cx="64"
              cy="64"
              r="48"
              fill="none"
              stroke={colors[index % colors.length]}
              strokeWidth="18"
              pathLength="100"
              strokeDasharray={`${length} ${100 - length}`}
              strokeDashoffset={-start}
              transform="rotate(-90 64 64)"
            />
          );
        })}
        <text x="64" y="63" textAnchor="middle" className="in-donut-total">
          {data.every((row) => row.value === null)
            ? 'Unavailable'
            : number(total).length > 8
              ? new Intl.NumberFormat('en-KE', {
                  notation: 'compact',
                  maximumFractionDigits: 1,
                }).format(total)
              : number(total)}
        </text>
        <text x="64" y="78" textAnchor="middle" className="in-donut-unit">
          {unit}
        </text>
      </svg>
      <figcaption>
        {data.map((row, index) => (
          <div key={row.label} className="in-donut-key">
            <i style={{ background: colors[index % colors.length] }} />
            <span>{row.label}</span>
            <strong>
              {row.value === null
                ? 'Unavailable'
                : `${total ? Math.round((row.value / total) * 100) : 0}%`}
            </strong>
          </div>
        ))}
      </figcaption>
    </figure>
  );
}

export function EvidenceTable<T>({
  title,
  description,
  columns,
  data,
  onReport,
  pageSize = 5,
}: {
  title: string;
  description?: string;
  columns: ColumnDef<T, unknown>[];
  data: T[];
  onReport?: () => void;
  pageSize?: number;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [fittedRows, setFittedRows] = useState(pageSize);
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const fit = () => {
      const header = body.querySelector('thead')?.getBoundingClientRect().height ?? 24;
      const footer =
        body.querySelector('[data-table-pagination]')?.getBoundingClientRect().height ?? 28;
      const row = body.querySelector('tbody tr')?.getBoundingClientRect().height ?? 24;
      const padding = getComputedStyle(body);
      const available =
        body.getBoundingClientRect().height -
        parseFloat(padding.paddingTop) -
        parseFloat(padding.paddingBottom);
      const root = body.querySelector('[data-table-root]');
      const gap = root ? parseFloat(getComputedStyle(root).rowGap) || 0 : 4;
      const count = Math.max(
        1,
        Math.min(pageSize, Math.floor((available - header - footer - gap - 3) / Math.max(24, row))),
      );
      setFittedRows((current) => (current === count ? current : count));
    };
    const observer = new ResizeObserver(fit);
    observer.observe(body);
    fit();
    return () => observer.disconnect();
  }, [pageSize, data.length]);
  return (
    <ReportPanel
      title={title}
      description={
        description ?? `${number(data.length)} matching ${data.length === 1 ? 'record' : 'records'}`
      }
      onReport={onReport}
      className="in-evidence"
    >
      <div className="in-evidence-body" ref={bodyRef}>
        <DataTable
          data={data}
          columns={columns}
          caption={title}
          pageSize={fittedRows}
          emptyTitle="No matching records"
          emptyDescription="Try a different period or clear the active filters."
        />
      </div>
    </ReportPanel>
  );
}

export function Unavailable({
  title = 'This report needs more evidence',
  message,
  action,
}: {
  title?: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <section className="in-unavailable">
      <div className="in-unavailable-icon">
        <Info size={22} aria-hidden="true" />
      </div>
      <div>
        <h2>{title}</h2>
        <p>{message}</p>
        {action}
      </div>
    </section>
  );
}
