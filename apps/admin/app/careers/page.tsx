import type { Metadata } from 'next';
import Link from 'next/link';

import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import {
  type ApplicantRow,
  type Badges,
  type JobRow,
  type MetricsRow,
} from '@/components/careers/shared';
import {
  ApplicantsTab,
  JobsTab,
  PipelineTab,
  SettingsTab,
} from '@/components/careers/tabs';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Careers ATS' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'jobs', label: 'Jobs' },
  { key: 'applicants', label: 'Applicants' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'settings', label: 'Templates & settings' },
] as const;

const SUBTITLE: Record<string, string> = {
  jobs: 'Jobs you publish here appear on the public Careers page · HR / recruiter role only',
  applicants: 'Every applicant across every job · filter by job, stage, city, source, score',
  pipeline:
    'New → Screening → Intro call → Work sample → Team conversation → Offer → Hired · matches the public "How we hire" steps',
  settings: 'Templates, reasons and the policy behind every candidate email',
};

/**
 * Grow → Careers ATS.
 *
 * The public careers page prints two promises. This console is where
 * they are kept: a rejection cannot be saved without a reason the
 * candidate reads, and the "about two weeks" on the page is summed
 * from the stage targets set here.
 *
 * Candidate data lives in its own schema and is reachable by
 * recruiters, the hiring manager for that job, and the interviewers on
 * that panel. Everybody else — including other console modules — sees
 * nothing, which RLS enforces rather than this page.
 */
