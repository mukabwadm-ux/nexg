'use client';

import { Button } from '@nexg/ui';
import { Check, Clock, MessageCircle, Smartphone, Zap } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { RiderPreview } from './rider-preview';
import { useRiderOnboarding } from './store';

export interface RiderStatusFacts {
  reference: string;
  outstanding: number;
  pendingChases: { label: string }[];
  rejected: { label: string; reason: string | null }[];
  slot: { hub: string; startsAt: string } | null;
}

/**
 * Step 6 — and, from now on, the rider's status page.
 *
 * The question after submitting is not "what is my status", it is "is
 * anyone looking at this and when can I start earning". So the timeline
 * says who is doing what and roughly when, and nothing on it claims a
 * document is verified that a person has not looked at.
 */
export function RiderStatusStep({ facts }: { facts: RiderStatusFacts }) {
  const { draft, readiness } = useRiderOnboarding();
  if (!draft) return null;

  const waiting = !!draft.waitlisted_at;
  const active = draft.status === 'active';
  const k = facts.outstanding;

  const steps = [
    {
      title: 'Application received',
      body: `${draft.submitted_at ? formatWhen(draft.submitted_at) : 'Not submitted yet'} · reference ${facts.reference}`,
      state: 'done' as const,
    },
    {
      title: 'Documents under review',
      body: 'Rider ops checks each photo, usually within one working day. You hear from us per document — with the reason if one needs a retake.',
      state: (active ? 'done' : 'now') as 'done' | 'now',
    },
    {
      title: facts.slot
        ? `Kit & onboarding · ${formatWhen(facts.slot.startsAt)}`
        : 'Kit & onboarding',
      body: facts.slot
        ? `${facts.slot.hub} · 45 minutes · bring your phone and bike.`
        : 'Rider ops will call you to arrange a time at the hub.',
      state: (draft.kit_issued_at ? 'done' : 'next') as 'done' | 'next',
    },
    {
      title: 'Active — first request',
      body: 'Go online in the rider app. First requests usually arrive within the hour in your areas.',
      state: (active ? 'done' : 'next') as 'done' | 'next',
    },
  ];

  return (
    <div className="mx-auto grid max-w-[90rem] gap-8 px-4 py-8 sm:px-8 sm:py-10 xl:grid-cols-[minmax(0,1fr)_25rem] xl:gap-[4.5rem]">
      <main>
        <p className="text-gold-text text-xs font-extrabold uppercase tracking-[0.14em]">
          {waiting ? 'Waitlisted' : active ? 'Active' : 'Submitted'}
        </p>
        <h1 className="mt-3 text-[2rem] font-extrabold leading-[1.1] tracking-tight sm:text-[2.75rem]">
          {waiting
            ? 'You are first in line for your city.'
            : active
              ? `Welcome to NexG, ${draft.first_name}.`
              : k > 0
                ? `You’re ${spell(k)} document${k === 1 ? '' : 's'} from active.`
                : 'You’re under review.'}
        </h1>
        <p className="text-muted mt-4 max-w-xl text-[0.9375rem] leading-[1.8] sm:text-base">
          {waiting
            ? 'We keep everything you entered. When we open your city we call you first, and you finish the last steps in five minutes.'
            : active
              ? 'Your card is live. Guests see your first name, photo and plate at the gate — never your number.'
              : 'Nothing is shared yet. Here is exactly what happens next — this page is your status page from now on, on any device.'}
        </p>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <ol className="border-border bg-surface rounded-2xl border p-6">
            {steps.map((item, index) => (
              <li key={item.title} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span
                    aria-hidden="true"
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                      item.state === 'done'
                        ? 'bg-gold text-ink'
                        : item.state === 'now'
                          ? 'bg-ink'
                          : 'bg-border'
                    }`}
                  >
                    {item.state === 'done' && <Check className="h-3.5 w-3.5" strokeWidth={3.5} />}
                    {item.state === 'now' && <span className="h-2 w-2 rounded-full bg-white" />}
                  </span>
                  {index < steps.length - 1 && <span className="bg-border w-px flex-1" />}
                </div>
                <div className={index < steps.length - 1 ? 'pb-6' : ''}>
                  <p
                    className={`text-[0.9375rem] font-extrabold ${
                      item.state === 'next' ? 'text-muted-light' : ''
                    }`}
                  >
                    {item.title}
                  </p>
                  <p className="text-muted mt-1 text-[0.8125rem] leading-[1.7]">{item.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="space-y-4">
            {facts.pendingChases.length > 0 && (
              <div className="border-border bg-surface rounded-2xl border p-5">
                {facts.pendingChases.map((doc) => (
                  <div key={doc.label} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.9375rem] font-extrabold">{doc.label}</p>
                      <p className="text-muted mt-1 text-xs font-semibold leading-[1.6]">
                        Send a photo when it arrives · within 14 days
                      </p>
                    </div>
                    <span className="text-warning shrink-0 text-xs font-bold">
                      <MessageCircle className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                      Sending on WhatsApp
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="border-border bg-surface rounded-2xl border p-6">
              <p className="text-[0.9375rem] font-extrabold">While you wait</p>
              <ul className="mt-4 space-y-2.5">
                <WaitRow
                  icon={<Zap className="h-4 w-4" />}
                  label="Install the rider app on your phone"
                  meta="2 min"
                  href="/riders"
                />
                <WaitRow
                  icon={<Clock className="h-4 w-4" />}
                  label="How a delivery works, from ping to gate"
                  meta="4 min"
                  href="/help"
                />
                <WaitRow
                  icon={<MessageCircle className="h-4 w-4" />}
                  label="Rider team on WhatsApp"
                  meta="any time"
                  href="/help"
                />
                {k > 0 && (
                  <WaitRow
                    icon={<Smartphone className="h-4 w-4" />}
                    label="Add the photos still outstanding"
                    meta={`${k} left`}
                    href="/riders/apply/documents"
                  />
                )}
              </ul>
            </div>
          </div>
        </div>

        {facts.rejected.length > 0 && (
          <div className="border-danger/30 bg-danger-bg mt-4 rounded-2xl border p-6">
            <p className="text-danger text-[0.9375rem] font-extrabold">
              {facts.rejected.length === 1
                ? 'One photo needs a retake.'
                : `${facts.rejected.length} photos need a retake.`}
            </p>
            <ul className="mt-3 space-y-2">
              {facts.rejected.map((doc) => (
                <li
                  key={doc.label}
                  className="text-danger text-[0.8125rem] font-semibold leading-[1.7]"
                >
                  <strong>{doc.label}:</strong> {doc.reason ?? 'No reason given.'}
                </li>
              ))}
            </ul>
            <Button variant="outline" className="mt-4" asChild>
              <Link href="/riders/apply/documents">Retake now</Link>
            </Button>
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button size="lg" asChild>
            <Link href={k > 0 ? '/riders/apply/documents' : '/riders'}>
              <span className="flex items-center gap-3">
                {k > 0 ? 'Finish my photos' : 'Install the rider app'}
                <span aria-hidden="true" className="text-gold">
                  &rarr;
                </span>
              </span>
            </Link>
          </Button>
          <p className="text-muted-light text-[0.8125rem] font-semibold">
            {readiness?.pct ?? 0}% ready · nothing is shared until a person has checked it
          </p>
        </div>
      </main>

      <aside>
        <div className="xl:sticky xl:top-8">
          <RiderPreview />
        </div>
      </aside>
    </div>
  );
}

function WaitRow({
  icon,
  label,
  meta,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  meta: string;
  href: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="border-border bg-bg hover:border-ink flex items-center gap-3 rounded-xl border p-3 transition-colors"
      >
        <span
          aria-hidden="true"
          className="bg-ink flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1 text-[0.8125rem] font-extrabold">{label}</span>
        <span className="text-muted-light shrink-0 text-xs font-bold">{meta}</span>
      </Link>
    </li>
  );
}

function spell(n: number): string {
  return ['no', 'one', 'two', 'three', 'four', 'five', 'six'][n] ?? String(n);
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* By hand rather than Intl: this renders on the server and again in the
   browser, and differing ICU data is a hydration mismatch. Nairobi is
   UTC+3 all year. */
function formatWhen(iso: string): string {
  const at = new Date(new Date(iso).getTime() + 3 * 60 * 60 * 1000);
  const hh = String(at.getUTCHours()).padStart(2, '0');
  const mm = String(at.getUTCMinutes()).padStart(2, '0');
  return `${DAY_NAMES[at.getUTCDay()]} ${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}, ${hh}:${mm}`;
}
