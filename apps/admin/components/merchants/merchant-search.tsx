'use client';

import { cn, StatusBadge, type StatusKey } from '@nexg/ui';
import { ArrowRight, Loader2, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { searchMerchants, type MerchantHit } from '@/app/merchants/search';

/**
 * Find a merchant from anywhere in the Merchants module.
 *
 * Suggestions come as you type (name, legal name, contact, phone or
 * email); arrow keys move through them and Enter opens the merchant.
 * Enter with nothing picked opens the Directory filtered by the text,
 * and `/` jumps here from anywhere on the page.
 */
export function MerchantSearch({ className }: { className?: string }) {
  const router = useRouter();
  const input = React.useRef<HTMLInputElement>(null);
  const listId = React.useId();
  const [query, setQuery] = React.useState('');
  const [hits, setHits] = React.useState<MerchantHit[]>([]);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const [loading, setLoading] = React.useState(false);
  const latest = React.useRef(0);

  React.useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    const ticket = ++latest.current;
    setLoading(true);
    const timer = setTimeout(() => {
      void searchMerchants(needle)
        .then((found) => {
          if (ticket !== latest.current) return;
          setHits(found);
          setActive(found.length ? 0 : -1);
        })
        .catch(() => {
          if (ticket === latest.current) setHits([]);
        })
        .finally(() => {
          if (ticket === latest.current) setLoading(false);
        });
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);

  /* `/` focuses the search unless someone is already typing somewhere. */
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (hit: MerchantHit | undefined) => {
    setOpen(false);
    if (hit) {
      router.push(`/merchants/${hit.id}`);
      return;
    }
    const needle = query.trim();
    if (needle)
      router.push(`/merchants?${new URLSearchParams({ tab: 'directory', q: needle }).toString()}`);
  };

  const showList = open && query.trim().length >= 2;

  return (
    <div className={cn('relative w-full sm:w-[22rem]', className)}>
      <label className="sr-only" htmlFor={`${listId}-input`}>
        Search merchants
      </label>
      <div className="border-border bg-surface focus-within:border-ink focus-within:ring-gold/40 flex h-10 items-center gap-2 rounded-xl border px-3 shadow-[0_1px_2px_rgb(20_20_20/0.04)] transition-[border-color,box-shadow] focus-within:ring-2">
        {loading ? (
          <Loader2 aria-hidden="true" className="text-muted h-4 w-4 shrink-0 animate-spin" />
        ) : (
          <Search aria-hidden="true" className="text-muted h-4 w-4 shrink-0" />
        )}
        <input
          ref={input}
          id={`${listId}-input`}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          placeholder="Search merchants by name, phone or email"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActive((i) => (hits.length ? (i + 1) % hits.length : -1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((i) => (hits.length ? (i - 1 + hits.length) % hits.length : -1));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              go(active >= 0 ? hits[active] : undefined);
            } else if (event.key === 'Escape') {
              setOpen(false);
              input.current?.blur();
            }
          }}
          className="placeholder:text-muted-light min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        <kbd
          aria-hidden="true"
          className="border-border text-muted-light hidden rounded-md border px-1.5 py-0.5 text-[0.6875rem] font-bold sm:inline"
        >
          /
        </kbd>
      </div>

      {showList ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Matching merchants"
          className="border-border bg-surface absolute right-0 top-full z-40 mt-2 w-full overflow-hidden rounded-xl border shadow-[0_18px_40px_-18px_rgb(20_20_20/0.45)] sm:w-[26rem]"
        >
          {hits.length === 0 ? (
            <p className="text-muted px-4 py-5 text-sm font-semibold">
              {loading ? 'Searching…' : `No merchant matches “${query.trim()}”.`}
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1.5">
              {hits.map((hit, index) => (
                <li
                  key={hit.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    go(hit);
                  }}
                  onMouseEnter={() => setActive(index)}
                  className={cn(
                    'mx-1.5 flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2',
                    index === active ? 'bg-bg' : '',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-extrabold">{hit.name}</span>
                    <span className="text-muted block truncate text-xs font-semibold">
                      {[hit.city, hit.contact].filter(Boolean).join(' · ') || 'No contact on file'}
                    </span>
                  </span>
                  <StatusBadge status={hit.status as StatusKey} />
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              go(undefined);
            }}
            className="border-border text-muted hover:text-ink flex w-full items-center justify-between border-t px-4 py-2.5 text-xs font-bold"
          >
            See every match in the Directory
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
