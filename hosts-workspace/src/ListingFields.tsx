import { useEffect, useRef, useState } from 'react';

import { STAY_AMENITIES } from '../../apps/web/lib/host-workspace/vocab';

/* ════════════════════════════════════════════════ map pin */

/* The Maps JavaScript API is loaded from Google at run time and this app
   carries no type package for it, so the few calls below go through `any`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GoogleMaps = any;
type Pin = { lat: number; lng: number };

declare global {
  interface Window {
    __nexgMapsPromise?: Promise<GoogleMaps>;
    __nexgMapsReady?: () => void;
  }
}

const NAIROBI: Pin = { lat: -1.286389, lng: 36.817223 };

/** Loads the Maps JavaScript API once per page; every map shares it. */
function loadMaps(key: string): Promise<GoogleMaps> {
  if (window.__nexgMapsPromise) return window.__nexgMapsPromise;
  window.__nexgMapsPromise = new Promise((resolve, reject) => {
    const existing = (window as unknown as { google?: { maps?: GoogleMaps } }).google?.maps;
    if (existing) return resolve(existing);
    window.__nexgMapsReady = () =>
      resolve((window as unknown as { google: { maps: GoogleMaps } }).google.maps);
    const script = document.createElement('script');
    script.src =
      'https://maps.googleapis.com/maps/api/js?' +
      new URLSearchParams({
        key,
        libraries: 'marker',
        callback: '__nexgMapsReady',
        v: 'quarterly',
        loading: 'async',
      });
    script.async = true;
    script.onerror = () => {
      window.__nexgMapsPromise = undefined;
      reject(new Error('Google Maps could not be reached'));
    };
    document.head.appendChild(script);
  });
  return window.__nexgMapsPromise;
}

const round = (value: number) => Number(value.toFixed(6));

/**
 * The exact pin guests see on the map. With the site's Maps key the host
 * taps or drags a pin; without it, or if the map does not load, they type
 * the coordinates (holding a finger on the spot in a phone's map app gives
 * them). Either way the two numbers are what is saved.
 */
export function PinField({
  value,
  onChange,
  maps,
  label,
}: {
  value: Partial<Pin>;
  onChange: (pin: Partial<Pin>) => void;
  maps?: { key: string; mapId: string } | null;
  label: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const marker = useRef<GoogleMaps>(null);
  const latest = useRef(onChange);
  latest.current = onChange;
  const [state, setState] = useState<'off' | 'loading' | 'ready' | 'failed'>(
    maps ? 'loading' : 'off',
  );
  const placed = typeof value.lat === 'number' && typeof value.lng === 'number';

  useEffect(() => {
    if (!maps) return;
    let alive = true;
    loadMaps(maps.key)
      .then(async (googleMaps: GoogleMaps) => {
        if (!alive || !host.current || marker.current) return;
        const { AdvancedMarkerElement } = await googleMaps.importLibrary('marker');
        const start = placed ? (value as Pin) : NAIROBI;
        const map = new googleMaps.Map(host.current, {
          mapId: maps.mapId,
          center: start,
          zoom: placed ? 17 : 12,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
        });
        marker.current = new AdvancedMarkerElement({
          map,
          position: placed ? start : null,
          gmpDraggable: true,
          title: 'Drag to the entrance',
        });
        marker.current.addListener('dragend', () => {
          const at = marker.current?.position;
          if (!at) return;
          const lat = typeof at.lat === 'function' ? at.lat() : at.lat;
          const lng = typeof at.lng === 'function' ? at.lng() : at.lng;
          latest.current({ lat: round(lat), lng: round(lng) });
        });
        /* Tapping moves the pin: dragging a small marker with a thumb is hard. */
        map.addListener('click', (event: GoogleMaps) => {
          if (!event.latLng || !marker.current) return;
          const at = { lat: round(event.latLng.lat()), lng: round(event.latLng.lng()) };
          marker.current.position = at;
          latest.current(at);
        });
        setState('ready');
      })
      .catch(() => alive && setState('failed'));
    return () => {
      alive = false;
    };
    /* Made once; the pin moves by its own listeners, not by rebuilding the map. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maps?.key, maps?.mapId]);

  /* Typed coordinates move the pin on the map too. */
  useEffect(() => {
    if (state === 'ready' && marker.current && placed) marker.current.position = value;
  }, [state, placed, value]);

  const number = (key: keyof Pin, text: string) => {
    const next = { ...value, [key]: text === '' ? undefined : Number(text) };
    onChange(next);
  };

  return (
    <div className="pin-field">
      {maps && state !== 'failed' && (
        <div ref={host} className="pin-map" role="application" aria-label={label} />
      )}
      <p className="muted">
        {state === 'ready'
          ? 'Tap the map or drag the pin onto the entrance. Guests see this exact spot.'
          : state === 'loading'
            ? 'Loading the map…'
            : state === 'failed'
              ? 'The map did not load. Type the coordinates instead: hold a finger on the spot in your phone’s map app to get them.'
              : 'Type the coordinates: hold a finger on the spot in your phone’s map app to get them. Guests see this exact spot.'}
      </p>
      <div className="pin-inputs">
        <label>
          <span>Latitude</span>
          <input
            type="number"
            step="0.000001"
            min={-90}
            max={90}
            value={value.lat ?? ''}
            onChange={(event) => number('lat', event.target.value)}
          />
        </label>
        <label>
          <span>Longitude</span>
          <input
            type="number"
            step="0.000001"
            min={-180}
            max={180}
            value={value.lng ?? ''}
            onChange={(event) => number('lng', event.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════ amenities */

const standard = new Set(STAY_AMENITIES.map((item) => item.toLowerCase()));

/**
 * The 17 amenities guests filter by, as tick boxes, and the host's own as
 * free text. Their own are shown to guests but cannot be filtered on.
 */
export function AmenityField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (amenities: string[]) => void;
}) {
  const ticked = value.filter((item) => standard.has(item.toLowerCase()));
  const [custom, setCustom] = useState(() =>
    value.filter((item) => !standard.has(item.toLowerCase())).join(', '),
  );
  const own = (text: string) =>
    text
      .split(',')
      .map((item) => item.trim().replace(/\s+/g, ' '))
      .filter(Boolean);
  const toggle = (item: string, on: boolean) =>
    onChange([
      ...STAY_AMENITIES.filter((label) =>
        label === item ? on : ticked.some((t) => t.toLowerCase() === label.toLowerCase()),
      ),
      ...own(custom),
    ]);

  return (
    <div className="amenity-field">
      <div className="amenity-options">
        {STAY_AMENITIES.map((item) => (
          <label key={item} className="amenity-option">
            <input
              type="checkbox"
              checked={ticked.some((t) => t.toLowerCase() === item.toLowerCase())}
              onChange={(event) => toggle(item, event.target.checked)}
            />
            {item}
          </label>
        ))}
      </div>
      <label className="amenity-custom">
        <span>Other amenities · separate with commas</span>
        <input
          value={custom}
          maxLength={2000}
          placeholder="Rooftop braai, Smart TV"
          onChange={(event) => {
            setCustom(event.target.value);
            onChange([...ticked, ...own(event.target.value)]);
          }}
        />
      </label>
    </div>
  );
}
