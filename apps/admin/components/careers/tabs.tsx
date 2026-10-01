import { Card } from '@nexg/ui';
import Link from 'next/link';

import {
  Avatar,
  Chip,
  CONTRACT_LABEL,
  DASH,
  daysLabel,
  EmptyRow,
  FlagChips,
  JOB_TONE,
  NotMeasured,
  num,
  pct,
  Pill,
  plural,
  ScoreChip,
  shortDate,
  SOURCE_LABEL,
  STAGE_LABEL,
  STAGE_TONE,
  STAGES,
  Tile,
  when,
  WORK_MODE_LABEL,
  type ApplicantRow,
  type Badges,
  type JobRow,
  type MetricsRow,
} from './shared';

// ═══════════════════════════════════════════ F1 · Jobs

export function JobsTab({
  jobs,
  badges,
  filter,
  selected,
  questions,
}: {
  jobs: JobRow[];
  badges: Badges;
  filter: string;
  selected: string | null;
  questions: {
    id: string;
    job_id: string;
    prompt: string;
    kind: string;
    points: number | null;
    threshold: Record<string, number> | null;
    must_value: string | null;
  }[];
}) {
  const visible = jobs.filter((j) => {
    switch (filter) {
      case 'draft':
        return j.status === 'draft';
      case 'paused':
        return j.status === 'paused';
      case 'closed':
        return j.status === 'closed';
      case 'general':
        return j.is_general;
      default:
        return j.status === 'open' || j.status === 'always_open';
    }
  });

  const chosen = selected ? jobs.find((j) => j.id === selected) : undefined;
  const href = (f: string, s?: string | null) => {
    const p = new URLSearchParams({ tab: 'jobs' });
    if (f !== 'open') p.set('filter', f);
    const sel = s === undefined ? selected : s;
    if (sel) p.set('selected', sel);
    return `/careers?${p.toString()}`;
  };

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Chip on={filter === 'open'} href={href('open')}>
          Open {badges.open_jobs}
        </Chip>
        <Chip on={filter === 'draft'} href={href('draft')}>
          Draft {badges.draft_jobs}
        </Chip>
        <Chip on={filter === 'paused'} href={href('paused')}>
          Paused
        </Chip>
        <Chip on={filter === 'closed'} href={href('closed')}>
          Closed
        </Chip>
        <Chip on={filter === 'general'} href={href('general')}>
          General applications
        </Chip>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Open roles" value={num(badges.open_jobs)}>
          shown on the Careers page
        </Tile>
        <Tile
          label="New applicants · 7d"
          value={num(badges.applied_this_week)}
          tone={badges.unreviewed > 0 ? 'danger' : undefined}
        >
          {badges.unreviewed > 0
            ? `${badges.unreviewed} unreviewed > 3 d`
            : 'nothing waiting over 3 days'}
        </Tile>
        <Tile
          label="Time to hire · 90d"
          value={badges.time_to_hire_days === null ? `${DASH} d` : `${badges.time_to_hire_days} d`}
        >
          target 14 d · measured, not typed
        </Tile>
        <Tile
          label="Offer acceptance"
          value={pct(badges.offer_acceptance_pct)}
        >
          {plural(badges.offers_total ?? 0, 'offer')} · {num(badges.offers_declined)} declined
        </Tile>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_28rem] xl:items-start">
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[40rem] text-left">
            <thead>
              <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">New</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Posted</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((j) => (
                <tr
                  key={j.id}
                  className={`border-border hover:bg-bg border-b last:border-b-0 ${
                    selected === j.id ? 'bg-bg ring-gold ring-1 ring-inset' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <Link href={href(filter, j.id)} className="block">
                      <span className="block text-[0.8125rem] font-extrabold">{j.title}</span>
                      <span className="text-muted-light block text-[0.6875rem] font-semibold">
                        {[j.team_name, j.city_name ?? (j.is_general ? 'Any' : null)]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </Link>
                  </td>
                  <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">
                    {j.contract ? (CONTRACT_LABEL[j.contract] ?? j.contract) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Pill tone={JOB_TONE[j.status]}>
                      {j.status.replace(/_/g, ' ').toUpperCase()}
                    </Pill>
                  </td>
                  <td
                    className={`px-4 py-3 text-[0.8125rem] font-extrabold ${
                      j.new_applicants > 0 ? 'text-danger' : 'text-muted-light'
                    }`}
                  >
                    {j.new_applicants > 0 ? j.new_applicants : '—'}
                  </td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">
                    {j.total_applicants > 0 ? j.total_applicants : '—'}
                  </td>
                  <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">
                    {shortDate(j.posted_at)}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && <EmptyRow colSpan={6}>No roles here.</EmptyRow>}
            </tbody>
          </table>
        </Card>

        {chosen ? (
          <JobPanel job={chosen} questions={questions.filter((q) => q.job_id === chosen.id)} />
        ) : (
          <Card className="p-5">
            <p className="text-muted text-sm font-semibold">Pick a role to open it.</p>
          </Card>
        )}
      </div>
    </>
  );
}

function JobPanel({
  job,
  questions,
}: {
  job: JobRow;
  questions: {
    id: string;
    prompt: string;
    kind: string;
    points: number | null;
    threshold: Record<string, number> | null;
    must_value: string | null;
  }[];
}) {
  const weeks = Math.ceil(
    Object.values(job.stage_targets ?? {}).reduce((a, b) => a + Number(b), 0) / 7,
  );

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-[1.0625rem] font-extrabold">{job.title}</span>
          <Pill tone={JOB_TONE[job.status]}>{job.status.replace(/_/g, ' ').toUpperCase()}</Pill>
        </p>
        <p className="text-muted-light mt-2 text-[0.6875rem] font-semibold leading-relaxed">
          {[
            job.team_name,
            job.city_name,
            job.work_mode ? WORK_MODE_LABEL[job.work_mode] : null,
            job.contract ? CONTRACT_LABEL[job.contract] : null,
          ]
            .filter(Boolean)
            .join(' · ')}{' '}
          · posted {shortDate(job.posted_at)}
          {job.closes_at && ` · closes ${shortDate(job.closes_at)}`}
          {job.hiring_manager_name && ` · hiring manager ${job.hiring_manager_name}`}
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Tile label="Applicants" value={num(job.total_applicants)} />
        <Tile
          label="New this week"
          value={num(job.new_this_week)}
          tone={job.new_this_week > 0 ? 'danger' : undefined}
        />
        <Tile label="In interviews" value={num(job.in_interviews)} />
        <Tile label="Offers" value={num(job.offers)} />
      </div>

      <Card className="p-0">
        <p className="border-border border-b px-4 py-3 text-[0.9375rem] font-extrabold">
          Screening questions · auto-score
        </p>
        <ul className="divide-border divide-y">
          {questions.map((q) => (
            <li key={q.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
              <span className="text-muted min-w-0 text-[0.75rem] font-semibold">{q.prompt}</span>
              <span className="text-muted-light shrink-0 text-[0.6875rem] font-extrabold">
                {q.kind === 'must_yes_no'
                  ? `must = ${q.must_value}`
                  : q.kind === 'points_number' && q.threshold
                    ? `≥ ${q.threshold['gte']} · +${q.threshold['points']} pts`
                    : q.kind === 'free_text'
                      ? 'reviewed by human'
                      : `+${q.points ?? 1} pt`}
              </span>
            </li>
          ))}
          {questions.length === 0 && (
            <li className="text-muted px-4 py-6 text-center text-[0.75rem] font-semibold">
              No screening questions. Every application is read by hand.
            </li>
          )}
        </ul>
        <p className="text-muted-light border-border border-t px-4 py-3 text-[0.6875rem] font-semibold leading-snug">
          A failed must-have flags the card and suggests a template. It never rejects anybody.
        </p>
      </Card>

      <Card className="p-5">
        <p className="text-[0.9375rem] font-extrabold">What the candidate is promised</p>
        <p className="text-muted mt-2 text-[0.75rem] font-semibold leading-[1.7]">
          Five steps, about <strong>{weeks} weeks</strong> — summed from this job&rsquo;s own
          stage targets, so the page cannot promise a fortnight while the pipeline runs longer.
        </p>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {Object.entries(job.stage_targets ?? {}).map(([stage, days]) => (
            <li
              key={stage}
              className="border-border-strong rounded-full border px-2 py-0.5 text-[0.625rem] font-bold"
            >
              {stage.replace(/_/g, ' ')} {String(days)} d
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-4">
        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`/careers?tab=pipeline&job=${job.id}`}
            className="bg-ink hover:bg-ink/90 col-span-2 rounded-lg px-3 py-2 text-center text-[0.8125rem] font-bold text-white transition-colors"
          >
            Open pipeline · {job.total_applicants}
          </Link>
          <a
            href={`/careers/${job.slug}`}
            className="border-border-strong hover:border-ink rounded-lg border px-3 py-2 text-center text-[0.8125rem] font-bold transition-colors"
          >
            Preview public page
          </a>
          <Link
            href={`/careers?tab=applicants&job=${job.id}`}
            className="border-border-strong hover:border-ink rounded-lg border px-3 py-2 text-center text-[0.8125rem] font-bold transition-colors"
          >
            Applicants
          </Link>
        </div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════ F2 · Pipeline

export function PipelineTab({
  applicants,
  jobs,
  jobId,
  metrics,
  filter,
}: {
  applicants: ApplicantRow[];
  jobs: JobRow[];
  jobId: string | null;
  metrics: MetricsRow | null;
  filter: string;
}) {
  const job = jobs.find((j) => j.id === jobId);

  const visible = applicants.filter((a) => {
    if (filter === 'action') return a.needs_action;
    if (filter === 'rejected') return a.stage === 'rejected';
    if (filter === 'score') return (a.screening_score ?? 0) >= 5;
    return !['rejected', 'withdrawn'].includes(a.stage);
  });

  const href = (f: string) =>
    `/careers?tab=pipeline${jobId ? `&job=${jobId}` : ''}${f === 'all' ? '' : `&filter=${f}`}`;

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {jobs
          .filter((j) => j.status === 'open' || j.status === 'always_open')
          .slice(0, 6)
          .map((j) => (
            <Chip
              key={j.id}
              on={jobId === j.id}
              href={`/careers?tab=pipeline&job=${j.id}`}
            >
              {j.title}
            </Chip>
          ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Chip on={filter === 'all'} href={href('all')}>
          All
        </Chip>
        <Chip on={filter === 'action'} href={href('action')}>
          Needs action {applicants.filter((a) => a.needs_action).length}
        </Chip>
        <Chip on={filter === 'rejected'} href={href('rejected')}>
          Rejected {applicants.filter((a) => a.stage === 'rejected').length}
        </Chip>
        <Chip on={filter === 'score'} href={href('score')}>
          Score ≥ 5
        </Chip>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Tile label="In pipeline" value={num(metrics?.in_pipeline)}>
          {num(metrics?.new_count)} new · {num(metrics?.needs_action)} need action
        </Tile>
        <Tile
          label="Screening auto-score"
          value={
            metrics?.avg_score === null || metrics?.avg_score === undefined
              ? `${DASH}/10`
              : `avg ${metrics.avg_score}/${metrics.avg_max ?? DASH}`
          }
        >
          from questions · human reviews all
        </Tile>
        <Tile label="Conversion · new → offer" value={pct(metrics?.new_to_offer_pct)}>
          this role
        </Tile>
        <Tile label="Days in stage · median" value={num(metrics?.median_days_in_stage)}>
          target ≤ 5 per stage
        </Tile>
        <Tile
          label="Rejected with feedback"
          value={pct(metrics?.rejected_with_feedback_pct)}
          tone={
            metrics?.rejected_with_feedback_pct !== null &&
            metrics?.rejected_with_feedback_pct !== undefined &&
            metrics.rejected_with_feedback_pct < 100
              ? 'danger'
              : 'success'
          }
        >
          template + reason · always
        </Tile>
        <Tile label="Data retention" value="6 months">
          then anonymised · KDPA
        </Tile>
      </div>

      {!job ? (
        <Card className="mt-5 p-6">
          <p className="text-[0.9375rem] font-extrabold">Pick a role.</p>
          <p className="text-muted mt-2 text-[0.8125rem] font-semibold">
            A pipeline belongs to one job — the stages are that job&rsquo;s own targets.
          </p>
        </Card>
      ) : (
        <div className="mt-5 flex gap-4 overflow-x-auto pb-2">
          {STAGES.map((stage) => {
            const cards = visible.filter((a) => a.stage === stage.key);
            return (
              <section key={stage.key} className="w-[17rem] shrink-0">
                <Card className="p-0">
                  <div className="border-border flex items-center justify-between gap-2 border-b px-4 py-3">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={`h-2 w-2 rounded-full ${
                          stage.key === 'hired' || stage.key === 'offer'
                            ? 'bg-success'
                            : stage.key === 'new'
                              ? 'bg-muted-light'
                              : 'bg-gold'
                        }`}
                      />
                      <span className="text-[0.8125rem] font-extrabold">{stage.label}</span>
                    </span>
                    <span className="text-muted-light text-[0.75rem] font-extrabold">
                      {cards.length}
                    </span>
                  </div>
                  <div className="space-y-2 p-2">
                    {cards.map((a) => (
                      <Link
                        key={a.id}
                        href={`/careers?tab=applicants&selected=${a.id}`}
                        className={`block rounded-lg border p-3 transition-colors ${
                          a.must_failed.length > 0
                            ? 'border-danger bg-danger-bg'
                            : 'border-border hover:border-ink'
                        }`}
                      >
                        <p className="text-[0.8125rem] font-extrabold">
                          {a.full_name ?? '[Applicant]'}
                        </p>
                        <p className="text-muted-light text-[0.625rem] font-semibold">
                          {[a.city, SOURCE_LABEL[a.source] ?? a.source].filter(Boolean).join(' · ')}
                        </p>
                        <p className="mt-1.5 flex flex-wrap items-center gap-1">
                          <ScoreChip score={a.screening_score} max={a.screening_max} />
                          <FlagChips flags={a.flags} />
                        </p>
                        <p
                          className={`mt-1.5 text-[0.625rem] font-extrabold ${
                            a.stage_target_days !== null &&
                            a.days_in_stage > a.stage_target_days
                              ? 'text-danger'
                              : 'text-gold-text'
                          }`}
                        >
                          {daysLabel(a.days_in_stage)}
                        </p>
                        {a.must_failed.length > 0 && (
                          <p className="text-danger mt-1.5 text-[0.625rem] font-bold leading-snug">
                            Auto-flag: a must-have failed · suggest reject with template
                          </p>
                        )}
                      </Link>
                    ))}
                    {cards.length === 0 && (
                      <p className="text-muted-light px-2 py-6 text-center text-[0.75rem] font-semibold">
                        Nobody here
                      </p>
                    )}
                  </div>
                </Card>
              </section>
            );
          })}
        </div>
      )}

      <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-relaxed">
        These columns are the public &ldquo;How we hire&rdquo; steps, with New and Screening added
        inside Apply. A candidate sees five; both of those read as &ldquo;Application received ·
        under review&rdquo;.
      </p>
    </>
  );
}

// ══════════════════════════════════════ F3 · Applicants

export function ApplicantsTab({
  applicants,
  badges,
  filter,
  selected,
  reasons,
  notes,
  events,
  emails,
}: {
  applicants: ApplicantRow[];
  badges: Badges;
  filter: string;
  selected: string | null;
  reasons: { code: string; label: string; candidate_text: string }[];
  notes: { id: string; body: string; kind: string; created_at: string; author: string | null }[];
  events: { id: number; from_stage: string | null; to_stage: string; at: string }[];
  emails: { id: string; subject: string; status: string; created_at: string }[];
}) {
  const visible = applicants.filter((a) => {
    switch (filter) {
      case 'new':
        return a.stage === 'new';
      case 'action':
        return a.needs_action;
      case 'on_file':
        return a.stage === 'on_file';
      case 'rejected':
        return a.stage === 'rejected';
      case 'hired':
        return a.stage === 'hired';
      default:
        return !['rejected', 'withdrawn', 'hired'].includes(a.stage);
    }
  });

  const chosen = selected ? applicants.find((a) => a.id === selected) : undefined;
  const href = (f: string, s?: string | null) => {
    const p = new URLSearchParams({ tab: 'applicants' });
    if (f !== 'active') p.set('filter', f);
    const sel = s === undefined ? selected : s;
    if (sel) p.set('selected', sel);
    return `/careers?${p.toString()}`;
  };

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Chip on={filter === 'active'} href={href('active')}>
          All active {applicants.filter((a) => !['rejected', 'withdrawn', 'hired'].includes(a.stage)).length}
        </Chip>
        <Chip on={filter === 'new'} href={href('new')}>
          New {badges.new_applications}
        </Chip>
        <Chip on={filter === 'action'} href={href('action')}>
          Needs action {badges.needs_action}
        </Chip>
        <Chip on={filter === 'on_file'} href={href('on_file')}>
          On file
        </Chip>
        <Chip on={filter === 'rejected'} href={href('rejected')}>
          Rejected
        </Chip>
        <Chip on={filter === 'hired'} href={href('hired')}>
          Hired
        </Chip>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_28rem] xl:items-start">
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[44rem] text-left">
            <thead>
              <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-3">Applicant</th>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Applied</th>
                <th className="px-4 py-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => (
                <tr
                  key={a.id}
                  className={`border-border hover:bg-bg border-b last:border-b-0 ${
                    selected === a.id ? 'bg-bg ring-gold ring-1 ring-inset' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <Link href={href(filter, a.id)} className="flex items-center gap-2.5">
                      <Avatar name={a.full_name} />
                      <span className="min-w-0">
                        <span className="block text-[0.8125rem] font-extrabold">
                          {a.full_name ?? '[Applicant name]'}
                        </span>
                        <span className="text-muted-light block text-[0.6875rem] font-semibold">
                          {a.city ?? DASH}
                          {a.needs_action && (
                            <span className="text-danger"> · needs action</span>
                          )}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">
                    {a.job_title}
                  </td>
                  <td className="px-4 py-3">
                    <Pill tone={STAGE_TONE[a.stage]}>{STAGE_LABEL[a.stage] ?? a.stage}</Pill>
                  </td>
                  <td className="px-4 py-3">
                    <ScoreChip score={a.screening_score} max={a.screening_max} />
                  </td>
                  <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">
                    {when(a.created_at)}
                  </td>
                  <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">
                    {SOURCE_LABEL[a.source] ?? a.source}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <EmptyRow colSpan={6}>Nobody here.</EmptyRow>
              )}
            </tbody>
          </table>
        </Card>

        {chosen ? (
          <CandidatePanel
            applicant={chosen}
            reasons={reasons}
            notes={notes}
            events={events}
            emails={emails}
          />
        ) : (
          <Card className="p-5">
            <p className="text-muted text-sm font-semibold">Pick somebody to open their record.</p>
          </Card>
        )}
      </div>
    </>
  );
}

