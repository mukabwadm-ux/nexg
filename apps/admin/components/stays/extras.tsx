import { cn } from '@nexg/ui';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

/*
 * The smaller pieces the designs repeat across the Stays screens: the tabs
 * inside a side panel, the quick-action tiles, a row of panel buttons that
 * are links, and a "not set up yet" card for tabs whose data NexG does not
 * hold. Server-safe.
 */

/** Underlined tabs inside a side panel; each is a link that sets ?ptab=. */
export function PanelTabs({
  tabs,
  active,
  href,
}: {
  tabs: { key: string; label: string }[];
  active: string;
  href: (key: string) => string;
}) {
  return (
    <nav
      aria-label="Details"
      className="border-border -mx-1 mb-3 flex gap-1 overflow-x-auto border-b"
    >
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={href(t.key)}
          scroll={false}
          aria-current={t.key === active ? 'page' : undefined}
          className={cn(
            '-mb-px whitespace-nowrap border-b-2 px-2.5 py-2 text-[0.875rem] font-bold',
            t.key === active
              ? 'border-[#F5A623] text-[#B57A00]'
              : 'text-muted hover:text-ink border-transparent',
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export interface Tile {
  label: string;
  icon: LucideIcon;
  href?: string;
  /** Opens a download rather than a page. */
  download?: boolean;
  /** Shown greyed with this reason when the action is not built yet. */
  unavailable?: string;
  /** A client control rendered in place of the link (a form button). */
  node?: React.ReactNode;
}

/** The designs' "Quick Actions" grid of gold-outlined tiles. */
export function QuickTiles({ tiles, cols = 2 }: { tiles: Tile[]; cols?: 2 | 3 | 4 | 6 }) {
  const grid =
    cols === 6
      ? 'grid-cols-3 sm:grid-cols-6'
      : cols === 4
        ? 'grid-cols-2 sm:grid-cols-4'
        : cols === 3
          ? 'grid-cols-3'
          : 'grid-cols-2';
  const cls =
    'flex h-full min-h-[5.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border p-2.5 text-center text-[0.8125rem] font-bold';
  return (
    <ul className={cn('grid gap-2', grid)}>
      {tiles.map((t) => {
        const I = t.icon;
        const body = (
          <>
            <I aria-hidden="true" className="h-6 w-6" strokeWidth={1.7} />
            {t.label}
          </>
        );
        return (
          <li key={t.label}>
            {t.node ? (
              t.node
            ) : t.unavailable ? (
              <span
                title={t.unavailable}
                aria-disabled="true"
                className={cn(
                  cls,
                  'border-border text-muted-light cursor-not-allowed bg-[#FAF9F6]',
                )}
              >
                {body}
                <span className="sr-only">: {t.unavailable}</span>
              </span>
            ) : t.download ? (
              <a
                href={t.href}
                download
                className={cn(
                  cls,
                  'border-[#F5D27A] bg-[#FFFBF0] text-[#8A5C00] hover:bg-[#FFF4D6]',
                )}
              >
                {body}
              </a>
            ) : (
              <Link
                href={t.href ?? '#'}
                className={cn(
                  cls,
                  'border-[#F5D27A] bg-[#FFFBF0] text-[#8A5C00] hover:bg-[#FFF4D6]',
                )}
              >
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The outlined buttons under a panel's header (Call, Message, More…), as links. */
export function PanelLinks({
  links,
}: {
  links: { label: string; icon: LucideIcon; href?: string | null; external?: boolean }[];
}) {
  const shown = links.filter((l) => l.href);
  if (shown.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {shown.map((l) => {
        const I = l.icon;
        const cls =
          'inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#F5D27A] bg-[#FFFBF0] px-3 text-[0.8125rem] font-bold text-[#8A5C00] hover:bg-[#FFF4D6]';
        return l.external || /^(tel|mailto|https?):/.test(l.href!) ? (
          <a key={l.label} href={l.href!} className={cls}>
            <I aria-hidden="true" className="h-4 w-4" />
            {l.label}
          </a>
        ) : (
          <Link key={l.label} href={l.href!} className={cls}>
            <I aria-hidden="true" className="h-4 w-4" />
            {l.label}
          </Link>
        );
      })}
    </div>
  );
}

/** A tab whose data NexG does not hold yet: what it would show and where it stands. */
export function NotYet({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-[38rem] flex-col items-center py-10 text-center">
      <p className="text-[1.0625rem] font-extrabold">{title}</p>
      <p className="text-muted mt-2 text-sm font-semibold leading-relaxed">{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** A vertical timeline of a stay's steps, done ones ticked. */
export function Timeline({
  steps,
}: {
  steps: { label: string; when: string; done: boolean; current?: boolean }[];
}) {
  return (
    <ol className="space-y-0">
      {steps.map((s, i) => (
        <li key={s.label} className="relative flex gap-3 pb-3 last:pb-0">
          {i < steps.length - 1 && (
            <span
              aria-hidden="true"
              className="absolute left-[9px] top-5 h-full w-0.5 bg-[#E5E0D6]"
            />
          )}
          <span
            aria-hidden="true"
            className={cn(
              'relative z-[1] mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[0.625rem] font-black',
              s.done ? 'border-[#1E9E45] bg-[#1E9E45] text-white' : 'border-[#B9B3A7] bg-white',
            )}
          >
            {s.done ? '✓' : ''}
          </span>
          <span className={cn('min-w-0 rounded-lg px-2 py-0.5', s.current && 'bg-[#EAF7EE]')}>
            <span className="block text-[0.875rem] font-bold">{s.label}</span>
            <span className="text-muted block text-[0.8125rem] font-semibold">{s.when}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
