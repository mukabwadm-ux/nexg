'use client';

import { CalendarClock, FileText, Mail, Phone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { cvLink, moveApplicant } from '@/app/merchant/hiring/actions';

export interface Applicant {
  id: string;
  vacancy_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  note: string | null;
  cv_name: string | null;
  status: string;
  employer_note: string | null;
  interview_at: string | null;
  created_at: string;
}

type Step = 'submitted' | 'shortlisted' | 'interview' | 'hired' | 'rejected';

const STATUS: Record<string, { label: string; tone: string }> = {
  submitted: { label: 'New', tone: 'bg-gold text-ink' },
  shortlisted: { label: 'Shortlisted', tone: 'bg-gold-soft text-gold-text' },
  interview: { label: 'Interview', tone: 'bg-info-bg text-info' },
  hired: { label: 'Hired', tone: 'bg-success-bg text-success' },
  rejected: { label: 'Not going ahead', tone: 'bg-bg text-muted-light' },
  withdrawn: { label: 'Withdrew', tone: 'bg-bg text-muted-light' },
};

const STEPS: { key: Step; label: string; hint: string }[] = [
  { key: 'shortlisted', label: 'Shortlist', hint: 'They hear they are on your shortlist.' },
  { key: 'interview', label: 'Invite to interview', hint: 'They are told the day and time.' },
  { key: 'hired', label: 'Hire', hint: 'They hear you want to hire them.' },
  {
    key: 'rejected',
    label: 'Not going ahead',
    hint: 'They are thanked and told you are not taking it further.',
  },
  { key: 'submitted', label: 'Back to new', hint: 'Only for your own sorting. They are not told.' },
];

const when = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('en-KE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(iso));

/**
 * One applicant: who they are, what they wrote, their CV, and the next step.
 * Every step but "back to new" tells the applicant, with the message given.
 */
export function ApplicantCard({ applicant, timeZone }: { applicant: Applicant; timeZone: string }) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const status = STATUS[applicant.status] ?? STATUS.submitted!;
  const withdrawn = applicant.status === 'withdrawn';

  async function openCv() {
    setError(null);
    const result = await cvLink(applicant.id);
    if (result.url) window.location.assign(result.url);
    else setError(result.message ?? 'The CV could not be opened.');
  }

  async function confirm(form: HTMLFormElement) {
    if (!step) return;
    const data = new FormData(form);
    setBusy(true);
    setError(null);
    const result = await moveApplicant({
      applicationId: applicant.id,
      vacancyId: applicant.vacancy_id,
      status: step,
      message: String(data.get('message') ?? ''),
      interviewLocal: String(data.get('interview_at') ?? ''),
      timeZone,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? 'That did not work. Try again.');
      return;
    }
    setStep(null);
    router.refresh();
  }

  const chosen = STEPS.find((s) => s.key === step);

  return (
    <li className={`px-4 py-4 ${withdrawn ? 'opacity-70' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.9375rem] font-extrabold">{applicant.full_name}</p>
          <p className="text-muted mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] font-semibold">
            <a
              href={`mailto:${applicant.email}`}
              className="hover:text-ink flex items-center gap-1"
            >
              <Mail aria-hidden="true" className="h-3.5 w-3.5" />
              {applicant.email}
            </a>
            {applicant.phone ? (
              <a href={`tel:${applicant.phone}`} className="hover:text-ink flex items-center gap-1">
                <Phone aria-hidden="true" className="h-3.5 w-3.5" />
                {applicant.phone}
              </a>
            ) : null}
            <span className="text-muted-light">
              Applied{' '}
              {new Date(applicant.created_at).toLocaleDateString('en-KE', {
                day: 'numeric',
                month: 'short',
              })}
            </span>
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[0.6875rem] font-extrabold ${status.tone}`}>
          {status.label}
        </span>
      </div>

      {applicant.note ? (
        <p className="text-muted mt-2.5 whitespace-pre-line text-[0.8125rem] font-semibold leading-[1.6]">
          {applicant.note}
        </p>
      ) : null}

      {applicant.status === 'interview' && applicant.interview_at ? (
        <p className="text-info mt-2.5 flex items-center gap-1.5 text-[0.8125rem] font-bold">
          <CalendarClock aria-hidden="true" className="h-4 w-4" />
          Interview {when(applicant.interview_at, timeZone)}
        </p>
      ) : null}

      {!withdrawn ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {applicant.cv_name ? (
            <button
              type="button"
              onClick={openCv}
              className="border-border-strong hover:border-ink flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[0.75rem] font-bold"
            >
              <FileText aria-hidden="true" className="h-3.5 w-3.5" />
              Download CV
            </button>
          ) : (
            <span className="text-muted-light text-[0.75rem] font-semibold">No CV sent</span>
          )}
          <label className="sr-only" htmlFor={`step-${applicant.id}`}>
            Next step for {applicant.full_name}
          </label>
          <select
            id={`step-${applicant.id}`}
            value={step ?? ''}
            onChange={(event) => setStep((event.target.value || null) as Step | null)}
            className="border-border-strong bg-surface h-9 rounded-lg border px-2 text-[0.75rem] font-bold"
          >
            <option value="">Next step…</option>
            {STEPS.filter((s) => s.key !== applicant.status || s.key === 'interview').map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-muted-light mt-2 text-[0.75rem] font-semibold">
          They withdrew, so their CV is no longer shared with you.
        </p>
      )}

      {chosen ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void confirm(event.currentTarget);
          }}
          className="border-border bg-bg mt-3 space-y-2.5 rounded-xl border p-3"
        >
          <p className="text-[0.8125rem] font-extrabold">
            {chosen.label}
            <span className="text-muted-light ml-2 font-semibold">{chosen.hint}</span>
          </p>
          {step === 'interview' ? (
            <label className="block">
              <span className="text-[0.75rem] font-bold">Day and time</span>
              <input
                name="interview_at"
                type="datetime-local"
                required
                className="border-border-strong bg-surface mt-1 h-10 w-full max-w-xs rounded-lg border px-2 text-[0.8125rem] font-semibold"
              />
            </label>
          ) : null}
          {step !== 'submitted' ? (
            <label className="block">
              <span className="text-[0.75rem] font-bold">
                Message to {applicant.full_name.split(' ')[0]}{' '}
                <span className="text-muted-light font-semibold">(optional)</span>
              </span>
              <textarea
                name="message"
                rows={2}
                maxLength={1000}
                placeholder={
                  step === 'interview' ? 'Where to come, who to ask for, what to bring.' : ''
                }
                className="border-border-strong bg-surface mt-1 w-full rounded-lg border px-2.5 py-2 text-[0.8125rem] font-semibold"
              />
            </label>
          ) : null}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="bg-ink h-9 rounded-lg px-4 text-[0.75rem] font-bold text-white disabled:opacity-60"
            >
              {busy ? 'Saving…' : step === 'submitted' ? 'Move back' : 'Send'}
            </button>
            <button
              type="button"
              onClick={() => setStep(null)}
              className="border-border-strong h-9 rounded-lg border px-4 text-[0.75rem] font-bold"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="text-danger mt-2 text-[0.75rem] font-bold">
          {error}
        </p>
      ) : null}
    </li>
  );
}
