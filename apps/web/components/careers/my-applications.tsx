import { CalendarClock, FileText } from 'lucide-react';
import Link from 'next/link';

import { formatPay, jobPlace, type PayPeriod } from '@/lib/careers/board';

import { SaveJobButton } from './save-job-button';
import { WithdrawApplication } from './withdraw-application';

export interface MyApplication {
  id: string;
  vacancy_id: string;
  status: string;
  employer_note: string | null;
  interview_at: string | null;
  created_at: string;
  cv_name: string | null;
  title: string;
  area: string | null;
  employer_name: string;
  city_name: string | null;
  timezone: string | null;
  still_open: boolean;
}

export interface MySavedJob {
  vacancy_id: string;
  title: string;
  area: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: PayPeriod | null;
  currency: string | null;
  employer_name: string;
  city_name: string | null;
  still_open: boolean;
}

const STATUS: Record<string, { label: string; tone: string }> = {
  submitted: { label: 'Sent', tone: 'bg-bg text-muted' },
  shortlisted: { label: 'Shortlisted', tone: 'bg-gold-soft text-gold-text' },
  interview: { label: 'Interview', tone: 'bg-info-bg text-info' },
  hired: { label: 'Hired', tone: 'bg-success-bg text-success' },
  rejected: { label: 'Not taken further', tone: 'bg-bg text-muted-light' },
  withdrawn: { label: 'Withdrawn', tone: 'bg-bg text-muted-light' },
};

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });

function interviewTime(iso: string, timezone: string | null) {
  return new Intl.DateTimeFormat('en-KE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone ?? 'Africa/Nairobi',
  }).format(new Date(iso));
}

/** The job seeker's own applications, newest first, with where each one stands. */
export function MyApplications({ applications }: { applications: MyApplication[] | null }) {
  if (applications === null) {
    return (
      <p role="alert" className="text-danger text-sm font-semibold">
        Your applications could not be loaded. Refresh the page to try again.
      </p>
    );
  }
  if (applications.length === 0) {
    return (
      <p className="text-muted text-sm font-semibold">
        No job applications yet.{' '}
        <Link href="/careers/jobs" className="text-ink underline">
          Find a job
        </Link>
        .
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {applications.map((a) => {
        const status = STATUS[a.status] ?? STATUS.submitted!;
        const place = jobPlace(a);
        const live = !['withdrawn', 'hired', 'rejected'].includes(a.status);
        return (
          <li key={a.id} className="border-border bg-surface rounded-xl border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.9375rem] font-extrabold">
                  {a.still_open ? (
                    <Link href={`/careers/jobs/${a.vacancy_id}`} className="hover:underline">
                      {a.title}
                    </Link>
                  ) : (
                    a.title
                  )}
                </p>
                <p className="text-muted text-[0.8125rem] font-semibold">
                  {[a.employer_name, place].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[0.6875rem] font-extrabold ${status.tone}`}
              >
                {status.label}
              </span>
            </div>

            {a.status === 'interview' && a.interview_at ? (
              <p className="bg-info-bg text-info mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[0.8125rem] font-bold">
                <CalendarClock aria-hidden="true" className="h-4 w-4 shrink-0" />
                Interview on {interviewTime(a.interview_at, a.timezone)}
              </p>
            ) : null}

            {a.employer_note ? (
              <blockquote className="border-gold text-muted mt-3 border-l-2 pl-3 text-[0.8125rem] font-semibold leading-[1.6]">
                {a.employer_note}
                <footer className="text-muted-light mt-0.5 text-[0.6875rem]">
                  {a.employer_name}
                </footer>
              </blockquote>
            ) : null}

            <div className="text-muted-light mt-3 flex flex-wrap items-center justify-between gap-2 text-[0.75rem] font-semibold">
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>Applied {shortDate(a.created_at)}</span>
                {a.cv_name ? (
                  <span className="flex items-center gap-1">
                    <FileText aria-hidden="true" className="h-3.5 w-3.5" />
                    {a.cv_name}
                  </span>
                ) : null}
                {!a.still_open && live ? <span>The job has closed</span> : null}
              </span>
              {live ? (
                <WithdrawApplication applicationId={a.id} employer={a.employer_name} />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Jobs the job seeker bookmarked, open ones first. */
export function MySavedJobs({ jobs }: { jobs: MySavedJob[] | null }) {
  if (jobs === null) {
    return (
      <p role="alert" className="text-danger text-sm font-semibold">
        Your saved jobs could not be loaded. Refresh the page to try again.
      </p>
    );
  }
  if (jobs.length === 0) {
    return (
      <p className="text-muted text-sm font-semibold">
        No saved jobs yet. Tap the bookmark on a job to keep it here.{' '}
        <Link href="/careers/jobs" className="text-ink underline">
          Find a job
        </Link>
        .
      </p>
    );
  }
  const sorted = [...jobs].sort((a, b) => Number(b.still_open) - Number(a.still_open));
  return (
    <ul className="border-border divide-border bg-surface divide-y overflow-hidden rounded-xl border">
      {sorted.map((job) => {
        const pay = formatPay(job);
        return (
          <li key={job.vacancy_id} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="min-w-0">
              <span className="block text-[0.875rem] font-extrabold">
                {job.still_open ? (
                  <Link href={`/careers/jobs/${job.vacancy_id}`} className="hover:underline">
                    {job.title}
                  </Link>
                ) : (
                  job.title
                )}
              </span>
              <span className="text-muted block text-[0.75rem] font-semibold">
                {[job.employer_name, jobPlace(job), job.still_open ? pay : 'No longer open']
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            <SaveJobButton vacancyId={job.vacancy_id} title={job.title} />
          </li>
        );
      })}
    </ul>
  );
}
