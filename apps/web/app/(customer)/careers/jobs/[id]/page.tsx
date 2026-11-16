import { BadgeCheck, Briefcase, CalendarClock, Clock, MapPin, Users, Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ApplyPanel } from '@/components/careers/apply-panel';
import { CareersNav } from '@/components/careers/careers-nav';
import { categoryIcon } from '@/components/careers/category-icon';
import { SaveJobButton } from '@/components/careers/save-job-button';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import {
  categoryLabel,
  formatPay,
  jobPlace,
  jobTypeLabel,
  postedAgo,
  type JobCategory,
  type JobType,
  type PayPeriod,
} from '@/lib/careers/board';
import { createPublicClient } from '@/lib/supabase/public';

/* Cached like the board, and redrawn at once when the business edits or
   closes the job (the Hiring actions revalidate this path). */
export const revalidate = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Vacancy {
  id: string;
  title: string;
  category: JobCategory | null;
  job_type: JobType | null;
  city_name: string | null;
  city_slug: string | null;
  currency: string | null;
  area: string | null;
  openings: number | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: PayPeriod | null;
  description: string | null;
  requirements: string | null;
  posted_at: string | null;
  closes_on: string | null;
  employer_name: string | null;
  employer_photo: string | null;
  employer_verified_at: string | null;
}

/** An open job of a live business, or nothing: drafts and closed jobs have no public page. */
async function loadVacancy(id: string): Promise<Vacancy | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await createPublicClient()
    .from('careers_vacancy_v')
    .select(
      'id, title, category, job_type, city_name, city_slug, currency, area, openings, salary_min, salary_max, salary_period, description, requirements, posted_at, closes_on, employer_name, employer_photo, employer_verified_at',
    )
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return data as Vacancy;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const job = await loadVacancy(params.id);
  if (!job) return { title: 'Job not found' };
  return {
    title: `${job.title} at ${job.employer_name}`,
    description: (job.description ?? '').replace(/\s+/g, ' ').slice(0, 160),
  };
}

const EMPLOYMENT_TYPE: Record<JobType, string> = {
  full_time: 'FULL_TIME',
  part_time: 'PART_TIME',
  temporary: 'TEMPORARY',
  gig: 'CONTRACTOR',
  internship: 'INTERN',
};

const PAY_UNIT: Partial<Record<PayPeriod, string>> = {
  hour: 'HOUR',
  day: 'DAY',
  week: 'WEEK',
  month: 'MONTH',
};

/* Structured data, so a search engine's job listings can show the job. */
function jobPosting(job: Vacancy) {
  const unit = job.salary_period ? PAY_UNIT[job.salary_period] : undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: [job.description, job.requirements].filter(Boolean).join('\n\n'),
    datePosted: job.posted_at,
    ...(job.closes_on ? { validThrough: `${job.closes_on}T23:59:59` } : {}),
    ...(job.job_type ? { employmentType: EMPLOYMENT_TYPE[job.job_type] } : {}),
    hiringOrganization: { '@type': 'Organization', name: job.employer_name },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: job.area ?? job.city_name,
        addressRegion: job.city_name,
      },
    },
    ...(unit && (job.salary_min != null || job.salary_max != null)
      ? {
          baseSalary: {
            '@type': 'MonetaryAmount',
            currency: job.currency ?? 'KES',
            value: {
              '@type': 'QuantitativeValue',
              ...(job.salary_min != null ? { minValue: job.salary_min } : {}),
              ...(job.salary_max != null ? { maxValue: job.salary_max } : {}),
              unitText: unit,
            },
          },
        }
      : {}),
  };
}

