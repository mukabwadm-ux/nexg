import { useEffect, useState, type FormEvent } from 'react';

import { errorMessage, workspaceRequest } from '../client';
import {
  JOB_CATEGORIES,
  JOB_TYPES,
  PAY_PERIODS,
  type HiringApplicant,
  type HiringDetail,
  type HiringJob,
  type HiringOverview,
} from '../hiring';
import { Badge, Button, Empty, Icon, PageHeader, Panel, Table } from '../ui';
import { useWorkspace } from '../workspace';
import './hiring.css';

/*
 * Hiring: the jobs this host, and any hotel the person is an admin of, post
 * on NexG Careers, and the people who apply. The rules live in the database
 * (who may post, who is verified, take-downs); this page shows what it says.
 */

const STATUS: Record<
  string,
  { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }
> = {
  open: { label: 'On the board', tone: 'success' },
  draft: { label: 'Draft', tone: 'neutral' },
  closed: { label: 'Closed', tone: 'neutral' },
};

const APPLICANT: Record<
  string,
  { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }
> = {
  submitted: { label: 'New', tone: 'warning' },
  shortlisted: { label: 'Shortlisted', tone: 'info' },
  interview: { label: 'Interview', tone: 'info' },
  hired: { label: 'Hired', tone: 'success' },
  rejected: { label: 'Not going ahead', tone: 'neutral' },
  withdrawn: { label: 'Withdrew', tone: 'neutral' },
};

const STEPS = [
  ['shortlisted', 'Shortlist', 'They hear they are on your shortlist.'],
  ['interview', 'Invite to interview', 'They are told the day and time.'],
  ['hired', 'Hire', 'They hear you want to hire them.'],
  ['rejected', 'Not going ahead', 'They are thanked and told you are not taking it further.'],
  ['submitted', 'Back to new', 'Only for your own sorting. They are not told.'],
] as const;

const label = (pairs: readonly (readonly [string, string])[], key: string) =>
  pairs.find(([k]) => k === key)?.[1] ?? key;

const day = (iso: string | null) =>
  iso
    ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-KE', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';

function post<T>(body: Record<string, unknown>) {
  return workspaceRequest<T>('/hiring', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function HiringPage() {
  const { recordId } = useWorkspace();
  if (recordId === 'new') return <NewJob />;
  if (recordId) return <JobPage key={recordId} id={recordId} />;
  return <JobList />;
}

function useOverview(retry: number) {
  const [data, setData] = useState<HiringOverview | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    workspaceRequest<HiringOverview>('/hiring', { signal: controller.signal })
      .then(setData)
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(errorMessage(cause, 'Hiring could not be loaded.'));
      });
    return () => controller.abort();
  }, [retry]);
  return { data, error };
}

