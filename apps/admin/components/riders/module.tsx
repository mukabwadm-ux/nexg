import { cn } from '@nexg/ui';
import { DatabaseZap, Download, PlusCircle, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { RangeControl } from '@/components/portal/client-kit';
import {
  DashCard,
  DashHeader,
  HeaderButton,
  StatusChip,
  type ChipTone,
} from '@/components/portal/dash';
import { initials, type Period } from '@/lib/portal';
import {
  BUCKET_LABEL,
  CASE_BUCKET_LABEL,
  DELIVERY_BUCKET_LABEL,
  KYC_LABEL,
  PAYOUT_LABEL,
  PRIORITY_LABEL,
  STAGE_LABEL,
} from '@/lib/riders-module';

/*
 * The pieces the eight Riders screens share, in the dashboard designs'
 * look: the header with the period, Export and the gold action; chips;
 * the rider cell; the funnel; the progress bars; the table frame.
 * Server-safe; the interactive parts are in ./module-client.
 */

/* ─────────────────────────────────────────────────────────── the header */

export function ScreenHeader({
  title,
  subtitle,
  period,
  exportHref,
  action,
}: {
  title: string;
  subtitle: string;
  period: Period;
  /** The CSV of what the screen's table holds, all pages. */
  exportHref: string;
  /** The gold button: a link or a client control. */
  action: React.ReactNode;
}) {
  return (
    <DashHeader
      title={title}
      subtitle={subtitle}
      actions={
        <>
          <RangeControl from={period.from} to={period.to} />
          <HeaderButton icon={Download} href={exportHref}>
            Export
          </HeaderButton>
          {action}
        </>
      }
    />
  );
}

/**
 * Add Rider: riders apply through the one-page form on the website, which
 * checks their phone and takes their documents. Staff signing somebody up
 * in person open the same form, in a new tab.
 */
export function AddRiderButton() {
  const web = (process.env.NEXT_PUBLIC_WEB_ORIGIN ?? 'https://nexgapp.com').replace(/\/$/, '');
  return (
    <a
      href={`${web}/riders`}
      target="_blank"
      rel="noopener noreferrer"
      className="focus-visible:ring-gold inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-b from-[#FFD24D] to-[#F5B400] px-4 text-[0.9375rem] font-bold text-[#1A1A1A] shadow-[0_8px_18px_-10px_rgba(229,168,0,0.9)] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2"
    >
      <PlusCircle aria-hidden="true" className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.9} />
      Add Rider
      <span className="sr-only">(opens the rider application form in a new tab)</span>
    </a>
  );
}

/* ─────────────────────────────────────────────────────────────── chips */

const BUCKET_TONE: Record<string, ChipTone> = {
  online: 'green',
  on_trip: 'amber',
  offline: 'blue',
  suspended: 'grey',
  offboarded: 'red',
  onboarding: 'gold',
};

export function BucketChip({ bucket }: { bucket: string }) {
  return (
    <StatusChip tone={BUCKET_TONE[bucket] ?? 'grey'}>{BUCKET_LABEL[bucket] ?? bucket}</StatusChip>
  );
}

const KYC_TONE: Record<string, ChipTone> = {
  verified: 'green',
  in_review: 'amber',
  rejected: 'red',
  not_started: 'grey',
};

export function KycMark({ kyc }: { kyc: string }) {
  const tone = KYC_TONE[kyc] ?? 'grey';
  const dot =
    tone === 'green'
      ? 'border-[#1E9E45] text-[#1E9E45]'
      : tone === 'red'
        ? 'border-[#D63A2F] text-[#D63A2F]'
        : tone === 'amber'
          ? 'border-[#E5A800] text-[#B57A00]'
          : 'border-[#B9B3A7] text-[#7A746A]';
  const glyph = tone === 'green' ? '✓' : tone === 'red' ? '✕' : tone === 'amber' ? '…' : '–';
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[0.875rem] font-semibold">
      <span
        aria-hidden="true"
        className={cn(
          'flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 text-[0.6875rem] font-black',
          dot,
        )}
      >
        {glyph}
      </span>
      {KYC_LABEL[kyc] ?? kyc}
    </span>
  );
}

