'use client';

import { CircleCheck, FileText, Upload, X } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

const CV_MAX_BYTES = 5 * 1024 * 1024;
const CV_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

type Phase =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'form'; userId: string; name: string; email: string; phone: string }
  | { kind: 'applied'; status: string; appliedAt: string }
  | { kind: 'sent' };

const STATUS_LINE: Record<string, (employer: string) => string> = {
  submitted: (e) => `Sent. ${e} has your application.`,
  shortlisted: () => 'You are on the shortlist.',
  interview: () => 'You are invited to an interview.',
  hired: (e) => `${e} wants to hire you.`,
  rejected: (e) => `${e} is not taking this application further.`,
};

const field =
  'border-border-strong bg-surface text-ink placeholder:text-muted-light focus:border-ink w-full rounded-lg border px-3 text-[0.875rem] font-semibold transition-colors focus:outline-none';

/**
 * Applying for a business's job, on the job's page.
 *
 * It takes a NexG account, so the applicant can follow the application and
 * withdraw it, and the business knows who it is talking to. The CV goes
 * straight from the browser to the applicant's own private folder; the
 * database then checks that the file is theirs before it is attached.
 */
export function ApplyPanel({
  vacancyId,
  employerName,
}: {
  vacancyId: string;
  employerName: string;
}) {
  const [phase, setPhase] = React.useState<Phase>({ kind: 'loading' });
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const next = encodeURIComponent(`/careers/jobs/${vacancyId}#apply`);

  React.useEffect(() => {
    let live = true;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!live) return;
      if (!user || user.is_anonymous) {
        setPhase({ kind: 'signed-out' });
        return;
      }
      const { data: mine } = await supabase
        .from('my_job_applications_v')
        .select('status, created_at')
        .eq('vacancy_id', vacancyId)
        .maybeSingle();
      if (!live) return;
      const application = mine as { status: string | null; created_at: string | null } | null;
      if (application?.status && application.status !== 'withdrawn') {
        setPhase({
          kind: 'applied',
          status: application.status,
          appliedAt: application.created_at ?? '',
        });
        return;
      }
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      setPhase({
        kind: 'form',
        userId: user.id,
        name: String(meta.full_name ?? meta.name ?? ''),
        email: user.email ?? '',
        phone: user.phone ? `+${user.phone.replace(/^\+/, '')}` : '',
      });
    })();
    return () => {
      live = false;
    };
  }, [vacancyId]);

  function pickFile(picked: File | null) {
    setError(null);
    if (!picked) {
      setFile(null);
      return;
    }
    const ext = picked.name.split('.').pop()?.toLowerCase() ?? '';
    if (!CV_TYPES[ext]) {
      setError('Your CV needs to be a PDF or a Word document.');
      return;
    }
    if (picked.size > CV_MAX_BYTES) {
      setError('Your CV is larger than 5 MB. Save a smaller copy and add that.');
      return;
    }
    setFile(picked);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phase.kind !== 'form') return;
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    setError(null);

    let cvPath: string | null = null;
    if (file) {
      setBusy('Uploading your CV');
      const ext = file.name.split('.').pop()!.toLowerCase();
      cvPath = `${phase.userId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('careers-cv')
        .upload(cvPath, file, { contentType: CV_TYPES[ext], upsert: false });
      if (uploadError) {
        setBusy(null);
        setError('Your CV did not upload. Check your connection and try again.');
        return;
      }
    }

    setBusy('Sending your application');
    const { error: applyError } = await supabase.rpc('rpc_vacancy_apply', {
      p_vacancy_id: vacancyId,
      p_full_name: String(form.get('full_name') ?? ''),
      p_email: String(form.get('email') ?? ''),
      p_phone: String(form.get('phone') ?? '') || undefined,
      p_note: String(form.get('note') ?? '') || undefined,
      p_cv_path: cvPath ?? undefined,
      p_cv_name: file?.name ?? undefined,
    });
    setBusy(null);

    if (applyError) {
      /* The file is no use without the application. */
      if (cvPath) await supabase.storage.from('careers-cv').remove([cvPath]);
      setError(applyError.message);
      return;
    }
    setPhase({ kind: 'sent' });
  }

  return (
    <section
      id="apply"
      aria-labelledby="apply-heading"
      className="border-border bg-surface scroll-mt-24 rounded-2xl border p-5"
    >
      <h2 id="apply-heading" className="text-[1.125rem] font-extrabold">
        Apply for this job
      </h2>

      {phase.kind === 'loading' ? (
        <div aria-hidden="true" className="mt-4 space-y-2">
          <div className="bg-bg h-10 animate-pulse rounded-lg" />
          <div className="bg-bg h-10 animate-pulse rounded-lg" />
        </div>
      ) : null}

      {phase.kind === 'signed-out' ? (
        <>
          <p className="text-muted mt-2 text-[0.8125rem] font-semibold leading-[1.65]">
            Applying takes a NexG account, so you can follow your application and hear back at every
            step. It takes a minute.
          </p>
          <div className="mt-4 grid gap-2">
            <Link
              href={`/sign-in?next=${next}`}
              className="bg-gold text-ink hover:bg-gold/90 flex h-11 items-center justify-center rounded-lg text-[0.9375rem] font-extrabold transition-colors"
            >
              Log in to apply
            </Link>
            <Link
              href={`/sign-up?next=${next}`}
              className="border-border-strong hover:border-ink flex h-11 items-center justify-center rounded-lg border text-[0.9375rem] font-bold transition-colors"
            >
              Create an account
            </Link>
          </div>
        </>
      ) : null}

      {phase.kind === 'applied' ? (
        <div className="mt-3">
          <p className="flex items-start gap-2 text-[0.875rem] font-bold">
            <CircleCheck aria-hidden="true" className="text-success mt-0.5 h-4 w-4 shrink-0" />
            {(STATUS_LINE[phase.status] ?? STATUS_LINE.submitted!)(employerName)}
          </p>
          {phase.appliedAt ? (
            <p className="text-muted-light mt-1 pl-6 text-[0.75rem] font-semibold">
              You applied on{' '}
              {new Date(phase.appliedAt).toLocaleDateString('en-KE', {
                day: 'numeric',
                month: 'long',
              })}
              .
            </p>
          ) : null}
          <Link
            href="/account?tab=applications"
            className="border-border-strong hover:border-ink mt-4 flex h-10 items-center justify-center rounded-lg border text-[0.875rem] font-bold transition-colors"
          >
            See my applications
          </Link>
        </div>
      ) : null}

      {phase.kind === 'sent' ? (
        <div className="mt-3" role="status">
          <p className="flex items-start gap-2 text-[0.9375rem] font-extrabold">
            <CircleCheck aria-hidden="true" className="text-success mt-0.5 h-5 w-5 shrink-0" />
            Application sent
          </p>
          <p className="text-muted mt-1 pl-7 text-[0.8125rem] font-semibold leading-[1.65]">
            {employerName} can see it now. You will hear here and by email when they move it on.
          </p>
          <Link
            href="/account?tab=applications"
            className="border-border-strong hover:border-ink mt-4 flex h-10 items-center justify-center rounded-lg border text-[0.875rem] font-bold transition-colors"
          >
            See my applications
          </Link>
        </div>
      ) : null}

      {phase.kind === 'form' ? (
        <form onSubmit={submit} className="mt-4 space-y-3" noValidate={false}>
          <label className="block">
            <span className="text-[0.75rem] font-bold">Full name</span>
            <input
              name="full_name"
              required
              minLength={2}
              maxLength={120}
              autoComplete="name"
              defaultValue={phase.name}
              className={`${field} mt-1 h-11`}
            />
          </label>
          <label className="block">
            <span className="text-[0.75rem] font-bold">Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              defaultValue={phase.email}
              className={`${field} mt-1 h-11`}
            />
          </label>
          <label className="block">
            <span className="text-[0.75rem] font-bold">
              Phone <span className="text-muted-light font-semibold">(optional)</span>
            </span>
            <input
              name="phone"
              type="tel"
              maxLength={32}
              autoComplete="tel"
              defaultValue={phase.phone}
              placeholder="+254 7…"
              className={`${field} mt-1 h-11`}
            />
          </label>
          <label className="block">
            <span className="text-[0.75rem] font-bold">
              Why this job <span className="text-muted-light font-semibold">(a few lines)</span>
            </span>
            <textarea
              name="note"
              rows={3}
              maxLength={2000}
              className={`${field} mt-1 py-2.5 leading-[1.6]`}
            />
          </label>

          <div>
            <span className="text-[0.75rem] font-bold">
              CV <span className="text-muted-light font-semibold">(PDF or Word, up to 5 MB)</span>
            </span>
            {file ? (
              <div className="border-border-strong bg-bg mt-1 flex items-center gap-2.5 rounded-lg border px-3 py-2.5">
                <FileText aria-hidden="true" className="text-gold-text h-5 w-5 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-bold">
                  {file.name}
                </span>
                <button
                  type="button"
                  onClick={() => pickFile(null)}
                  aria-label="Remove this CV"
                  className="tap-area text-muted hover:text-ink rounded p-1"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="border-border-strong hover:border-ink mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-4 text-[0.8125rem] font-bold transition-colors">
                <Upload aria-hidden="true" className="h-4 w-4" />
                Add your CV
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="sr-only"
                  onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </div>

          {error ? (
            <p
              role="alert"
              className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-[0.8125rem] font-bold"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy !== null}
            className="bg-gold text-ink hover:bg-gold/90 flex h-12 w-full items-center justify-center rounded-lg text-[0.9375rem] font-extrabold transition-colors disabled:opacity-60"
          >
            {busy ? `${busy}…` : 'Send application'}
          </button>

          <p className="text-muted-light text-[0.6875rem] font-semibold leading-[1.6]">
            Your application and CV go to {employerName} only. You can withdraw any time from My
            applications, and they can no longer open your CV.
          </p>
        </form>
      ) : null}
    </section>
  );
}
