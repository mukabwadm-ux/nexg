import { Card } from '@nexg/ui';
import Link from 'next/link';
import * as React from 'react';

import {
  DASH,
  Pill,
  SectionTitle,
  URGENCY_LABEL,
  URGENCY_TONE,
  ago,
  km,
  num,
  plural,
} from './shared';
import type { LiveOrder } from './workbench';

export interface RiderPin {
  rider_id: string;
  name: string | null;
  vehicle: string | null;
  plate_no: string | null;
  presence: string;
  lat: number | null;
  lng: number | null;
  zone_name: string | null;
  current_order_reference: string | null;
  cash_on_hand_cents: number | null;
  cash_cap_cents: number | null;
  offers_paused: boolean;
  offers_paused_reason: string | null;
  last_seen_at: string | null;
  health_band: string | null;
  top_decile: boolean;
}

/**
 * Where the map goes.
 *
 * NexG has no Google Maps key, and the build prompt is explicit that
 * nothing illustrative may be drawn in production — no placeholder
 * streets, no invented positions. A grey rectangle with fake pins
 * would be worse than no map: a dispatcher would read it as the
 * city.
 *
 * So the list is not a fallback here, it is the screen. It carries
 * every fact the map was specified to carry — who is where, how far,
 * what state each order is in — and it is the version that works on
 * a mid-range Android over 3G, which is the other half of the point.
 * When a key is configured the map renders above this and the list
 * stays, because the prompt also requires a keyboard-reachable list
 * equivalent.
 */
