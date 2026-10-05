'use client';

import { MAP_COLOURS, loadGoogleMaps } from '@nexg/ui';
import * as React from 'react';

import type { RiderPin } from './map-area';
import type { LiveOrder } from './workbench';

export interface OrderPoint {
  order_id: string;
  reference: string;
  urgency: string;
  stage: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  radius_km: number | null;
  rider_id: string | null;
}

export interface ZoneShape {
  zone_id: string;
  name: string;
  tier: string | null;
  state: string;
  paused: boolean;
  shape: { type: string; coordinates: number[][][] | number[][][][] } | null;
}

export interface Bounds {
  south: number;
  north: number;
  west: number;
  east: number;
}

const URGENCY_COLOUR: Record<string, string> = {
  needs_a_person: MAP_COLOURS.danger,
  late: MAP_COLOURS.gold,
  finding_a_rider: MAP_COLOURS.info,
  running: MAP_COLOURS.muted,
  done: MAP_COLOURS.success,
};

/**
 * The live map.
 *
 * Renders only when a key and a Map ID are both configured. Where
 * there is none, the page keeps the list it already has and says
 * why — an illustrative map would be read as the city, which is
 * worse than none.
 *
 * Everything drawn here is live data or Settings geometry. There
 * are no placeholder streets and no invented positions: a rider
 * dot exists because a rider sent a heartbeat, a zone outline is
 * the polygon somebody drew in Settings, and the dashed circle is
 * the radius the cascade is currently searching.
 *
 * Markers are rebuilt from props rather than diffed. A hundred
 * markers is nothing to rebuild and the diffing version of this is
 * where stale pins come from.
 */
