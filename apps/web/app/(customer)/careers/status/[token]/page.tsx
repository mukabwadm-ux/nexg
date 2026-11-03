import { Card } from '@nexg/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { StatusActions } from '@/components/careers/status-actions';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { createPublicClient } from '@/lib/supabase/public';

export const metadata: Metadata = { title: 'Your application', robots: { index: false } };
export const dynamic = 'force-dynamic';

const STEPS = ['Apply', 'Intro call', 'Work sample', 'Team conversation', 'Offer'] as const;

interface Status {
  ok: boolean;
  job_title?: string;
  applied_at?: string;
  stage?: string;
  public_stage?: string;
  step?: number | null;
  first_name?: string;
  weeks_to_hire?: number;
  rejected_reason?: string | null;
  talent_pool?: boolean;
  interview?: {
    id: string;
    kind: string;
    status: string;
    slots: string[];
    scheduled_at: string | null;
    meet_link: string | null;
  } | null;
  work_sample?: {
    brief: string | null;
    paid: boolean;
    pay_note: string | null;
    due_at: string | null;
    submitted_at: string | null;
  } | null;
  offer?: {
    status: string;
    salary: number | null;
    currency: string;
    start_date: string | null;
    contract: string | null;
    conditions: string[];
  } | null;
  retention_months?: string;
}

/**
 * Where a candidate stands.
 *
 * No sign-in: the token in the URL is the credential, which is why
 * this page is `noindex` and why the view behind it hands out five
 * stages and nothing else — no note, no score, no interviewer
 * surname, nothing about anybody else.
 */
