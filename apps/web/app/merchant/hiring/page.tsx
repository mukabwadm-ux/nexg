import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { Panel } from '@/components/merchant/bits';
import { Board, PageHead, merchantContext } from '@/components/merchant/frame';
import { jobTypeLabel } from '@/lib/careers/board';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Hiring' };
export const dynamic = 'force-dynamic';

interface JobRow {
  id: string;
  title: string;
  status: string;
  job_type: string;
  posted_at: string | null;
  closes_on: string | null;
  created_at: string;
  /* Since 20261225000100. */
  taken_down_at?: string | null;
}

const STATUS: Record<string, { label: string; tone: string }> = {
  open: { label: 'On the board', tone: 'bg-success-bg text-success' },
  draft: { label: 'Draft', tone: 'bg-bg text-muted' },
  closed: { label: 'Closed', tone: 'bg-bg text-muted-light' },
  taken_down: { label: 'Taken down by NexG', tone: 'bg-danger-bg text-danger' },
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * The business's jobs on NexG Careers: open, drafts and closed, with how many
 * people applied and how many of them nobody has looked at yet.
 */
export default async function HiringPage() {
  const { m, live } = await merchantContext();
  if (!m) return null;

  const supabase = createClient();
  const jobsRes = await supabase
    .from('vacancy')
    .select('*')
    .eq('merchant_id', m.merchant_id)
    .order('created_at', { ascending: false });

  const jobs = (jobsRes.data as JobRow[] | null) ?? [];
  const appsRes = jobs.length
    ? await supabase
        .from('vacancy_application')
        .select('vacancy_id, status')
        .in(
          'vacancy_id',
          jobs.map((j) => j.id),
        )
    : { data: [] };
  const applications = (appsRes.data as { vacancy_id: string; status: string }[] | null) ?? [];
  const counts = (id: string) => {
    const mine = applications.filter((a) => a.vacancy_id === id && a.status !== 'withdrawn');
    return { all: mine.length, fresh: mine.filter((a) => a.status === 'submitted').length };
  };

  return (
    <Board>
      <PageHead
        title="Hiring"
        lead="Post jobs on NexG Careers and choose who to hire. Applicants send a note and a CV, and hear back at every step."
        actions={
          jobsRes.error ? undefined : (
            <Link
              href="/merchant/hiring/new"
              className="bg-gold text-ink inline-flex h-10 items-center rounded-lg px-4 text-[0.875rem] font-extrabold"
            >
              Post a job
            </Link>
          )
        }
      />

      {!live ? (
        <p className="border-gold/40 bg-gold-soft rounded-xl border px-4 py-3 text-[0.8125rem] font-semibold">
          You can write jobs now and keep them as drafts. They go on the board once NexG has
          verified your business.
        </p>
      ) : null}

      {jobsRes.error ? (
        <p role="alert" className="text-danger text-sm font-semibold">
          Hiring is not switched on yet. Try again later.
        </p>
      ) : (
        <Panel title="Your jobs">
          {jobs.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-[0.9375rem] font-extrabold">No jobs yet</p>
              <p className="text-muted mx-auto mt-1 max-w-sm text-[0.8125rem] font-semibold">
                Post your first job and it goes on the NexG Careers board, where job seekers in your
                city look for work.
              </p>
              <Link
                href="/merchant/hiring/new"
                className="bg-ink mt-4 inline-flex h-10 items-center rounded-lg px-4 text-[0.875rem] font-bold text-white"
              >
                Post a job
              </Link>
            </div>
          ) : (
            <ul className="divide-border divide-y">
              {jobs.map((job) => {
                const status =
                  (job.taken_down_at ? STATUS.taken_down : STATUS[job.status]) ?? STATUS.draft!;
                const { all, fresh } = counts(job.id);
                return (
                  <li key={job.id}>
                    <Link
                      href={`/merchant/hiring/${job.id}`}
                      className="hover:bg-bg flex items-center justify-between gap-3 px-4 py-3.5 transition-colors"
                    >
                      <span className="min-w-0">
                        <span className="block text-[0.875rem] font-extrabold">{job.title}</span>
                        <span className="text-muted-light block text-[0.75rem] font-semibold">
                          {[
                            jobTypeLabel(job.job_type),
                            job.posted_at
                              ? `Posted ${day(job.posted_at)}`
                              : `Written ${day(job.created_at)}`,
                            job.closes_on && job.status === 'open'
                              ? `Closes ${day(job.closes_on)}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className="text-right text-[0.75rem] font-bold">
                          {all === 1 ? '1 applicant' : `${all} applicants`}
                          {fresh > 0 ? (
                            <span className="bg-gold text-ink ml-2 rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold">
                              {fresh} new
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={`hidden rounded-full px-2.5 py-1 text-[0.6875rem] font-extrabold sm:inline ${status.tone}`}
                        >
                          {status.label}
                        </span>
                        <ArrowRight aria-hidden="true" className="text-muted h-4 w-4" />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}
    </Board>
  );
}
