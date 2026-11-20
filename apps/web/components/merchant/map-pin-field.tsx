'use client';

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
 */
export function MapPinField({
  id,
  value,
  disabled,
  placeholder,
  className,
  onChange,
}: {
  id: string;
  value: string;
  disabled: boolean;
  placeholder?: string;
  className: string;
  onChange: (value: string) => void;
}) {
  const maps = React.useMemo(() => mapsCapability(), []);
  const [open, setOpen] = React.useState(false);
  const [picked, setPicked] = React.useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  const show = () => {
    if (disabled) return;
    setPicked(parsePin(value));
    setProblem(null);
    setOpen(true);
  };

  const here = () => {
    if (!navigator.geolocation) {
      setProblem('This browser cannot share its location. Drop the pin on the map instead.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setPicked({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => {
        setLocating(false);
        setProblem('Your location could not be read. Allow location access, or drop the pin.');
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
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
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
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
            {maps.live ? (
              <div className="mt-3">
                <StoreMap
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