export default async function CareersPage({
  searchParams,
}: {
  searchParams?: {
    tab?: string;
    filter?: string;
    selected?: string;
    job?: string;
  };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'careers');
  const supabase = createClient();
  const hr = supabase.schema('hr');

  const tab = TABS.some((t) => t.key === searchParams?.tab) ? searchParams!.tab! : 'jobs';
  const filter =
    searchParams?.filter ??
    (tab === 'jobs' ? 'open' : tab === 'applicants' ? 'active' : 'all');
  const selected = searchParams?.selected ?? null;

  const [{ data: badgesRaw }, { data: jobs }] = await Promise.all([
    hr.rpc('rpc_careers_counts', {}),
    hr.from('console_jobs_v').select('*').order('posted_at', { ascending: false, nullsFirst: false }),
  ]);

  const badges = (badgesRaw as Badges | null) ?? ({} as Badges);
  const jobRows = (jobs as JobRow[] | null) ?? [];
  const jobId = searchParams?.job ?? jobRows.find((j) => j.status === 'open')?.id ?? null;

  return (
    <ConsoleShell staff={staff} current="/careers">
      <ConsoleHeader
        title={tab === 'pipeline' ? 'Pipeline' : tab === 'applicants' ? 'Applicants' : 'Careers ATS'}
        breadcrumb={SUBTITLE[tab]!}
      />

      <main className="px-4 py-6 sm:px-8">
        <nav
          className="border-border -mx-4 flex gap-6 overflow-x-auto border-b px-4 sm:-mx-8 sm:px-8"
          aria-label="Careers sections"
        >
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/careers?tab=${t.key}`}
              className={`-mb-px shrink-0 border-b-2 pb-3 text-sm font-bold transition-colors ${
                tab === t.key
                  ? 'border-gold text-ink'
                  : 'text-muted hover:text-ink border-transparent'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {tab === 'jobs' && (await loadJobs(supabase, jobRows, badges, filter, selected))}
        {tab === 'applicants' && (await loadApplicants(supabase, badges, filter, selected, searchParams?.job))}
        {tab === 'pipeline' && (await loadPipeline(supabase, jobRows, jobId, filter))}
        {tab === 'settings' && (await loadSettings(supabase))}
      </main>
    </ConsoleShell>
  );
}

/* The base client; each loader narrows to the hr schema itself.
   Aliasing the narrowed client collapses into a union across every
   exposed schema, and TypeScript then allows only the table names
   they share. */
type Supabase = ReturnType<typeof createClient>;

async function loadJobs(
  supabase: Supabase,
  jobs: JobRow[],
  badges: Badges,
  filter: string,
  selected: string | null,
) {
  const hr = supabase.schema('hr');
  /* Only the open job's questions: the panel is the only thing that
     renders them. */
  const { data: questions } = selected
    ? await hr
        .from('job_question')
        .select('id, job_id, prompt, kind, points, threshold, must_value')
        .eq('job_id', selected)
        .order('sort')
    : { data: [] as unknown[] };

  return (
    <JobsTab
      jobs={jobs}
      badges={badges}
      filter={filter}
      selected={selected}
      questions={
        (questions as {
          id: string;
          job_id: string;
          prompt: string;
          kind: string;
          points: number | null;
          threshold: Record<string, number> | null;
          must_value: string | null;
        }[] | null) ?? []
      }
    />
  );
}

async function loadApplicants(
  supabase: Supabase,
  badges: Badges,
  filter: string,
  selected: string | null,
  jobFilter?: string,
) {
  const hr = supabase.schema('hr');
  let query = hr.from('console_applicants_v').select('*').order('created_at', { ascending: false });
  if (jobFilter) query = query.eq('job_id', jobFilter);

  const [{ data: applicants }, { data: reasons }] = await Promise.all([
    query,
    hr.from('rejection_reason').select('code, label, candidate_text').eq('active', true).order('sort'),
  ]);

  /* The selected candidate's history only. Fetching every note for
     every applicant to render one panel is a lot of somebody's
     private feedback moving around for nothing. */
  const [{ data: notes }, { data: events }, { data: emails }] = selected
    ? await Promise.all([
        hr
          .from('note')
          .select('id, body, kind, created_at, author:author_id(display_name)')
          .eq('application_id', selected)
          .order('created_at', { ascending: false }),
        hr
          .from('stage_event')
          .select('id, from_stage, to_stage, at')
          .eq('application_id', selected)
          .order('at', { ascending: false }),
        hr
          .from('email')
          .select('id, subject, status, created_at')
          .eq('application_id', selected)
          .order('created_at', { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  return (
    <ApplicantsTab
      applicants={(applicants as ApplicantRow[] | null) ?? []}
      badges={badges}
      filter={filter}
      selected={selected}
      reasons={
        (reasons as { code: string; label: string; candidate_text: string }[] | null) ?? []
      }
      notes={(
        (notes as
          | {
              id: string;
              body: string;
              kind: string;
              created_at: string;
              author: { display_name: string } | null;
            }[]
          | null) ?? []
      ).map((n) => ({ ...n, author: n.author?.display_name ?? null }))}
      events={
        (events as { id: number; from_stage: string | null; to_stage: string; at: string }[] | null) ??
        []
      }
      emails={
        (emails as { id: string; subject: string; status: string; created_at: string }[] | null) ??
        []
      }
    />
  );
}

async function loadPipeline(supabase: Supabase, jobs: JobRow[], jobId: string | null, filter: string) {
  const hr = supabase.schema('hr');
  if (!jobId) {
    return <PipelineTab applicants={[]} jobs={jobs} jobId={null} metrics={null} filter={filter} />;
  }

  const [{ data: applicants }, { data: metrics }] = await Promise.all([
    hr.from('console_applicants_v').select('*').eq('job_id', jobId),
    hr.from('console_metrics_v').select('*').eq('job_id', jobId).maybeSingle(),
  ]);

  return (
    <PipelineTab
      applicants={(applicants as ApplicantRow[] | null) ?? []}
      jobs={jobs}
      jobId={jobId}
      metrics={(metrics as MetricsRow | null) ?? null}
      filter={filter}
    />
  );
}

async function loadSettings(supabase: Supabase) {
  const hr = supabase.schema('hr');
  const [{ data: templates }, { data: reasons }, { data: settings }] = await Promise.all([
    hr
      .from('email_template')
      .select('id, key, subject, requires_reason, version, updated_at')
      .order('key'),
    hr.from('rejection_reason').select('code, label, candidate_text, active').order('sort'),
    hr.from('setting').select('key, value, label').order('key'),
  ]);

  return (
    <SettingsTab
      templates={
        (templates as {
          id: string;
          key: string;
          subject: string;
          requires_reason: boolean;
          version: number;
          updated_at: string;
        }[] | null) ?? []
      }
      reasons={
        (reasons as
          | { code: string; label: string; candidate_text: string; active: boolean }[]
          | null) ?? []
      }
      settings={(settings as { key: string; value: unknown; label: string }[] | null) ?? []}
    />
  );
}
