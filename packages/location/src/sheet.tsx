'use client';

import { Search } from 'lucide-react';
import * as React from 'react';

import { UseMyLocation } from './use-my-location';
import { useLocation } from './store';

/**
 * "Where should we deliver?"
 *
 * Opens once per visit, on the first page that needs a place,
 * **over a rendered page** — never over a blank screen and never
 * blocking the paint. A visitor who skips it still has a
 * readable site, which is why the ladder falls back to an IP
 * city rather than a wall.
 *
 * Kept deliberately small: one heading, "use my location", a
 * search, and a skip. Skipping still falls back to the IP city,
 * and we ask for an exact spot before any price is locked.
 */
export function LocationSheet({
  /** Open by itself on a first visit. Off where the page asks in its own way. */
  autoOpen = true,
}: { autoOpen?: boolean } = {}) {
  const { sheetOpen, closeSheet, setPanelOpen, place, openSheet, asked, ready, step } =
    useLocation();

  /*
   * Once per visit, on the first page that needs a place, and
   * only after the page has rendered.
   *
   * The condition is deliberately narrow. A visitor who arrived
   * by QR code, followed a deep link, is signed in, or has a pin
   * on this device already has a place — asking them is noise.
   * Only somebody we genuinely cannot place sees this.
   */
  React.useEffect(() => {
    if (!autoOpen || !ready || asked || sheetOpen) return;
    if (place && step !== 'ip_city') return;
    const timer = setTimeout(() => openSheet(place ? 'ip_city' : 'none'), 400);
    return () => clearTimeout(timer);
  }, [autoOpen, ready, asked, sheetOpen, place, step, openSheet]);

  /*
   * Escape dismisses it.
   *
   * Clicking the backdrop always did; pressing Escape did not,
   * which is the same sheet being dismissible with a mouse and
   * not with a keyboard. The lint rule that flagged the
   * click-anywhere handler was pointing at a real gap rather
   * than being pedantic.
   */
  React.useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSheet('dismissed');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheetOpen, closeSheet]);

  if (!sheetOpen) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[60] flex h-[100dvh] items-end justify-center bg-black/50 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-sheet-title"
    >
      {/*
        A real button rather than a click handler on the backdrop
        div, so "click outside to dismiss" is reachable by keyboard
        and by a screen reader too.
      */}
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default"
        onClick={() => closeSheet('dismissed')}
      />
      <div className="bg-surface relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl sm:p-6">
        <h2 id="location-sheet-title" className="text-xl font-extrabold tracking-tight">
          Where should we deliver?
        </h2>

        <div className="mt-4">
          <UseMyLocation variant="sheet" onDone={() => closeSheet('confirmed')} />
        </div>

        <button
          type="button"
          onClick={() => {
            closeSheet('dismissed');
            setTimeout(() => setPanelOpen(true), 50);
          }}
          className="border-border hover:border-ink mt-3 flex w-full items-center gap-2 rounded-xl border px-4 py-3 text-left transition-colors"
        >
          <Search className="text-muted-light h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="text-muted-light flex-1 truncate text-sm font-semibold">
            Search an address or place
          </span>
        </button>

        <button
          type="button"
          onClick={() => closeSheet('skipped')}
          className="text-muted hover:text-ink mx-auto mt-4 block text-sm font-extrabold transition-colors"
        >
          Skip for now
        </button>

        <p className="text-muted-light mt-3 text-center text-[0.6875rem] font-semibold">
          We only keep the spot you confirm.{' '}
          <a href="/legal/privacy" className="underline">
            How we use location
          </a>{' '}
          ·{' '}
          <a href="/legal/privacy" className="underline">
            Privacy (KDPA)
          </a>
        </p>
      </div>
    </div>
  );
}
