'use client';

import { MAP_COLOURS, loadGoogleMaps } from '@nexg/ui';
import { Bed, Bike, Car, MapPinned, Ticket, Utensils, type LucideIcon } from 'lucide-react';
import * as React from 'react';

export type MapKind = 'food' | 'delivery' | 'stay' | 'experience' | 'transfer' | 'service';

export interface MapPoint {
  kind: MapKind;
  lat: number;
  lng: number;
  label: string;
}

const PIN: Record<MapKind, { colour: string; glyph: string; label: string; icon: LucideIcon }> = {
  food: { colour: '#E5A800', glyph: 'utensils', label: 'Food orders', icon: Utensils },
  delivery: { colour: '#1A1A1A', glyph: 'bike', label: 'Deliveries', icon: Bike },
  stay: { colour: '#E5A800', glyph: 'bed', label: 'Stays', icon: Bed },
  experience: { colour: '#C98A00', glyph: 'ticket', label: 'Experiences', icon: Ticket },
  transfer: { colour: '#1A1A1A', glyph: 'car', label: 'Transfers', icon: Car },
  service: { colour: '#7A6A4F', glyph: 'pin', label: 'Services', icon: MapPinned },
};

/* Lucide paths, so a marker carries the same glyph as the table's type pill. */
const GLYPH: Record<string, string> = {
  utensils:
    '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  bike: '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
  bed: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
  ticket:
    '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
  car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
};

function markerEl(kind: MapKind, title: string): HTMLElement {
  const p = PIN[kind];
  const el = document.createElement('div');
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', title);
  el.style.cssText = `width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
    background:${p.colour};display:flex;align-items:center;justify-content:center;
    box-shadow:0 3px 8px rgba(0,0,0,.35);border:2px solid #fff`;
  el.innerHTML = `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#fff"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
    style="transform:rotate(45deg)">${GLYPH[p.glyph]}</svg>`;
  return el;
}

/**
 * Where operations are happening now, on the city's map.
 *
 * Drawn only when a Google Maps key and Map ID are configured, like the
 * live dispatch map. Without them the card says which settings are
 * missing and counts what would be on it. It never draws an illustrative
 * map, because that would be read as the real city.
 */
export function OpsMap({
  maps,
  centre,
  city,
  points,
}: {
  maps: { live: boolean; key: string; mapId: string; why: string | null };
  centre: { lat: number; lng: number } | null;
  city: string;
  points: MapPoint[];
}) {
  const host = React.useRef<HTMLDivElement>(null);
  const map = React.useRef<google.maps.Map | null>(null);
  const drawn = React.useRef<{ clear: () => void }[]>([]);
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const middle = centre ?? { lat: -1.2864, lng: 36.8172 };

  React.useEffect(() => {
    if (!maps.live) return;
    let alive = true;
    loadGoogleMaps({ key: maps.key })
      .then((g: typeof google.maps) => {
        if (!alive || !host.current || map.current) return;
        map.current = new g.Map(host.current, {
          mapId: maps.mapId,
          center: middle,
          zoom: 12,
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: 'cooperative',
        });
        setReady(true);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
    // The map is made once; data changes redraw markers below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maps.live, maps.key, maps.mapId]);

  React.useEffect(() => {
    const m = map.current;
    if (!ready || !m || !window.google) return;
    const g = window.google.maps;
    for (const d of drawn.current) d.clear();
    drawn.current = [];

    const ring = document.createElement('div');
    ring.style.cssText = `width:46px;height:46px;border-radius:50%;background:rgba(229,168,0,.22);
      display:flex;align-items:center;justify-content:center`;
    ring.innerHTML = `<div style="width:16px;height:16px;border-radius:50%;background:${MAP_COLOURS.gold};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`;
    const centreMarker = new g.marker.AdvancedMarkerElement({
      map: m,
      position: middle,
      content: ring,
      title: city,
      zIndex: 1,
    });
    drawn.current.push({ clear: () => (centreMarker.map = null) });

    const bounds = new g.LatLngBounds();
    bounds.extend(middle);
    for (const p of points) {
      const marker = new g.marker.AdvancedMarkerElement({
        map: m,
        position: { lat: p.lat, lng: p.lng },
        content: markerEl(p.kind, `${PIN[p.kind].label}: ${p.label}`),
        title: p.label,
        zIndex: 10,
      });
      drawn.current.push({ clear: () => (marker.map = null) });
      bounds.extend({ lat: p.lat, lng: p.lng });
    }
    if (points.length > 0) m.fitBounds(bounds, 36);
    // middle is derived from centre, which is in the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, points, centre, city]);

  const byKind = (Object.keys(PIN) as MapKind[])
    .map((k) => ({ k, n: points.filter((p) => p.kind === k).length }))
    .filter((x) => x.n > 0);

  if (!maps.live || error) {
    return (
      <div className="border-border bg-bg flex aspect-[4/3] flex-col justify-between rounded-xl border p-4">
        <div>
          <p className="text-[0.875rem] font-extrabold">No map is drawn here.</p>
          <p className="text-muted mt-1 text-[0.8125rem] font-semibold">
            {error
              ? `The map could not load: ${error}`
              : (maps.why ?? 'The map needs a Google Maps key and a Map ID.')}
          </p>
        </div>
        <ul className="mt-3 space-y-1.5">
          {byKind.length === 0 ? (
            <li className="text-muted-light text-[0.8125rem] font-semibold">
              Nothing with a location is live in {city} right now.
            </li>
          ) : (
            byKind.map(({ k, n }) => {
              const Icon = PIN[k].icon;
              return (
                <li key={k} className="flex items-center gap-2 text-[0.8125rem] font-semibold">
                  <Icon aria-hidden="true" className="h-4 w-4 text-[#C98A00]" />
                  {n.toLocaleString('en-KE')} {PIN[k].label.toLowerCase()} in {city}
                </li>
              );
            })
          )}
        </ul>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={host}
        role="region"
        aria-label={`Map of live operations in ${city}`}
        className="border-border aspect-[4/3] w-full overflow-hidden rounded-xl border"
      />
      <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-white/90 px-3 py-1 text-[0.8125rem] font-bold shadow">
        {city}
      </span>
    </div>
  );
}
