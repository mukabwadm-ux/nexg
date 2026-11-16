import { ArrowRight, Briefcase, Search } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { CareersNav } from '@/components/careers/careers-nav';
import { CategoryTiles } from '@/components/careers/category-tiles';
import { EmployerCard, TrainingBanner, WhyCareers } from '@/components/careers/employer-panels';
import { FilterPanel } from '@/components/careers/filter-panel';
import { JobCard } from '@/components/careers/job-card';
import { JobSearchBar } from '@/components/careers/job-search-bar';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { NO_FILTERS, boardCities, facetCounts, filterJobs } from '@/lib/careers/board';
import { loadBoard } from '@/lib/careers/load';

export const metadata: Metadata = {
  title: 'Careers',
  description:
    'Find jobs, gig work and internships with hotels, restaurants, property managers and other businesses on NexG.',
};

/*
 * The same for every visitor, so cached: five minutes at most, and redrawn at
 * once when a business opens, edits or closes a job (the Hiring actions
 * revalidate this path).
 */
export const revalidate = 300;

const FEATURED = 5;

export default async function CareersPage() {
  const { jobs, cities } = await loadBoard();
  const latest = filterJobs(jobs, NO_FILTERS);
  const facets = facetCounts(jobs, NO_FILTERS);
  const now = new Date();

  return (
    <>
      <SiteHeader action={{ label: 'Find jobs', href: '/careers/jobs' }} />
      <CareersNav />

      <main>
        {/* ------------------------------------------------------------ hero */}
        <section className="band-surface relative overflow-hidden">
          <div className="mx-auto max-w-[120rem] lg:min-h-[31rem]">
            <div className="relative z-10 px-4 pb-8 pt-10 sm:px-[30px] lg:w-1/2 lg:pb-28 lg:pt-16">
              <h1 className="text-[2.5rem]/[1.05] font-extrabold tracking-tight sm:text-[3.25rem]/[1.04] xl:text-[3.75rem]/[1.03]">
                Connecting talent
                <br />
                to <span className="text-gold-text">opportunity.</span>
              </h1>
              <p className="text-muted mt-5 max-w-[30rem] text-[1.0625rem] font-semibold leading-[1.65]">
                Discover jobs, flexible work and career growth across hospitality, tourism,
                property, services and more.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/careers/jobs"
                  className="bg-gold text-ink hover:bg-gold/90 inline-flex h-12 items-center gap-2.5 rounded-lg px-6 text-[0.9375rem] font-extrabold transition-colors"
                >
                  <Search aria-hidden="true" className="h-[1.125rem] w-[1.125rem]" />
                  Find Jobs
                </Link>
                <Link
                  href="/careers/employers"
                  className="text-ink inline-flex h-12 items-center gap-2.5 rounded-lg border-2 border-current px-6 text-[0.9375rem] font-extrabold transition-colors hover:opacity-80"
                >
                  <Briefcase aria-hidden="true" className="h-[1.125rem] w-[1.125rem]" />
                  Hire Talent
                </Link>
              </div>
            </div>

            {/* The photograph, behind a gold curve on wide screens. */}
            <div className="relative mx-4 h-64 overflow-hidden rounded-2xl sm:mx-[30px] sm:h-80 lg:absolute lg:inset-y-0 lg:right-0 lg:mx-0 lg:h-auto lg:w-1/2 lg:overflow-visible lg:rounded-none">
              <div
                aria-hidden="true"
                className="bg-gold absolute inset-0 hidden [clip-path:ellipse(100%_140%_at_100%_50%)] lg:block"
              />
              <div className="absolute inset-0 lg:left-3 lg:[clip-path:ellipse(100%_140%_at_100%_50%)]">
                <Image
                  src="/images/merchant-page/barista.jpg"
                  alt="A smiling barista in an apron, arms folded, behind a café counter"
                  fill
                  priority
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="object-cover object-[60%_30%]"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- search */}
        <div className="relative z-10 mx-auto -mt-2 max-w-[120rem] px-4 pt-6 sm:px-[30px] lg:-mt-12 lg:pt-0">
          <JobSearchBar cities={cities} />
        </div>

        {/* ------------------------------------------------------ categories */}
        <section
          aria-label="Browse jobs by category"
          className="mx-auto max-w-[120rem] px-4 pt-6 sm:px-[30px]"
        >
          <CategoryTiles />
        </section>

        <div className="mx-auto max-w-[120rem] px-4 pt-5 sm:px-[30px]">
          <TrainingBanner />
        </div>

        {/* ----------------------------------------------------------- board */}
        <section
          id="jobs"
          aria-labelledby="latest-jobs"
          className="mx-auto grid max-w-[120rem] scroll-mt-20 gap-5 px-4 pb-16 pt-6 sm:px-[30px] lg:grid-cols-[16.5rem_minmax(0,1fr)] xl:grid-cols-[16.5rem_minmax(0,1fr)_21rem]"
        >
          <aside className="hidden lg:block">
            <FilterPanel
              action="/careers/jobs"
              filters={NO_FILTERS}
              facets={facets}
              cities={boardCities(jobs, cities)}
            />
          </aside>

          <div className="min-w-0">
            <div className="flex items-end justify-between gap-3">
              <h2 id="latest-jobs" className="text-[1.375rem] font-extrabold tracking-tight">
                Latest jobs
              </h2>
              {latest.length > 0 ? (
                <Link
                  href="/careers/jobs"
                  className="text-gold-text inline-flex items-center gap-1 text-[0.8125rem] font-extrabold hover:underline"
                >
                  View all {latest.length === 1 ? 'jobs' : `${latest.length} jobs`}
                  <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </div>

            {latest.length > 0 ? (
              <ul className="mt-4 space-y-3">
                {latest.slice(0, FEATURED).map((job) => (
                  <li key={`${job.kind}:${job.id}`}>
                    <JobCard job={job} now={now} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="border-border-strong bg-surface mt-4 rounded-2xl border border-dashed px-6 py-10 text-center">
                <p className="text-[1rem] font-extrabold">No jobs on the board yet</p>
                <p className="text-muted mx-auto mt-1.5 max-w-md text-[0.8125rem] font-semibold leading-[1.65]">
                  Businesses on NexG are getting their first jobs ready. Create an account now, and
                  applying takes a minute when they go up.
                </p>
                <Link
                  href="/sign-up?next=%2Fcareers"
                  className="bg-ink mt-5 inline-flex h-10 items-center rounded-lg px-5 text-[0.875rem] font-bold text-white"
                >
                  Create an account
                </Link>
              </div>
            )}
          </div>

          <div className="space-y-4 lg:col-start-2 xl:col-start-auto">
            <EmployerCard />
            <WhyCareers />
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
