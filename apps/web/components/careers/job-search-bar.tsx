import { Briefcase, ChevronDown, MapPin, Search } from 'lucide-react';

import { JOB_TYPES, type BoardFilters } from '@/lib/careers/board';
import type { BoardCity } from '@/lib/careers/load';

const field =
  'border-border bg-surface text-ink placeholder:text-muted-light focus:border-ink h-12 w-full rounded-xl border text-[0.875rem] font-semibold transition-colors focus:outline-none';

/**
 * Keyword, place and type, sent to /careers/jobs as a plain GET form, so it
 * works before the page's JavaScript has loaded and the results page can be
 * shared and bookmarked.
 */
export function JobSearchBar({
  cities,
  filters,
  className = '',
}: {
  cities: BoardCity[];
  filters?: BoardFilters;
  className?: string;
}) {
  /* The example names real cities NexG works in, not a guess. */
  const example = cities
    .slice(0, 2)
    .map((c) => c.name)
    .join(', ');

  return (
    <form
      action="/careers/jobs"
      method="get"
      role="search"
      aria-label="Search jobs"
      className={`bg-surface border-border grid gap-2 rounded-2xl border p-2 shadow-[0_18px_40px_-18px_rgba(20,20,20,0.25)] md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] ${className}`}
    >
      <label className="relative block">
        <span className="sr-only">Job title, keyword or company</span>
        <Search
          aria-hidden="true"
          className="text-muted-light pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
        />
        <input
          name="q"
          type="search"
          defaultValue={filters?.q ?? ''}
          placeholder="Job title, keyword or company"
          maxLength={100}
          className={`${field} pl-10 pr-3`}
        />
      </label>

      <label className="relative block">
        <span className="sr-only">Location</span>
        <MapPin
          aria-hidden="true"
          className="text-muted-light pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
        />
        <select
          name="city"
          defaultValue={filters?.cities[0] ?? ''}
          className={`${field} appearance-none pl-10 pr-9`}
        >
          <option value="">{example ? `Location (e.g. ${example})` : 'Location'}</option>
          {cities.map((city) => (
            <option key={city.slug} value={city.slug}>
              {city.name}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="text-muted-light pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
        />
      </label>

      <label className="relative block">
        <span className="sr-only">Job type</span>
        <Briefcase
          aria-hidden="true"
          className="text-muted-light pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
        />
        <select
          name="type"
          defaultValue={filters?.types.length === 1 ? filters.types[0] : ''}
          className={`${field} appearance-none pl-10 pr-9`}
        >
          <option value="">Job type</option>
          {JOB_TYPES.map((type) => (
            <option key={type.key} value={type.key}>
              {type.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="text-muted-light pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2"
        />
      </label>

      <button
        type="submit"
        className="bg-gold text-ink hover:bg-gold/90 h-12 rounded-xl px-7 text-[0.9375rem] font-extrabold transition-colors"
      >
        Search Jobs
      </button>
    </form>
  );
}