function CandidatePanel({
  applicant,
  reasons,
  notes,
  events,
  emails,
}: {
  applicant: ApplicantRow;
  reasons: { code: string; label: string; candidate_text: string }[];
  notes: { id: string; body: string; kind: string; created_at: string; author: string | null }[];
  events: { id: number; from_stage: string | null; to_stage: string; at: string }[];
  emails: { id: string; subject: string; status: string; created_at: string }[];
}) {
  const nextStage = STAGES[STAGES.findIndex((s) => s.key === applicant.stage) + 1];

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <Avatar name={applicant.full_name} />
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-[1rem] font-extrabold">
                {applicant.full_name ?? '[Applicant name]'}
              </span>
              <Pill tone={STAGE_TONE[applicant.stage]}>
                {STAGE_LABEL[applicant.stage] ?? applicant.stage}
              </Pill>
              <ScoreChip score={applicant.screening_score} max={applicant.screening_max} />
            </p>
            <p className="text-muted-light mt-1.5 text-[0.6875rem] font-semibold leading-relaxed">
              {applicant.job_title} · applied {when(applicant.created_at)} via{' '}
              {SOURCE_LABEL[applicant.source] ?? applicant.source}
              {applicant.city && ` · ${applicant.city}`}
              {/* Masked in the view, not here. Revealing is an audited RPC. */}
              {applicant.phone_masked && ` · ${applicant.phone_masked}`}
              {applicant.email_masked && ` · ${applicant.email_masked}`}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <Fact
          label="Screening"
          value={
            applicant.screening_score === null
              ? DASH
              : `${applicant.screening_score}/${applicant.screening_max ?? DASH}`
          }
        />
        <Fact
          label="Work sample"
          value={
            applicant.work_sample_score === null
              ? DASH
              : `${applicant.work_sample_score}/20`
          }
          sub={
            applicant.work_sample_hours
              ? `${applicant.work_sample_payment === 'paid' ? 'paid' : 'due'} · ${applicant.work_sample_hours} h`
              : undefined
          }
        />
        <Fact label="Days in stage" value={daysLabel(applicant.days_in_stage)} />
      </div>

      {Object.keys(applicant.flags ?? {}).length > 0 && (
        <Card className="p-4">
          <p className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
            From the screening answers
          </p>
          <p className="mt-2 flex flex-wrap gap-1.5">
            <FlagChips flags={applicant.flags} />
          </p>
        </Card>
      )}

      {applicant.why_nexg && (
        <Card className="p-4">
          <p className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
            Why NexG
          </p>
          <p className="text-muted mt-1.5 text-[0.75rem] font-semibold leading-relaxed">
            {applicant.why_nexg}
          </p>
        </Card>
      )}

      {applicant.must_failed.length > 0 && applicant.stage !== 'rejected' && (
        <Card className="border-danger border-2 p-5">
          <p className="text-[0.875rem] font-extrabold">
            {plural(applicant.must_failed.length, 'must-have')} failed
          </p>
          <p className="text-muted mt-2 text-[0.75rem] font-semibold leading-[1.7]">
            The card is flagged and a template is suggested. Nobody is rejected by a score — you
            still pick the reason and write the sentence they read.
          </p>
        </Card>
      )}

      {applicant.rejected_reason_text && (
        <Card className="p-5">
          <p className="text-[0.875rem] font-extrabold">What they were told</p>
          <p className="text-muted mt-2 text-[0.75rem] font-semibold leading-[1.7]">
            &ldquo;{applicant.rejected_reason_text}&rdquo;
          </p>
          <p className="text-muted-light mt-2 text-[0.625rem] font-semibold">
            Reason code: {applicant.rejected_reason_code}
          </p>
        </Card>
      )}

      <Card className="p-0">
        <p className="border-border border-b px-4 py-3 text-[0.9375rem] font-extrabold">
          Reviewer notes
        </p>
        <ul className="divide-border divide-y">
          {notes.map((n) => (
            <li key={n.id} className="px-4 py-3">
              <p className="text-muted-light text-[0.625rem] font-extrabold uppercase">
                {n.author ?? 'Staff'} · {n.kind.replace(/_/g, ' ')} · {when(n.created_at)}
              </p>
              <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-relaxed">
                {n.body}
              </p>
            </li>
          ))}
          {notes.length === 0 && (
            <li className="text-muted px-4 py-6 text-center text-[0.75rem] font-semibold">
              Nothing written yet.
            </li>
          )}
        </ul>
      </Card>

      <Card className="p-0">
        <p className="border-border border-b px-4 py-3 text-[0.9375rem] font-extrabold">
          Timeline
        </p>
        <ul className="divide-border divide-y">
          {events.map((e) => (
            <li key={e.id} className="px-4 py-2.5">
              <p className="text-[0.75rem] font-semibold">
                <span className="text-muted-light">{when(e.at)} · </span>
                {e.from_stage ? `${STAGE_LABEL[e.from_stage]} → ` : ''}
                <span className="font-extrabold">{STAGE_LABEL[e.to_stage] ?? e.to_stage}</span>
              </p>
            </li>
          ))}
          {emails.map((m) => (
            <li key={m.id} className="px-4 py-2.5">
              <p className="text-[0.75rem] font-semibold">
                <span className="text-muted-light">{when(m.created_at)} · email · </span>
                {m.subject}
                <span className="text-muted-light"> · {m.status}</span>
              </p>
            </li>
          ))}
          {events.length === 0 && emails.length === 0 && (
            <li className="text-muted px-4 py-6 text-center text-[0.75rem] font-semibold">
              Nothing yet.
            </li>
          )}
        </ul>
      </Card>

      {!['rejected', 'withdrawn', 'hired'].includes(applicant.stage) && (
        <Card className="p-4">
          <p className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
            Move to
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {nextStage && (
              <span className="bg-gold-soft text-gold-text rounded-lg px-3 py-1.5 text-[0.75rem] font-extrabold">
                {nextStage.label}
              </span>
            )}
            <span className="border-border-strong rounded-lg border px-3 py-1.5 text-[0.75rem] font-bold">
              Keep on file
            </span>
            <span className="border-border-strong rounded-lg border px-3 py-1.5 text-[0.75rem] font-bold">
              Reject…
            </span>
          </div>
          <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-[1.7]">
            The candidate sees stage changes by email · a rejection always carries a reason they
            can read · data is kept {6} months, then anonymised.
          </p>
          <p className="text-muted-light mt-2 text-[0.625rem] font-semibold">
            {plural(reasons.length, 'rejection reason')} on the list, each with the sentence the
            candidate reads.
          </p>
        </Card>
      )}
    </div>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-bg rounded-lg p-2.5">
      <p className="text-muted-light text-[0.5625rem] font-extrabold uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1 text-[0.8125rem] font-extrabold">{value}</p>
      {sub && <p className="text-muted-light text-[0.5625rem] font-semibold">{sub}</p>}
    </div>
  );
}

