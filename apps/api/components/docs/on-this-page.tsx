'use client';

import { cn } from '@nexg/ui';
import { ChevronDown } from 'lucide-react';
import * as React from 'react';

export interface TocItem {
  id: string;
  label: string;
}

/** Marks the section being read. The heading nearest the top wins. */
function useActiveSection(items: TocItem[]): string | null {
  const [active, setActive] = React.useState<string | null>(items[0]?.id ?? null);

  React.useEffect(() => {
    const headings = items
      .map((item) => document.getElementById(item.id))
      .filter((node): node is HTMLElement => node !== null);
    if (!headings.length || typeof IntersectionObserver === 'undefined') return;

    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
        const first = items.find((item) => visible.get(item.id));
        if (first) setActive(first.id);
      },
      // The band just under the sticky masthead.
      { rootMargin: '-80px 0px -60% 0px' },
    );
    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [items]);

  return active;
}

function Links({ items, active }: { items: TocItem[]; active: string | null }) {
  return (
    <ul className="mt-3 space-y-0.5">
      {items.map((item) => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            aria-current={active === item.id ? 'location' : undefined}
            className={cn(
              'block rounded-md px-2.5 py-1.5 text-sm leading-5 transition-colors duration-150',
              active === item.id
                ? 'bg-surface text-ink ring-border font-bold ring-1'
                : 'text-muted hover:text-ink hover:bg-border/40',
            )}
          >
            {item.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** The right-hand contents on wide screens. */
export function OnThisPage({ items }: { items: TocItem[] }) {
  const active = useActiveSection(items);
  if (items.length < 2) return null;
  return (
    <nav aria-label="On this page" className="sticky top-24">
      <p className="text-ink text-sm font-bold">On this page</p>
      <Links items={items} active={active} />
    </nav>
  );
}

/** The same contents, folded, at the top of the page on narrower screens. */
export function OnThisPageCompact({ items }: { items: TocItem[] }) {
  if (items.length < 2) return null;
  return (
    <details className="border-border bg-surface group mb-8 rounded-lg border xl:hidden">
      <summary className="text-ink flex h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-bold [&::-webkit-details-marker]:hidden">
        On this page
        <ChevronDown
          className="text-muted h-4 w-4 transition-transform duration-200 group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <nav aria-label="On this page" className="border-border border-t px-2 pb-3">
        <Links items={items} active={null} />
      </nav>
    </details>
  );
}
