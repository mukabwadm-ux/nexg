'use client';

import { Briefcase, Clock, Home, Loader2, Lock, MapPin, Search, X } from 'lucide-react';
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
export function Panel({
  inline = false,
  onDone,
}: {
  /** Shown inside the "Where should we deliver?" sheet rather than under the chip. */
  inline?: boolean;
  /** Called once a place is chosen. Defaults to closing the chip's panel. */
  onDone?: () => void;
} = {}) {
  const { savedPlaces, place, setPanelOpen, setPlace, actions } = useLocation();
  const finish = onDone ?? (() => setPanelOpen(false));
  const [query, setQuery] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [picking, setPicking] = React.useState<number | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  /* One token for the typing and the pick, so Google bills one session. */
  const session = React.useRef(newSession());
  /* Where the visitor already is, to bias suggestions nearby. */
  const near = React.useRef(place ? { lat: place.lat, lng: place.lng } : null);
  near.current = place ? { lat: place.lat, lng: place.lng } : null;

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /*
   * Suggestions as you type, the way Google Maps does it: a short
   * pause after each keystroke, the previous request cancelled, and
   * the old list kept on screen until the new one lands, so it does
   * not flicker to "Looking…" between letters.
   */
  React.useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setSuggestions([]);
      setProblem(null);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      void (async () => {
        const found = await suggestPlaces(term, session.current, near.current, controller.signal);
        if (controller.signal.aborted) return;
        setSuggestions(found.suggestions);
        setProblem(found.problem);
        setActive(0);
        setSearching(false);
      })();
    }, 120);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  async function choose(candidate: SavedPlace) {
    const cover = await actions.coverage(candidate.lat, candidate.lng);
    await setPlace({ ...candidate, ...cover } as SavedPlace, 'search');
    finish();
  }

  async function pick(index: number) {
    const s = suggestions[index];
    if (!s || picking !== null) return;

    /* A place NexG already knows comes with its pin. */
    if (s.lat !== undefined && s.lng !== undefined) {
      await choose({
        id: `search:${s.lat},${s.lng}`,
        label: s.main,
        address_line: s.secondary,
        lat: s.lat,
        lng: s.lng,
        coverage: 'unknown',
        source: 'search',
      });
      return;
    }

    setPicking(index);
    const found = s.place_id ? await lookUpPlace(s.place_id, session.current) : null;
    /* The session ends with the pick; the next search starts a new one. */
    session.current = newSession();
    setPicking(null);
    if (!found) {
      setProblem('That place could not be opened. Try another, or use your current location.');
      return;
    }
    await choose({ ...found, id: `search:${s.place_id}`, label: s.main || found.label });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void pick(active);
    }
  }

  const showList = query.trim().length >= 2;

  return (
    <div
      role="dialog"
      aria-label="Choose where to deliver"
      className={
        inline
          ? 'w-full'
          : 'border-border bg-surface absolute left-0 right-auto top-[calc(100%+0.5rem)] z-50 w-[min(34rem,calc(100vw-2rem))] rounded-2xl border p-4 shadow-2xl sm:p-5'
      }
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-extrabold tracking-tight">Deliver to</h2>
        <span className="text-muted-light flex items-center gap-1 text-[0.6875rem] font-semibold">
          <Lock className="h-3 w-3" aria-hidden="true" />
          Location is only read when you ask
        </span>
      </div>

      <div className="border-ink focus-within:ring-gold mb-3 flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 focus-within:ring-2">
        {searching ? (
          <Loader2 className="text-muted-light h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
        ) : (
          <Search className="text-muted-light h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Hotel, apartment, estate, building or Plus Code…"
          aria-label="Search for an address"
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls="nexg-place-suggestions"
          aria-activedescendant={suggestions.length > 0 ? `nexg-place-${active}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          className="placeholder:text-muted-light w-full bg-transparent text-sm font-semibold outline-none"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="text-muted-light hover:text-ink shrink-0 rounded-full p-0.5"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <span className="text-muted-light hidden shrink-0 text-[0.6875rem] font-semibold sm:block">
            Esc to close
          </span>
        )}
      </div>

      {showList ? (
        <div className="border-border mb-3 overflow-hidden rounded-xl border">
          {suggestions.length > 0 ? (
            <ul id="nexg-place-suggestions" role="listbox" aria-label="Suggested places">
              {suggestions.map((s, i) => (
                <li
                  key={s.place_id ?? `known:${i}:${s.lat},${s.lng}`}
                  id={`nexg-place-${i}`}
                  role="option"
                  aria-selected={i === active}
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => void pick(i)}
                    className={
                      'border-border flex w-full items-center gap-3 border-b px-4 py-2.5 text-left transition-colors last:border-0 ' +
                      (i === active ? 'bg-bg' : '')
                    }
                  >
                    {picking === i ? (
                      <Loader2
                        className="text-muted-light h-4 w-4 shrink-0 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <MapPin className="text-muted-light h-4 w-4 shrink-0" aria-hidden="true" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.8125rem] font-semibold">
                        <Highlighted text={s.main} matches={s.matches} />
                      </span>
                      {s.secondary ? (
                        <span className="text-muted-light block truncate text-[0.6875rem] font-semibold">
                          {s.secondary}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : searching ? (
            <p className="text-muted-light px-4 py-4 text-center text-[0.8125rem] font-semibold">
              Looking…
            </p>
          ) : (
            <p className="text-muted-light px-4 py-4 text-center text-[0.8125rem] font-semibold">
              {problem ??
                `Nothing matched “${query.trim()}”. Try a building, an estate or a Plus Code.`}
            </p>
          )}
          {suggestions.length > 0 && problem ? (
            <p className="text-muted-light border-border border-t px-4 py-2 text-[0.6875rem] font-semibold">
              {problem}
            </p>
          ) : null}
          {suggestions.some((s) => s.place_id) ? (
            <p className="text-muted-light border-border border-t px-4 py-1.5 text-right text-[0.625rem] font-semibold">
              Powered by Google
            </p>
          ) : null}
        </div>
      ) : null}

      <UseMyLocation onDone={finish} />

      {savedPlaces.length > 0 ? (
        <>
          <p className="text-muted-light mb-1.5 mt-4 text-[0.625rem] font-extrabold uppercase tracking-[0.12em]">
            Saved &amp; recent
          </p>
          <ul>
            {savedPlaces.slice(0, 5).map((p) => {
              const current =
                place &&
                Math.abs(place.lat - p.lat) < 0.0005 &&
                Math.abs(place.lng - p.lng) < 0.0005;
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

interface Suggestion {
  /** Set for a Google suggestion: its pin is looked up when picked. */
  place_id: string | null;
  main: string;
  secondary: string | null;
  /** Character ranges of `main` matching what was typed. */
  matches: [number, number][];
  /** Set for a place NexG already knows. */
  lat?: number;
  lng?: number;
}

/** The typed letters in bold, the rest plain — as in Google Maps. */
function Highlighted({ text, matches }: { text: string; matches: [number, number][] }) {
  const ranges = [...matches]
    .filter(([a, b]) => b > a && a >= 0 && b <= text.length)
    .sort((x, y) => x[0] - y[0]);
  const parts: React.ReactNode[] = [];
  let at = 0;
  ranges.forEach(([a, b], i) => {
    if (a < at) return;
    if (a > at) parts.push(text.slice(at, a));
    parts.push(
      <strong key={i} className="font-extrabold">
        {text.slice(a, b)}
      </strong>,
    );
    at = b;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

function newSession(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const SEARCH_DOWN =
  'Address search is not working right now. Use your current location, or try again shortly.';

/**
 * As-you-type suggestions from Google Places, through our route so
 * the server key (GOOGLE_MAPS_API_KEY) never reaches the browser.
 *
 * Without a working key this returns no suggestions rather than a
 * plausible list — an invented address is worse than none, because
 * somebody will order to it. Why it came back empty goes to the
 * console for whoever is setting the key up; the visitor gets a
 * plain sentence.
 */
async function suggestPlaces(
  term: string,
  session: string,
  near: { lat: number; lng: number } | null,
  signal: AbortSignal,
): Promise<{ suggestions: Suggestion[]; problem: string | null }> {
  try {
    const params = new URLSearchParams({ q: term, session });
    if (near) params.set('near', `${near.lat.toFixed(4)},${near.lng.toFixed(4)}`);
    const response = await fetch(`/api/location/suggest?${params}`, { signal });
    if (!response.ok) return { suggestions: [], problem: SEARCH_DOWN };
    const body = (await response.json()) as { suggestions?: Suggestion[]; reason?: string };
    if (body.reason) console.warn('[address search]', body.reason);
    return { suggestions: body.suggestions ?? [], problem: body.reason ? SEARCH_DOWN : null };
  } catch {
    return { suggestions: [], problem: signal.aborted ? null : SEARCH_DOWN };
  }
}

/** The pin for one picked suggestion. */
async function lookUpPlace(id: string, session: string): Promise<Omit<SavedPlace, 'id'> | null> {
  try {
    const params = new URLSearchParams({ id, session });
    const response = await fetch(`/api/location/place?${params}`);
    if (!response.ok) return null;
    const body = (await response.json()) as { place?: Omit<SavedPlace, 'id'> };
    return body.place ?? null;
  } catch {
    return null;
  }
}
