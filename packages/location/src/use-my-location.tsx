'use client';

import { Lock, MapPin } from 'lucide-react';
import * as React from 'react';

import { ConfirmPin } from './confirm-pin';
import {
  accuracyBand,
  readPositionOnce,
  type ConsentState,
} from './geolocation';
import { useLocation } from './store';
import type { Place } from './types';

/**
 * The one button that may open the browser's permission prompt.
 *
 * Everything about it is shaped by one fact: a Block is close to
 * permanent. Browsers do not re-ask, and most people never find
 * the padlock menu. So the visitor reads what will happen and
 * what we keep *before* the browser's dialog appears over the
 * top of it, and the request happens inside this click handler
 * and nowhere else.
 *
 * The sub-label changes with the permission state — "Asks first"
 * against "Allowed earlier" — which is read with
 * `permissions.query`, a call that neither prompts nor reads a
 * position. Knowing what the browser will do is not the same as
 * doing it.
 */
export function UseMyLocation({
  onDone,
  variant = 'panel',
}: {
  onDone?: () => void;
  variant?: 'panel' | 'sheet';
}) {
  const { consent, setConsent, actions, setPlace, markBlockedNoticeSeen } = useLocation();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<Place | null>(null);

  async function ask() {
    setBusy(true);
    setError(null);
    void actions.note('clicked_use_location');

    /* Inside the click. This is the whole rule. */
    const result = await readPositionOnce();

    if (!result.ok) {
      setBusy(false);
      setError(result.message);
      if (result.reason === 'denied') {
        setConsent('denied');
        markBlockedNoticeSeen();
        void actions.note('blocked');
      }
      return;
    }

    void actions.note('allowed', { band: accuracyBand(result.fix.accuracy_m) });
    setConsent('granted');

    const cover = await actions.coverage(result.fix.lat, result.fix.lng);
    setBusy(false);

    /*
     * Straight to confirmation, never straight to "done".
     *
     * A browser fix is a circle, not a doorway — hundreds of
     * metres across on a laptop. Accepting it silently is how a
     * rider ends up outside the wrong gate with hot food, so the
     * guest sees the circle and moves the pin.
     */
    setPending({
      label: 'Pinned location',
      /* The lookup is the authority on coverage, the zone and
         the window, so it is spread before the fields only this
         side knows. It always answers with a coverage value, so
         there is no default to set here first. */
      ...cover,
      lat: result.fix.lat,
      lng: result.fix.lng,
      accuracy_m: result.fix.accuracy_m,
      source: 'gps',
    } as Place);
  }

  if (pending) {
    return (
      <ConfirmPin
        candidate={pending}
        onCancel={() => setPending(null)}
        onConfirm={async (confirmed) => {
          await setPlace(confirmed, 'gps');
          setPending(null);
          onDone?.();
        }}
      />
    );
  }

  const dark = variant === 'sheet';

  return (
    <div>
      <button
        type="button"
        onClick={() => void ask()}
        disabled={busy || consent === 'unavailable'}
        className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-opacity disabled:opacity-60 sm:p-4 ${
          dark ? 'bg-ink text-white' : 'bg-ink text-white hover:opacity-90'
        }`}
      >
        <span className="bg-gold flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
          <MapPin className="text-ink h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold">
            {busy ? 'Waiting for your browser…' : 'Use my current location'}
          </span>
          <span className="block text-[0.6875rem] font-semibold text-white/70">
            {subLabel(consent)}
          </span>
        </span>
        <span className="hidden shrink-0 items-center gap-1 text-[0.6875rem] font-extrabold text-white/70 sm:flex">
          <Lock className="h-3 w-3" aria-hidden="true" />
          {consent === 'granted' ? 'Allowed earlier' : 'Asks first'}
        </span>
      </button>

      {error ? (
        <p className="border-border bg-bg text-muted mt-2 rounded-lg border px-3 py-2 text-[0.75rem] font-semibold">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function subLabel(consent: ConsentState): string {
  switch (consent) {
    case 'granted':
      /* Permission already given, and still nothing read until
         this is pressed. Saying so is the point. */
      return 'You allowed this before — we still only read it when you tap.';
    case 'denied':
      return 'Blocked in your browser · re-enable from the padlock in the address bar';
    case 'unavailable':
      return 'This browser cannot share a location — type your address instead';
    default:
      return 'Your browser will ask you to allow it — nothing is read until you say yes. We keep only the delivery pin you confirm.';
  }
}
