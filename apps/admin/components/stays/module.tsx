import { cn } from '@nexg/ui';
import { DatabaseZap, Download, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { RangeControl } from '@/components/portal/client-kit';
import { DashCard, DashHeader, StatusChip, type ChipTone } from '@/components/portal/dash';
import { DashSelect } from '@/components/portal/dash-filters';
import { initials, type Period } from '@/lib/portal';
import {
  CASE_STATUS_LABEL,
  HOST_BUCKET_LABEL,
  label,
  LEAD_STATUS_LABEL,
  RESERVATION_LABEL,
  STAY_STATUS_LABEL,
  UNIT_BUCKET_LABEL,
} from '@/lib/stays-module';

export {
  DataTable,
  ErrorNote,
  FilterRow,
  Footnote,
  Funnel,
  MeterRows,
  PanelLine,
  Stars,
} from '@/components/riders/module';

/*
 * The pieces the Stays screens share, in the dashboard designs' look: the
 * header ("Stays / Overview" with the city, the period and the actions),
 * chips, the guest and unit cells, the side panel frame. Server-safe; the
 * buttons that change things are in ./client.
 */

export interface CityOption {
  id: string;
  name: string;
}

export function StaysHeader({
  screen,
  subtitle,
  period,
  cities,
  city,
  exportHref,
  action,
  noPeriod = false,
}: {
  screen: string;
  subtitle: string;
  period: Period;
  cities: CityOption[];
  city: string | null;
  exportHref?: string;
  action?: React.ReactNode;
  /** Screens about now (the calendar, the hosts queue) leave the period out. */
  noPeriod?: boolean;
}) {
  return (
    <DashHeader
      title={`Stays / ${screen}`}
      subtitle={subtitle}
      actions={
        <>
          {cities.length > 0 && (
            <DashSelect
              label="City"
              param="city"
              value={city ?? 'all'}
              options={cities.map((c) => ({ value: c.id, label: c.name }))}
              className="min-w-[11rem]"
            />
          )}
          {!noPeriod && <RangeControl from={period.from} to={period.to} />}
          {exportHref && (
            /* A plain download link: a client-side Link would fetch the CSV route as a page. */
            <a
              href={exportHref}
              download
              className="focus-visible:ring-gold inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-xl border border-white/40 px-4 text-[0.9375rem] font-bold text-white transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2"
            >
              <Download aria-hidden="true" className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.9} />
              Export
            </a>
          )}
          {action}
        </>
      }
    />
  );
}

/** The gold header action as a link (Add Unit, Create Custom Report…). */
export function GoldLink({
  href,
  icon: Icon,
  children,
  external = false,
}: {
  href: string;
  icon: LucideIcon;
  children: React.ReactNode;
  external?: boolean;
}) {
  const cls =
    'focus-visible:ring-gold inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-b from-[#FFD24D] to-[#F5B400] px-4 text-[0.9375rem] font-bold text-[#1A1A1A] shadow-[0_8px_18px_-10px_rgba(229,168,0,0.9)] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2';
  const body = (
    <>
      <Icon aria-hidden="true" className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.9} />
      {children}
    </>
  );
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {body}
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  ) : (
    <Link href={href} className={cls}>
      {body}
    </Link>
  );
}

/* ─────────────────────────────────────────────────────────────── chips */

const TONE: Record<string, ChipTone> = {
  confirmed: 'blue',
  booked: 'blue',
  checked_in: 'green',
  in_stay: 'green',
  upcoming: 'amber',
  completed: 'grey',
  departed: 'grey',
  cancelled: 'red',
  verified: 'green',
  pending: 'amber',
  sent_back: 'amber',
  flagged: 'red',
  rejected: 'red',
  occupied: 'green',
  available: 'blue',
  setting_up: 'gold',
  inactive: 'grey',
  open: 'amber',
  in_progress: 'blue',
  mediation: 'gold',
  resolved: 'green',
  closed: 'grey',
  invalid: 'grey',
  captured: 'grey',
  qualified: 'blue',
  onboarding: 'blue',
  verification: 'amber',
  activated: 'green',
  lost: 'red',
  active: 'green',
  paused: 'amber',
  ended: 'grey',
  draft: 'grey',
  published: 'green',
  under_review: 'amber',
  hidden: 'grey',
  approved: 'green',
  live: 'green',
  applied: 'amber',
  offboarded: 'red',
};

const ALL_LABELS: Record<string, string> = {
  ...STAY_STATUS_LABEL,
  ...RESERVATION_LABEL,
  ...HOST_BUCKET_LABEL,
  ...UNIT_BUCKET_LABEL,
  ...CASE_STATUS_LABEL,
  ...LEAD_STATUS_LABEL,
  published: 'Published',
  under_review: 'Under Review',
  hidden: 'Hidden',
  active: 'Active',
  paused: 'Paused',
  ended: 'Ended',
  draft: 'Draft',
  approved: 'Approved',
  live: 'Live',
  applied: 'Applied',
  offboarded: 'Offboarded',
};

/** Any stays status as the designs' chip. */
export function Chip({ status, text }: { status: string; text?: string }) {
  return <StatusChip tone={TONE[status] ?? 'grey'}>{text ?? label(ALL_LABELS, status)}</StatusChip>;
}

const PRIORITY_TONE: Record<string, ChipTone> = {
  low: 'green',
  medium: 'amber',
  high: 'red',
  urgent: 'red',
};

export function PriorityChip({ priority }: { priority: string }) {
  return (
    <StatusChip tone={PRIORITY_TONE[priority] ?? 'grey'}>
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </StatusChip>
  );
}

/** A small purple/gold type tag: Host, Property Manager, Partner, Booking… */
export function TypeTag({
  children,
  tone = 'gold',
}: {
  children: React.ReactNode;
  tone?: ChipTone;
}) {
  return <StatusChip tone={tone}>{children}</StatusChip>;
}

