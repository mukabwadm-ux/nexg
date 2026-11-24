import { cn } from '@nexg/ui';
import { ArrowRight, Triangle, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

/**
 * The pieces every console page in the admin portal designs is made of:
 * the KPI row (the first card in gold), white panels with a title and a
 * "View all", and the pill tabs that switch a page's views.
 *
 * Server components, so a page can use them without shipping JavaScript.
 */

type IconType = LucideIcon;

export function KpiGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        'grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-[repeat(auto-fit,minmax(9.75rem,1fr))]',
        className,
      )}
    >
      {children}
    </ul>
  );
}

export interface Delta {
  /** Change against the previous period, already in its unit. */
  value: number;
  unit: '%' | 'pp' | '';
  /** Whether going up is good news (it is not for refunds or delays). */
  upIsGood?: boolean;
}

/**
 * One KPI card. `value` null means the figure is not measured yet, which
 * shows as a dash with the reason, never as a zero.
 */
export function Kpi({
  icon: Icon,
  label,
  value,
  delta,
  note,
  featured = false,
  href,
}: {
  icon: IconType;
  /** Where the figure's list lives; the whole card links there. */
  href?: string;
  label: string;
  value: string | null;
  delta?: Delta | null;
  note?: string;
  featured?: boolean;
}) {
  const up = delta ? delta.value >= 0 : false;
  const good = delta ? (delta.upIsGood ?? true) === up : true;
  const Box = href ? Link : 'div';
  return (
    <li className="flex min-w-0">
      <Box
        href={href as string}
        className={cn(
          'flex min-w-0 flex-1 items-start gap-3 rounded-2xl border p-4 transition-[box-shadow,transform] duration-200',
          href &&
            'focus-visible:ring-gold hover:-translate-y-px hover:shadow-[0_14px_30px_-16px_rgba(20,20,20,0.45)] focus-visible:outline-none focus-visible:ring-2',
          featured
            ? 'text-ink from-gold-light via-gold to-gold-deep border-transparent bg-gradient-to-br shadow-[0_10px_28px_-14px_rgb(var(--gold-deep-rgb)/0.75)]'
            : 'border-border bg-surface shadow-[0_1px_2px_rgba(20,20,20,0.04),0_10px_26px_-20px_rgba(20,20,20,0.35)]',
        )}
      >
        {/* Wide screens: the large icon beside the figure, as drawn. Narrower,
          it moves into the label row so the figure keeps the card's width. */}
        <Icon
          strokeWidth={1.6}
          className={cn(
            'mt-0.5 hidden h-9 w-9 shrink-0 2xl:block',
            featured ? 'text-ink/80' : 'text-[#E5A800]',
          )}
        />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'flex items-center gap-1.5 text-[0.8125rem] font-semibold',
              featured ? 'text-ink/80' : 'text-muted',
            )}
          >
            <Icon
              strokeWidth={2}
              aria-hidden="true"
              className={cn(
                'h-4 w-4 shrink-0 2xl:hidden',
                featured ? 'text-ink/80' : 'text-[#E5A800]',
              )}
            />
            <span className="truncate">{label}</span>
          </p>
          <p
            data-figure
            className="mt-0.5 truncate text-[1.5rem] font-extrabold leading-tight tracking-[-0.02em]"
          >
            {value ?? '—'}
          </p>
          {delta ? (
            <p
              className={cn(
                'mt-1 flex items-center gap-1 text-[0.8125rem] font-bold',
                good ? (featured ? 'text-[#0f5a26]' : 'text-success') : 'text-danger',
              )}
            >
              <Triangle
                aria-hidden="true"
                className={cn('h-2.5 w-2.5 fill-current', !up && 'rotate-180')}
              />
              <span className="sr-only">{up ? 'Up' : 'Down'}</span>
              {up ? '+' : '−'}
              {Math.abs(delta.value).toLocaleString('en-KE', { maximumFractionDigits: 1 })}
              {delta.unit === 'pp' ? ' pp' : delta.unit}
              {note && (
                <span
                  className={cn('font-semibold', featured ? 'text-ink/65' : 'text-muted-light')}
                >
                  {note}
                </span>
              )}
            </p>
          ) : (
            note && (
              <p
                className={cn(
                  'mt-1 truncate text-xs font-semibold',
                  featured ? 'text-ink/70' : 'text-muted-light',
                )}
              >
                {note}
              </p>
            )
          )}
        </div>
      </Box>
    </li>
  );
}

