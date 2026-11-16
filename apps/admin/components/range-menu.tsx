import { CalendarDays, ChevronDown } from 'lucide-react';
import Link from 'next/link';

/**
 * The period picker in a page header ("Last 30 days · 17 Oct – 15 Nov").
 * A real control: it puts ?range= in the address and the page reads it, so
 * the period survives a reload and can be shared. A <details> menu, so it
 * needs no JavaScript.
 */
export const RANGES = [
  { key: '7', days: 7, label: 'Last 7 days' },
  { key: '30', days: 30, label: 'Last 30 days' },
  { key: '90', days: 90, label: 'Last 90 days' },
] as const;

export type Range = (typeof RANGES)[number];

export function rangeFrom(value: string | undefined): Range {
  return RANGES.find((r) => r.key === value) ?? RANGES[1];
}

const short = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Nairobi' });

export function RangeMenu({ base, current }: { base: string; current: Range }) {
  const now = new Date();
  const from = new Date(now.getTime() - (current.days - 1) * 86_400_000);
  const join = base.includes('?') ? '&' : '?';

  return (
    <details className="group relative">
      <summary className="flex h-11 cursor-pointer list-none items-center gap-2.5 rounded-xl border border-white/25 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/[0.06] [&::-webkit-details-marker]:hidden">
        <CalendarDays className="h-4 w-4 text-white/80" aria-hidden="true" />
        <span>{current.label}</span>
        <span className="hidden text-white/60 sm:inline">
          ({short(from)} – {short(now)})
        </span>
        <ChevronDown className="h-4 w-4 text-white/70 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="border-border bg-surface text-ink absolute right-0 top-full z-40 mt-2 w-52 overflow-hidden rounded-xl border py-1.5 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.45)]">
        {RANGES.map((r) => (
          <li key={r.key}>
            <Link
              href={`${base}${join}range=${r.key}`}
              aria-current={r.key === current.key ? 'true' : undefined}
              className={`hover:bg-gold-soft block px-4 py-2.5 text-sm ${
                r.key === current.key ? 'font-extrabold' : 'font-semibold'
              }`}
            >
              {r.label}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
