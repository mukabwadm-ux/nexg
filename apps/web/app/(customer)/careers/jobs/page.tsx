import { SlidersHorizontal, X } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { CareersNav, type CareersSection } from '@/components/careers/careers-nav';
import { EmployerCard, WhyCareers } from '@/components/careers/employer-panels';
import { FilterPanel } from '@/components/careers/filter-panel';
import { JobCard } from '@/components/careers/job-card';
import { JobSearchBar } from '@/components/careers/job-search-bar';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import {
  GIG_TYPES,
  TRAINING_TYPES,
  boardCities,
  categoryLabel,
  facetCounts,
  filterJobs,
  filtersQuery,
  hasFilters,
  jobTypeLabel,
  readFilters,
  type BoardFilters,
} from '@/lib/careers/board';
import { loadBoard } from '@/lib/careers/load';

export const metadata: Metadata = {
  title: 'Find jobs',
  description:
    'Search jobs, gig work and internships with businesses on NexG by keyword, place, type and category.',
};

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Which of the careers bar's doors this search is. */
function sectionOf(filters: BoardFilters): CareersSection {
  if (same(filters.types, GIG_TYPES)) return 'gig';
  if (same(filters.types, TRAINING_TYPES)) return 'training';
  return 'find';
}

function headingOf(filters: BoardFilters, section: CareersSection): string {
  if (section === 'gig') return 'Gig and on-demand work';
  if (section === 'training') return 'Internships and trainee roles';
  if (filters.categories.length === 1 && !filters.q) {
    return `${categoryLabel(filters.categories[0]!)} jobs`;
  }
  if (filters.q) return `Jobs matching “${filters.q}”`;
  return hasFilters(filters) ? 'Jobs' : 'All jobs';
}

/**
 * The results page: everything the search bar, the category tiles, the
 * careers bar and the filters send here. The filters are the address, so a
 * search can be shared and comes back with the back button.
 */
export default async function JobsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const filters = readFilters(searchParams);
  const { jobs, cities } = await loadBoard();
  const results = filterJobs(jobs, filters);
  const facets = facetCounts(jobs, filters);
  const filterCities = boardCities(jobs, cities);
  const section = sectionOf(filters);
  const now = new Date();

  /* One removable chip for each filter in force. */
  const chips: { label: string; href: string }[] = [
    ...(filters.q ? [{ label: `“${filters.q}”`, href: filtersQuery({ ...filters, q: '' }) }] : []),
    ...filters.types.map((t) => ({
      label: jobTypeLabel(t) ?? t,
      href: filtersQuery({ ...filters, types: filters.types.filter((x) => x !== t) }),
    })),
    ...filters.cities.map((c) => ({
      label: filterCities.find((x) => x.slug === c)?.name ?? c,
      href: filtersQuery({ ...filters, cities: filters.cities.filter((x) => x !== c) }),
    })),
    ...filters.categories.map((c) => ({
      label: categoryLabel(c) ?? c,
      href: filtersQuery({ ...filters, categories: filters.categories.filter((x) => x !== c) }),
    })),
  ];
  const activeCount = filters.types.length + filters.cities.length + filters.categories.length;

  const panel = (
    <FilterPanel action="/careers/jobs" filters={filters} facets={facets} cities={filterCities} />
  );

  return (
    <>
      <SiteHeader action={{ label: 'Find jobs', href: '/careers/jobs' }} />
      <CareersNav active={section} />

      <main>
        <section className="band-surface border-border border-b">
          <div className="mx-auto max-w-[120rem] px-4 pb-6 pt-6 sm:px-[30px]">
            <nav aria-label="Breadcrumb" className="text-muted-light text-[0.75rem] font-semibold">
              <Link href="/careers" className="hover:text-ink">
                Careers
              </Link>
              <span aria-hidden="true"> / </span>
              <span aria-current="page">Jobs</span>
            </nav>
            <h1 className="mt-2 text-[1.75rem] font-extrabold tracking-tight sm:text-[2.125rem]">
              {headingOf(filters, section)}
            </h1>
            <p className="text-muted mt-1 text-[0.875rem] font-semibold" aria-live="polite">
              {results.length === 1 ? '1 job' : `${results.length} jobs`}
              {hasFilters(filters) ? ` of ${jobs.length} on the board` : ''}
            </p>
            <JobSearchBar cities={cities} filters={filters} className="mt-5" />
          </div>
        </section>

        <div className="mx-auto grid max-w-[120rem] gap-5 px-4 pb-16 pt-6 sm:px-[30px] lg:grid-cols-[16.5rem_minmax(0,1fr)] xl:grid-cols-[16.5rem_minmax(0,1fr)_21rem]">
          <aside className="hidden lg:block">{panel}</aside>

          <div className="min-w-0">
            <details className="mb-4 lg:hidden">
              <summary className="border-border bg-surface flex h-11 cursor-pointer list-none items-center justify-center gap-2 rounded-xl border text-[0.875rem] font-bold [&::-webkit-details-marker]:hidden">
                <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
                Filters{activeCount > 0 ? ` (${activeCount})` : ''}
              </summary>
              <div className="mt-3">{panel}</div>
            </details>

            {chips.length > 0 ? (
              <ul aria-label="Filters in use" className="mb-4 flex flex-wrap gap-2">
                {chips.map((chip) => (
                  <li key={chip.label}>
                    <Link
                      href={`/careers/jobs${chip.href}`}
                      scroll={false}
                      className="border-border-strong bg-surface hover:border-ink inline-flex h-8 items-center gap-1.5 rounded-full border pl-3 pr-2 text-[0.8125rem] font-bold transition-colors"
                    >
                      {chip.label}
                      <X aria-hidden="true" className="h-3.5 w-3.5" />
                      <span className="sr-only">(remove)</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}

            {results.length > 0 ? (
              <ul className="space-y-3">
                {results.map((job) => (
                  <li key={`${job.kind}:${job.id}`}>
                    <JobCard job={job} now={now} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="border-border-strong bg-surface rounded-2xl border border-dashed px-6 py-10 text-center">
                <p className="text-[1rem] font-extrabold">
                  {jobs.length === 0 ? 'No jobs on the board yet' : 'No jobs match that search'}
                </p>
                <p className="text-muted mx-auto mt-1.5 max-w-md text-[0.8125rem] font-semibold leading-[1.65]">
                  {jobs.length === 0
                    ? 'Businesses on NexG are getting their first jobs ready. Check back soon.'
                    : 'Try fewer filters, or another word.'}
                </p>
                {hasFilters(filters) ? (
                  <Link
                    href="/careers/jobs"
                    className="bg-ink mt-5 inline-flex h-10 items-center rounded-lg px-5 text-[0.875rem] font-bold text-white"
                  >
                    See all jobs
                  </Link>
                ) : null}
              </div>
            )}
          </div>

          <div className="space-y-4 lg:col-start-2 xl:col-start-auto">
            <EmployerCard />
            <WhyCareers />
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
