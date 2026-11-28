'use client';

import { loadGoogleMaps } from '@nexg/ui';
import { maps as mapsCapability } from '@nexg/ui/capabilities';
import * as React from 'react';

export interface DriverPosition {
  latitude: number;
  longitude: number;
  at: string;
}

/**
 * Where the customer's driver was last seen, the way an order shows its
 * rider (components/account/order-live.tsx): a map with the driver's pin when
 * maps are on, and the time it was taken. The business's system sends the
 * position; the booking page reads it again every 20 seconds.
 */
export function DriverLive({ position }: { position: DriverPosition }) {
  const caps = React.useMemo(() => mapsCapability(), []);
  const host = React.useRef<HTMLDivElement>(null);
  const drawn = React.useRef<{
    map: google.maps.Map;
    marker: google.maps.marker.AdvancedMarkerElement;
  } | null>(null);

  React.useEffect(() => {
    if (!caps.live || !host.current) return;
    let cancelled = false;
    const point = { lat: position.latitude, lng: position.longitude };
    void loadGoogleMaps({ key: caps.key }).then((g) => {
      if (cancelled || !host.current) return;
      if (!drawn.current) {
        const pin = document.createElement('span');
        pin.textContent = 'Driver';
        pin.style.cssText =
          'display:inline-block;padding:3px 8px;border-radius:8px;font:800 12px Manrope,sans-serif;background:#D2AF26;color:#141414';
        const map = new g.Map(host.current, {
          center: point,
          zoom: 15,
          mapId: caps.mapId,
          disableDefaultUI: true,
          zoomControl: true,
        });
        drawn.current = {
          map,
          marker: new g.marker.AdvancedMarkerElement({
            map,
            position: point,
            title: 'Your driver',
            content: pin,
          }),
        };
      } else {
        drawn.current.marker.position = point;
        drawn.current.map.panTo(point);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [caps, position.latitude, position.longitude]);

  const seen = new Date(position.at).toLocaleTimeString('en-KE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Nairobi',
  });
  const directions = `https://www.google.com/maps/search/?api=1&query=${position.latitude},${position.longitude}`;
  return (
    <div className="flex flex-col gap-2">
      {caps.live ? (
        <div
          ref={host}
          role="img"
          aria-label={`Map showing where your driver was at ${seen}`}
          className="border-border h-56 w-full overflow-hidden rounded-xl border"
        />
      ) : null}
      <p className="text-muted text-sm">
        Your driver was seen at {seen}.{' '}
        <a href={directions} target="_blank" rel="noopener noreferrer" className="underline">
          Open in Google Maps
        </a>
      </p>
    </div>
  );
}