const STAGE_TONE: Record<string, ChipTone> = {
  activated: 'green',
  approved: 'blue',
  pending_review: 'amber',
  rejected: 'red',
};

export function StageChip({ stage }: { stage: string }) {
  return <StatusChip tone={STAGE_TONE[stage] ?? 'grey'}>{STAGE_LABEL[stage] ?? stage}</StatusChip>;
}

const PAYOUT_TONE: Record<string, ChipTone> = {
  paid: 'green',
  held: 'amber',
  sending: 'blue',
  failed: 'red',
  cancelled: 'grey',
  rolled: 'grey',
};

export function PayoutChip({ state }: { state: string | null }) {
  if (!state) return <span className="text-muted">No payout yet</span>;
  return (
    <StatusChip tone={PAYOUT_TONE[state] ?? 'grey'}>{PAYOUT_LABEL[state] ?? state}</StatusChip>
  );
}

const CASE_TONE: Record<string, ChipTone> = {
  open: 'amber',
  in_progress: 'blue',
  resolved: 'green',
  escalated: 'red',
};

export function CaseChip({ bucket }: { bucket: string }) {
  return (
    <StatusChip tone={CASE_TONE[bucket] ?? 'grey'}>
      {CASE_BUCKET_LABEL[bucket] ?? bucket}
    </StatusChip>
  );
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
      {PRIORITY_LABEL[priority] ?? priority}
    </StatusChip>
  );
}

const DELIVERY_TONE: Record<string, ChipTone> = {
  delivered: 'green',
  in_transit: 'blue',
  pending_pickup: 'amber',
  failed: 'red',
};

export function DeliveryChip({ bucket }: { bucket: string }) {
  return (
    <StatusChip tone={DELIVERY_TONE[bucket] ?? 'grey'}>
      {DELIVERY_BUCKET_LABEL[bucket] ?? bucket}
    </StatusChip>
  );
}

