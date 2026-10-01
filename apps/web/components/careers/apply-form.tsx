'use client';

import { Button, Card, Input, PhoneInput, useToast } from '@nexg/ui';
import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { applyToJob } from '@/app/careers/[slug]/apply/actions';

/**
 * Apply · about two minutes.
 *
 * Tap, don't type: yes/no questions are two big chips, selects are
 * chips, numbers are a plain stepper. The only free text is three
 * lines on why NexG.
 *
 * Must-have questions say so out loud — "this role needs this" —
 * because hiding which answers matter is a trick, and a candidate who
 * cannot work nights is better off knowing before they spend two
 * minutes.
 *
 * What is NOT shown at the end: whether a must-have failed. A person
 * decides that, not this form.
 */

export interface Question {
  id: string;
  kind: string;
  prompt: string;
  options: string[] | null;
  must: boolean;
}

export function ApplyForm({
  slug,
  jobTitle,
  questions,
  retentionMonths,
  src,
}: {
  slug: string;
  jobTitle: string;
  questions: Question[];
  retentionMonths: number;
  src: string | null;
}) {
  const { toast } = useToast();
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState<string | null>(null);
  const [city, setCity] = React.useState('');
  const [linkedin, setLinkedin] = React.useState('');
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [why, setWhy] = React.useState('');
  const [consent, setConsent] = React.useState(false);
  const [pool, setPool] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, startTransition] = React.useTransition();
  const [done, setDone] = React.useState<{ token?: string; firstName?: string } | null>(null);

  const set = (id: string, value: string) => setAnswers((a) => ({ ...a, [id]: value }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next['name'] = 'We need a name.';
    if (!email.trim()) next['email'] = 'We need an email — it is how we come back to you.';
    if (!consent) next['consent'] = 'We need this to keep your application at all.';
    for (const q of questions) {
      if (q.must && !answers[q.id]) next[q.id] = 'This role needs an answer here.';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    startTransition(async () => {
      const result = await applyToJob({
        job_slug: slug,
        full_name: name.trim(),
        email: email.trim(),
        phone,
        city: city.trim() || null,
        linkedin_url: linkedin.trim() || null,
        why_nexg: why.trim() || null,
        answers,
        talent_pool: pool,
        src,
      });

      if (!result.ok) {
        toast({ title: 'That did not send', description: result.message });
        return;
      }
      setDone({ token: result.token, firstName: result.firstName });
    });
  }

  if (done) {
    return (
      <Card className="p-6 sm:p-8">
        <span
          aria-hidden="true"
          className="bg-gold flex h-10 w-10 items-center justify-center rounded-full"
        >
          <Check className="text-ink h-5 w-5" />
        </span>
        <h2 className="mt-4 text-[1.5rem] font-extrabold leading-tight tracking-tight">
          Got it{done.firstName ? `, ${done.firstName}` : ''}.
        </h2>
        <p className="text-muted mt-3 text-sm font-semibold leading-[1.8]">
          A person reads every application. You will hear from us either way — and if it is a no,
          you will get a reason, not silence.
        </p>

        <ol className="mt-5 space-y-2">
          {['Apply', 'Intro call', 'Work sample', 'Team conversation', 'Offer'].map((s, i) => (
            <li key={s} className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[0.625rem] font-extrabold ${
                  i === 0 ? 'bg-success text-white' : 'bg-bg text-muted-light'
                }`}
              >
                {i === 0 ? '✓' : i + 1}
              </span>
              <span
                className={`text-[0.8125rem] ${i === 0 ? 'font-extrabold' : 'text-muted font-semibold'}`}
              >
                {s}
              </span>
            </li>
          ))}
        </ol>

        {done.token && (
          <div className="border-border mt-6 border-t pt-5">
            <p className="text-[0.8125rem] font-extrabold">Follow where you stand</p>
            <p className="text-muted mt-1.5 text-[0.75rem] font-semibold leading-relaxed">
              We have emailed you this private link. It shows the same stage we see.
            </p>
            <Link
              href={`/careers/status/${done.token}`}
              className="text-gold-text mt-2 inline-block break-all text-[0.75rem] font-extrabold hover:underline"
            >
              /careers/status/{done.token.slice(0, 12)}…
            </Link>
          </div>
        )}
      </Card>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Card className="p-5 sm:p-7">
        <p className="text-gold-text text-[0.625rem] font-extrabold uppercase tracking-[0.18em]">
          1 · You
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input
            id="ap_name"
            label="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            {...(errors['name'] ? { error: errors['name'] } : {})}
          />
          <Input
            id="ap_email"
            type="email"
            label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            {...(errors['email'] ? { error: errors['email'] } : {})}
          />
          <PhoneInput id="ap_phone" label="Phone" value={phone} onChange={setPhone} />
          <Input
            id="ap_city"
            label="City"
            placeholder="Where you are now"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
        <div className="mt-4">
          <Input
            id="ap_linkedin"
            label="LinkedIn"
            placeholder="Optional"
            value={linkedin}
            onChange={(e) => setLinkedin(e.target.value)}
          />
        </div>
      </Card>

      {questions.length > 0 && (
        <Card className="p-5 sm:p-7">
          <p className="text-gold-text text-[0.625rem] font-extrabold uppercase tracking-[0.18em]">
            2 · A few questions
          </p>
          <div className="mt-4 space-y-5">
            {questions.map((q) => (
              <fieldset key={q.id}>
                <legend className="text-[0.8125rem] font-bold">
                  {q.prompt}
                  {q.must && (
                    <span className="text-gold-text ml-2 text-[0.6875rem] font-extrabold">
                      This role needs this
                    </span>
                  )}
                </legend>

                {q.kind === 'must_yes_no' || q.kind === 'points_yes_no' ? (
                  <div className="mt-2 flex gap-2" role="radiogroup" aria-label={q.prompt}>
                    {['yes', 'no'].map((v) => (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        aria-checked={answers[q.id] === v}
                        onClick={() => set(q.id, v)}
                        className={`flex-1 rounded-lg border px-4 py-3 text-[0.875rem] font-extrabold capitalize transition-colors ${
                          answers[q.id] === v
                            ? 'border-ink bg-ink text-white'
                            : 'border-border-strong hover:border-ink bg-white'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                ) : q.kind === 'points_select' && q.options ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {q.options.map((o) => (
                      <button
                        key={o}
                        type="button"
                        aria-pressed={answers[q.id] === o}
                        onClick={() => set(q.id, o)}
                        className={`rounded-full border px-3 py-1.5 text-[0.75rem] font-bold transition-colors ${
                          answers[q.id] === o
                            ? 'border-ink bg-ink text-white'
                            : 'border-border-strong hover:border-ink bg-white'
                        }`}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                ) : q.kind === 'points_number' ? (
                  <div className="mt-2 max-w-[10rem]">
                    <Input
                      id={`q_${q.id}`}
                      type="number"
                      min={0}
                      label=""
                      value={answers[q.id] ?? ''}
                      onChange={(e) => set(q.id, e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="mt-2">
                    <textarea
                      id={`q_${q.id}`}
                      rows={3}
                      maxLength={300}
                      value={why}
                      onChange={(e) => setWhy(e.target.value)}
                      className="border-border-strong focus-visible:ring-gold w-full rounded-lg border px-3 py-2 text-[0.875rem] font-semibold focus-visible:outline-none focus-visible:ring-2"
                      placeholder="Three lines is plenty."
                    />
                    <p className="text-muted-light mt-1 text-right text-[0.625rem] font-semibold">
                      {why.length}/300
                    </p>
                  </div>
                )}

                {errors[q.id] && (
                  <p className="text-danger mt-1 text-[0.6875rem] font-bold">{errors[q.id]}</p>
                )}
              </fieldset>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-5 sm:p-7">
        <p className="text-gold-text text-[0.625rem] font-extrabold uppercase tracking-[0.18em]">
          {questions.length > 0 ? '3' : '2'} · Consent
        </p>
        <p className="text-muted mt-3 text-[0.8125rem] font-semibold leading-[1.8]">
          We keep your application for {retentionMonths} months after the process ends, then
          anonymise it. You can ask us to remove it sooner from your status page.
        </p>

        <label className="mt-4 flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="accent-gold mt-0.5 h-4 w-4"
          />
          <span className="text-[0.8125rem] font-semibold">
            I&rsquo;m happy for NexG to keep my application for this role.
          </span>
        </label>
        {errors['consent'] && (
          <p className="text-danger mt-1 text-[0.6875rem] font-bold">{errors['consent']}</p>
        )}

        <label className="mt-3 flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={pool}
            onChange={(e) => setPool(e.target.checked)}
            className="accent-gold mt-0.5 h-4 w-4"
          />
          <span className="text-muted text-[0.8125rem] font-semibold">
            Optional — keep me in the talent pool for twelve months in case something closer comes
            up.
          </span>
        </label>

        <Button type="submit" className="mt-6 w-full" disabled={pending}>
          {pending ? 'Sending…' : `Send application · ${jobTitle}`}
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Button>
      </Card>
    </form>
  );
}