/* ─────────────────────────────────────────────────────────── the cells */

/** Initials in the gold circle, the name, a line under it; links when given a href. */
export function PersonCell({
  name,
  sub,
  href,
}: {
  name: string;
  sub?: React.ReactNode;
  href?: string;
}) {
  const body = (
    <span className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#FFE9A8] to-[#F5C842] text-[0.75rem] font-extrabold text-[#5E4300]"
      >
        {initials(name)}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-bold">{name}</span>
        {sub && (
          <span className="text-muted block truncate text-[0.8125rem] font-semibold">{sub}</span>
        )}
      </span>
    </span>
  );
  return href ? (
    <Link href={href} scroll={false} className="hover:underline">
      {body}
    </Link>
  ) : (
    body
  );
}

/** A unit or building: its photo when it has one, a gold tile when not. */
export function PlaceCell({
  title,
  sub,
  photo,
  href,
}: {
  title: string;
  sub?: React.ReactNode;
  photo?: string | null;
  href?: string;
}) {
  const body = (
    <span className="flex min-w-0 items-center gap-2.5">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="h-10 w-12 shrink-0 rounded-lg object-cover" />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-10 w-12 shrink-0 items-center justify-center rounded-lg bg-[#FFF4D6] text-[0.75rem] font-extrabold text-[#8A5C00]"
        >
          {initials(title)}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate font-bold">{title}</span>
        {sub && (
          <span className="text-muted block truncate text-[0.8125rem] font-semibold">{sub}</span>
        )}
      </span>
    </span>
  );
  return href ? (
    <Link href={href} scroll={false} className="hover:underline">
      {body}
    </Link>
  ) : (
    body
  );
}

/** A photo's URL from a unit's or property's photos JSON, when it is a real one. */
export function photoUrl(photo: unknown): string | null {
  if (!photo || typeof photo !== 'object') return null;
  const p = photo as { url?: unknown; src?: unknown; placeholder?: unknown };
  if (p.placeholder) return null;
  const url = typeof p.url === 'string' ? p.url : typeof p.src === 'string' ? p.src : null;
  return url && /^https:\/\//.test(url) ? url : null;
}

/* ─────────────────────────────────────────────────────── the side panel */

/** The detail panel to the right of a table, with its close link. */
export function SidePanel({
  title,
  closeHref,
  children,
  badge,
}: {
  title: React.ReactNode;
  closeHref: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <DashCard className="xl:sticky xl:top-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[1.25rem] font-extrabold tracking-[-0.01em]">{title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {badge}
          <Link
            href={closeHref}
            scroll={false}
            aria-label="Close the details"
            className="text-muted hover:text-ink flex h-8 w-8 items-center justify-center rounded-lg text-xl leading-none"
          >
            ×
          </Link>
        </div>
      </div>
      {children}
    </DashCard>
  );
}

/** A label and value pair in a panel's facts list. */
export function Fact({
  icon: Icon,
  label: text,
  children,
}: {
  icon?: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border flex items-center justify-between gap-3 border-b py-2 text-[0.875rem] last:border-b-0">
      <span className="text-muted flex items-center gap-2 font-semibold">
        {Icon && <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-[#E5A800]" />}
        {text}
      </span>
      <span className="text-right font-bold">{children}</span>
    </div>
  );
}

/** The placeholder when a panel has nothing chosen. */
export function PanelHint({ children }: { children: React.ReactNode }) {
  return (
    <DashCard>
      <p className="text-muted py-10 text-center text-sm font-semibold">{children}</p>
    </DashCard>
  );
}

/** An honest empty line inside a card. */
export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted py-8 text-center text-sm font-semibold">{children}</p>;
}

/** A row of labelled bars, each as long as its share of the largest. */
export function ShareBars({
  rows,
  empty,
}: {
  rows: { label: string; value: number; text: string; icon?: LucideIcon }[];
  empty: string;
}) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  const top = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const Icon = r.icon;
        return (
          <li
            key={r.label}
            className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(3.5rem,auto)] items-center gap-3"
          >
            <span className="flex min-w-0 items-center gap-2 text-[0.875rem] font-semibold">
              {Icon && <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-[#E5A800]" />}
              <span className="truncate">{r.label}</span>
            </span>
            <span className="bg-bg h-2.5 overflow-hidden rounded-full">
              <span
                className="block h-full rounded-full bg-[#F5A623]"
                style={{ width: `${(100 * r.value) / top}%` }}
              />
            </span>
            <span className="text-right text-[0.875rem] font-extrabold tabular-nums">{r.text}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Shown while the database has not got the Stays module functions yet. */
export function WaitingForDatabase() {
  return (
    <DashCard>
      <div className="mx-auto flex max-w-[36rem] flex-col items-center py-14 text-center">
        <DatabaseZap aria-hidden="true" className="h-10 w-10 text-[#E5A800]" strokeWidth={1.6} />
        <p className="mt-4 text-[1.125rem] font-extrabold">Waiting for a database update</p>
        <p className="text-muted mt-2 text-sm font-semibold leading-relaxed">
          These Stays screens are ready, but the database they read from has not been updated yet.
          They fill in on their own once it is. The earlier hotels console still works meanwhile.
        </p>
        <Link
          href="/hotels?tab=hosts"
          className="mt-4 font-bold text-[#826D18] underline underline-offset-4"
        >
          Open the hotels console
        </Link>
      </div>
    </DashCard>
  );
}

/** A two-part layout: the table, and the panel beside it on wide screens. */
export function WithPanel({
  children,
  panel,
  className,
}: {
  children: React.ReactNode;
  panel: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]', className)}>
      {children}
      {panel}
    </div>
  );
}