function JobList() {
  const { go } = useWorkspace();
  const [retry, setRetry] = useState(0);
  const { data, error } = useOverview(retry);

  return (
    <div className="management-page hiring-page">
      <PageHeader
        title="Hiring"
        subtitle="Post jobs on NexG Careers and choose who to hire. Applicants send a note and a CV, and hear back at every step."
      >
        {data && data.employers.length > 0 && (
          <Button variant="primary" onClick={() => go('hiring', 'new')}>
            <Icon name="add" size={16} />
            Post a job
          </Button>
        )}
      </PageHeader>
      {error && (
        <Empty title="Hiring unavailable" description={error}>
          <Button onClick={() => setRetry(retry + 1)}>Retry</Button>
        </Empty>
      )}
      {!data && !error && <p className="mg-small-note">Loading your jobs…</p>}
      {data && data.employers.some((e) => !e.verified) && (
        <p className="hiring-note">
          {data.employers
            .filter((e) => !e.verified)
            .map((e) => e.name)
            .join(' and ')}{' '}
          can write jobs now and keep them as drafts. They go on the board once NexG has verified
          the business.
        </p>
      )}
      {data && (
        <Panel className="mg-fill-panel">
          <div className="mg-panel-heading">
            <div>
              <h2>Your jobs</h2>
              <p>
                {data.employers.length > 1
                  ? 'For ' + data.employers.map((e) => e.name).join(', ')
                  : 'Jobs you post appear on the NexG Careers board.'}
              </p>
            </div>
          </div>
          {data.jobs.length === 0 ? (
            <Empty
              title="No jobs yet"
              description="Post your first job and it goes on the NexG Careers board, where job seekers in your city look for work."
            >
              <Button variant="primary" onClick={() => go('hiring', 'new')}>
                Post a job
              </Button>
            </Empty>
          ) : (
            <Table>
              <caption className="mg-sr-only">Your jobs</caption>
              <thead>
                <tr>
                  <th scope="col">Job</th>
                  {data.employers.length > 1 && <th scope="col">Business</th>}
                  <th scope="col">Applicants</th>
                  <th scope="col">Posted</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.jobs.map((job) => {
                  const status = job.takenDownReason
                    ? ({ label: 'Taken down by NexG', tone: 'danger' } as const)
                    : STATUS[job.status];
                  return (
                    <tr key={job.id}>
                      <td>
                        <button className="hiring-link" onClick={() => go('hiring', job.id)}>
                          {job.title}
                        </button>
                        <small className="hiring-sub">{label(JOB_TYPES, job.jobType)}</small>
                      </td>
                      {data.employers.length > 1 && <td>{job.employerName}</td>}
                      <td>
                        {job.applicants}
                        {job.applicantsNew > 0 && (
                          <>
                            {' '}
                            <Badge tone="warning">{job.applicantsNew} new</Badge>
                          </>
                        )}
                      </td>
                      <td>{job.postedAt ? day(job.postedAt) : 'Written ' + day(job.createdAt)}</td>
                      <td>{status && <Badge tone={status.tone}>{status.label}</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Panel>
      )}
    </div>
  );
}

function NewJob() {
  const { go } = useWorkspace();
  const { data, error } = useOverview(0);
  return (
    <div className="management-page hiring-page">
      <PageHeader title="Post a job" subtitle="Say what the job is, where and what it pays.">
        <Button onClick={() => go('hiring')}>
          <Icon name="left" size={16} />
          Hiring
        </Button>
      </PageHeader>
      {error && <Empty title="Hiring unavailable" description={error} />}
      {!data && !error && <p className="mg-small-note">Loading…</p>}
      {data && (
        <Panel>
          <JobForm overview={data} onSaved={(id) => go('hiring', id)} />
        </Panel>
      )}
    </div>
  );
}

function JobPage({ id }: { id: string }) {
  const { go, notify } = useWorkspace();
  const [retry, setRetry] = useState(0);
  const { data: overview } = useOverview(retry);
  const [detail, setDetail] = useState<HiringDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    workspaceRequest<HiringDetail>('/hiring?job=' + encodeURIComponent(id), {
      signal: controller.signal,
    })
      .then(setDetail)
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(errorMessage(cause, 'This job could not be loaded.'));
      });
    return () => controller.abort();
  }, [id, retry]);

  const job = detail?.job;
  const verified =
    overview?.employers.find((e) => e.kind === job?.employerKind && e.id === job?.employerId)
      ?.verified ?? false;

  async function setStatus(status: 'open' | 'closed') {
    setBusy(true);
    try {
      const result = await post<{ message: string }>({ action: 'status', id, status });
      notify(result.message);
      setRetry((r) => r + 1);
    } catch (cause) {
      notify(errorMessage(cause, 'That did not work. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  const active = detail?.applicants.filter((a) => a.status !== 'withdrawn').length ?? 0;

  return (
    <div className="management-page hiring-page">
      <PageHeader
        title={job?.title ?? 'Job'}
        subtitle={
          !job
            ? undefined
            : job.takenDownReason !== null
              ? 'NexG took this job down. It is off the board until NexG lifts that.'
              : job.status === 'open'
                ? 'On the NexG Careers board now.'
                : job.status === 'draft'
                  ? 'A draft. Nobody else can see it until you publish it.'
                  : 'Closed. It is off the board, and the people who applied keep their applications.'
        }
      >
        <Button onClick={() => go('hiring')}>
          <Icon name="left" size={16} />
          Hiring
        </Button>
        {job?.status === 'open' && (
          <a
            className="btn btn-secondary"
            href={'/careers/jobs/' + job.id}
            target="_blank"
            rel="noreferrer"
          >
            See it on the board
          </a>
        )}
        {job?.status === 'open' && (
          <Button disabled={busy} onClick={() => setStatus('closed')}>
            Close the job
          </Button>
        )}
        {job?.status === 'closed' && job.takenDownReason === null && verified && (
          <Button variant="primary" disabled={busy} onClick={() => setStatus('open')}>
            Open it again
          </Button>
        )}
      </PageHeader>

      {error && (
        <Empty title="Job unavailable" description={error}>
          <Button onClick={() => go('hiring')}>Back to Hiring</Button>
        </Empty>
      )}
      {!detail && !error && <p className="mg-small-note">Loading…</p>}

      {job && job.takenDownReason !== null && (
        <p role="alert" className="hiring-alert">
          NexG took this job down and gave this reason. “{job.takenDownReason}” You can still read
          and answer the people who applied. To put the job back up, contact NexG support.
        </p>
      )}

      {detail && job && (
        <div className="hiring-columns">
          <Panel>
            <div className="mg-panel-heading">
              <div>
                <h2>{active === 1 ? '1 applicant' : active + ' applicants'}</h2>
                <p>
                  CVs are shared with you only, while the application stands and for 180 days after
                  the job closes. Use them for this hiring and nothing else.
                </p>
              </div>
            </div>
            {detail.applicants.length === 0 ? (
              <Empty
                title="Nobody has applied yet"
                description={
                  job.status === 'open'
                    ? 'You get a bell and an email when somebody does.'
                    : 'Applicants appear here once the job is on the board.'
                }
              />
            ) : (
              <ul className="hiring-applicants">
                {detail.applicants.map((applicant) => (
                  <ApplicantRow
                    key={applicant.id}
                    jobId={job.id}
                    applicant={applicant}
                    timeZone={detail.timeZone}
                    onMoved={() => setRetry((r) => r + 1)}
                  />
                ))}
              </ul>
            )}
          </Panel>
          {overview && (
            <Panel>
              <div className="mg-panel-heading">
                <div>
                  <h2>The job</h2>
                </div>
              </div>
              <JobForm overview={overview} job={job} onSaved={() => setRetry((r) => r + 1)} />
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}

function ApplicantRow({
  jobId,
  applicant,
  timeZone,
  onMoved,
}: {
  jobId: string;
  applicant: HiringApplicant;
  timeZone: string;
  onMoved: () => void;
}) {
  const { notify } = useWorkspace();
  const [step, setStep] = useState('');
  const [message, setMessage] = useState('');
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const status = APPLICANT[applicant.status] ?? APPLICANT.submitted;
  const withdrawn = applicant.status === 'withdrawn';
  const chosen = STEPS.find(([key]) => key === step);

  async function openCv() {
    setError('');
    try {
      const { url } = await post<{ url: string }>({
        action: 'cv',
        jobId,
        applicationId: applicant.id,
      });
      window.location.assign(url);
    } catch (cause) {
      setError(errorMessage(cause, 'The CV could not be opened.'));
    }
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await post({
        action: 'move',
        jobId,
        applicationId: applicant.id,
        status: step,
        message,
        interviewLocal: step === 'interview' ? when : '',
      });
      notify('Saved. ' + (step === 'submitted' ? 'They are not told.' : 'They have been told.'));
      setStep('');
      setMessage('');
      onMoved();
    } catch (cause) {
      setError(errorMessage(cause, 'That did not work. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={'hiring-applicant' + (withdrawn ? ' is-withdrawn' : '')}>
      <div className="hiring-applicant-head">
        <div>
          <strong>{applicant.fullName}</strong>
          <small>
            <a href={'mailto:' + applicant.email}>{applicant.email}</a>
            {applicant.phone && (
              <>
                {' · '}
                <a href={'tel:' + applicant.phone}>{applicant.phone}</a>
              </>
            )}
            {' · Applied ' + day(applicant.createdAt)}
          </small>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      {applicant.note && <p className="hiring-note-text">{applicant.note}</p>}
      {applicant.status === 'interview' && applicant.interviewAt && (
        <p className="hiring-interview">
          Interview{' '}
          {new Intl.DateTimeFormat('en-KE', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            timeZone,
          }).format(new Date(applicant.interviewAt))}
        </p>
      )}
      {withdrawn ? (
        <p className="mg-small-note">They withdrew, so their CV is no longer shared with you.</p>
      ) : (
        <div className="hiring-actions">
          {applicant.cvName ? (
            <Button onClick={openCv}>
              <Icon name="download" size={15} />
              Download CV
            </Button>
          ) : (
            <span className="mg-small-note">No CV sent</span>
          )}
          <label className="mg-sr-only" htmlFor={'step-' + applicant.id}>
            Next step for {applicant.fullName}
          </label>
          <select
            id={'step-' + applicant.id}
            value={step}
            onChange={(e) => setStep(e.target.value)}
          >
            <option value="">Next step…</option>
            {STEPS.filter(([key]) => key !== applicant.status || key === 'interview').map(
              ([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ),
            )}
          </select>
        </div>
      )}
      {chosen && (
        <form className="hiring-step" onSubmit={confirm}>
          <p>
            <strong>{chosen[1]}</strong> <span>{chosen[2]}</span>
          </p>
          <div className="field-grid">
            {step === 'interview' && (
              <label className="field">
                <span>Day and time *</span>
                <input
                  type="datetime-local"
                  required
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                />
              </label>
            )}
            {step !== 'submitted' && (
              <label className="field field-wide">
                <span>Message to {applicant.fullName.split(' ')[0]} · optional</span>
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={message}
                  placeholder={
                    step === 'interview' ? 'Where to come, who to ask for, what to bring.' : ''
                  }
                  onChange={(e) => setMessage(e.target.value)}
                />
              </label>
            )}
          </div>
          <div className="hiring-actions">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? 'Saving…' : step === 'submitted' ? 'Move back' : 'Send'}
            </Button>
            <Button onClick={() => setStep('')}>Cancel</Button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </li>
  );
}

function JobForm({
  overview,
  job,
  onSaved,
}: {
  overview: HiringOverview;
  job?: HiringJob;
  onSaved: (id: string) => void;
}) {
  const { notify } = useWorkspace();
  const first = overview.employers[0];
  const [employer, setEmployer] = useState(
    job ? job.employerKind + ':' + job.employerId : first ? first.kind + ':' + first.id : '',
  );
  const [kind, employerId] = employer.split(':') as ['host' | 'hotel', string];
  const chosen = overview.employers.find((e) => e.kind === kind && e.id === employerId);
  const [draft, setDraft] = useState({
    title: job?.title ?? '',
    category: job?.category ?? '',
    jobType: job?.jobType ?? '',
    cityId: job?.cityId ?? chosen?.cityId ?? overview.cities[0]?.id ?? '',
    area: job?.area ?? '',
    openings: job?.openings ?? 1,
    salaryMin: job?.salaryMin?.toString() ?? '',
    salaryMax: job?.salaryMax?.toString() ?? '',
    salaryPeriod: job?.salaryPeriod ?? 'month',
    description: job?.description ?? '',
    requirements: job?.requirements ?? '',
    closesOn: job?.closesOn ?? '',
  });
  const [busy, setBusy] = useState<'publish' | 'save' | null>(null);
  const [error, setError] = useState('');
  const set = (key: keyof typeof draft, value: string | number) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const isOpen = job?.status === 'open';
  const takenDown = job ? job.takenDownReason !== null : false;
  const canPublish = Boolean(chosen?.verified) && !takenDown;

  async function save(publish: boolean) {
    const amount = (value: string) => {
      const n = Number(value.replace(/[,\s]/g, ''));
      return value.trim() === '' ? null : Number.isFinite(n) ? Math.round(n) : NaN;
    };
    const salaryMin = amount(draft.salaryMin);
    const salaryMax = amount(draft.salaryMax);
    if (Number.isNaN(salaryMin) || Number.isNaN(salaryMax)) {
      setError('Write the pay as a number, such as 45000.');
      return;
    }
    setBusy(publish ? 'publish' : 'save');
    setError('');
    try {
      const result = await post<{ id: string; message: string }>({
        action: 'save',
        employerKind: kind,
        employerId,
        ...(job ? { id: job.id } : {}),
        title: draft.title,
        category: draft.category,
        jobType: draft.jobType,
        cityId: draft.cityId,
        area: draft.area,
        openings: Number(draft.openings) || 1,
        salaryMin,
        salaryMax,
        salaryPeriod: draft.salaryPeriod,
        description: draft.description,
        requirements: draft.requirements,
        closesOn: draft.closesOn,
        publish,
      });
      notify(result.message);
      onSaved(result.id);
    } catch (cause) {
      setError(errorMessage(cause, 'The job could not be saved.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <form
      className="record-form hiring-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save(false);
      }}
    >
      <div className="field-grid">
        {!job && overview.employers.length > 1 && (
          <label className="field field-wide">
            <span>Hiring for *</span>
            <select value={employer} onChange={(e) => setEmployer(e.target.value)}>
              {overview.employers.map((e) => (
                <option key={e.kind + e.id} value={e.kind + ':' + e.id}>
                  {e.name}
                  {e.kind === 'hotel' ? ' (hotel)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field field-wide">
          <span>Job title *</span>
          <input
            required
            minLength={3}
            maxLength={120}
            value={draft.title}
            placeholder="Housekeeping attendant"
            onChange={(e) => set('title', e.target.value)}
          />
        </label>
        <label className="field">
          <span>Category *</span>
          <select required value={draft.category} onChange={(e) => set('category', e.target.value)}>
            <option value="" disabled>
              Pick one
            </option>
            {JOB_CATEGORIES.map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Type of job *</span>
          <select required value={draft.jobType} onChange={(e) => set('jobType', e.target.value)}>
            <option value="" disabled>
              Pick one
            </option>
            {JOB_TYPES.map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>City *</span>
          <select required value={draft.cityId} onChange={(e) => set('cityId', e.target.value)}>
            {overview.cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Area · optional</span>
          <input
            maxLength={80}
            value={draft.area}
            placeholder="Kilimani"
            onChange={(e) => set('area', e.target.value)}
          />
        </label>
        <label className="field">
          <span>Openings *</span>
          <input
            type="number"
            required
            min={1}
            max={500}
            value={draft.openings}
            onChange={(e) => set('openings', Number(e.target.value))}
          />
        </label>
        <label className="field">
          <span>Pay from · optional</span>
          <input
            inputMode="numeric"
            value={draft.salaryMin}
            placeholder="45000"
            onChange={(e) => set('salaryMin', e.target.value)}
          />
        </label>
        <label className="field">
          <span>Pay to · optional</span>
          <input
            inputMode="numeric"
            value={draft.salaryMax}
            placeholder="60000"
            onChange={(e) => set('salaryMax', e.target.value)}
          />
        </label>
        <label className="field">
          <span>Pay period</span>
          <select value={draft.salaryPeriod} onChange={(e) => set('salaryPeriod', e.target.value)}>
            {PAY_PERIODS.map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="field field-wide">
          <span>What the job is *</span>
          <textarea
            required
            minLength={20}
            maxLength={6000}
            rows={5}
            value={draft.description}
            placeholder="What the person will do day to day, the hours, and who they work with."
            onChange={(e) => set('description', e.target.value)}
          />
        </label>
        <label className="field field-wide">
          <span>What they need · optional</span>
          <textarea
            maxLength={4000}
            rows={3}
            value={draft.requirements}
            placeholder="Experience, certificates, languages."
            onChange={(e) => set('requirements', e.target.value)}
          />
        </label>
        <label className="field">
          <span>Closing date · optional</span>
          <input
            type="date"
            value={draft.closesOn}
            onChange={(e) => set('closesOn', e.target.value)}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="hiring-actions">
        {isOpen ? (
          <Button type="submit" variant="primary" disabled={busy !== null}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        ) : (
          <>
            <Button
              variant="primary"
              disabled={busy !== null || !canPublish}
              onClick={(event) => {
                const form = (event.currentTarget as HTMLButtonElement).form;
                if (form && !form.reportValidity()) return;
                void save(true);
              }}
            >
              {busy === 'publish' ? 'Publishing…' : 'Publish'}
            </Button>
            <Button type="submit" disabled={busy !== null}>
              {busy === 'save' ? 'Saving…' : job ? 'Save changes' : 'Save as draft'}
            </Button>
          </>
        )}
        {takenDown ? (
          <span className="mg-small-note">NexG took this job down, so it cannot be published.</span>
        ) : !chosen?.verified ? (
          <span className="mg-small-note">
            You can publish once NexG has verified the business.
          </span>
        ) : null}
      </div>
    </form>
  );
}