// ═══════════════════════════ Templates & settings

export function SettingsTab({
  templates,
  reasons,
  settings,
}: {
  templates: {
    id: string;
    key: string;
    subject: string;
    requires_reason: boolean;
    version: number;
    updated_at: string;
  }[];
  reasons: { code: string; label: string; candidate_text: string; active: boolean }[];
  settings: { key: string; value: unknown; label: string }[];
}) {
  return (
    <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start">
      <div className="space-y-5">
        <Card className="overflow-x-auto p-0">
          <p className="border-border border-b px-4 py-3 text-[0.9375rem] font-extrabold">
            Email templates
          </p>
          <table className="w-full min-w-[34rem] text-left">
            <thead>
              <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-3">Key</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-border border-b last:border-b-0">
                  <td className="px-4 py-3 text-[0.75rem] font-extrabold">{t.key}</td>
                  <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">
                    {t.subject}
                  </td>
                  <td className="text-muted-light px-4 py-3 text-[0.75rem] font-semibold">
                    v{t.version}
                  </td>
                  <td className="px-4 py-3">
                    {t.requires_reason && (
                      <Pill tone="bg-danger-bg text-danger">REQUIRES REASON</Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-muted-light border-border border-t px-4 py-3 text-[0.6875rem] font-semibold leading-snug">
            No candidate email goes out except from one of these, and every copy sent is stored
            against the application.
          </p>
        </Card>

        <Card className="overflow-x-auto p-0">
          <p className="border-border border-b px-4 py-3 text-[0.9375rem] font-extrabold">
            Rejection reasons
          </p>
          <ul className="divide-border divide-y">
            {reasons.map((r) => (
              <li key={r.code} className="px-4 py-3">
                <p className="flex items-center justify-between gap-2">
                  <span className="text-[0.8125rem] font-extrabold">{r.label}</span>
                  <span className="text-muted-light text-[0.625rem] font-semibold">{r.code}</span>
                </p>
                {/* The sentence the candidate reads, written once so two
                    recruiters cannot phrase the same no differently. */}
                <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-relaxed">
                  &ldquo;{r.candidate_text}&rdquo;
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="p-0">
          <p className="border-border border-b px-4 py-3 text-[0.9375rem] font-extrabold">
            Hiring policy
          </p>
          <ul className="divide-border divide-y">
            {settings.map((s) => (
              <li key={s.key} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <span className="text-muted min-w-0 text-[0.75rem] font-semibold">{s.label}</span>
                <span className="shrink-0 text-[0.75rem] font-extrabold">
                  {s.value === null || s.value === 'null'
                    ? DASH
                    : typeof s.value === 'object'
                      ? `${Object.keys(s.value as object).length} values`
                      : String(s.value).replace(/"/g, '')}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <NotMeasured
          what="Why the nulls are nulls"
          why="The careers mailbox and the salary threshold above which an offer needs a second person have not been decided. Until they are, the public page prints [—] and every offer needs two approvers — the conservative reading, since the alternative is one person approving any salary."
        />
      </div>
    </div>
  );
}