export function LiveMap({
  apiKey,
  mapId,
  riders,
  orders,
  zones,
  bounds,
  selectedId,
  onSelect,
}: {
  apiKey: string;
  mapId: string;
  riders: RiderPin[];
  orders: OrderPoint[];
  zones: ZoneShape[];
  bounds: Bounds | null;
  selectedId: string | null;
  onSelect: (orderId: string) => void;
}) {
  const host = React.useRef<HTMLDivElement>(null);
  const map = React.useRef<google.maps.Map | null>(null);
  const drawn = React.useRef<{ clear: () => void }[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);

  /* One map, made once. */
  React.useEffect(() => {
    let alive = true;
    loadGoogleMaps({ key: apiKey })
      .then((maps: typeof google.maps) => {
        if (!alive || !host.current || map.current) return;
        const made = new maps.Map(host.current, {
          mapId,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          center: bounds
            ? { lat: (bounds.north + bounds.south) / 2, lng: (bounds.east + bounds.west) / 2 }
            : { lat: -1.2864, lng: 36.8172 },
          zoom: 12,
        });
        map.current = made;
        if (bounds) {
          made.fitBounds(
            new maps.LatLngBounds(
              { lat: bounds.south, lng: bounds.west },
              { lat: bounds.north, lng: bounds.east },
            ),
            24,
          );
        }
        setReady(true);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [apiKey, mapId, bounds]);

  /* Everything on it, rebuilt whenever the data changes. */
  React.useEffect(() => {
    const m = map.current;
    if (!ready || !m || !window.google) return;
    const g = window.google.maps;

    for (const d of drawn.current) d.clear();
    drawn.current = [];

    for (const z of zones) {
      if (!z.shape) continue;
      const rings =
        z.shape.type === 'MultiPolygon'
          ? (z.shape.coordinates as number[][][][]).flat()
          : (z.shape.coordinates as number[][][]);

      const poly = new g.Polygon({
        paths: rings.map((ring) =>
          ring.map((pair) => ({ lat: pair[1] as number, lng: pair[0] as number })),
        ),
        map: m,
        strokeColor: z.paused || z.state === 'short' ? MAP_COLOURS.danger : MAP_COLOURS.muted,
        strokeOpacity: 0.9,
        /* Core heavier than extended than trial. A Polygon cannot
           dash its stroke, and the zones table carries the tier in
           words anyway — colour and weight are never the only
           signal. */
        strokeWeight: z.tier === 'core' ? 2 : z.tier === 'extended' ? 1.25 : 0.75,
        fillColor: z.paused || z.state === 'short' ? MAP_COLOURS.danger : MAP_COLOURS.ink,
        fillOpacity: z.paused ? 0.1 : z.state === 'short' ? 0.07 : 0.02,
        clickable: false,
      });
      drawn.current.push({ clear: () => poly.setMap(null) });
    }

    for (const o of orders) {
      const colour = URGENCY_COLOUR[o.urgency] ?? MAP_COLOURS.muted;
      const selected = o.order_id === selectedId;

      if (o.pickup_lat !== null && o.pickup_lng !== null) {
        const el = document.createElement('div');
        el.textContent = o.reference.slice(-4);
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.setAttribute(
          'aria-label',
          `Order ${o.reference}, ${o.urgency.replace(/_/g, ' ')}, ${o.stage}`,
        );
        el.style.cssText = `
          background:${colour};color:#fff;font:700 10px/1 Manrope,system-ui,sans-serif;
          padding:5px 7px;border-radius:7px;white-space:nowrap;cursor:pointer;
          border:${selected ? `2px solid ${MAP_COLOURS.gold}` : '2px solid transparent'};
          box-shadow:0 1px 4px rgba(0,0,0,.35)`;

        const pin = new g.marker.AdvancedMarkerElement({
          map: m,
          position: { lat: o.pickup_lat, lng: o.pickup_lng },
          content: el,
          title: `${o.reference} · ${o.stage}`,
          zIndex: selected ? 100 : o.urgency === 'needs_a_person' ? 50 : 10,
        });
        pin.addListener('click', () => onSelect(o.order_id));
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') onSelect(o.order_id);
        });
        drawn.current.push({ clear: () => (pin.map = null) });

        /* The circle the cascade is currently searching, and the
           line the order has to travel. Only for the selected one:
           six of these at once is a screen nobody can read. */
        if (selected && o.radius_km) {
          const circle = new g.Circle({
            map: m,
            center: { lat: o.pickup_lat, lng: o.pickup_lng },
            radius: o.radius_km * 1000,
            strokeColor: MAP_COLOURS.gold,
            strokeOpacity: 0.8,
            strokeWeight: 1.5,
            fillColor: MAP_COLOURS.gold,
            fillOpacity: 0.05,
            clickable: false,
          });
          drawn.current.push({ clear: () => circle.setMap(null) });
        }

        if (selected && o.dropoff_lat !== null && o.dropoff_lng !== null) {
          const line = new g.Polyline({
            map: m,
            path: [
              { lat: o.pickup_lat, lng: o.pickup_lng },
              { lat: o.dropoff_lat, lng: o.dropoff_lng },
            ],
            /* Straight, and dashed to say so. A solid line would
               claim this is the route, and the Routes API is not
               wired — a rider following it would ride into a
               river. */
            strokeOpacity: 0,
            icons: [
              {
                icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, scale: 3, strokeColor: colour },
                offset: '0',
                repeat: '12px',
              },
            ],
            clickable: false,
          });
          drawn.current.push({ clear: () => line.setMap(null) });
        }
      }

      if (selected && o.dropoff_lat !== null && o.dropoff_lng !== null) {
        const el = document.createElement('div');
        el.style.cssText = `width:12px;height:12px;border-radius:50%;background:${MAP_COLOURS.ink};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)`;
        const drop = new g.marker.AdvancedMarkerElement({
          map: m,
          position: { lat: o.dropoff_lat, lng: o.dropoff_lng },
          content: el,
          title: 'Where it is going',
        });
        drawn.current.push({ clear: () => (drop.map = null) });
      }
    }

    for (const r of riders) {
      if (r.lat === null || r.lng === null) continue;
      const idle = r.last_seen_at && Date.now() - new Date(r.last_seen_at).getTime() > 30 * 60_000;
      const colour = r.offers_paused
        ? MAP_COLOURS.muted
        : r.presence === 'on_trip'
          ? MAP_COLOURS.gold
          : idle
            ? MAP_COLOURS.muted
            : MAP_COLOURS.success;

      const el = document.createElement('div');
      el.style.cssText = `width:18px;height:18px;border-radius:50%;background:${colour};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);opacity:${idle ? 0.55 : 1}`;

      const pin = new g.marker.AdvancedMarkerElement({
        map: m,
        position: { lat: r.lat, lng: r.lng },
        content: el,
        title: `${r.name ?? 'Rider'} · ${r.plate_no ?? ''} · ${
          r.offers_paused ? 'offers paused' : r.presence
        }`,
        zIndex: 5,
      });
      drawn.current.push({ clear: () => (pin.map = null) });
    }
  }, [ready, riders, orders, zones, selectedId, onSelect]);

  if (error) {
    return (
      <div className="border-danger bg-danger-bg rounded-2xl border p-4">
        <p className="text-danger text-[0.8125rem] font-extrabold">The map did not load.</p>
        <p className="text-muted mt-1 text-[0.8125rem] font-semibold">{error}</p>
        <p className="text-muted-light mt-1 text-[0.75rem] font-semibold">
          Everything the map shows is in the lists below, from the same queries.
        </p>
      </div>
    );
  }

  return (
    <div className="border-border bg-surface relative overflow-hidden rounded-2xl border">
      <div ref={host} className="h-[520px] w-full" aria-label="Live map" role="application" />
      {!ready && (
        <div className="bg-bg absolute inset-0 grid place-items-center">
          <p className="text-muted text-[0.8125rem] font-semibold">Loading the map…</p>
        </div>
      )}
      <div className="border-border text-muted-light border-t px-3 py-1.5 text-[0.6875rem] font-semibold">
        Rider positions are from their last heartbeat, not a live stream — each dot says how long
        ago in the list below. The dashed line is straight, not a route.
      </div>
    </div>
  );
}

/** The selected order, as what the map needs. */
export function pointsFor(orders: LiveOrder[], points: OrderPoint[]): OrderPoint[] {
  const live = new Set(orders.map((o) => o.id));
  return points.filter((p) => live.has(p.order_id));
}
