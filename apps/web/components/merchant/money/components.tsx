'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { TableViewport } from '@nexg/ui/table-viewport';
import { Info, X, type LucideIcon } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import styles from './workspace.module.css';

export function MoneyFrame({
  description,
  actions,
  profile,
  schema,
  ready,
  children,
}: {
  description: string;
  actions?: ReactNode;
  profile?: string;
  schema?: string;
  ready: boolean;
  children: ReactNode;
}) {
  return (
    <div className={styles.root}>
      <main
        className="mo-workspace"
        data-testid="money-workspace"
        data-profile={profile}
        data-schema={schema}
        data-ready={ready}
      >
        <div className="mo-heading">
          <div>
            <h1>Money</h1>
            <p>{description}</p>
          </div>
          {actions && <div className="mo-heading-actions">{actions}</div>}
        </div>
        {children}
      </main>
    </div>
  );
}

export function MoneyTabs<Tab extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: readonly Tab[];
  active: Tab;
  onSelect: (tab: Tab) => void;
}) {
  return (
    <div className="mo-tabs" role="tablist" aria-label="Money views">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={active === tab}
          onClick={() => onSelect(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  title,
  description,
  children,
  onClose,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}) {
  const focus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={`${styles.root} ${styles.modal}`}
          onOpenAutoFocus={() => {
            focus.current = document.activeElement as HTMLElement | null;
          }}
          onCloseAutoFocus={(e) => {
            if (focus.current?.isConnected) {
              e.preventDefault();
              focus.current.focus();
            }
          }}
        >
          <header className="mo-dialog-head">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
            </div>
            <button className="mo-icon" aria-label="Close dialog" onClick={onClose}>
              <X size={18} />
            </button>
          </header>
          <div className="mo-dialog-body">{children}</div>
          {footer && <footer className="mo-dialog-footer">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export type Metric = {
  label: string;
  value: string;
  note?: string;
  definition: string;
  icon: LucideIcon;
  tone?: 'red' | 'gold' | 'green' | 'blue';
};
export function Metrics({
  metrics,
  onInfo,
}: {
  metrics: Metric[];
  onInfo: (metric: Metric) => void;
}) {
  return (
    <div className="mo-metrics" aria-label="Money summary">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <section className="mo-metric" key={metric.label}>
            <Icon
              className={`mo-metric-icon ${metric.tone ? 'mo-' + metric.tone : ''}`}
              size={21}
              aria-hidden="true"
            />
            <div className="mo-metric-content">
              <div className="mo-metric-label">
                {metric.label}
                <button
                  className="mo-info"
                  aria-label={`About ${metric.label}`}
                  onClick={() => onInfo(metric)}
                >
                  <Info size={14} />
                </button>
              </div>
              <strong>{metric.value}</strong>
              {metric.note && <small>{metric.note}</small>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
export type TableRow = {
  id: string;
  cells: ReactNode[];
  search: string;
  type: string;
  status: string;
  tags?: string[];
};
export function matchesTableRow(row: TableRow, search: string, filter: string) {
  return (
    (filter === 'All' ||
      row.type === filter ||
      row.status === filter ||
      row.tags?.includes(filter)) &&
    row.search.toLowerCase().includes(search.trim().toLowerCase())
  );
}
export function DataTable({
  title,
  columns,
  rows,
  selected,
  onSelect,
  search,
  onSearch,
  filter,
  onFilter,
  filters,
  footer,
  showControls = true,
  onClear,
  emptyMessage = 'No records in this sample.',
}: {
  title: string;
  columns: string[];
  rows: TableRow[];
  selected: string;
  onSelect: (id: string) => void;
  search: string;
  onSearch: (v: string) => void;
  filter: string;
  onFilter: (v: string) => void;
  filters: string[];
  footer?: ReactNode;
  showControls?: boolean;
  onClear?: () => void;
  emptyMessage?: string;
}) {
  const filtered = rows.filter((row) => matchesTableRow(row, search, filter));
  return (
    <section className="mo-table-card" data-testid="money-table-card">
      <div className="mo-table-heading">
        <h2>{title}</h2>
        {showControls && (
          <div className="mo-table-controls">
            <label className="mo-search">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label={`Search ${title.toLowerCase()}`}
                placeholder={
                  title === 'Transactions'
                    ? 'Search reference, work or customer'
                    : title === 'Statements & reports' || title === 'Payouts & settlements'
                      ? 'Search reference or period'
                      : 'Search reference or work'
                }
                value={search}
                onChange={(e) => onSearch(e.target.value)}
              />
            </label>
            <select
              aria-label={`Filter ${title.toLowerCase()}`}
              value={filter}
              onChange={(e) => onFilter(e.target.value)}
            >
              {filters.map((v) => (
                <option key={v} value={v}>
                  {v === 'Sale'
                    ? 'Payments'
                    : v === 'Refund'
                      ? 'Refunds'
                      : v === 'Fee'
                        ? 'Fees'
                        : v}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <TableViewport
        label={title + ' records'}
        className="mo-table-scroll"
        data-testid="money-table-scroll"
      >
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} scope="col" role="columnheader">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={row.id}
                className={selected === row.id ? 'mo-selected' : ''}
                onClick={() => onSelect(row.id)}
              >
                {row.cells.map((cell, i) => (
                  <td key={i} data-label={columns[i]}>
                    {i === 0 ? (
                      <button
                        className="mo-row-link"
                        aria-label={`Open ${row.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(row.id);
                        }}
                      >
                        {cell}
                      </button>
                    ) : (
                      cell
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="mo-empty">
            {rows.length ? (
              <>
                No records match these filters.{' '}
                <button
                  className="mo-link"
                  onClick={() => {
                    if (onClear) onClear();
                    else {
                      onSearch('');
                      onFilter('All');
                    }
                  }}
                >
                  Clear filters
                </button>
              </>
            ) : (
              emptyMessage
            )}
          </div>
        )}
      </TableViewport>
      <div className="mo-table-footer">
        <span>
          {filtered.length} {filtered.length === 1 ? 'record' : 'records'} shown
        </span>
        {footer}
      </div>
    </section>
  );
}
export function Pair({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className={`mo-pair${strong ? 'mo-pair-strong' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
