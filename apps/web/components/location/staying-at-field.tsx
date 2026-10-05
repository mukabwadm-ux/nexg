'use client';

import { useLocation, type Place } from '@nexg/location';
import { Input } from '@nexg/ui';
import { Check, Crosshair, MapPin, Search } from 'lucide-react';
import * as React from 'react';

/**
 * "Where are you staying?" on the homepage hero.
 *
 * The field the whole order hangs on, and it used to be a plain
 * text box — so a visitor whose location the site had already
 * resolved was asked to type it out again, and a visitor whose
 * location it had not was given no help at all.
 *
 * Now it does three things in one control:
 *
 *   * fills itself from the resolved delivery location, if there
 *     is one
 *   * searches as you type, against the same endpoint the header
 *     panel uses
 *   * hands off to the same "Where should we deliver?" sheet for
 *     the GPS path, rather than growing a second picker
 *
 * Choosing something here sets the delivery location for the
 * whole site, so the header chip follows. One place, one answer
 * — the alternative is a hero that says one address and a chip
 * that says another, with the prices belonging to whichever the
 * guest is not looking at.
 */

interface Candidate {
  label: string;
  address_line: string | null;
  lat: number;
  lng: number;
}

export function StayingAtField() {
  const { place, ready, consent, openSheet, setPlace, actions } = useLocation();

  const [value, setValue] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const [results, setResults] = React.useState<Candidate[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [picked, setPicked] = React.useState<Place | null>(null);
  const wrap = React.useRef<HTMLDivElement>(null);

  /*
   * Fill from the resolved place — but never over something the
   * visitor has typed.
   *
   * The store resolves after mount (saved places, the device pin,
   * the account), so without the `touched` guard this lands a
   * second or two in and wipes whatever they were part-way
   * through writing. That is the sort of bug that feels like the
   * page fighting you.
   */
  React.useEffect(() => {
    if (!ready || touched || !place) return;
    /* A city guessed from the connection is not an address, and
       putting "Nairobi · from your connection" in a field asking
       where somebody is staying would be a worse answer than an
       empty box. */
    if (place.coverage !== 'covered') return;

    setValue(describePlace(place));
    setPicked(place);
  }, [ready, touched, place]);

  /* Debounced search, same endpoint as the header panel. */
  React.useEffect(() => {
    if (!touched) return;
    const term = value.trim();
    if (term.length < 3) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/location/search?q=${encodeURIComponent(term)}`);
          const body = response.ok ? ((await response.json()) as { results?: Candidate[] }) : {};
          setResults(body.results ?? []);
        } catch {
          setResults([]);
        } finally {
          setSearching(false);
        }
      })();
    }, 250);
    return () => clearTimeout(timer);
  }, [value, touched]);

  React.useEffect(() => {
    function onDown(event: MouseEvent) {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  async function choose(candidate: Candidate) {
    const cover = await actions.coverage(candidate.lat, candidate.lng);
    const next = { ...candidate, ...cover } as Place;
    setValue(describePlace(next));
    setPicked(next);
    setOpen(false);
    setResults([]);
    /* Sets it for the whole site, not just this field. */
    await setPlace(next, 'search');
  }

  const confirmed = picked && picked.coverage === 'covered' && !touched;
  const showResults = open && touched && value.trim().length >= 3;

  return (
    <div ref={wrap} className="relative">
      <Input
        id="staying_at"
        name="staying_at"
        label="Where are you staying?"
        placeholder="Hotel, apartment or address"
        leadingIcon={<MapPin className="h-4 w-4" />}
        /*
         * Deliberately not `loading={searching}`. The shared
         * Input renders its spinner by way of
         * `disabled={disabled || loading}`, which is right for a
         * field being validated and wrong for one being typed
         * into: it greys out and stops accepting keystrokes
         * halfway through the word somebody is searching for.
         * The dropdown says "Looking…" instead.
         */
        required
        autoComplete="off"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setTouched(true);
          setPicked(null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />

      {/*
       * The pin travels with the lead. Without it a concierge
       * reads an address string and starts guessing which gate
       * it means — which is the problem the whole location layer
       * exists to remove, undone at the last step.
       */}
      {picked ? (
        <>
          <input type="hidden" name="staying_lat" value={picked.lat} />
          <input type="hidden" name="staying_lng" value={picked.lng} />
          <input type="hidden" name="staying_zone" value={picked.zone ?? ''} />
          <input type="hidden" name="staying_source" value={picked.source ?? 'search'} />
        </>
      ) : null}

      {/* Where the value came from, and how to change it.
          Hidden while results are showing, because the dropdown
          sits exactly here and half a sentence under a list is
          worse than no sentence. */}
      <div
        className={`mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 ${
          showResults ? 'invisible' : ''
        }`}
      >
        {confirmed ? (
          <>
            <span className="text-success flex items-center gap-1 text-[0.6875rem] font-extrabold">
              <Check className="h-3 w-3" aria-hidden="true" />
              From your delivery location
            </span>
            {picked?.zone ? (
              <span className="text-muted-light text-[0.6875rem] font-semibold">
                {picked.zone}
                {picked.eta_min && picked.eta_max
                  ? ` · ${picked.eta_min}–${picked.eta_max} min typical`
                  : ''}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setTouched(true);
                setValue('');
                setPicked(null);
                setOpen(true);
              }}
              className="text-gold ml-auto text-[0.6875rem] font-extrabold hover:underline"
            >
              Change
            </button>
          </>
        ) : (
          <>
            {place && place.coverage !== 'covered' ? (
              <span className="text-muted-light text-[0.6875rem] font-semibold">
                {place.coverage === 'unlaunched'
                  ? `We are not live in ${place.city ?? 'that city'} yet — tell us where anyway and we will be in touch.`
                  : 'We worked out your city from your connection. Type the exact place for a real price.'}
              </span>
            ) : (
              <span className="text-muted-light text-[0.6875rem] font-semibold">
                Type a hotel, estate or building — or use your location.
              </span>
            )}
            {consent !== 'unavailable' ? (
              <button
                type="button"
                onClick={() => openSheet('hero')}
                /*
                 * Named apart from the button inside the sheet.
                 * Both say "Use my current location" on screen,
                 * which is right — it is the same offer — but two
                 * controls with one accessible name is a screen
                 * reader reading the same thing twice with no way
                 * to tell which is which.
                 */
                aria-label="Use my current location to fill in where you are staying"
                className="text-gold ml-auto flex items-center gap-1 text-[0.6875rem] font-extrabold hover:underline"
              >
                <Crosshair className="h-3 w-3" aria-hidden="true" />
                {consent === 'denied' ? 'Pick on a map' : 'Use my current location'}
              </button>
            ) : null}
          </>
        )}
      </div>

      {/* Results, inline. */}
      {showResults ? (
        <div className="border-border bg-surface absolute left-0 right-0 top-[calc(100%-0.25rem)] z-40 overflow-hidden rounded-xl border shadow-xl">
          {searching ? (
            <p className="text-muted-light px-4 py-3 text-[0.8125rem] font-semibold">Looking…</p>
          ) : results.length === 0 ? (
            <div className="px-4 py-3">
              <p className="text-muted-light text-[0.8125rem] font-semibold">
                Nothing matched that. You can still send it as typed — a concierge will confirm the
                spot with you.
              </p>
              <button
                type="button"
                onClick={() => openSheet('hero-no-match')}
                className="text-gold mt-1.5 text-[0.75rem] font-extrabold hover:underline"
              >
                Or drop a pin on a map
              </button>
            </div>
          ) : (
            results.map((r) => (
              <button
                key={`${r.lat},${r.lng}`}
                type="button"
                onClick={() => void choose(r)}
                className="border-border hover:bg-bg flex w-full items-center gap-3 border-b px-4 py-2.5 text-left transition-colors last:border-0"
              >
                <Search className="text-muted-light h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-[0.8125rem] font-extrabold">{r.label}</span>
                  {r.address_line ? (
                    <span className="text-muted-light block truncate text-[0.6875rem] font-semibold">
                      {r.address_line}
                    </span>
                  ) : null}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * What to write in the box.
 *
 * The label alone ("Home") means nothing to a concierge reading
 * the lead, and the raw address line alone loses the unit and
 * gate the guest went to the trouble of saving. Both, when both
 * exist.
 */
function describePlace(place: Place): string {
  const parts = [
    place.unit_no ? `${place.unit_no},` : null,
    place.address_line ?? place.label,
    place.address_line && place.label && !place.label.startsWith('Pinned') ? `(${place.label})` : null,
  ].filter(Boolean);
  return parts.join(' ').trim();
}