export function MapArea({
  orders,
  riders,
  selected,
  city,
  chip,
  mapsKey,
}: {
  orders: LiveOrder[];
  riders: RiderPin[];
  selected: string | null;
  city: string;
  chip: string;
  mapsKey: string | null;
}) {
  const free = riders.filter((r) => r.presence === 'online' && !r.offers_paused);
  const onTrip = riders.filter((r) => r.presence === 'on_trip');
  const idle = free.filter(
    (r) => r.last_seen_at && Date.now() - new Date(r.last_seen_at).getTime() > 30 * 60_000,
  );
  const unassigned = orders.filter(
    (o) => o.urgency === 'needs_a_person' || o.urgency === 'finding_a_rider',
  );

  return (
    <div className="space-y-4">
      {!mapsKey && (
        <Card className="p-4">
          <p className="text-[0.8125rem] font-extrabold">No map is drawn here, deliberately.</p>
          <p className="text-muted mt-1.5 text-[0.8125rem] font-semibold">
            The map needs a Google Maps key and a Map ID, and neither is configured. Drawing an
            illustrative one — placeholder streets, invented rider positions — would be read as the
            city, which is worse than no map. Set{' '}
            <code className="text-[0.75rem]">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> and{' '}
            <code className="text-[0.75rem]">NEXT_PUBLIC_GOOGLE_MAPS_ID</code> and it appears above
            this list.
          </p>
          <p className="text-muted-light mt-1.5 text-[0.8125rem] font-semibold">
            Everything the map was specified to show is below, from the same queries, and reachable
            by keyboard.
          </p>
        </Card>
      )}

      {/* The counts strip the artboard puts bottom-left of the map. */}
      <div className="bg-ink flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl px-4 py-3 text-white">
        <Count label={orders.length === 1 ? 'live order' : 'live orders'} value={orders.length} />
        <Count
          label={riders.length === 1 ? 'rider online' : 'riders online'}
          value={riders.length}
        />
        <Count label="free" value={free.length} tone="gold" />
        <Count
          label="unassigned"
          value={unassigned.length}
          tone={unassigned.length > 0 ? 'danger' : undefined}
        />
        {idle.length > 0 && <Count label="idle 30+ min" value={idle.length} tone="gold" />}
        <span className="ml-auto text-[0.625rem] font-semibold text-white/40">
          {city} · positions from the rider record
        </span>
      </div>

      <Card className="p-4">
        <SectionTitle note={`${plural(orders.length, 'order')} · oldest first`}>
          {chip === 'needs' ? 'Orders needing a person' : 'Live orders'}
        </SectionTitle>
        <ul className="mt-3 space-y-1">
          {orders.length === 0 && (
            <li className="text-muted py-2 text-[0.8125rem] font-semibold">
              Nothing live in {city} right now.
            </li>
          )}
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/live?city=${encodeURIComponent(city)}&chip=${chip}&selected=${o.id}`}
                className={`flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 transition-colors ${
                  selected === o.id
                    ? 'bg-gold-soft border-gold border-l-4'
                    : 'hover:bg-bg border-l-4 border-transparent'
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-[0.8125rem] font-bold">
                    {o.reference}
                    <span className="text-muted-light ml-2 font-semibold">
                      {o.merchant ?? DASH} → {o.dropoff_label ?? DASH}
                    </span>
                  </p>
                  <p className="text-muted-light truncate text-[0.6875rem] font-semibold">
                    {ago(o.placed_at)} old
                    {o.rider ? ` · ${o.rider}` : ' · no rider'}
                    {o.needs_action_reads_as && ` · ${o.needs_action_reads_as}`}
                  </p>
                </div>
                <Pill tone={URGENCY_TONE[o.urgency]}>{URGENCY_LABEL[o.urgency] ?? o.urgency}</Pill>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-4">
        <SectionTitle note={`${free.length} free · ${onTrip.length} on a trip`}>
          Riders
        </SectionTitle>
        <ul className="mt-3 space-y-1">
          {riders.length === 0 && (
            <li className="text-muted py-2 text-[0.8125rem] font-semibold">
              Nobody is online in {city}.
            </li>
          )}
          {riders.map((r) => (
            <li
              key={r.rider_id}
              className="border-border flex items-center justify-between gap-3 border-t py-2 first:border-t-0"
            >
              <div className="min-w-0">
                <p className="truncate text-[0.8125rem] font-bold">
                  {r.name ?? DASH}
                  {r.top_decile && (
                    <span className="text-gold-text ml-1.5 text-[0.625rem] font-extrabold uppercase">
                      top decile
                    </span>
                  )}
                </p>
                <p className="text-muted-light truncate text-[0.6875rem] font-semibold">
                  {r.vehicle ?? DASH} · {r.plate_no ?? DASH}
                  {r.zone_name && ` · ${r.zone_name}`}
                  {r.cash_cap_cents !== null &&
                    ` · cash ${Math.round((r.cash_on_hand_cents ?? 0) / 100)}/${Math.round(
                      r.cash_cap_cents / 100,
                    )}`}
                </p>
                {r.offers_paused && (
                  <p className="text-danger truncate text-[0.6875rem] font-bold">
                    offers paused{r.offers_paused_reason && ` · ${r.offers_paused_reason}`}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <Pill
                  tone={
                    r.presence === 'on_trip'
                      ? 'bg-gold-soft text-gold-text'
                      : r.offers_paused
                        ? 'bg-danger-bg text-danger'
                        : 'bg-success-bg text-success'
                  }
                >
                  {r.presence === 'on_trip'
                    ? (r.current_order_reference ?? 'ON A TRIP')
                    : r.offers_paused
                      ? 'PAUSED'
                      : 'FREE'}
                </Pill>
                <p className="text-muted-light mt-0.5 text-[0.625rem] font-semibold">
                  seen {ago(r.last_seen_at)} ago
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Count({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone?: 'gold' | 'danger';
}) {
  return (
    <span className="text-[0.75rem] font-semibold">
      <span
        className={`text-[0.9375rem] font-extrabold tabular-nums ${
          tone === 'danger' ? 'text-danger' : tone === 'gold' ? 'text-gold' : ''
        }`}
      >
        {num(value)}
      </span>{' '}
      <span className="text-white/60">{label}</span>
    </span>
  );
}

/** Straight-line distance, for the "how far is this rider" line. */
export function pinDistance(
  a: { lat: number | null; lng: number | null },
  b: { lat: number | null; lng: number | null },
): string {
  if (a.lat === null || a.lng === null || b.lat === null || b.lng === null) return km(null);
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return km(2 * R * Math.asin(Math.sqrt(h)));
}
