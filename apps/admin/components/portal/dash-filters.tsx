'use client';

import { cn } from '@nexg/ui';
import { ChevronDown, Search, SlidersHorizontal } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

/*
 * The dashboard designs' filter row: a search box, selects that read
 * "Category: All", and a button that clears them. Everything is kept in
 * the address, so the server reads the filtered page and a link to it
 * shows the same rows.
 */

export interface DashOption {
  value: string;
  label: string;
}

function useParamSetter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return React.useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(changes)) {
        if (v == null || v === '' || v === 'all') next.delete(k);
        else next.set(k, v);
      }
      next.delete('page');
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );
}

/** A select drawn as "Label: Value" with a chevron, the native control on top. */
export function DashSelect({
  label,
  param,
  value,
  options,
  className,
}: {
  label: string;
  param: string;
  value: string;
  options: DashOption[];
  className?: string;
}) {
  const set = useParamSetter();
  const shown = options.find((o) => o.value === value)?.label ?? 'All';
  return (
    <label
      className={cn(
        'border-border-strong bg-surface text-ink focus-within:ring-gold relative flex h-11 min-w-0 items-center justify-between gap-2 rounded-xl border px-3.5 text-[0.9375rem] font-semibold focus-within:ring-2',
        className,
      )}
    >
      <span className="truncate">
        {label}: {shown}
      </span>
      <ChevronDown aria-hidden="true" className="text-ink h-4 w-4 shrink-0" />
      <select
        aria-label={label}
        value={value}
        onChange={(e) => set({ [param]: e.target.value })}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        <option value="all">All</option>
        {options
          .filter((o) => o.value !== 'all')
          .map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
      </select>
    </label>
  );
}

/** A search box that applies after a short pause, or on Enter. */
export function DashSearch({
  param = 'q',
  value,
  placeholder,
  label,
  className,
}: {
  param?: string;
  value: string;
  placeholder: string;
  label: string;
  className?: string;
}) {
  const set = useParamSetter();
  const [q, setQ] = React.useState(value);
  const first = React.useRef(true);

  React.useEffect(() => setQ(value), [value]);

  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (q.trim() === value.trim()) return;
    const t = setTimeout(() => set({ [param]: q.trim() }), 450);
    return () => clearTimeout(t);
    // Only the typed text starts a search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <label
      className={cn(
        'border-border-strong bg-surface focus-within:ring-gold flex h-11 min-w-0 items-center gap-2.5 rounded-xl border px-3.5 focus-within:ring-2',
        className,
      )}
    >
      <Search aria-hidden="true" className="text-ink h-[1.1rem] w-[1.1rem] shrink-0" />
      <input
        type="search"
        aria-label={label}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') set({ [param]: q.trim() });
        }}
        placeholder={placeholder}
        className="text-ink placeholder:text-muted min-w-0 flex-1 bg-transparent text-[0.9375rem] focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
    </label>
  );
}

/** The sliders button at the end of the row: clears every filter it names. */
export function DashClear({ params }: { params: string[] }) {
  const set = useParamSetter();
  return (
    <button
      type="button"
      onClick={() => set(Object.fromEntries(params.map((p) => [p, null])))}
      aria-label="Clear filters"
      title="Clear filters"
      className="border-border-strong bg-surface text-ink hover:bg-bg focus-visible:ring-gold flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border focus-visible:outline-none focus-visible:ring-2"
    >
      <SlidersHorizontal aria-hidden="true" className="h-5 w-5" />
    </button>
  );
}
