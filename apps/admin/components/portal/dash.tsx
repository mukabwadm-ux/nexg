import { cn } from '@nexg/ui';
import {
  BedDouble,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Package,
  Shirt,
  ShoppingCart,
  Sparkles,
  Ticket,
  Utensils,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

/*
 * The dashboard designs (Operations, Merchant Verification, Catalogues,
 * Performance, Payouts & Settlements): a title on the black frame, white
 * cards on black, a gold first KPI card, gold tab bars, category chips and
 * merchant cells with a photo. Server-safe; interactive parts live in the
 * screens' own client files.
 */

/* ──────────────────────────────────────────────────────────── the frame */

/**
 * The page body on the black frame. Cards inside carry their own white
 * background, as in the designs; this replaces the light sheet the other
 * console pages sit on.
 */
export function DashCanvas({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main data-canvas="dark" className={cn('space-y-4 pb-2 sm:space-y-5', className)}>
      {children}
    </main>
  );
}

export function DashHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="console-header flex flex-wrap items-end justify-between gap-x-6 gap-y-4 px-1 pb-5 pt-2 text-white sm:px-2">
      <div className="min-w-0 flex-1 basis-[26rem]">
        <h1 className="text-balance text-[1.875rem] font-extrabold leading-tight tracking-[-0.02em] sm:text-[2.125rem]">
          {title}
        </h1>
        <p className="mt-1 max-w-[80ch] text-sm text-white/80 sm:text-[0.9375rem]">{subtitle}</p>
      </div>
      {actions && (
        <div className="console-header-actions flex flex-wrap items-center gap-2.5">{actions}</div>
      )}
    </header>
  );
}

