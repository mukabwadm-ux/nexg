'use client';

import { loadGoogleMaps } from '@nexg/ui';
import { maps as mapsCapability } from '@nexg/ui/capabilities';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

interface Place {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  role: 'pickup' | 'dropoff';
}
interface OrderMap {
  status: 'live' | 'locations-only' | 'unavailable';
  stage?: string;
  places?: Place[];
  courier?: { latitude: number; longitude: number; observedAt: string; vehicle: string } | null;
}

const ACTIVE = ['placed', 'confirmed', 'preparing', 'ready', 'picked_up', 'arriving'];

/**
 * Live tracking on the website (the Consumer app had it, the website did not): every 15 seconds
 * it reads rpc_my_order_map, which answers only for this session's own order, and refreshes the
 * page when the stage moves. The rider shows once they share their position (picked up and on
 * the way); before that the map shows the shop and the delivery point.
 */
export function OrderLive({ orderId, stage }: { orderId: string; stage: string }) {
  const router = useRouter();
  const [map, setMap] = React.useState<OrderMap | null>(null);
  const caps = React.useMemo(() => mapsCapability(), []);
  const host = React.useRef<HTMLDivElement>(null);
  const drawn = React.useRef<{
    map: google.maps.Map;
    markers: google.maps.marker.AdvancedMarkerElement[];
  } | null>(null);
  const active = ACTIVE.includes(stage);

  React.useEffect(() => {
    if (!active) return;
    let live = true;
    const read = async () => {
      const { data } = await (
        createClient().rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown }>
      )('rpc_my_order_map', { p_order_id: orderId, p_contract_version: '2' });
      if (!live || !data) return;
      const next = data as OrderMap;
      setMap(next);
      if (next.stage && next.stage !== stage) router.refresh();
    };
    void read();
    const timer = window.setInterval(() => void read(), 15_000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [active, orderId, stage, router]);

  React.useEffect(() => {
    if (!caps.live || !host.current || !map?.places?.length) return;
    let cancelled = false;
    void loadGoogleMaps({ key: caps.key }).then((g) => {
      if (cancelled || !host.current) return;
      const points = [
        ...(map.places ?? []).map((p) => ({
          lat: p.latitude,
          lng: p.longitude,
          title: p.title,
          kind: p.role,
        })),
        ...(map.courier
          ? [
              {
                lat: map.courier.latitude,
                lng: map.courier.longitude,
                title: 'Your rider',
                kind: 'rider',
              },
            ]
          : []),
      ];
      if (!drawn.current) {
        drawn.current = {
          map: new g.Map(host.current, {
            center: points[0],
            zoom: 14,
            mapId: caps.mapId,
            disableDefaultUI: true,
            zoomControl: true,
          }),
          markers: [],
        };
      }
      const view = drawn.current;
      view.markers.forEach((m) => (m.map = null));
      view.markers = points.map((p) => {
        const pin = document.createElement('span');
        pin.textContent = p.kind === 'rider' ? 'Rider' : p.kind === 'pickup' ? 'Shop' : 'You';
        pin.style.cssText = `display:inline-block;padding:3px 8px;border-radius:8px;font:800 12px Manrope,sans-serif;${
          p.kind === 'rider' ? 'background:#D2AF26;color:#141414' : 'background:#141414;color:#fff'
        }`;
        return new g.marker.AdvancedMarkerElement({
          map: view.map,
          position: p,
          title: p.title,
          content: pin,
        });
      });
      const bounds = new g.LatLngBounds();
      points.forEach((p) => bounds.extend(p));
      if (points.length > 1) view.map.fitBounds(bounds, 48);
    });
    return () => {
      cancelled = true;
    };
  }, [caps, map]);

  if (!active) return null;
  const riderNote = map?.courier
    ? `Your rider was seen ${new Date(map.courier.observedAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })}.`
    : stage === 'picked_up' || stage === 'arriving'
      ? 'Your rider is on the way. Their position shows here when they share it.'
      : 'The map shows your rider once your order is picked up.';

  return (
    <section
      aria-labelledby="track"
      className="border-border flex flex-col gap-3 rounded-2xl border bg-white p-5"
    >
      <h2 id="track" className="text-lg font-extrabold">
        Track your order
      </h2>
      {caps.live && map?.places?.length ? (
        <div
          ref={host}
          role="img"
          aria-label="Map of the shop, your delivery point and your rider"
          className="h-72 w-full overflow-hidden rounded-xl bg-[#ece8df]"
        />
      ) : null}
      <p className="text-muted text-sm" aria-live="polite">
        {riderNote}
      </p>
    </section>
  );
}
