import { cn } from '@nexg/ui';
import { Check, CheckCircle2, Circle, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

/*
 * The right-hand detail panes in the Merchant Verification and Catalogues
 * designs: a numbered progress line, pill tabs with icons, ticked rows and
 * the action buttons along the bottom.
 */

export interface Step {
  label: string;
  /** "Completed", "In Review", "Pending". */
  note: string;
  state: 'done' | 'current' | 'todo';
}

/** Application → Documents → Compliance → Final Decision. */
export function Stepper({ steps }: { steps: Step[] }) {
  return (
    <ol className="grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((s, i) => (
        <li key={s.label} className="relative flex flex-col items-center text-center">
          {i > 0 && (
            <span
              aria-hidden="true"
              className={cn(
                'absolute right-1/2 top-[1.0625rem] h-0.5 w-full -translate-y-1/2',
                steps[i - 1]?.state === 'done' ? 'bg-[#E5A800]' : 'bg-border',
              )}
            />
          )}
          <span
            className={cn(
              'relative z-10 flex h-[2.125rem] w-[2.125rem] items-center justify-center rounded-full border-2 text-[0.875rem] font-extrabold',
              s.state === 'done' && 'border-[#1E9E45] bg-[#1E9E45] text-white',
              s.state === 'current' && 'border-[#E5A800] bg-[#FFD24D] text-[#1A1A1A]',
              s.state === 'todo' && 'border-border-strong bg-surface text-ink',
            )}
          >
            {s.state === 'done' ? (
              <Check aria-hidden="true" className="h-4 w-4" strokeWidth={3} />
            ) : (
              i + 1
            )}
          </span>
          <span className="text-ink mt-2 text-[0.875rem] font-bold">{s.label}</span>
          <span className="text-muted text-[0.75rem] font-semibold">{s.note}</span>
          <span className="sr-only">
            {s.state === 'done' ? 'done' : s.state === 'current' ? 'in progress' : 'not started'}
          </span>
        </li>
      ))}
    </ol>
  );
}

export interface PillTab {
  key: string;
  label: string;
  icon: LucideIcon;
  href: string;
  count?: number | null;
}

/** Tabs inside a pane; the open one is a gold pill. */
export function PillTabs({
  tabs,
  active,
  label,
}: {
  tabs: PillTab[];
  active: string;
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="border-border flex gap-1 overflow-x-auto border-b pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((t) => {
        const on = t.key === active;
        const Icon = t.icon;
        return (
          <Link
            key={t.key}
            href={t.href}
            scroll={false}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-[0.8125rem] transition-colors min-[1600px]:gap-2 min-[1600px]:px-3.5 min-[1600px]:text-[0.875rem]',
              'focus-visible:ring-gold focus-visible:outline-none focus-visible:ring-2',
              on
                ? 'bg-gradient-to-b from-[#FFE07A] to-[#F7C02B] font-bold text-[#1A1A1A]'
                : 'text-ink hover:bg-bg font-semibold',
            )}
          >
            <Icon
              aria-hidden="true"
              className="hidden h-[1.05rem] w-[1.05rem] min-[1600px]:block"
              strokeWidth={1.9}
            />
            {t.label}
            {t.count != null && (
              <span className="text-muted text-[0.75rem] tabular-nums">
                ({t.count.toLocaleString('en-KE')})
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** A row with a green tick (or an empty circle) and something on the right. */
export function CheckRow({
  ok,
  label,
  right,
}: {
  ok: boolean | null;
  label: string;
  right?: React.ReactNode;
}) {
  return (
    <li className="border-border flex items-center justify-between gap-3 border-b py-2.5 last:border-b-0">
      <span className="flex min-w-0 items-center gap-2.5">
        {ok ? (
          <CheckCircle2 aria-hidden="true" className="h-5 w-5 shrink-0 fill-[#1E9E45] text-white" />
        ) : (
          <Circle aria-hidden="true" className="text-border-strong h-5 w-5 shrink-0" />
        )}
        <span className="text-ink text-[0.875rem] font-semibold leading-snug">{label}</span>
        <span className="sr-only">{ok ? 'done' : ok === false ? 'not done' : 'not checked'}</span>
      </span>
      {right}
    </li>
  );
}

/** The bottom bar of a pane: outline, red outline and the gold main action. */
export function PaneButton({
  icon: Icon,
  children,
  tone = 'outline',
  onClick,
  href,
  external = false,
  disabled,
  title,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  tone?: 'outline' | 'danger' | 'gold';
  onClick?: () => void;
  href?: string;
  /** Opens href in a new tab, for pages outside the console. */
  external?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const cls = cn(
    'inline-flex min-h-12 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-center text-[0.875rem] font-bold leading-tight transition-colors min-[1600px]:gap-2 min-[1600px]:px-4 min-[1600px]:text-[0.9375rem]',
    'focus-visible:ring-gold focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
    tone === 'outline' && 'border-border-strong text-ink hover:bg-bg border bg-white',
    tone === 'danger' && 'border border-[#E5484D] bg-white text-[#C62D22] hover:bg-[#FFF5F4]',
    tone === 'gold' &&
      'bg-gradient-to-b from-[#FFD24D] to-[#F5B400] text-[#1A1A1A] shadow-[0_8px_18px_-10px_rgba(229,168,0,0.9)] hover:brightness-105',
  );
  const body = (
    <>
      <Icon
        aria-hidden="true"
        className="h-4 w-4 shrink-0 min-[1600px]:h-5 min-[1600px]:w-5"
        strokeWidth={1.9}
      />
      <span className="min-w-0">{children}</span>
    </>
  );
  if (href && !disabled && external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} title={title}>
        {body}
      </a>
    );
  }
  if (href && !disabled) {
    return (
      <Link href={href} className={cls} title={title}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls} title={title}>
      {body}
    </button>
  );
}
