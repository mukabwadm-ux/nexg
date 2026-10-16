'use client';

import { MAP_COLOURS, loadGoogleMaps } from '@nexg/ui';
import { LocateFixed, MapPin } from 'lucide-react';
import * as React from 'react';

/**
 * The map behind the confirm view.
 *
 * The pin is fixed in the middle and the map moves under it — the
 * ride-hailing pattern, and the right one on a phone: dragging the
 * map with a whole thumb is easy, dragging a 22-pixel marker is not.
 * Whatever is under the pin when the map stops is the place.
 *
 * The accuracy circle stays where the reading was, so somebody can
 * see how far they have moved from it and how wide the guess was.
 */
export function PinMap({
  apiKey,
  mapId,
  start,
  centre,
  accuracyM,
  onSettle,
}: {
  apiKey: string;
  mapId: string;
  /** Where the reading put them; the accuracy circle stays here. */
  start: { lat: number; lng: number };
  /** Where the pin is now. Moved from outside — the nudge buttons — it pans the map. */
  centre: { lat: number; lng: number };
  accuracyM: number;
  /** Called when the map comes to rest with a new centre. */
  onSettle: (at: { lat: number; lng: number }) => void;
}) {
  const host = React.useRef<HTMLDivElement>(null);
  const map = React.useRef<google.maps.Map | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [moving, setMoving] = React.useState(false);

  /* The map is made once; these keep it reading the current values. */
  const latest = React.useRef(onSettle);
  latest.current = onSettle;
  const current = React.useRef(centre);
  current.current = centre;

  /* A nudge from the keyboard controls: move the map to match. */
  React.useEffect(() => {
    const m = map.current;
    const c = m?.getCenter();
    if (!m || !c) return;
    if (Math.abs(c.lat() - centre.lat) > 1e-6 || Math.abs(c.lng() - centre.lng) > 1e-6) {
      m.panTo(centre);
    }
  }, [centre]);

  React.useEffect(() => {
    let alive = true;
    loadGoogleMaps({ key: apiKey })
      .then((maps) => {
        if (!alive || !host.current || map.current) return;

        const m = new maps.Map(host.current, {
          mapId,
          center: current.current,
          /* 18 is a building with its gate visible; anything wider
             and a rider's "which entrance" question comes back. */
          zoom: 18,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: 'greedy',
        });
        map.current = m;

        if (accuracyM > 0) {
          new maps.Circle({
            map: m,
            center: start,
            radius: accuracyM,
            strokeColor: MAP_COLOURS.ink,
            strokeOpacity: 0.3,
            strokeWeight: 1,
            fillColor: MAP_COLOURS.ink,
            fillOpacity: 0.08,
            clickable: false,
          });
        }

        m.addListener('dragstart', () => setMoving(true));
        m.addListener('idle', () => {
          setMoving(false);
          const c = m.getCenter();
          if (!c) return;
          const at = { lat: Number(c.lat().toFixed(6)), lng: Number(c.lng().toFixed(6)) };
          /* Resting where the pin already is — the map arriving, or a
             nudge it just followed — is not a move. */
          const was = current.current;
          if (Math.abs(at.lat - was.lat) < 1e-6 && Math.abs(at.lng - was.lng) < 1e-6) return;
          latest.current(at);
        });
      })
      .catch((e: Error) => alive && setError(e.message));

    return () => {
      alive = false;
    };
    /* Made once. Rebuilding it would move the map under somebody's thumb. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, mapId]);

  /* Back to where the reading put them. */
  const recentre = React.useCallback(() => {
    map.current?.panTo(start);
  }, [start]);

  if (error) {
    return (
      <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-[0.75rem] font-bold">
        The map did not load ({error}). Use the nudge buttons below to move the pin.
      </p>
    );
  }

  return (
    <div className="relative h-64 overflow-hidden rounded-xl sm:h-56">
      <div ref={host} className="absolute inset-0" />

      {/* The pin, fixed at the centre; its point is the place. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 transition-transform ${
          moving ? '-translate-y-[calc(100%+6px)]' : '-translate-y-full'
        }`}
      >
        <span className="bg-gold ring-surface flex h-9 w-9 items-center justify-center rounded-full shadow-lg ring-4">
          <MapPin className="text-ink h-4 w-4" />
        </span>
      </span>
      <span
        aria-hidden="true"
        className="bg-ink/40 pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
      />

      <span className="bg-ink pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-[0.6875rem] font-extrabold text-white">
        Move the map so the pin is on your gate
      </span>

      <button
        type="button"
        onClick={recentre}
        aria-label="Back to my location"
        className="bg-surface text-ink absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full shadow-md"
      >
        <LocateFixed className="h-4 w-4" />
      </button>
    </div>
  );
}
