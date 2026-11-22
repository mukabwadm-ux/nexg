import { cn } from '@nexg/ui';
import { Triangle, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { initials, type Tone } from '@/lib/portal';

/**
 * The pieces the portal-design pages (Company, Finance) are made of:
 * a page title with its big gold icon, a bar of views whose open one is a
 * black pill with a gold icon, KPI cards on soft cream, coloured pills for
 * types and statuses, and initials for people. Server components; the
 * interactive parts live in client-kit.
 */

/* ───────────────────────────────────────────────────────────── the title */

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="console-header flex flex-wrap items-end justify-between gap-x-6 gap-y-4 px-1 pb-5 pt-2 text-white sm:px-2">
      <div className="flex min-w-0 items-center gap-4">
        {/* The designs draw the page's icon large and gold, on its own. */}
        <Icon
          aria-hidden="true"
          className="h-12 w-12 shrink-0 text-[#F5B800] drop-shadow-[0_6px_14px_rgba(240,185,11,0.35)] sm:h-14 sm:w-14"
          strokeWidth={1.6}
        />
        <div className="min-w-0">
          <h1 className="text-balance text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em] sm:text-[2rem]">
            {title}
          </h1>
          <p className="mt-1 max-w-[70ch] text-sm text-white/70 sm:text-[0.9375rem]">{subtitle}</p>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/* ───────────────────────────────────────────────────────────── the views */

export interface ViewTab {
  key: string;
  label: string;
  icon: LucideIcon;
  href: string;
  count?: number | null;
  /** A badge in red, such as items waiting for a decision. */
  alert?: number | null;
}

/** The page's views; the open one is the black pill with a gold icon. */
export function ViewTabs({ tabs, active }: { tabs: ViewTab[]; active: string }) {
  return (
    <nav
      aria-label="Views"
      className="border-border bg-surface flex gap-1 overflow-x-auto rounded-2xl border p-1.5 shadow-[0_1px_2px_rgba(20,20,20,0.04)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((t) => {
        const on = t.key === active;
        const Icon = t.icon;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 text-[0.875rem] font-semibold transition-colors duration-150',
              'focus-visible:ring-gold focus-visible:outline-none focus-visible:ring-2',
              on
                ? 'bg-ink font-bold text-white shadow-[0_8px_18px_-10px_rgba(20,20,20,0.9)]'
                : 'text-muted hover:bg-bg hover:text-ink',
            )}
          >
            <Icon
              aria-hidden="true"
              strokeWidth={1.9}
              className={cn('h-[1.1rem] w-[1.1rem] shrink-0', on ? 'text-gold' : 'text-muted')}
            />
            <span>{t.label}</span>
            {t.count != null && (
              <span className={cn('tabular-nums', on ? 'text-white/60' : 'text-muted-light')}>
                {t.count.toLocaleString('en-KE')}
              </span>
            )}
            {t.alert != null && t.alert > 0 && (
              <span className="bg-danger flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[0.6875rem] font-extrabold tabular-nums text-white">
                {t.alert}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/* ──────────────────────────────────────────────────────────────── KPIs */

const STAT_TONES: Record<Tone, { ring: string; icon: string; card: string }> = {
  gold: {
    ring: 'bg-[#FFF1C7]',
    icon: 'text-[#E5A800]',
    card: 'from-[#FFFDF6] to-[#FFF6DD] border-[#F6E7BC]',
  },
  green: {
    ring: 'bg-success-bg',
    icon: 'text-success',
    card: 'from-[#FBFEFB] to-[#EEF8F0] border-[#D6EEDC]',
  },
  amber: {
    ring: 'bg-[#FFF1C7]',
    icon: 'text-[#C98A00]',
    card: 'from-[#FFFDF6] to-[#FFF4D6] border-[#F6E3B0]',
  },
  red: {
    ring: 'bg-danger-bg',
    icon: 'text-danger',
    card: 'from-[#FFFCFB] to-[#FDEFEC] border-[#F6D9D4]',
  },
  blue: {
    ring: 'bg-info-bg',
    icon: 'text-info',
    card: 'from-[#FCFDFF] to-[#EEF3FA] border-[#D9E4F2]',
  },
  purple: {
    ring: 'bg-[#F3EAFE]',
    icon: 'text-[#7E3FD1]',
    card: 'from-[#FDFBFF] to-[#F5EEFD] border-[#E6D9F8]',
  },
  grey: {
    ring: 'bg-border/70',
    icon: 'text-muted',
    card: 'from-[#FFFFFF] to-[#F7F5F0] border-border',
  },
  ink: {
    ring: 'bg-ink',
    icon: 'text-gold',
    card: 'from-[#FFFFFF] to-[#F7F5F0] border-border',
  },
};

export function StatGrid({
  children,
  className,
  dense = false,
}: {
  children: React.ReactNode;
  className?: string;
  /**
   * Five or more cards of money: the icon sits above the figure until the
   * screen is wide enough for "KES 24,860,000" beside it.
   */
  dense?: boolean;
}) {
  return (
    <ul
      data-dense={dense ? '' : undefined}
      className={cn(
        'group/stats grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))]',
        className,
      )}
    >
      {children}
    </ul>
  );
}

/**
 * One KPI card: the figure large, what it counts under it, and a note or
 * a change against the period before. `value` null means not measured, a
 * dash, never a zero.
 */
export function Stat({
  icon: Icon,
  value,
  label,
  tone = 'gold',
  note,
  noteTone,
  delta,
  deltaNote,
  href,
  wide = false,
  visual,
  children,
}: {
  icon: LucideIcon;
  value: string | null;
  label: string;
  tone?: Tone;
  note?: string;
  noteTone?: 'good' | 'bad' | 'muted';
  /** Percentage change; up is good unless `upIsBad`. */
  delta?: { value: number; upIsBad?: boolean } | null;
  /** What the change is measured against, after the figure: "vs Oct". */
  deltaNote?: string;
  href?: string;
  /** Twice as wide on large screens, like the designs' storage card. */
  wide?: boolean;
  /** Drawn in place of the icon, such as a utilisation ring. */
  visual?: React.ReactNode;
  /** Extra content under the figure, such as a meter. */
  children?: React.ReactNode;
}) {
  const t = STAT_TONES[tone];
  const up = delta ? delta.value >= 0 : false;
  const good = delta ? (delta.upIsBad ? !up : up) : true;
  const body = (
    <>
      {/* As drawn: every card on the same cream, the icon large and bare,
          and only the icon (and the note) take the card's colour. */}
      {visual ?? (
        <Icon
          aria-hidden="true"
          className={cn(
            'h-10 w-10 shrink-0 sm:h-11 sm:w-11',
            /* Five cards of money in a row: a slightly smaller icon leaves
               "KES 24,860,000" room to stay on one line, as drawn. */
            'min-[1500px]:group-data-[dense]/stats:h-9 min-[1500px]:group-data-[dense]/stats:w-9 min-[1760px]:group-data-[dense]/stats:h-11 min-[1760px]:group-data-[dense]/stats:w-11',
            t.icon,
          )}
          strokeWidth={1.6}
        />
      )}
      <span className="w-full min-w-0 flex-1">
        <span
          data-figure
          className="text-ink block break-words text-[1.25rem] font-extrabold leading-tight tracking-[-0.02em] sm:text-[1.375rem] min-[1500px]:group-data-[dense]/stats:whitespace-nowrap min-[1500px]:group-data-[dense]/stats:text-[clamp(1.0625rem,1.12vw,1.375rem)] min-[1760px]:text-[1.5rem]"
        >
          {value ?? '—'}
        </span>
        <span className="text-ink/80 line-clamp-2 block text-[0.875rem] font-semibold leading-snug">
          {label}
        </span>
        {delta ? (
          <span
            className={cn(
              'mt-1 flex flex-wrap items-center gap-x-1 text-[0.8125rem] font-extrabold',
              good ? 'text-success' : 'text-danger',
            )}
          >
            <Triangle
              aria-hidden="true"
              className={cn('h-2.5 w-2.5 fill-current', !up && 'rotate-180')}
            />
            <span className="sr-only">{up ? 'Up' : 'Down'}</span>
            {up ? '+' : '−'}
            {Math.abs(delta.value).toLocaleString('en-KE', { maximumFractionDigits: 1 })}%
            {deltaNote && <span className="text-ink/70 font-semibold">{deltaNote}</span>}
          </span>
        ) : (
          note && (
            <span
              className={cn(
                'mt-0.5 line-clamp-2 block text-xs font-bold leading-snug',
                noteTone === 'good' && 'text-success',
                noteTone === 'bad' && 'text-danger',
                (!noteTone || noteTone === 'muted') && 'text-muted-light',
              )}
            >
              {note}
            </span>
          )
        )}
        {children}
      </span>
    </>
  );
  const cls = cn(
    'flex min-w-0 flex-1 flex-col items-start gap-2.5 rounded-2xl border bg-gradient-to-br p-3.5 sm:flex-row sm:items-center sm:gap-3 sm:p-4',
    'sm:group-data-[dense]/stats:flex-col sm:group-data-[dense]/stats:items-start sm:group-data-[dense]/stats:gap-2.5',
    'min-[1500px]:group-data-[dense]/stats:flex-row min-[1500px]:group-data-[dense]/stats:items-center min-[1500px]:group-data-[dense]/stats:gap-3',
    'shadow-[0_1px_2px_rgba(20,20,20,0.04),0_10px_26px_-22px_rgba(20,20,20,0.35)]',
    STAT_TONES.gold.card,
    href &&
      'focus-visible:ring-gold transition-[box-shadow,transform] duration-200 hover:-translate-y-px hover:shadow-[0_14px_30px_-16px_rgba(20,20,20,0.4)] focus-visible:outline-none focus-visible:ring-2',
  );
  return (
    <li className={cn('flex min-w-0', wide && 'col-span-2 xl:col-span-2')}>
      {href ? (
        <Link href={href} className={cls}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

/* ─────────────────────────────────────────────────────────────── pills */

const PILL_TONES: Record<Tone, string> = {
  gold: 'bg-[#FFF3CC] text-[#8A6400] ring-[#F5DC8A]',
  green: 'bg-success-bg text-success ring-[#CFE9D6]',
  amber: 'bg-[#FFF1D1] text-[#8A5A00] ring-[#F3D79A]',
  red: 'bg-danger-bg text-danger ring-[#F5CFCA]',
  blue: 'bg-info-bg text-info ring-[#D3E1F1]',
  purple: 'bg-[#F3EAFE] text-[#6B2FBF] ring-[#E2D2F9]',
  grey: 'bg-[#F1EFEA] text-muted ring-border',
  ink: 'bg-ink text-white ring-ink',
};

/** A small coloured label for a type or a status. */
export function Pill({
  tone = 'grey',
  dot = false,
  icon: Icon,
  children,
  className,
}: {
  tone?: Tone;
  /** A leading dot, the way status pills are drawn. */
  dot?: boolean;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset',
        PILL_TONES[tone],
        className,
      )}
    >
      {dot && <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
      {Icon && <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Initials in a gold circle, for owners, holders and requesters. */
export function Person({
  name,
  sub,
  size = 'sm',
}: {
  name: string | null | undefined;
  sub?: string | null;
  size?: 'sm' | 'md';
}) {
  if (!name) return <span className="text-muted-light">—</span>;
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden="true"
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full bg-[#FFE9A6] font-extrabold text-[#6B4E00]',
          size === 'sm' ? 'h-8 w-8 text-[0.6875rem]' : 'h-10 w-10 text-xs',
        )}
      >
        {initials(name)}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-semibold">{name}</span>
        {sub && <span className="text-muted-light block truncate text-xs">{sub}</span>}
      </span>
    </span>
  );
}

/** The heading row of a panel: title and aside on the left, controls on the right. */
export function PanelHead({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <h2 className="text-[1.125rem] font-extrabold tracking-[-0.01em]">
        {title}
        {aside && <span className="text-muted-light ml-2 text-xs font-semibold">{aside}</span>}
      </h2>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** A percentage ring for a KPI card: gold to 100%, red beyond it. */
export function Ring({ value, label }: { value: number | null; label: string }) {
  const pct = value == null ? 0 : Math.max(0, value);
  const over = pct > 100;
  const r = 22;
  const c = 2 * Math.PI * r;
  const shown = Math.min(pct, 100);
  return (
    <span
      className="relative flex h-14 w-14 shrink-0 items-center justify-center"
      role="img"
      aria-label={label}
    >
      <svg
        viewBox="0 0 56 56"
        className="absolute inset-0 h-full w-full -rotate-90"
        aria-hidden="true"
      >
        <circle cx="28" cy="28" r={r} fill="none" stroke="rgb(var(--border-rgb))" strokeWidth="6" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke={over ? 'rgb(var(--danger-rgb))' : '#F5B800'}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${(shown / 100) * c} ${c}`}
        />
      </svg>
      <span className={cn('text-[0.75rem] font-extrabold tabular-nums', over && 'text-danger')}>
        {value == null ? '—' : `${Math.round(pct)}%`}
      </span>
    </span>
  );
}

/** A white sheet section with the console's soft depth. */
export function Sheet({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      data-portal-sheet
      className={cn(
        'border-border bg-surface min-w-0 rounded-2xl border p-4 shadow-[0_1px_2px_rgba(20,20,20,0.04),0_10px_26px_-22px_rgba(20,20,20,0.35)] sm:p-5',
        className,
      )}
    >
      {children}
    </section>
  );
}
