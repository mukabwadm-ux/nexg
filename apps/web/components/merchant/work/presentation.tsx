'use client';

import { TableViewport } from '@nexg/ui/table-viewport';
import { ArrowLeft, Check, ChevronRight, Search, X } from 'lucide-react';
import { useState, type KeyboardEvent, type ReactNode } from 'react';

import offeringStyles from '../offerings/workspace.module.css';
import workspaceStyles from '../workspace/workspace.module.css';

export function WorkLayout({
  children,
  detail,
  mobileDetail = false,
}: {
  children: ReactNode;
  detail?: ReactNode;
  mobileDetail?: boolean;
}) {
  return (
    <div className={workspaceStyles.workRoot}>
      <div
        data-work-layout
        className={`${workspaceStyles.workLayout} ${detail ? workspaceStyles.workSplit : ''}`}
      >
        <main
          data-work-main
          data-mobile-detail={detail && mobileDetail ? 'true' : 'false'}
          className={workspaceStyles.workMain}
        >
          {children}
        </main>
        {detail && (
          <div
            className={`${offeringStyles.root} ${workspaceStyles.workDetail} min-h-0 min-w-0 px-5 pb-3 pt-3 xl:flex xl:px-3 ${mobileDetail ? 'block' : 'hidden xl:flex'}`}
          >
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}

export function WorkHeading({
  description,
  actions,
}: {
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight">Work</h1>
        <p className="mt-1 text-sm text-[#626675]">{description}</p>
      </div>
      {actions}
    </div>
  );
}

export function WorkTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly { id: T; label: string; count: number | '–' }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Work views"
      className="mt-2 flex overflow-x-auto overflow-y-hidden border-b border-[#e2e2df]"
    >
      {tabs.map(({ id, label, count }) => (
        <button
          type="button"
          role="tab"
          aria-selected={value === id}
          key={id}
          onClick={() => onChange(id)}
          className={`flex shrink-0 items-center gap-2 border-b-2 px-3 pb-2 text-sm font-semibold ${value === id ? 'border-[#b68a35] text-[#14243a]' : 'border-transparent text-[#6b7583]'}`}
        >
          {label}
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${value === id ? 'bg-[#f2e3c3] text-[#72551b]' : 'bg-[#eeefef] text-[#606b78]'}`}
          >
            {count}
          </span>
        </button>
      ))}
    </div>
  );
}

export function WorkSearch({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  children?: ReactNode;
}) {
  return (
    <div className="my-2 flex flex-wrap gap-2">
      <label className="relative min-w-[12rem] flex-1">
        <span className="sr-only">{placeholder}</span>
        <Search size={17} className="absolute left-3 top-3 text-[#6a7787]" aria-hidden="true" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border border-[#dedfdf] bg-white py-2 pl-10 pr-3 text-sm outline-[#b68a35]"
        />
      </label>
      {children}
    </div>
  );
}

export function WorkQueue({
  columns,
  children,
}: {
  columns: readonly [string, string, string, string, string];
  children: ReactNode;
}) {
  return (
    <TableViewport
      label="Work queue"
      data-testid="work-queue"
      className={workspaceStyles.workQueue}
    >
      <div
        data-work-queue-header
        className={`${workspaceStyles.workQueueHeader} hidden grid-cols-[1.2fr_.7fr_1.6fr_.8fr_.7fr] gap-3 border-b border-[#ecebe8] px-3 py-2 text-xs font-semibold text-[#687585] md:grid`}
      >
        {columns.map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
      {children}
    </TableViewport>
  );
}

export function WorkQueueRow({
  id,
  customer,
  item,
  context,
  milestone,
  stage,
  operator,
  selected,
  onSelect,
}: {
  id: string;
  customer: string;
  item: string;
  context: string;
  milestone: string;
  stage: ReactNode;
  operator: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`grid min-h-[2rem] w-full grid-cols-[1fr_auto] items-center gap-2 border-b border-[#eeedea] px-3 py-2 text-left last:border-b-0 hover:bg-[#fbf7ee] md:grid-cols-[1.2fr_.7fr_1.6fr_.8fr_.7fr] md:gap-3 md:py-1 ${selected ? 'border-l-4 border-l-[#bd9343] bg-[#fbf1dc]' : 'border-l-4 border-l-transparent'}`}
    >
      <span className="min-w-0 truncate text-xs" title={`${id} · ${customer}`}>
        <strong>{id}</strong>
        <span className="ml-1.5 text-[#667384]">{customer}</span>
      </span>
      <span className="hidden min-w-0 truncate text-xs md:block" title={item}>
        {item}
      </span>
      <span
        className="hidden min-w-0 truncate text-xs md:block"
        title={`${context} · ${milestone}`}
      >
        {context} <span className="text-[#667384]">· {milestone}</span>
      </span>
      <span className="flex min-w-0 items-center gap-2">
        {stage}
        <ChevronRight size={16} className="shrink-0 text-[#6d7885] md:hidden" aria-hidden="true" />
      </span>
      <span className="hidden min-w-0 items-center justify-between gap-1 text-xs md:flex">
        <span className="truncate" title={operator}>
          {operator}
        </span>
        <ChevronRight size={14} className="shrink-0 text-[#6d7885]" aria-hidden="true" />
      </span>
    </button>
  );
}

export function WorkRecordPanel({
  title,
  subtitle,
  stage,
  onBack,
  onClose,
  history,
  children,
  footer,
  busy,
}: {
  title: string;
  subtitle: string;
  stage: ReactNode;
  onBack: () => void;
  onClose: () => void;
  history: string[];
  children: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
}) {
  const [detailTab, setDetailTab] = useState<'details' | 'activity'>('details');
  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 'details'
        : event.key === 'End'
          ? 'activity'
          : detailTab === 'details'
            ? 'activity'
            : 'details';
    setDetailTab(next);
    document.getElementById(`work-tab-${next}`)?.focus();
  }

  return (
    <aside className="of-editor" aria-label="Selected work detail" aria-busy={busy}>
      <div className="of-editor-heading" style={{ padding: '10px 14px 4px' }}>
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-3 flex items-center gap-1 text-sm font-semibold text-[#806124] xl:hidden"
          >
            <ArrowLeft size={16} /> Back to work
          </button>
          <div className="of-title-row">
            <h2>{title}</h2>
            {stage}
          </div>
          <p>{subtitle}</p>
        </div>
        <button type="button" className="of-icon" aria-label="Close work details" onClick={onClose}>
          <X size={19} />
        </button>
      </div>
      <div
        className="of-editor-tabs"
        style={{ margin: '0 14px' }}
        role="tablist"
        aria-label="Work detail sections"
      >
        {(['details', 'activity'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`work-tab-${id}`}
            style={{ padding: '6px 8px' }}
            aria-controls={`work-panel-${id}`}
            aria-selected={detailTab === id}
            tabIndex={detailTab === id ? 0 : -1}
            onKeyDown={handleTabKey}
            onClick={() => setDetailTab(id)}
          >
            {id === 'details' ? 'Details' : 'Activity'}
          </button>
        ))}
      </div>
      <div
        className="of-editor-body"
        style={{ padding: '8px 14px' }}
        role="tabpanel"
        id={`work-panel-${detailTab}`}
        aria-labelledby={`work-tab-${detailTab}`}
        tabIndex={0}
      >
        {detailTab === 'details' ? (
          children
        ) : (
          <div>
            <h3 className="text-base font-semibold">Activity history</h3>
            <p className="mt-1 text-xs text-[#72808e]">Sample events for this record</p>
            <ol className="mt-4 space-y-3">
              {history.map((entry, index) => (
                <li key={`${entry}-${index}`} className="flex gap-3 text-sm">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#b58a38] text-white">
                    <Check size={12} aria-hidden="true" />
                  </span>
                  <span>{entry}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
      {footer && (
        <div className="of-editor-footer" style={{ padding: '8px 14px' }}>
          {footer}
        </div>
      )}
    </aside>
  );
}
