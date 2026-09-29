'use client';

import { Button, useToast } from '@nexg/ui';
import { Camera, Check, Clock, MessageCircle, Upload } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

import { Chip } from './controls';
import { LivePreview } from './preview';
import { useOnboarding } from './store';

export interface CallSlot {
  iso: string;
  label: string;
}

export interface StatusFacts {
  reference: string;
  outstandingDocs: number;
  pendingChases: number;
  itemCount: number;
  branchCount: number;
  hasCover: boolean;
  rejected: { label: string; reason: string | null }[];
}

/**
 * Step 7 — and, from now on, the merchant's status page.
 *
 * The timeline says what is happening and who is doing it, because the
 * question a merchant asks after submitting is not "what is my status" but
 * "is anyone looking at this". Nothing here claims a document is verified
 * that a person has not looked at.
 */
export function StatusStep({ slots, facts }: { slots: CallSlot[]; facts: StatusFacts }) {
  const { draft, readiness } = useOnboarding();
  const { toast } = useToast();
  const [chosen, setChosen] = React.useState(draft?.onboarding_call_at ?? null);

  const pickSlot = async (iso: string) => {
    if (!draft) return;
    setChosen(iso);
    const supabase = createClient();
    const { error } = await supabase.rpc('rpc_merchant_save_step', {
      p_merchant_id: draft.id,
      p_step: 7,
      p_patch: { onboarding_call_at: iso },
    });
    if (error) {
      toast({ title: 'We could not book that', description: error.message, tone: 'danger' });
      return;
    }
    toast({
      title: 'Noted',
      description: 'The merchant team confirms the time when they call.',
      tone: 'success',
    });
  };

  if (!draft) return null;

  const waiting = !!draft.waitlisted_at;
  const outstanding = facts.outstandingDocs;

  const steps = [
    {
      title: 'Application received',
      body: `${draft.submitted_at ? formatWhen(draft.submitted_at) : 'Not submitted yet'} · reference ${facts.reference}`,
      state: 'done' as const,
    },
    {
      title: 'Documents under review',
      body: 'Our merchant team checks each one. Usually within 2 working days — you will hear from us per document.',
      state: (outstanding === 0 ? 'now' : 'now') as 'now',
    },
    {
      title: 'Onboarding call · 15 minutes',
      body: 'We walk you through accepting your first order and set up your dashboard login. Pick a time below.',
      state: (chosen ? 'done' : 'next') as 'done' | 'next',
    },
    {
      title: 'Go live',
      body: 'Your card appears to guests nearby. First orders usually arrive the same evening.',
      state: 'next' as const,
    },
  ];

  return (
    <div className="mx-auto grid max-w-[90rem] gap-8 px-4 py-8 sm:px-8 sm:py-10 xl:grid-cols-[minmax(0,1fr)_25rem] xl:gap-[4.5rem]">
      <main>
        <p className="text-gold-text text-xs font-extrabold uppercase tracking-[0.14em]">
          {waiting ? 'Waitlisted' : 'Submitted'}
        </p>
        <h1 className="mt-3 text-[2rem] font-extrabold leading-[1.1] tracking-tight sm:text-[2.75rem]">
          {waiting
            ? 'You are first in line for your area.'
            : outstanding > 0
              ? `You’re ${spell(outstanding)} document${outstanding === 1 ? '' : 's'} away from going live.`
              : 'You’re under review.'}
        </h1>
        <p className="text-muted mt-4 max-w-xl text-[0.9375rem] leading-[1.8] sm:text-base">
          {waiting
            ? 'We keep everything you entered. When we open a zone near you we message you first, and you finish the last steps in five minutes.'
            : 'Nothing is public yet. Here is exactly what happens next and what you can do in the meantime — this page is also your status page from now on.'}
        </p>

        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {/* ------------------------------------------------------ timeline */}
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
            {/* ------------------------------------------------- call slots */}
            {!waiting && (
              <div className="border-border bg-surface rounded-2xl border p-6">
                <p className="text-[0.9375rem] font-extrabold">
                  Pick a time for your onboarding call
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {slots.map((slot) => (
                    <Chip
                      key={slot.iso}
                      selected={chosen === slot.iso}
                      onClick={() => void pickSlot(slot.iso)}
                    >
                      {slot.label}
                    </Chip>
                  ))}
                  <Chip selected={false} onClick={() => void pickSlot('')}>
                    Another time
                  </Chip>
                </div>
                <p className="text-muted-light mt-4 text-xs font-semibold leading-[1.7]">
                  These are the slots the merchant team keeps open. They confirm on the call.
                </p>
              </div>
            )}

            {/* ------------------------------------------------ while you wait */}
            <div className="border-border bg-surface rounded-2xl border p-6">
              <p className="text-[0.9375rem] font-extrabold">While you wait</p>
              <ul className="mt-4 space-y-2.5">
                <WaitRow
                  icon={<Upload className="h-4 w-4" />}
                  label={`Finish your ${facts.itemCount < 5 ? 'menu' : 'menu'} · ${facts.itemCount} of ~40 items`}
                  meta="~10 min"
                  href="/merchants/apply/payout"
                />
                {facts.pendingChases > 0 && (
                  <WaitRow
                    icon={<MessageCircle className="h-4 w-4" />}
                    label="Send the documents you asked us to chase"
                    meta={`${facts.pendingChases} left`}
                    href="/merchants/apply/documents"
                  />
                )}
                {outstanding > 0 && (
                  <WaitRow
                    icon={<Upload className="h-4 w-4" />}
                    label="Upload the documents still outstanding"
                    meta={`${outstanding} left`}
                    href="/merchants/apply/documents"
                  />
                )}
                {!facts.hasCover && (
                  <WaitRow
                    icon={<Camera className="h-4 w-4" />}
                    label="Add a cover photo guests will see first"
                    meta="optional"
                    href="/merchants/apply/payout"
                  />
                )}
                {facts.branchCount < 2 && (
                  <WaitRow
                    icon={<Clock className="h-4 w-4" />}
                    label="Add a second branch"
                    meta="optional"
                    href="/merchants/apply/location"
                  />
                )}
              </ul>
            </div>
          </div>
        </div>

        {facts.rejected.length > 0 && (
          <div className="border-danger/30 bg-danger-bg mt-4 rounded-2xl border p-6">
            <p className="text-danger text-[0.9375rem] font-extrabold">
              {facts.rejected.length} document{facts.rejected.length === 1 ? '' : 's'} came back
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
              <Link href="/merchants/apply/documents">Send a replacement</Link>
            </Button>
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button size="lg" asChild>
            <Link href="/merchants/apply/documents">
              <span className="flex items-center gap-3">
                {outstanding > 0 ? 'Finish my documents' : 'Review my application'}
                <span aria-hidden="true" className="text-gold">
                  &rarr;
                </span>
              </span>
            </Link>
          </Button>
          <p className="text-muted-light text-[0.8125rem] font-semibold">
            {readiness?.pct ?? 0}% ready · nothing is public until a person has checked it
          </p>
        </div>
      </main>

      <aside>
        <div className="xl:sticky xl:top-8">
          <LivePreview />
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
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/*
 * Built by hand rather than with Intl.DateTimeFormat. This renders on the
 * server and again in the browser, which do not always carry the same ICU
 * data, and a date that differs between them is a hydration mismatch.
 *
 * Nairobi is UTC+3 all year — no daylight saving — so the offset is a
 * constant rather than a timezone database lookup.
 */
function formatWhen(iso: string): string {
  const nairobi = new Date(new Date(iso).getTime() + 3 * 60 * 60 * 1000);
  const hh = String(nairobi.getUTCHours()).padStart(2, '0');
  const mm = String(nairobi.getUTCMinutes()).padStart(2, '0');
  return `${DAY_NAMES[nairobi.getUTCDay()]} ${nairobi.getUTCDate()} ${MONTH_NAMES[nairobi.getUTCMonth()]}, ${hh}:${mm}`;
}