export default async function StatusPage({ params }: { params: { token: string } }) {
  const supabase = createPublicClient();

  const { data } = await supabase.rpc('rpc_careers_status', { p_token: params.token });

  const s = (data as Status | null) ?? { ok: false };

  if (!s.ok) {
    return (
      <>
        <SiteHeader action={{ label: 'See open roles', href: '/careers#roles' }} />
        <main className="mx-auto max-w-[96rem] px-4 py-16 sm:px-8 lg:px-16">
          <h1 className="text-[1.875rem] font-extrabold tracking-tight">That link has expired.</h1>
          <p className="text-muted mt-3 max-w-[34rem] text-[0.9375rem] font-semibold leading-[1.8]">
            Status links last 90 days and are extended each time your application moves. Reply to
            any email from us and we will send a new one.
          </p>
        </main>
        <SiteFooter />
      </>
    );
  }

  const rejected = s.stage === 'rejected';
  const withdrawn = s.stage === 'withdrawn';
  const step = s.step ?? 0;

  return (
    <>
      <SiteHeader action={{ label: 'All roles', href: '/careers#roles' }} />

      <main className="mx-auto max-w-[56rem] px-4 pb-16 pt-8 sm:px-8">
        <h1 className="text-[1.875rem] font-extrabold leading-tight tracking-[-0.02em]">
          {s.job_title}
        </h1>
        <p className="text-muted-light mt-2 text-[0.8125rem] font-semibold">
          Applied{' '}
          {s.applied_at
            ? new Date(s.applied_at).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
              })
            : ''}
          {s.first_name ? ` · ${s.first_name}` : ''}
        </p>

        {/* Five steps. The console runs seven; a candidate is never
            told they are in a sub-state of triage. */}
        <ol className="mt-7 grid gap-2 sm:grid-cols-5">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const reached = !rejected && !withdrawn && step >= n;
            return (
              <li
                key={label}
                className={`rounded-xl border p-3 ${
                  reached ? 'border-gold bg-gold-soft/40' : 'border-border bg-white'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[0.625rem] font-extrabold ${
                    reached ? 'bg-gold text-ink' : 'bg-bg text-muted-light'
                  }`}
                >
                  {reached && step > n ? '✓' : n}
                </span>
                <span className="mt-2 block text-[0.75rem] font-extrabold">{label}</span>
              </li>
            );
          })}
        </ol>

        <Card className="mt-6 p-5 sm:p-7">
          <p className="text-gold-text text-[0.625rem] font-extrabold uppercase tracking-[0.18em]">
            Where you stand
          </p>
          <h2 className="mt-2 text-[1.25rem] font-extrabold">{s.public_stage}</h2>

          {rejected ? (
            <>
              {/* The promise, kept. Verbatim, from the person who wrote it. */}
              <p className="text-muted mt-3 text-[0.9375rem] font-semibold leading-[1.8]">
                {s.rejected_reason}
              </p>
              <p className="text-muted-light mt-3 text-[0.8125rem] font-semibold leading-[1.8]">
                We know that is not the answer you wanted. Thank you for the time you put into it.
              </p>
            </>
          ) : withdrawn ? (
            <p className="text-muted mt-3 text-[0.9375rem] font-semibold leading-[1.8]">
              You withdrew this application. The door is open if you change your mind.
            </p>
          ) : s.stage === 'new' || s.stage === 'screening' ? (
            <p className="text-muted mt-3 text-[0.9375rem] font-semibold leading-[1.8]">
              We read every application by hand. You will hear from a person either way — the whole
              process is five steps and about {s.weeks_to_hire ?? 2} weeks.
            </p>
          ) : s.stage === 'offer' && s.offer ? (
            <div className="mt-3">
              <p className="text-muted text-[0.9375rem] font-semibold leading-[1.8]">
                We would like you to join us.
              </p>
              <dl className="border-border mt-4 grid gap-2 border-t pt-4 text-[0.8125rem] sm:grid-cols-2">
                <Row
                  label="Salary"
                  value={
                    s.offer.salary
                      ? `${s.offer.currency} ${s.offer.salary.toLocaleString('en-KE')}`
                      : '[—]'
                  }
                />
                <Row label="Start" value={s.offer.start_date ?? '[—]'} />
                <Row label="Contract" value={s.offer.contract?.replace(/_/g, ' ') ?? '[—]'} />
                <Row label="Conditions" value={s.offer.conditions?.join(', ') || 'None'} />
              </dl>
            </div>
          ) : (
            <p className="text-muted mt-3 text-[0.9375rem] font-semibold leading-[1.8]">
              {s.stage === 'intro_call'
                ? 'Pick a time for your intro call below — about 30 minutes.'
                : s.stage === 'work_sample'
                  ? 'Your work sample is below, with the due date.'
                  : s.stage === 'team_conversation'
                    ? 'The last step is a 45-minute conversation with the team.'
                    : 'We will be in touch.'}
            </p>
          )}
        </Card>

        {s.work_sample && !rejected && (
          <Card className="mt-4 p-5 sm:p-7">
            <p className="text-[0.9375rem] font-extrabold">Your work sample</p>
            {s.work_sample.brief && (
              <p className="text-muted mt-2 whitespace-pre-line text-[0.875rem] font-semibold leading-[1.8]">
                {s.work_sample.brief}
              </p>
            )}
            {s.work_sample.paid && (
              <p className="text-gold-text mt-2 text-[0.8125rem] font-extrabold">
                {s.work_sample.pay_note ?? 'Paid for anything over two hours'}
              </p>
            )}
            {s.work_sample.due_at && (
              <p className="text-muted-light mt-2 text-[0.75rem] font-semibold">
                Due {new Date(s.work_sample.due_at).toLocaleDateString('en-GB')}
              </p>
            )}
          </Card>
        )}

        <StatusActions
          token={params.token}
          stage={s.stage ?? 'new'}
          interview={s.interview ?? null}
          talentPool={s.talent_pool ?? false}
          hasOffer={s.offer?.status === 'sent'}
        />

        <Card className="mt-4 p-5">
          <p className="text-[0.8125rem] font-extrabold">Your data</p>
          <p className="text-muted mt-1.5 text-[0.75rem] font-semibold leading-[1.8]">
            We keep this application for {s.retention_months ?? 6} months after the process ends,
            then anonymise it — your name, email, phone and anything you wrote are replaced with
            tokens. Ask us to remove it sooner with the button above.
          </p>
          <p className="text-muted-light mt-2 text-[0.75rem] font-semibold">
            Questions? Reply to any of our emails.{' '}
            <Link href="/careers#roles" className="underline">
              Other open roles
            </Link>
            .
          </p>
        </Card>
      </main>

      <SiteFooter />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted font-semibold">{label}</dt>
      <dd className="font-extrabold">{value}</dd>
    </div>
  );
}
