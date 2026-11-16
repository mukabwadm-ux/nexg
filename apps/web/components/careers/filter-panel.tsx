'use client';

import { ChevronUp, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import {
  CATEGORIES,
  JOB_TYPES,
  filtersQuery,
  readFilters,
  type BoardFilters,
  type Facets,
} from '@/lib/careers/board';

export interface FilterCity {
  slug: string;
  name: string;
}

/**
 * Job type, location and category, each with how many jobs ticking it would
 * show. A tick applies at once; the form is still a plain GET form, so it
 * also works as one.
 */
export function FilterPanel({
  action,
  filters,
  facets,
  cities,
}: {
  action: string;
  filters: BoardFilters;
  facets: Facets;
  cities: FilterCity[];
}) {
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
  const [citySearch, setCitySearch] = React.useState('');

  const apply = () => {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    const next = readFilters({
      q: (data.get('q') as string) ?? '',
      type: data.getAll('type') as string[],
      city: data.getAll('city') as string[],
      category: data.getAll('category') as string[],
    });
    router.push(`${action}${filtersQuery(next)}`, { scroll: false });
  };

  /* Cities with jobs, the busiest first, and any already ticked. */
  const cityOptions = cities
    .filter((c) => (facets.cities[c.slug] ?? 0) > 0 || filters.cities.includes(c.slug))
    .sort((a, b) => (facets.cities[b.slug] ?? 0) - (facets.cities[a.slug] ?? 0));
  const shownCities = cityOptions.filter((c) =>
    c.name.toLowerCase().includes(citySearch.trim().toLowerCase()),
  );
  const categoryOptions = CATEGORIES.filter(
    (c) => (facets.categories[c.key] ?? 0) > 0 || filters.categories.includes(c.key),
  );

  return (
    <form
      /* A new set of filters (Clear all, a link, the back button) redraws the
         boxes from the address rather than leaving the old ticks in place. */
      key={filtersQuery(filters)}
      ref={formRef}
      action={action}
      method="get"
      onChange={apply}
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
      className="border-border bg-surface rounded-2xl border p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[1rem] font-extrabold">Filter jobs</h2>
        <Link
          href={action}
          scroll={false}
          className="text-gold-text text-[0.75rem] font-extrabold hover:underline"
        >
          Clear all
        </Link>
      </div>

      {filters.q ? <input type="hidden" name="q" value={filters.q} /> : null}

      <Group title="Job type">
        {JOB_TYPES.map((type) => (
          <Check
            key={type.key}
            name="type"
            value={type.key}
            label={type.label}
            count={facets.types[type.key] ?? 0}
            checked={filters.types.includes(type.key)}
          />
        ))}
      </Group>

      <Group title="Location">
        {cityOptions.length > 6 ? (
          <label className="relative mb-2 block">
            <span className="sr-only">Search location</span>
            <Search
              aria-hidden="true"
              className="text-muted-light pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
            />
            <input
              type="search"
              value={citySearch}
              onChange={(event) => {
                event.stopPropagation();
                setCitySearch(event.target.value);
              }}
              placeholder="Search location"
              className="border-border bg-surface focus:border-ink h-9 w-full rounded-lg border pl-8 pr-2 text-[0.8125rem] font-semibold focus:outline-none"
            />
          </label>
        ) : null}
        {shownCities.length === 0 ? (
          <p className="text-muted-light py-1 text-[0.8125rem] font-semibold">
            {cityOptions.length === 0 ? 'No jobs in any city yet.' : 'No city by that name.'}
          </p>
        ) : (
          shownCities.map((city) => (
            <Check
              key={city.slug}
              name="city"
              value={city.slug}
              label={city.name}
              count={facets.cities[city.slug] ?? 0}
              checked={filters.cities.includes(city.slug)}
            />
          ))
        )}
      </Group>

      {categoryOptions.length > 0 ? (
        <Group title="Category">
          {categoryOptions.map((category) => (
            <Check
              key={category.key}
              name="category"
              value={category.key}
              label={category.label}
              count={facets.categories[category.key] ?? 0}
              checked={filters.categories.includes(category.key)}
            />
          ))}
        </Group>
      ) : null}

      <noscript>
        <button
          type="submit"
          className="bg-ink mt-4 h-10 w-full rounded-lg text-sm font-bold text-white"
        >
          Show jobs
        </button>
      </noscript>
    </form>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(true);
  const id = React.useId();
  return (
    <fieldset className="border-border mt-4 border-t pt-3">
      <legend className="sr-only">{title}</legend>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between py-1 text-left text-[0.8125rem] font-extrabold"
      >
        {title}
        <ChevronUp
          aria-hidden="true"
          className={`h-4 w-4 transition-transform ${open ? '' : 'rotate-180'}`}
        />
      </button>
      <div id={id} hidden={!open} className="mt-1.5 space-y-0.5">
        {children}
      </div>
    </fieldset>
  );
}

function Check({
  name,
  value,
  label,
  count,
  checked,
}: {
  name: string;
  value: string;
  label: string;
  count: number;
  checked: boolean;
}) {
  return (
    <label className="hover:bg-bg flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1.5 text-[0.8125rem] font-semibold">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={checked}
        className="accent-ink border-border-strong h-4 w-4 shrink-0 rounded"
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-muted-light tabular-nums">({count})</span>
    </label>
  );
}
