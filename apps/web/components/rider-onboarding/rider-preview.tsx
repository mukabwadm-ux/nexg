'use client';

import { User } from 'lucide-react';
import * as React from 'react';

import { ReadyRing } from '@/components/onboarding/shell-frame';

import { useRiderOnboarding } from './store';
import { RIDER_CHECKS, SHIFTS } from './types';

/**
 * "How guests will see you", and how close they are to being seen.
 *
 * The plate is the point of this card. A guest standing at their gate has
 * one way to know the person on the bike is the person the app sent: the
 * plate matches. So it is drawn the way a plate is drawn, and the sentence
 * under it says what it is for — and that their phone number is not part of
 * the deal, which is the thing riders ask about most.
 */
export function RiderPreview() {
  const { draft, readiness, cities } = useRiderOnboarding();
  if (!draft) return null;

  const city = cities.find((c) => c.id === draft.city_id)?.name ?? null;
  const vehicle = draft.vehicle
    ? draft.vehicle === 'tuktuk'
      ? 'Tuk-tuk'
      : draft.vehicle.charAt(0).toUpperCase() + draft.vehicle.slice(1)
    : null;

  const meta = [vehicle, city, 'NexG rider'].filter(Boolean).join(' · ');

  const status =
    draft.kit_issued_at && draft.status === 'active'
      ? { text: 'Active', tone: 'success' as const }
      : draft.submitted_at
        ? { text: 'Under review', tone: 'warning' as const }
        : draft.waitlisted_at
          ? { text: 'Waitlisted', tone: 'warning' as const }
          : { text: 'Applying', tone: 'muted' as const };

  const chips = [
    ...draft.areas,
    ...draft.shifts.map((s) => SHIFTS.find((x) => x.value === s)?.label ?? s),
    ...(draft.cash_ok ? ['Cash ok'] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-gold-text text-xs font-extrabold uppercase tracking-[0.14em]">
          How guests will see you
        </h2>
        <p className="text-muted-light text-[0.6875rem] font-semibold">
          at the gate and on tracking
        </p>
      </div>

      <div className="border-border bg-surface rounded-2xl border p-5">
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className="border-gold bg-ink flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-full border-[3px]"
          >
            {draft.face_photo_path ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={draft.face_photo_path} alt="" className="h-full w-full object-cover" />
            ) : (
              <User className="text-gold h-7 w-7" />
            )}
          </span>

          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-[1.0625rem] font-extrabold">
                {draft.first_name || '[Your name]'}
              </span>
              <Pill tone={status.tone}>{status.text}</Pill>
            </p>
            <p className="text-muted mt-1 text-[0.8125rem] leading-[1.5]">{meta}</p>
          </div>
        </div>

        {/* The plate, drawn as a plate. */}
        <div className="bg-bg mt-4 flex items-center gap-3 rounded-xl p-3">
          <span
            className={`border-gold shrink-0 rounded-lg border-2 bg-white px-3 py-2 text-center font-extrabold tracking-[0.12em] ${
              draft.plate_no ? 'text-[0.9375rem]' : 'text-muted-light text-[0.6875rem]'
            }`}
          >
            {draft.vehicle === 'bicycle'
              ? 'NO PLATE'
              : draft.plate_no || (
                  <span className="flex flex-col gap-1" aria-label="Plate not entered yet">
                    <span className="bg-border-strong block h-0.5 w-8" />
                    <span className="bg-border-strong block h-0.5 w-8" />
                    <span className="bg-border-strong block h-0.5 w-8" />
                  </span>
                )}
          </span>
          <p className="text-muted text-xs font-semibold leading-[1.6]">
            {draft.vehicle === 'bicycle'
              ? 'Guests match your name and photo at their gate. Your phone number is never shown.'
              : 'Guests match this plate to the rider at their gate. Your phone number is never shown.'}
          </p>
        </div>

        {chips.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <li
                key={chip}
                className="bg-bg text-muted border-border rounded-md border px-2 py-1 text-[0.625rem] font-extrabold uppercase tracking-wide"
              >
                {chip}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ReadyRing
        heading="Ready to be activated"
        pct={readiness?.pct ?? 0}
        checks={RIDER_CHECKS}
        state={readiness as unknown as Record<string, unknown> | null}
      />
    </div>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: 'success' | 'warning' | 'muted';
  children: React.ReactNode;
}) {
  const tones = {
    success: 'bg-success-bg text-success',
    warning: 'bg-warning-bg text-warning',
    muted: 'bg-bg text-muted border-border border',
  };
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-[0.625rem] font-extrabold uppercase tracking-wide ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