/** A header button: outline on black, or the gold one for the main action. */
export function HeaderButton({
  icon: Icon,
  children,
  gold = false,
  href,
  onClick,
  type = 'button',
  disabled,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  gold?: boolean;
  href?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  const cls = cn(
    'inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-xl px-4 text-[0.9375rem] font-bold transition-colors',
    'focus-visible:ring-gold focus-visible:outline-none focus-visible:ring-2 disabled:opacity-60',
    gold
      ? 'bg-gradient-to-b from-[#FFD24D] to-[#F5B400] text-[#1A1A1A] shadow-[0_8px_18px_-10px_rgba(229,168,0,0.9)] hover:brightness-105'
      : 'border border-white/40 text-white hover:bg-white/[0.08]',
  );
  const body = (
    <>
      <Icon aria-hidden="true" className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.9} />
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {body}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────── trend line */

/**
 * A small line of daily values: flat when they are all equal, nothing when
 * there are fewer than two. Decorative for screen readers; the figure and
 * its change carry the meaning.
 */
export function Sparkline({
  values,
  tone = 'gold',
  className,
}: {
  values: number[];
  tone?: 'gold' | 'red';
  className?: string;
}) {
  const w = 88;
  const h = 30;
  const pad = 3;
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = (w - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = pad + i * step;
    const y = max === min ? h / 2 : h - pad - ((v - min) / span) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const stroke = tone === 'red' ? '#E5484D' : '#E5A800';
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${w} ${h}`}
      className={cn('h-[30px] w-[88px] shrink-0 overflow-visible', className)}
    >
      <polygon
        points={`${pad},${h} ${pts.join(' ')} ${w - pad},${h}`}
        fill={stroke}
        opacity="0.12"
      />
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────── KPI cards */

export function DashKpiGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ul className={cn('grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5', className)}>
      {children}
    </ul>
  );
}

/**
 * One KPI: a gold outline icon, the label, the figure, and under it the
 * change against the period before (and a trend line when given). The
 * first card of a row is `featured`, drawn gold.
 */
export function DashKpi({
  icon: Icon,
  label,
  value,
  delta,
  deltaText,
  upIsBad = false,
  series,
  featured = false,
  explain,
  href,
  iconTone = 'gold',
  children,
}: {
  icon: LucideIcon;
  /** Green or red for figures the designs draw that way (Verified, Rejected). */
  iconTone?: 'gold' | 'green' | 'red';
  label: string;
  /** Already formatted, e.g. "46,892" or "KES 342,860,200"; null shows a dash. */
  value: string | null;
  /** Percentage change; null hides the change line. */
  delta?: number | null;
  /** Shown instead of a percentage, e.g. "+0.2". */
  deltaText?: string;
  upIsBad?: boolean;
  series?: number[];
  featured?: boolean;
  /** What the figure counts, for the tooltip and screen readers. */
  explain: string;
  href?: string;
  /** Under the figure instead of a change, e.g. "Today, 10:24 AM". */
  children?: React.ReactNode;
}) {
  const hasDelta = delta != null || deltaText != null;
  const up = deltaText ? !deltaText.startsWith('-') : (delta ?? 0) > 0;
  const down = deltaText ? deltaText.startsWith('-') : (delta ?? 0) < 0;
  const bad = (upIsBad ? up : down) && (deltaText != null || (delta ?? 0) !== 0);
  const line = series && series.length > 1;
  const body = (
    <span className="flex w-full min-w-0 items-start gap-2.5 2xl:gap-3">
      <Icon
        aria-hidden="true"
        strokeWidth={1.6}
        className={cn(
          'mt-0.5 h-7 w-7 shrink-0 2xl:h-9 2xl:w-9',
          iconTone === 'green'
            ? 'text-[#1E9E45]'
            : iconTone === 'red'
              ? 'text-[#D63A2F]'
              : featured
                ? 'text-[#B57A00]'
                : 'text-[#E5A800]',
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="text-ink line-clamp-2 block text-[0.8125rem] font-bold leading-tight 2xl:text-[0.875rem]">
          {label}
        </span>
        {!(value === null && children) && (
          <span
            data-figure
            className="text-ink mt-1 block whitespace-nowrap text-[1.5rem] font-extrabold tabular-nums leading-none tracking-[-0.02em] xl:text-[1.625rem]"
          >
            {value ?? '—'}
          </span>
        )}
        {(hasDelta || line) && (
          <span className="mt-2 flex items-center justify-between gap-2">
            {hasDelta ? (
              <span
                className={cn(
                  'flex items-center gap-1 whitespace-nowrap text-[0.9375rem] font-extrabold tabular-nums',
                  bad ? 'text-danger' : up ? 'text-success' : 'text-muted',
                )}
              >
                <span aria-hidden="true">{up ? '▲' : down ? '▼' : '■'}</span>
                <span className="sr-only">{up ? 'Up' : down ? 'Down' : 'No change'}</span>
                {deltaText ?? `${(delta ?? 0) > 0 ? '+' : ''}${(delta ?? 0).toFixed(1)}%`}
              </span>
            ) : (
              <span className="text-muted-light text-[0.9375rem] font-extrabold">
                <span aria-hidden="true">—</span>
                <span className="sr-only">No earlier figure to compare with</span>
              </span>
            )}
            {line && (
              <Sparkline
                values={series!}
                tone={upIsBad && up ? 'red' : 'gold'}
                className="h-[26px] w-[64px] 2xl:h-[30px] 2xl:w-[88px]"
              />
            )}
          </span>
        )}
        {children}
      </span>
    </span>
  );
  const cls = cn(
    'flex h-full min-w-0 items-start rounded-2xl border p-4 shadow-[0_1px_2px_rgba(20,20,20,0.06)]',
    featured
      ? 'border-[#F2D27A] bg-gradient-to-br from-[#FFDF7E] via-[#FFEDB8] to-[#FFF7E0]'
      : 'border-border bg-surface',
  );
  return (
    <li title={explain} className="min-w-0">
      {href ? (
        <Link href={href} className={cn(cls, 'transition-shadow hover:shadow-md')}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

/* ─────────────────────────────────────────────────────────────── tabs */

export interface GoldTab {
  key: string;
  label: string;
  icon?: LucideIcon;
  href: string;
  count?: number | null;
}

/** A white bar of views; the open one is gold. Equal columns on wide screens. */
export function GoldTabs({
  tabs,
  active,
  label,
  className,
}: {
  tabs: GoldTab[];
  active: string;
  label: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        'bg-surface flex gap-1 overflow-x-auto rounded-2xl p-1.5 shadow-[0_1px_2px_rgba(20,20,20,0.06)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {tabs.map((t, i) => {
        const on = t.key === active;
        const Icon = t.icon;
        return (
          <Link
            key={t.key}
            href={t.href}
            scroll={false}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'relative flex min-h-12 min-w-max flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 text-[0.875rem] font-semibold transition-colors duration-150 min-[1600px]:gap-2.5 min-[1600px]:px-4 min-[1600px]:text-[0.9375rem]',
              'focus-visible:ring-gold focus-visible:outline-none focus-visible:ring-2',
              on
                ? 'bg-gradient-to-b from-[#FFD24D] to-[#F5B400] font-bold text-[#1A1A1A] shadow-[0_8px_18px_-10px_rgba(229,168,0,0.9)]'
                : 'text-ink hover:bg-bg',
              i > 0 &&
                !on &&
                tabs[i - 1]?.key !== active &&
                'before:bg-border before:absolute before:left-0 before:top-1/2 before:h-7 before:w-px before:-translate-y-1/2',
            )}
          >
            {Icon && <Icon aria-hidden="true" strokeWidth={1.8} className="h-5 w-5 shrink-0" />}
            <span>
              {t.label}
              {t.count != null && (
                <span className="tabular-nums"> ({t.count.toLocaleString('en-KE')})</span>
              )}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export interface SegmentTab {
  key: string;
  label: string;
  count?: number | null;
  href: string;
}

/** A segmented bar inside a card; the open segment is black with gold text. */
export function SegmentTabs({
  tabs,
  active,
  label,
  className,
}: {
  tabs: SegmentTab[];
  active: string;
  label: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        'border-border bg-bg flex gap-1 overflow-x-auto rounded-xl border p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            scroll={false}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'flex min-h-10 min-w-max flex-1 items-center justify-center rounded-lg px-2.5 text-[0.875rem] transition-colors min-[1600px]:px-3 min-[1600px]:text-[0.9375rem]',
              'focus-visible:ring-gold focus-visible:outline-none focus-visible:ring-2',
              on
                ? 'bg-ink font-bold text-[#F5B400] shadow-[0_6px_14px_-8px_rgba(20,20,20,0.9)]'
                : 'text-ink hover:bg-surface font-semibold',
            )}
          >
            {t.label}
            {t.count != null && (
              <span className="ml-1 tabular-nums">({t.count.toLocaleString('en-KE')})</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/* ─────────────────────────────────────────────────────────────── cards */

export function DashCard({
  title,
  titleNote,
  aside,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  /** Lighter text after the title, e.g. "(Dec 1 – Dec 31, 2026)". */
  titleNote?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        'bg-surface text-ink min-w-0 rounded-2xl p-4 shadow-[0_1px_2px_rgba(20,20,20,0.06)] sm:p-5',
        className,
      )}
    >
      {(title || aside) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {title && (
            <h2 className="text-[1.25rem] font-extrabold tracking-[-0.01em]">
              {title}
              {titleNote && (
                <span className="text-muted ml-1.5 text-[0.875rem] font-semibold">{titleNote}</span>
              )}
            </h2>
          )}
          {aside}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** "View All →" in a card's corner. */
export function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-[0.875rem] font-bold text-[#B57A00] underline underline-offset-4 hover:text-[#8A5C00]"
    >
      {children} <span aria-hidden="true">→</span>
    </Link>
  );
}

/* ─────────────────────────────────────────────────────── chips and cells */

export type ChipTone = 'amber' | 'green' | 'blue' | 'red' | 'grey' | 'gold';

const CHIP: Record<ChipTone, string> = {
  amber: 'bg-[#FFF1C7] text-[#9A6700]',
  green: 'bg-[#E3F5E6] text-[#1E7B34]',
  blue: 'bg-[#E3EEFB] text-[#1F5FAD]',
  red: 'bg-[#FDE7E5] text-[#C62D22]',
  grey: 'bg-[#EFEDE8] text-[#5E5A52]',
  gold: 'bg-[#FFF4D6] text-[#8A5C00]',
};

/** A status in the designs' squarer chip. */
export function StatusChip({
  tone,
  children,
  className,
}: {
  tone: ChipTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center whitespace-nowrap rounded-md px-2.5 py-1 text-[0.8125rem] font-semibold',
        CHIP[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Category keys the designs draw, with their icons. */
const CATEGORY_ICON: { match: RegExp; icon: LucideIcon }[] = [
  { match: /food|restaurant|cafe|bar|drink|bakery/i, icon: Utensils },
  { match: /stay|hotel|airbnb|host|lodg/i, icon: BedDouble },
  { match: /grocer|supermarket|market|pharm|convenien/i, icon: ShoppingCart },
  { match: /apparel|fashion|cloth|shoe/i, icon: Shirt },
  { match: /experience|tour|activit|event|adult/i, icon: Ticket },
  { match: /service|salon|spa|beauty|clean|repair|laundry/i, icon: Wrench },
  { match: /deliver|parcel|courier/i, icon: Package },
];

export function categoryIcon(key: string): LucideIcon {
  return CATEGORY_ICON.find((c) => c.match.test(key))?.icon ?? Sparkles;
}

/** A category in a light gold chip with its icon: "Food", "Stays". */
export function CategoryChip({
  label,
  icon,
  tone = 'gold',
}: {
  label: string;
  icon?: LucideIcon;
  tone?: ChipTone;
}) {
  const Icon = icon ?? categoryIcon(label);
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-[0.8125rem] font-semibold',
        CHIP[tone],
      )}
    >
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.9} />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** A merchant's photo, name and where it is. The photo falls back to initials. */
export function MerchantCell({
  name,
  place,
  photoUrl,
  href,
  size = 'md',
}: {
  name: string;
  place?: string | null;
  photoUrl?: string | null;
  href?: string;
  size?: 'md' | 'lg';
}) {
  const box = size === 'lg' ? 'h-16 w-16 rounded-xl' : 'h-10 w-10 rounded-lg';
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  const pic = photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- signed storage URLs, not optimisable
    <img
      src={photoUrl}
      alt=""
      className={cn(box, 'shrink-0 object-cover')}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        box,
        'flex shrink-0 items-center justify-center bg-gradient-to-br from-[#FFE9A8] to-[#F5C842] text-[0.8125rem] font-extrabold text-[#5E4300]',
      )}
    >
      {initials || '·'}
    </span>
  );
  const text = (
    <span className="min-w-0">
      <span className="text-ink block truncate text-[0.9375rem] font-bold">{name}</span>
      {place && (
        <span className="text-muted flex items-center gap-1 truncate text-[0.8125rem] font-semibold">
          <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{place}</span>
        </span>
      )}
    </span>
  );
  return href ? (
    <Link href={href} className="group flex min-w-0 items-center gap-3">
      {pic}
      {text}
    </Link>
  ) : (
    <span className="flex min-w-0 items-center gap-3">
      {pic}
      {text}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────── pagination */

function pagesFor(page: number, pages: number): (number | '…')[] {
  if (pages <= 5) return Array.from({ length: pages }, (_, i) => i + 1);
  if (page <= 3) return [1, 2, 3, '…', pages];
  if (page >= pages - 2) return [1, '…', pages - 2, pages - 1, pages];
  return [1, '…', page, '…', pages];
}

/**
 * "Showing 1 – 5 of 1,268 …" and the page buttons. Pages are links, so the
 * server reads the page it is asked for.
 */
export function Pagination({
  page,
  size,
  total,
  noun,
  href,
}: {
  page: number;
  size: number;
  total: number;
  /** "ongoing operations", "settlements". */
  noun: string;
  href: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const first = total === 0 ? 0 : (page - 1) * size + 1;
  const last = Math.min(total, page * size);
  const btn =
    'flex h-10 min-w-10 items-center justify-center rounded-lg border px-3 text-[0.9375rem] font-bold tabular-nums transition-colors';
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
      <p className="text-muted text-[0.875rem] font-semibold">
        Showing {first.toLocaleString('en-KE')} – {last.toLocaleString('en-KE')} of{' '}
        {total.toLocaleString('en-KE')} {noun}
      </p>
      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-1.5">
          {page > 1 ? (
            <Link
              href={href(page - 1)}
              scroll={false}
              aria-label="Previous page"
              className={cn(btn, 'border-border text-ink hover:bg-bg')}
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            </Link>
          ) : (
            <span aria-hidden="true" className={cn(btn, 'border-border text-muted-light')}>
              <ChevronLeft className="h-4 w-4" />
            </span>
          )}
          {pagesFor(page, pages).map((p, i) =>
            p === '…' ? (
              <span key={`gap-${i}`} aria-hidden="true" className="text-muted px-1 font-bold">
                …
              </span>
            ) : (
              <Link
                key={p}
                href={href(p)}
                scroll={false}
                aria-current={p === page ? 'page' : undefined}
                className={cn(
                  btn,
                  p === page
                    ? 'border-[#E5A800] bg-gradient-to-b from-[#FFD24D] to-[#F0A800] text-[#1A1A1A]'
                    : 'border-border text-ink hover:bg-bg',
                )}
              >
                {p.toLocaleString('en-KE')}
              </Link>
            ),
          )}
          {page < pages ? (
            <Link
              href={href(page + 1)}
              scroll={false}
              aria-label="Next page"
              className={cn(btn, 'border-border text-ink hover:bg-bg')}
            >
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          ) : (
            <span aria-hidden="true" className={cn(btn, 'border-border text-muted-light')}>
              <ChevronRight className="h-4 w-4" />
            </span>
          )}
        </nav>
      )}
    </div>
  );
}
