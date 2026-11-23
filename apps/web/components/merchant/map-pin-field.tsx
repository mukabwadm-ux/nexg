'use client';

import { readPositionOnce } from '@nexg/location';
import { maps as mapsCapability } from '@nexg/ui/capabilities';
import dynamic from 'next/dynamic';
import * as React from 'react';

/* The same Google map and draggable pin the Stores page uses. */
const StoreMap = dynamic(() => import('@/components/partner/store-map').then((m) => m.StoreMap), {
  ssr: false,
});

/* Nairobi CBD, where the map opens when nothing is pinned yet. */
const NAIROBI = { lat: -1.2864, lng: 36.8172 };

export function parsePin(value: string): { lat: number; lng: number } | null {
  const match = value.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

export function formatPin(at: { lat: number; lng: number }): string {
  return `${at.lat.toFixed(6)}, ${at.lng.toFixed(6)}`;
}

/**
 * The onboarding "Google Maps pin": clicking it opens a map where the
 * merchant drops a pin on their exact door, and the field fills in with
 * "latitude, longitude". Where the Maps key is not configured there is no
 * map to draw (a drawn one would mislead), so the dialog offers the phone's
 * own location instead. The text stays editable for anyone pasting
 * coordinates.
 *
 * Given the address the merchant already typed (`searchText`), the map opens
 * with the pin on the best match from the app's address search, so the
 * merchant only confirms it or moves it to the door.
 */
type Found = { label: string; address_line?: string | null; lat: number; lng: number };

export function MapPinField({
  id,
  value,
  disabled,
  placeholder,
  className,
  onChange,
  searchText,
}: {
  id: string;
  value: string;
  disabled: boolean;
  placeholder?: string;
  className: string;
  onChange: (value: string) => void;
  searchText?: string;
}) {
  const maps = React.useMemo(() => mapsCapability(), []);
  const [open, setOpen] = React.useState(false);
  const [picked, setPicked] = React.useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [found, setFound] = React.useState<Found[]>([]);
  const [searching, setSearching] = React.useState(false);
  /* The map is built once; a new key rebuilds it on a point chosen here. */
  const [mapKey, setMapKey] = React.useState(0);

  const moveTo = (at: { lat: number; lng: number }) => {
    setPicked(at);
    setMapKey((key) => key + 1);
  };

  const search = async (text: string, pickFirst: boolean) => {
    const q = text.trim();
    if (q.length < 3) return;
    setSearching(true);
    setProblem(null);
    try {
      const response = await fetch(`/api/location/search?q=${encodeURIComponent(q)}`);
      const body = (await response.json()) as { results?: Found[]; reason?: string };
      const results = (body.results ?? []).filter(
        (r) => Number.isFinite(r.lat) && Number.isFinite(r.lng),
      );
      setFound(results);
      if (results[0] && pickFirst) moveTo({ lat: results[0].lat, lng: results[0].lng });
      if (!results.length)
        setProblem(
          body.reason ??
            'No match for that address. Try the building or estate name, or move the pin.',
        );
    } catch {
      setProblem('The address search did not answer. Move the pin instead.');
    } finally {
      setSearching(false);
    }
  };

  const show = () => {
    if (disabled) return;
    const current = parsePin(value);
    const text = searchText?.trim() ?? '';
    setPicked(current);
    setProblem(null);
    setFound([]);
    setQuery(text);
    setOpen(true);
    if (!current && text.length >= 3) void search(text, true);
  };

  /* Escape closes the map, like any dialog, and only the map: it is caught
     first (on the window, while capturing), so a drawer or dialog the field
     sits in stays open with what was typed. */
  React.useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('keydown', close, true);
    return () => window.removeEventListener('keydown', close, true);
  }, [open]);

  /* Read inside the click, through the one sanctioned geolocation helper. */
  const here = async () => {
    setLocating(true);
    setProblem(null);
    const result = await readPositionOnce({ highAccuracy: true });
    setLocating(false);
    if (result.ok) moveTo({ lat: result.fix.lat, lng: result.fix.lng });
    else setProblem(result.message);
  };

  return (
    <>
      <div className="mt-1.5 flex gap-2">
        <input
          id={id}
          type="text"
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onClick={show}
          onChange={(event) => onChange(event.target.value)}
          className={className}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={show}
          className="border-border shrink-0 rounded-xl border px-3 text-sm font-bold"
        >
          Pin on map
        </button>
      </div>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${id}-map-title`}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
        >
          <div className="bg-surface w-full max-w-2xl rounded-t-2xl p-4 sm:rounded-2xl">
            <h3 id={`${id}-map-title`} className="text-base font-extrabold">
              Pin your exact location
            </h3>
            <p className="text-muted mt-1 text-sm font-semibold">
              {maps.live
                ? 'Tap the map or drag the pin onto your door. Riders are sent to this spot.'
                : 'Use your current location while you are at the business.'}
            </p>
            <div className="mt-3 flex gap-2">
              <input
                type="search"
                aria-label="Search for the address"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  void search(query, true);
                }}
                placeholder="Street, building or estate"
                className="border-border w-full rounded-xl border px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void search(query, true)}
                disabled={searching}
                className="border-border shrink-0 rounded-xl border px-3 text-sm font-bold"
              >
                {searching ? 'Finding…' : 'Find'}
              </button>
            </div>
            {found.length > 1 ? (
              <ul className="border-border mt-2 max-h-36 overflow-y-auto rounded-xl border">
                {found.map((r, index) => (
                  <li key={`${r.lat},${r.lng},${index}`}>
                    <button
                      type="button"
                      onClick={() => moveTo({ lat: r.lat, lng: r.lng })}
                      className="w-full px-3 py-2 text-left text-sm"
                    >
                      <span className="font-bold">{r.label}</span>
                      {r.address_line ? (
                        <span className="text-muted block text-xs">{r.address_line}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {maps.live ? (
              <div className="mt-3">
                <StoreMap
                  key={mapKey}
                  apiKey={maps.key}
                  mapId={maps.mapId}
                  value={picked}
                  centre={picked ?? NAIROBI}
                  onChange={setPicked}
                />
              </div>
            ) : null}
            <p className="mt-3 text-sm font-bold">
              {picked ? `Pinned at ${formatPin(picked)}` : 'No pin yet.'}
            </p>
            {problem ? (
              <p role="alert" className="text-danger mt-1 text-sm font-bold">
                {problem}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={here}
                disabled={locating}
                className="border-border rounded-full border px-4 py-2 text-sm font-bold"
              >
                {locating ? 'Finding you…' : 'Use my current location'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="border-border rounded-full border px-4 py-2 text-sm font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!picked}
                onClick={() => {
                  if (picked) onChange(formatPin(picked));
                  setOpen(false);
                }}
                className="bg-gold text-ink rounded-full px-4 py-2 text-sm font-extrabold disabled:opacity-50"
              >
                Use this spot
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
