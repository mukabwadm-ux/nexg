'use client';

import * as React from 'react';

export interface ZoneBounds {
  id: string;
  name: string;
  tier: 'core' | 'extended' | 'trial';
  eta_min: number;
  eta_max: number;
  cod_allowed: boolean;
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface MapPin {
  lat: number;
  lng: number;
  label: string;
  sub?: string;
  /** Amber rather than gold, for a pin that fell outside every zone. */
  outside?: boolean;
  index?: number;
}

/**
 * Where the pin fell, against where we deliver.
 *
 * Not a street map. There is no Maps key on this project, and a decorative
 * grid of fake roads would imply a precision this has no way to back up. So
 * it draws the one relationship the merchant is being asked about — their
 * pin, and our coverage — from the same polygons the database judges them
 * against. When this says "outside", zone_for_point said outside.
 */
export function ZoneMap({
  zones,
  pins,
  note,
  height = 'h-[17rem]',
}: {
  zones: ZoneBounds[];
  pins: MapPin[];
  note?: React.ReactNode;
  height?: string;
}) {
  const box = React.useMemo(() => bounds(zones, pins), [zones, pins]);

  if (!box) {
    return (
      <div
        className={`border-border bg-bg text-muted-light flex ${height} items-center justify-center rounded-2xl border text-xs font-bold`}
      >
        Drop a pin to see where you fall
      </div>
    );
  }

  const W = 800;
  const H = 300;
  const x = (lng: number) => ((lng - box.west) / (box.east - box.west)) * W;
  /* Latitude grows northwards and SVG y grows downwards. */
  const y = (lat: number) => ((box.north - lat) / (box.north - box.south)) * H;

  const fills = {
    core: 'rgb(var(--gold-rgb) / 0.22)',
    extended: 'rgb(var(--gold-rgb) / 0.12)',
    trial: 'rgb(var(--gold-rgb) / 0.06)',
  };

  return (
    <figure className={`border-border bg-bg relative ${height} overflow-hidden rounded-2xl border`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
        role="img"
        aria-label={`Coverage map showing ${zones.length} delivery zones and ${pins.length} branch pins`}
      >
        {zones.map((zone) => {
          const left = x(zone.west);
          const top = y(zone.north);
          return (
            <g key={zone.id}>
              <rect
                x={left}
                y={top}
                width={x(zone.east) - left}
                height={y(zone.south) - top}
                rx={10}
                fill={fills[zone.tier]}
                stroke="rgb(var(--gold-rgb) / 0.45)"
                strokeWidth={1.5}
                strokeDasharray={zone.tier === 'trial' ? '6 4' : undefined}
              />
              <text
                x={left + 10}
                y={top + 20}
                className="fill-[rgb(var(--gold-text-rgb))] text-[11px] font-extrabold uppercase"
                style={{ letterSpacing: '0.08em' }}
              >
                {zone.name}
              </text>
            </g>
          );
        })}

        {pins.map((pin, index) => (
          <g key={`${pin.lat}-${pin.lng}-${index}`}>
            <circle
              cx={x(pin.lng)}
              cy={y(pin.lat)}
              r={15}
              fill={pin.outside ? 'rgb(var(--warning-rgb))' : 'rgb(var(--gold-rgb))'}
              stroke="white"
              strokeWidth={3}
            />
            {pin.index !== undefined && (
              <text
                x={x(pin.lng)}
                y={y(pin.lat) + 4}
                textAnchor="middle"
                className="fill-[rgb(var(--ink-rgb))] text-[12px] font-extrabold"
              >
                {pin.index}
              </text>
            )}
          </g>
        ))}
      </svg>

      {/* The labels sit outside the SVG so they wrap and scale like text. */}
      {pins.length === 1 && pins[0] && (
        <figcaption
          className="border-border bg-surface shadow-card pointer-events-none absolute max-w-[15rem] -translate-y-1/2 translate-x-5 rounded-lg border px-3 py-2"
          style={{
            left: `${(x(pins[0].lng) / W) * 100}%`,
            top: `${(y(pins[0].lat) / H) * 100}%`,
          }}
        >
          <p className="text-[0.8125rem] font-extrabold leading-tight">{pins[0].label}</p>
          {pins[0].sub && (
            <p
              className={`mt-0.5 text-xs font-bold ${pins[0].outside ? 'text-warning' : 'text-gold-text'}`}
            >
              {pins[0].sub}
            </p>
          )}
        </figcaption>
      )}

      {note && (
        <div className="bg-ink absolute inset-x-3 bottom-3 rounded-xl px-4 py-3 text-[0.8125rem] font-bold leading-[1.6] text-white">
          {note}
        </div>
      )}
    </figure>
  );
}

/** A frame that holds every zone and every pin, with a little air. */
function bounds(zones: ZoneBounds[], pins: MapPin[]) {
  const lngs = [...zones.flatMap((z) => [z.west, z.east]), ...pins.map((p) => p.lng)];
  const lats = [...zones.flatMap((z) => [z.south, z.north]), ...pins.map((p) => p.lat)];
  if (lngs.length === 0 || lats.length === 0) return null;

  const west = Math.min(...lngs);
  const east = Math.max(...lngs);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const padX = Math.max((east - west) * 0.08, 0.004);
  const padY = Math.max((north - south) * 0.12, 0.004);

  return {
    west: west - padX,
    east: east + padX,
    south: south - padY,
    north: north + padY,
  };
}
