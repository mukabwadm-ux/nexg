'use client';

import { TableViewport } from '@nexg/ui/table-viewport';
import type { ReactNode } from 'react';

import styles from './workspace.module.css';

const tabs = ['Campaigns', 'History'] as const;
export type PromotionTab = (typeof tabs)[number];

export function PromotionsFrame({
  title,
  businessName,
  profileId,
  busy,
  action,
  children,
}: {
  title: string;
  businessName: string;
  profileId?: string;
  busy?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main
      className={styles.root + ' ' + styles.workspace}
      data-promotions-workspace
      data-profile={profileId}
      aria-busy={busy}
    >
      <div className="pm-header">
        <div>
          <h1>{title}</h1>
          <p>{businessName}</p>
        </div>
        {action}
      </div>
      {children}
    </main>
  );
}

export function PromotionTabs({
  active,
  onSelect,
}: {
  active: PromotionTab;
  onSelect: (tab: PromotionTab) => void;
}) {
  return (
    <div className="pm-tabs" role="tablist" aria-label="Promotions sections">
      {tabs.map((tab) => (
        <button
          key={tab}
          id={'pm-tab-' + tab}
          type="button"
          role="tab"
          aria-selected={active === tab}
          aria-controls={'pm-panel-' + tab}
          tabIndex={active === tab ? 0 : -1}
          className="pm-tab"
          onClick={() => onSelect(tab)}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next =
              event.key === 'Home'
                ? 'Campaigns'
                : event.key === 'End'
                  ? 'History'
                  : active === 'Campaigns'
                    ? 'History'
                    : 'Campaigns';
            onSelect(next);
            document.getElementById('pm-tab-' + next)?.focus();
          }}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

export function PromotionTable({ tab, children }: { tab: PromotionTab; children: ReactNode }) {
  const history = tab === 'History';
  return (
    <TableViewport className="pm-table-wrap" label="Promotion records">
      <table>
        <thead>
          <tr>
            <th scope="col">{history ? 'Promotion' : 'Campaign'}</th>
            <th scope="col">{history ? 'Type' : 'Offer / placement'}</th>
            <th scope="col" className="pm-desktop-column">
              {history ? 'Period' : 'Applies to'}
            </th>
            <th scope="col">{history ? 'Outcome' : 'Status'}</th>
            <th scope="col" aria-label="Open" />
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </TableViewport>
  );
}

export function PromotionStatus({
  label,
  tone,
  badge = false,
}: {
  label: string;
  tone: 'green' | 'blue' | 'amber' | 'red' | 'grey';
  badge?: boolean;
}) {
  return (
    <span className={badge ? 'pm-badge' : 'pm-state'} data-tone={tone}>
      {label}
    </span>
  );
}