export function ZoneChip({ name }: { name: string | null }) {
  if (!name) return <span className="text-muted">No zone</span>;
  return (
    <span className="bg-bg text-ink inline-flex max-w-[9rem] truncate rounded-md px-2 py-1 text-[0.8125rem] font-semibold">
      {name}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────── the rider */

/** The rider's initials in the gold square, their name linking to their record. */
export function RiderCell({ id, name, sub }: { id: string | null; name: string; sub?: string }) {
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
  return id ? (
    <Link href={`/riders/${id}`} className="hover:underline">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Stars({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted whitespace-nowrap">No ratings</span>;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap font-bold tabular-nums">
      <span aria-hidden="true" className="text-[#F5B400]">
        ★
      </span>
      {value.toFixed(1)}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────── the charts */

const FUNNEL = ['#E5A800', '#F5C842', '#FAD97A', '#FDEBB5', '#FFF5DA'];

/** The designs' gold funnel, each band as wide as its share of the first. */
export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const top = Math.max(1, steps[0]?.value ?? 1);
  /* A band is never drawn wider than the one above it; the legend keeps the real figures. */
  let floor = top;
  const widths = steps.map((s) => {
    floor = Math.min(floor, s.value);
    return Math.max(18, (160 * floor) / top);
  });
  const h = 30;
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
      <svg viewBox={`0 0 160 ${h * steps.length}`} aria-hidden="true" className="w-full">
        {steps.map((s, i) => {
          const w = widths[i]!;
          const next = widths[i + 1] ?? w * 0.86;
          const y = i * h;
          return (
            <polygon
              key={s.label}
              points={`${80 - w / 2},${y} ${80 + w / 2},${y} ${80 + next / 2},${y + h - 2} ${80 - next / 2},${y + h - 2}`}
              fill={FUNNEL[i % FUNNEL.length]}
            />
          );
        })}
      </svg>
      <ul className="space-y-2.5">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-center justify-between gap-3 text-[0.9375rem]">
            <span className="flex items-center gap-2 font-semibold">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: FUNNEL[i % FUNNEL.length] }}
              />
              {s.label}
            </span>
            <span className="font-extrabold tabular-nums">{s.value.toLocaleString('en-KE')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A label, a bar and its figure: KYC by stage, key metrics, zones. */
export function MeterRows({
  rows,
  empty,
}: {
  rows: {
    label: string;
    value: number | null;
    text: string;
    tone?: 'green' | 'gold' | 'red';
    icon?: LucideIcon;
  }[];
  empty: string;
}) {
  if (rows.length === 0)
    return <p className="text-muted py-6 text-center text-sm font-semibold">{empty}</p>;
  return (
    <ul className="space-y-3.5">
      {rows.map((r) => {
        const Icon = r.icon;
        return (
          <li
            key={r.label}
            className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_4.25rem] items-center gap-3"
          >
            <span className="flex min-w-0 items-center gap-2 text-[0.9375rem] font-semibold">
              {Icon && <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-[#E5A800]" />}
              <span className="truncate">{r.label}</span>
            </span>
            <span className="bg-bg h-2.5 overflow-hidden rounded-full">
              <span
                className={cn(
                  'block h-full rounded-full',
                  r.tone === 'red'
                    ? 'bg-[#E5484D]'
                    : r.tone === 'gold'
                      ? 'bg-[#F5B400]'
                      : 'bg-[#1E9E45]',
                )}
                style={{ width: `${Math.max(0, Math.min(100, r.value ?? 0))}%` }}
              />
            </span>
            <span className="text-right text-[0.9375rem] font-extrabold tabular-nums">
              {r.text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ──────────────────────────────────────────────────────────── the table */

export function DataTable({
  caption,
  head,
  children,
  empty,
  isEmpty,
}: {
  caption: string;
  head: React.ReactNode[];
  children: React.ReactNode;
  empty: string;
  isEmpty: boolean;
}) {
  return (
    <div className="relative -mx-1 overflow-x-auto">
      <table className="w-full min-w-[50rem] border-separate border-spacing-0 text-left text-[0.875rem]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                scope="col"
                className="border-border text-ink whitespace-nowrap border-b px-2.5 py-3 text-[0.8125rem] font-extrabold"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_td]:border-border [&_td]:border-b [&_td]:px-2.5 [&_td]:py-2.5 [&_td]:align-middle">
          {isEmpty ? (
            <tr>
              <td colSpan={head.length} className="text-muted py-12 text-center font-semibold">
                {empty}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

/** The filter row above a table. */
export function FilterRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap gap-2.5 [&>label:first-child]:flex-[2_1_16rem] [&>label]:flex-[1_1_9rem]">
      {children}
    </div>
  );
}

/** A side-panel line: label, figure, optional link. */
export function PanelLine({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  href?: string;
}) {
  const body = (
    <span className="flex items-center justify-between gap-3 py-2.5">
      <span className="flex items-center gap-3 font-semibold">
        <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-[#E5A800]" strokeWidth={1.8} />
        {label}
      </span>
      <span className="flex items-center gap-2 font-extrabold tabular-nums">
        {value}
        {href && <span aria-hidden="true">›</span>}
      </span>
    </span>
  );
  return (
    <li className="border-border border-b last:border-b-0">
      {href ? (
        <Link href={href} className="hover:bg-bg -mx-2 block rounded-lg px-2">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}

/** What a figure counts, under a card. */
export function Footnote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted mt-3 text-[0.8125rem] font-semibold leading-relaxed">{children}</p>
  );
}

/** Shown while production does not have the riders module functions yet. */
export function WaitingForDatabase() {
  return (
    <DashCard>
      <div className="mx-auto flex max-w-[36rem] flex-col items-center py-14 text-center">
        <DatabaseZap aria-hidden="true" className="h-10 w-10 text-[#E5A800]" strokeWidth={1.6} />
        <p className="mt-4 text-[1.125rem] font-extrabold">Waiting for a database update</p>
        <p className="text-muted mt-2 text-sm font-semibold leading-relaxed">
          These Riders screens are ready, but the database they read from has not been updated yet.
          They fill in on their own once it is. The rider console still works in the meantime.
        </p>
        <Link
          href="/riders/console"
          className="mt-4 font-bold text-[#826D18] underline underline-offset-4"
        >
          Open the rider console
        </Link>
      </div>
    </DashCard>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <DashCard>
      <p role="alert" className="text-danger text-sm font-semibold">
        Could not load this screen: {message}
      </p>
    </DashCard>
  );
}
