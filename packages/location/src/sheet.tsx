'use client';

import { Briefcase, Clock, Home, LayoutGrid, Search } from 'lucide-react';
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
 * It is skippable in one click, and the skip is honest about
 * what it costs: city-wide estimates, and we will ask again
 * before any price is locked.
 */
export function LocationSheet() {
  const {
    sheetOpen,
    closeSheet,
    savedPlaces,
    place,
    setPlace,
    actions,
    openSheet,
    asked,
    ready,
    step,
  } = useLocation();

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
    if (!ready || asked || sheetOpen) return;
    if (place && step !== 'ip_city') return;
    const timer = setTimeout(() => openSheet(place ? 'ip_city' : 'none'), 400);
    return () => clearTimeout(timer);
  }, [ready, asked, sheetOpen, place, step, openSheet]);

  if (!sheetOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-sheet-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSheet('dismissed');
      }}
    >
      <div className="bg-surface max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-t-3xl sm:rounded-3xl">
        <div className="grid gap-0 lg:grid-cols-[1.4fr_1fr]">
          {/* ───────────────────────────────────────── the ask */}
          <div className="p-5 sm:p-7">
            <div className="mb-3 flex items-start justify-between gap-3">
              <p className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-[0.12em]">
                Step 1 of 1 · takes 5 seconds
              </p>
              <button
                type="button"
                onClick={() => closeSheet('skipped')}
                className="text-muted hover:text-ink shrink-0 text-[0.75rem] font-extrabold transition-colors"
              >
                Skip for now
              </button>
            </div>

            <h2 id="location-sheet-title" className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              Where should we deliver?
            </h2>
            <p className="text-muted mt-2 text-sm font-semibold">
              Everything on NexG — merchants, prices, delivery times and what is open right now —
              depends on one spot. Pick it once; change it any time from the top of every page.
            </p>

            <div className="mt-4">
              <UseMyLocation variant="sheet" onDone={() => closeSheet('confirmed')} />
            </div>

            <div className="my-4 flex items-center gap-3">
              <span className="border-border flex-1 border-t" />
              <span className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-[0.12em]">
                or type it
              </span>
              <span className="border-border flex-1 border-t" />
            </div>

            <button
              type="button"
              onClick={() => {
                closeSheet('dismissed');
                /* The panel is the search. One search box in the
                   product, not two that can disagree. */
                setTimeout(() => document.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]')?.click(), 50);
              }}
              className="border-border hover:border-ink flex w-full items-center gap-2 rounded-xl border px-4 py-3 text-left transition-colors"
            >
              <Search className="text-muted-light h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="text-muted-light flex-1 text-sm font-semibold">
                Hotel, apartment, estate, building or Plus Code…
              </span>
              <span className="text-gold hidden text-[0.625rem] font-extrabold uppercase tracking-wide sm:block">
                Nairobi · Mombasa · Kisumu · Nakuru
              </span>
            </button>

            <p className="border-gold/30 bg-gold/5 text-muted mt-4 rounded-xl border px-4 py-3 text-[0.75rem] font-semibold">
              Not sure yet? Skip and we will start from your city, based on your internet connection
              only. You will see city-wide merchants with “from your area” delivery bands, and we
              ask for an exact spot before any price is locked.
            </p>

            <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold">
              We do not track location in the background and we do not keep a history.{' '}
              <a href="/legal/privacy" className="underline">
                How we use location
              </a>{' '}
              ·{' '}
              <a href="/legal/privacy" className="underline">
                Privacy notice (KDPA)
              </a>
            </p>
          </div>

          {/* ──────────────────────────── what this device remembers */}
          <aside className="bg-bg border-border border-t p-5 sm:p-7 lg:border-l lg:border-t-0">
            <p className="text-muted-light mb-3 text-[0.625rem] font-extrabold uppercase tracking-[0.12em]">
              Recognised on this device
            </p>

            {savedPlaces.length === 0 ? (
              <p className="text-muted-light text-[0.8125rem] font-semibold">
                Nothing saved here yet. Once you confirm a spot it appears in this list and on every
                page.
              </p>
            ) : (
              <ul className="border-border bg-surface divide-border divide-y overflow-hidden rounded-xl border">
                {savedPlaces.slice(0, 4).map((p) => {
                  const Icon = p.label?.toLowerCase().startsWith('home')
                    ? Home
                    : p.label?.toLowerCase().startsWith('work')
                      ? Briefcase
                      : p.source === 'qr'
                        ? LayoutGrid
                        : Clock;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => {
                          void (async () => {
                            const cover = await actions.coverage(p.lat, p.lng);
                            await setPlace({ ...p, ...cover }, 'device');
                            closeSheet('confirmed');
                          })();
                        }}
                        className="hover:bg-bg flex w-full items-center gap-3 px-3 py-3 text-left transition-colors"
                      >
                        <span className="bg-bg flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.8125rem] font-extrabold">
                            {p.label}
                          </span>
                          <span className="text-muted-light block truncate text-[0.6875rem] font-semibold">
                            {p.deviceOnly ? 'On this device' : 'Saved to your account'}
                            {p.gate_no ? ' · gate code on file' : ''}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold">
              Saved places live on this device, and in your account when you are signed in. Remove
              any of them from{' '}
              <a href="/account/places" className="underline">
                Account → Places
              </a>
              .
            </p>

            <div className="bg-ink mt-5 rounded-xl p-4 text-white">
              <p className="text-gold text-[0.625rem] font-extrabold uppercase tracking-[0.12em]">
                Why we ask
              </p>
              <p className="mt-1.5 text-[0.8125rem] font-semibold">
                A location set once means no surprise fees at checkout, accurate “open now” and
                delivery windows, and a rider who finds you first time.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