export function Panel({
  title,
  aside,
  action,
  children,
  className,
  id,
}: {
  title: React.ReactNode;
  /** Small text beside the title, such as the period. */
  aside?: React.ReactNode;
  /** A "View all" link: {href, label}. */
  action?: { href: string; label: string };
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        'border-border bg-surface flex min-w-0 flex-col rounded-2xl border p-5 shadow-[0_1px_2px_rgba(20,20,20,0.04),0_10px_26px_-22px_rgba(20,20,20,0.35)]',
        className,
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[1.0625rem] font-extrabold tracking-[-0.01em]">
          {title}
          {aside && <span className="text-muted-light ml-2 text-xs font-semibold">{aside}</span>}
        </h2>
        {action && (
          <Link
            href={action.href}
            className="text-gold-text inline-flex items-center gap-1 text-[0.8125rem] font-bold underline-offset-4 hover:underline"
          >
            {action.label}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>
      <div className="mt-4 min-w-0 flex-1">{children}</div>
    </section>
  );
}

export interface PillTab {
  href: string;
  label: string;
  icon?: IconType;
  count?: number | null;
  active: boolean;
  /** Designed but not built: shown, not linked. */
  disabled?: boolean;
}

/** A page's views as pills; the open one in gold. Scrolls sideways on a phone. */
export function PillTabs({ tabs, className }: { tabs: PillTab[]; className?: string }) {
  return (
    <nav
      aria-label="Views"
      className={cn(
        'border-border bg-surface -mx-px flex gap-1 overflow-x-auto rounded-2xl border p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {tabs.map((t) => {
        const Icon = t.icon;
        const body = (
          <>
            {Icon && <Icon className="h-[1.05rem] w-[1.05rem] shrink-0" strokeWidth={1.9} />}
            <span>{t.label}</span>
            {t.count != null && (
              <span className={cn('tabular-nums', t.active ? 'text-ink/70' : 'text-muted-light')}>
                ({t.count.toLocaleString('en-KE')})
              </span>
            )}
          </>
        );
        const cls = cn(
          'flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 text-[0.875rem] font-semibold transition-colors',
          t.active
            ? 'bg-gold text-ink font-bold shadow-[0_6px_16px_-8px_rgb(var(--gold-deep-rgb)/0.8)]'
            : t.disabled
              ? 'text-muted-light/70 cursor-default'
              : 'text-muted hover:bg-bg hover:text-ink',
        );
        return t.disabled ? (
          <span key={t.href} title="Designed, not built yet" className={cls}>
            {body}
          </span>
        ) : (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.active ? 'page' : undefined}
            className={cls}
          >
            {body}
          </Link>
        );
      })}
    </nav>
  );
}

/** KES from cents, compact for tiles: KES 1.2M, KES 48.6K, KES 950. */
export function kesCompact(cents: number): string {
  const kes = cents / 100;
  const abs = Math.abs(kes);
  if (abs >= 1_000_000) return `KES ${(kes / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 10_000) return `KES ${(kes / 1_000).toFixed(1)}K`;
  return `KES ${Math.round(kes).toLocaleString('en-KE')}`;
}

/** Percentage change, or null when there is nothing to compare against. */
export function change(now: number, before: number): number | null {
  if (before === 0) return null;
  return ((now - before) / before) * 100;
}
