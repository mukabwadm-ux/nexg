'use client';

import { Briefcase, Clock, Home, Lock, MapPin, Search } from 'lucide-react';
import * as React from 'react';

import { UseMyLocation } from './use-my-location';
import { useLocation } from './store';
import type { SavedPlace } from './types';

/**
 * The panel under the chip.
 *
 * Search first and focused, because typing an address is the
 * control that always works — on a laptop with no GPS, in a
 * browser where location is blocked, and for somebody ordering
 * to an address they are not standing at. "Use my current
 * location" is the convenience, not the primary path, and the
 * layout says so by where it sits.
 */
export function Panel() {
  const { savedPlaces, place, setPanelOpen, setPlace, actions } = useLocation();
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<SavedPlace[]>([]);
  const [searching, setSearching] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /* Debounced, so a search does not fire on every keystroke. */
  React.useEffect(() => {
    const term = query.trim();
    if (term.length < 3) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const found = await searchPlaces(term);
          setResults(found);
        } finally {
          setSearching(false);
        }
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  async function choose(candidate: SavedPlace) {
    const cover = await actions.coverage(candidate.lat, candidate.lng);
    await setPlace({ ...candidate, ...cover } as SavedPlace, 'search');
    setPanelOpen(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Choose where to deliver"
      className="border-border bg-surface absolute left-0 right-auto top-[calc(100%+0.5rem)] z-50 w-[min(34rem,calc(100vw-2rem))] rounded-2xl border p-4 shadow-2xl sm:p-5"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-extrabold tracking-tight">Deliver to</h2>
        <span className="text-muted-light flex items-center gap-1 text-[0.6875rem] font-semibold">
          <Lock className="h-3 w-3" aria-hidden="true" />
          Location is only read when you ask
        </span>
      </div>

      <div className="border-ink focus-within:ring-gold mb-3 flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 focus-within:ring-2">
        <Search className="text-muted-light h-4 w-4 shrink-0" aria-hidden="true" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Hotel, apartment, estate, building or Plus Code…"
          aria-label="Search for an address"
          className="placeholder:text-muted-light w-full bg-transparent text-sm font-semibold outline-none"
        />
        <span className="text-muted-light hidden shrink-0 text-[0.6875rem] font-semibold sm:block">
          Esc to close
        </span>
      </div>

      {query.trim().length >= 3 ? (
        <div className="border-border mb-3 overflow-hidden rounded-xl border">
          {searching ? (
            <p className="text-muted-light px-4 py-4 text-center text-[0.8125rem] font-semibold">
              Looking…
            </p>
          ) : results.length === 0 ? (
            <p className="text-muted-light px-4 py-4 text-center text-[0.8125rem] font-semibold">
              Nothing matched “{query.trim()}”. Try a building, an estate or a Plus Code.
            </p>
          ) : (
            results.map((r) => (
              <button
                key={`${r.lat},${r.lng}`}
                type="button"
                onClick={() => void choose(r)}
                className="border-border hover:bg-bg flex w-full items-center gap-3 border-b px-4 py-2.5 text-left transition-colors last:border-0"
              >
                <MapPin className="text-muted-light h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.8125rem] font-extrabold">{r.label}</span>
                  <span className="text-muted-light block truncate text-[0.6875rem] font-semibold">
                    {[r.zone, r.address_line].filter(Boolean).join(' · ') || 'Tap to confirm the pin'}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}

      <UseMyLocation onDone={() => setPanelOpen(false)} />

      {savedPlaces.length > 0 ? (
        <>
          <p className="text-muted-light mt-4 mb-1.5 text-[0.625rem] font-extrabold uppercase tracking-[0.12em]">
            Saved &amp; recent
          </p>
          <ul>
            {savedPlaces.slice(0, 5).map((p) => {
              const current =
                place && Math.abs(place.lat - p.lat) < 0.0005 && Math.abs(place.lng - p.lng) < 0.0005;
              const Icon = p.label?.toLowerCase().startsWith('home')
                ? Home
                : p.label?.toLowerCase().startsWith('work')
                  ? Briefcase
                  : Clock;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => void choose(p)}
                    className="border-border hover:bg-bg flex w-full items-center gap-3 border-b px-1 py-2.5 text-left transition-colors last:border-0"
                  >
                    <span className="bg-bg flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.8125rem] font-extrabold">
                        {p.label}
                      </span>
                      <span className="text-muted-light block truncate text-[0.6875rem] font-semibold">
                        {[
                          p.deviceOnly ? 'On this device' : 'Saved',
                          p.gate_no ? 'gate code on file' : p.landmark,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    {current ? (
                      <span className="bg-success/15 text-success shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-extrabold">
                        CURRENT
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      <p className="text-muted-light border-border mt-3 border-t pt-3 text-[0.6875rem] font-semibold">
        Changing this re-checks your cart, fees and delivery times.
      </p>
    </div>
  );
}

/**
 * Address search.
 *
 * Google Places is the intended source and is wired through the
 * route handler so the key never reaches the browser. Until a
 * key is configured this returns nothing rather than a plausible
 * list — an invented address is worse than no address, because
 * somebody will order to it.
 */
async function searchPlaces(term: string): Promise<SavedPlace[]> {
  try {
    const response = await fetch(`/api/location/search?q=${encodeURIComponent(term)}`);
    if (!response.ok) return [];
    const body = (await response.json()) as { results?: SavedPlace[] };
    return body.results ?? [];
  } catch {
    return [];
  }
}
