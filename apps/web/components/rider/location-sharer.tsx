'use client';

import { consentState, readPositionOnce } from '@nexg/location';
import { LocateFixed, LocateOff } from 'lucide-react';
import * as React from 'react';

import { pingLocation } from '@/app/(customer)/rider/actions';

import { ring } from './ui';

type State = 'checking' | 'ask' | 'sharing' | 'denied' | 'unavailable' | 'error';

const EVERY_MS = 15_000;

/**
 * While a rider is online, their position goes to dispatch every 15
 * seconds, so offers come from where they are. Only the latest point is
 * kept (rpc_rider_location_ping), and only while online or on a trip;
 * going offline unmounts this and it stops.
 *
 * It follows @nexg/location's rule: the browser is only asked inside a
 * tap. If the rider allowed location before, reading starts on its own
 * (an allowed permission cannot prompt); otherwise they tap "Share my
 * location" once. One reading at a time, never a watch.
 */
export function LocationSharer() {
  const [state, setState] = React.useState<State>('checking');
  const [message, setMessage] = React.useState<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const readAndSend = React.useCallback(async () => {
    const r = await readPositionOnce({ highAccuracy: true, fresh: true });
    if (!r.ok) {
      setState(r.reason === 'denied' ? 'denied' : 'error');
      setMessage(r.reason === 'denied' ? null : r.message);
      if (r.reason === 'denied' && timer.current) clearInterval(timer.current);
      return;
    }
    const sent = await pingLocation(r.fix.lat, r.fix.lng, new Date().toISOString());
    setState(sent.ok ? 'sharing' : 'error');
    setMessage(sent.ok ? null : (sent.message ?? null));
  }, []);

  const start = React.useCallback(() => {
    void readAndSend();
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => void readAndSend(), EVERY_MS);
  }, [readAndSend]);

  React.useEffect(() => {
    let alive = true;
    void consentState().then((c) => {
      if (!alive) return;
      if (c === 'granted') start();
      else setState(c === 'prompt' ? 'ask' : c);
    });
    return () => {
      alive = false;
      if (timer.current) clearInterval(timer.current);
    };
  }, [start]);

  if (state === 'ask') {
    return (
      <div className="mx-4 mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 px-3 py-2 sm:mx-6 lg:mx-8">
        <p className="flex-1 text-[13px] font-bold text-amber-900">
          Share your location so dispatch can send you offers nearby.
        </p>
        <button
          type="button"
          onClick={start}
          className={`rounded-lg bg-[#fdd128] px-3 py-1.5 text-[13px] font-extrabold text-[color:var(--rider-ink)] ${ring}`}
        >
          Share my location
        </button>
      </div>
    );
  }

  const ok = state === 'sharing' || state === 'checking';
  const text =
    state === 'sharing'
      ? 'Sharing your location with dispatch while you are online.'
      : state === 'checking'
        ? 'Finding your location…'
        : state === 'denied'
          ? 'Location is blocked in this browser, so no offers can reach you. Allow it from the padlock in the address bar.'
          : state === 'unavailable'
            ? 'This device cannot share a location.'
            : (message ?? 'Your location could not be sent. Trying again.');

  return (
    <p
      role={ok ? 'status' : 'alert'}
      className={`mx-4 mt-3 flex items-start gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-bold sm:mx-6 lg:mx-8 ${
        state === 'sharing'
          ? 'bg-green-50 text-green-800'
          : ok
            ? 'bg-slate-100 text-slate-600'
            : 'bg-amber-50 text-amber-900'
      }`}
    >
      {ok ? (
        <LocateFixed className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <LocateOff className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      {text}
    </p>
  );
}