const longDate = (date: string) =>
  new Date(date.length === 10 ? `${date}T12:00:00` : date).toLocaleDateString('en-KE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

export default async function JobPage({ params }: { params: { id: string } }) {
  const job = await loadVacancy(params.id);
  if (!job) notFound();

  const employer = job.employer_name ?? 'This business';
  const pay = formatPay(job);
  const place = jobPlace(job);
  const type = jobTypeLabel(job.job_type);
  const Icon = categoryIcon(job.category);

  const facts = [
    type ? { Icon: Briefcase, text: type } : null,
    place ? { Icon: MapPin, text: place } : null,
    pay ? { Icon: Wallet, text: pay } : null,
    job.openings && job.openings > 1 ? { Icon: Users, text: `${job.openings} openings` } : null,
    job.posted_at
      ? { Icon: Clock, text: `Posted ${postedAgo(job.posted_at)?.toLowerCase()}` }
      : null,
    job.closes_on ? { Icon: CalendarClock, text: `Closes ${longDate(job.closes_on)}` } : null,
  ].filter(Boolean) as { Icon: typeof Briefcase; text: string }[];

  return (
    <>
      <SiteHeader action={{ label: 'Find jobs', href: '/careers/jobs' }} />
      <CareersNav active="find" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jobPosting(job)).replace(/</g, '\\u003c'),
        }}
      />

      <main>
        <section className="band-surface border-border border-b">
          <div className="mx-auto max-w-[120rem] px-4 pb-7 pt-6 sm:px-[30px]">
            <nav aria-label="Breadcrumb" className="text-muted-light text-[0.75rem] font-semibold">
              <Link href="/careers" className="hover:text-ink">
                Careers
              </Link>
              <span aria-hidden="true"> / </span>
              <Link href="/careers/jobs" className="hover:text-ink">
                Jobs
              </Link>
              <span aria-hidden="true"> / </span>
              <span aria-current="page">{job.title}</span>
            </nav>

            <div className="mt-4 flex items-start gap-4">
              <div className="bg-gold-soft relative hidden h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl sm:flex">
                {job.employer_photo ? (
                  <Image
                    src={job.employer_photo}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                ) : (
                  <Icon aria-hidden="true" strokeWidth={1.75} className="text-gold-text h-9 w-9" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <h1 className="text-[1.75rem]/[1.15] font-extrabold tracking-tight sm:text-[2.25rem]/[1.1]">
                    {job.title}
                  </h1>
                  <SaveJobButton vacancyId={job.id} title={job.title} className="mt-1" />
                </div>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.9375rem] font-bold">
                  {employer}
                  <span className="bg-success-bg text-success inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold">
                    <BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" />
                    Verified business
                  </span>
                </p>
                <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
                  {facts.map(({ Icon: FactIcon, text }) => (
                    <li
                      key={text}
                      className="text-muted flex items-center gap-1.5 text-[0.8125rem] font-semibold"
                    >
                      <FactIcon aria-hidden="true" className="text-gold-text h-4 w-4 shrink-0" />
                      {text}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto grid max-w-[120rem] gap-6 px-4 pb-16 pt-6 sm:px-[30px] lg:grid-cols-[minmax(0,1fr)_23rem]">
          <div className="min-w-0 space-y-5">
            <section className="border-border bg-surface rounded-2xl border p-5 sm:p-6">
              <h2 className="text-[1.125rem] font-extrabold">About the job</h2>
              <p className="text-muted mt-3 whitespace-pre-line text-[0.9375rem] font-semibold leading-[1.75]">
                {job.description}
              </p>
            </section>

            {job.requirements ? (
              <section className="border-border bg-surface rounded-2xl border p-5 sm:p-6">
                <h2 className="text-[1.125rem] font-extrabold">What you need</h2>
                <p className="text-muted mt-3 whitespace-pre-line text-[0.9375rem] font-semibold leading-[1.75]">
                  {job.requirements}
                </p>
              </section>
            ) : null}

            {job.category ? (
              <p className="text-muted-light text-[0.8125rem] font-semibold">
                Listed under{' '}
                <Link
                  href={`/careers/jobs?category=${job.category}`}
                  className="text-ink font-bold underline-offset-2 hover:underline"
                >
                  {categoryLabel(job.category)}
                </Link>
                .
              </p>
            ) : null}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <ApplyPanel vacancyId={job.id} employerName={employer} />

            <section className="border-border bg-surface rounded-2xl border p-5">
              <h2 className="text-[0.9375rem] font-extrabold">About {employer}</h2>
              <p className="text-muted mt-2 text-[0.8125rem] font-semibold leading-[1.65]">
                A business on NexG
                {job.employer_verified_at
                  ? `, checked and verified since ${longDate(job.employer_verified_at)}.`
                  : ', checked and verified by NexG.'}
              </p>
              <Link
                href={`/careers/jobs?q=${encodeURIComponent(employer)}`}
                className="text-gold-text mt-3 inline-block text-[0.8125rem] font-extrabold hover:underline"
              >
                More jobs at {employer}
              </Link>
            </section>
          </aside>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
