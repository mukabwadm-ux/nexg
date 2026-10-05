'use client';

import { MAP_COLOURS, loadGoogleMaps } from '@nexg/ui';
import * as React from 'react';

/**
 * Dropping a pin on a new store.
 *
 * Shown only when a Maps key and Map ID are both configured.
 * Without them the form keeps asking for coordinates typed out of
 * a phone's map app, which is slower and entirely honest — a
 * draggable pin on a blank rectangle would let a merchant believe
 * they had placed their shop when they had not.
 *
 * The pin is the authority, not the search box. A merchant can
 * search for their street and then drag the marker to the actual
 * door, which is the thing a rider needs and the thing a geocoded
 * address usually gets wrong by thirty metres.
 */
export function StoreMap({
  apiKey,
  mapId,
  value,
  onChange,
  centre,
}: {
  apiKey: string;
  mapId: string;
  value: { lat: number; lng: number } | null;
  onChange: (at: { lat: number; lng: number }) => void;
  centre: { lat: number; lng: number };
}) {
  const host = React.useRef<HTMLDivElement>(null);
  const marker = React.useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);

  /* Held in a ref so the map, which is made once, always calls the
     current handler rather than the one from first render. */
  const latest = React.useRef(onChange);
  latest.current = onChange;

  React.useEffect(() => {
    let alive = true;
    loadGoogleMaps({ key: apiKey })
      .then((maps) => {
        if (!alive || !host.current || marker.current) return;

        const start = value ?? centre;
        const map = new maps.Map(host.current, {
          mapId,
          center: start,
          zoom: value ? 17 : 13,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
        });

        const dot = document.createElement('div');
        dot.style.cssText = `width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${MAP_COLOURS.gold};border:3px solid ${MAP_COLOURS.ink};box-shadow:0 2px 6px rgba(0,0,0,.4)`;

        marker.current = new maps.marker.AdvancedMarkerElement({
          map,
          position: start,
          content: dot,
          gmpDraggable: true,
          title: 'Drag to the door',
        });

        marker.current.addListener('dragend', () => {
          const at = marker.current?.position;
          if (!at) return;
          const lat = typeof at.lat === 'function' ? at.lat() : (at.lat as number);
          const lng = typeof at.lng === 'function' ? at.lng() : (at.lng as number);
          latest.current({ lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) });
        });

        /* Tapping the map moves the pin. On a phone, dragging a
           22-pixel marker with a thumb is the worst way to do
           this. */
        map.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (!e.latLng || !marker.current) return;
          const at = {
            lat: Number(e.latLng.lat().toFixed(6)),
            lng: Number(e.latLng.lng().toFixed(6)),
          };
          marker.current.position = at;
          latest.current(at);
        });

        if (!value) {
          latest.current({ lat: Number(start.lat.toFixed(6)), lng: Number(start.lng.toFixed(6)) });
        }
        setReady(true);
      })
      .catch((e: Error) => alive && setError(e.message));

    return () => {
      alive = false;
    };
    /* Made once. The pin is moved by its own listeners afterwards,
       not by rebuilding the map under somebody's finger. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, mapId]);

  if (error) {
    return (
      <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-[0.75rem] font-bold">
        The map did not load ({error}). Type the coordinates instead — your phone&apos;s map app
        gives them if you hold a finger on the spot.
      </p>
    );
  }

  return (
    <div>
      <div
        ref={host}
        className="border-border-strong h-56 w-full overflow-hidden rounded-xl border"
        role="application"
        aria-label="Where the store is"
      />
      <p className="text-muted-light mt-1 text-[0.75rem] font-semibold">
        {ready
          ? 'Tap or drag the pin onto the actual door — that is where a rider will go, not the middle of the street.'
          : 'Loading the map…'}
        {value && (
          <span className="tabular-nums">
            {' '}
            · {value.lat}, {value.lng}
          </span>
        )}
      </p>
    </div>
  );
}
