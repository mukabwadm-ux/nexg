'use client';

import { MAP_COLOURS, loadGoogleMaps } from '@nexg/ui';
import { Banknote, Clock, MapPin, Navigation, Store } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { answerOffer } from '@/app/(customer)/rider/actions';

import { kes, panel, ring } from './ui';

export interface RiderOffer {
  offerId: string;
  offeredAt: string;
  expiresAt: string | null;
  toPickupKm: number | null;
  etaMin: number | null;
  tripKm: number | null;
  pickup: string;
  dropoff: string;
  reference: string;
  scheduledFor: string | null;
  collectKes: number | null;
  payKes: number | null;
  pickupPoint: { lat: number; lng: number } | null;
  dropoffPoint: { lat: number; lng: number } | null;
}

type Filter = 'all' | 'now' | 'scheduled';
const NAIROBI = { lat: -1.2864, lng: 36.8172 };

/**
 * Available jobs: the offers dispatch has sent this rider, with Accept and
 * Decline, beside a map of the one picked. Accept goes through the same
 * dispatch function the phone app uses, which checks the offer is still
 * open and still theirs.
 */
export function OffersBoard({
  offers,
  online,
  rider,
  maps,
}: {
  offers: RiderOffer[];
  online: boolean;
  rider: { lat: number; lng: number } | null;
  maps: { key: string; mapId: string };
}) {
  const router = useRouter();
  const [filter, setFilter] = React.useState<Filter>('all');
  const [picked, setPicked] = React.useState<string | null>(offers[0]?.offerId ?? null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState<{ ok: boolean; message?: string } | null>(null);
  const [answered, setAnswered] = React.useState<string[]>([]);
  const now = useNow();

  /* An answered offer leaves the list at once, before the refresh lands. */
  const live = offers.filter(
    (o) => !answered.includes(o.offerId) && (!o.expiresAt || new Date(o.expiresAt).getTime() > now),
  );
  const shown = live.filter((o) =>
    filter === 'all' ? true : filter === 'scheduled' ? !!o.scheduledFor : !o.scheduledFor,
  );
  const current = shown.find((o) => o.offerId === picked) ?? shown[0] ?? null;

  React.useEffect(() => {
    const timer = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(timer);
  }, [router]);

  async function answer(offer: RiderOffer, accept: boolean) {
    setBusy(offer.offerId);
    setSaid(null);
    const result = await answerOffer(offer.offerId, accept);
    setBusy(null);
    if (result.ok) setAnswered((a) => [...a, offer.offerId]);
    setSaid(
      result.ok
        ? {
            ok: true,
            message: accept ? `Accepted ${offer.reference}. Head to the pickup.` : 'Declined.',
          }
        : result,
    );
    router.refresh();
  }

  const counts = {
    all: live.length,
    now: live.filter((o) => !o.scheduledFor).length,
    scheduled: live.filter((o) => !!o.scheduledFor).length,
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className={panel} aria-labelledby="offers-title">
        <h2 id="offers-title" className="sr-only">
          Offers
        </h2>
        <div role="tablist" aria-label="Which offers" className="mb-4 flex flex-wrap gap-1.5">
          {(['all', 'now', 'scheduled'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-2 text-[13.5px] font-extrabold ${ring} ${
                filter === f
                  ? 'bg-gold text-[color:var(--rider-ink)]'
                  : 'hover:bg-gold/20 bg-[#f3f5fa] text-slate-700'
              }`}
            >
              {f === 'all' ? 'All jobs' : f === 'now' ? 'Deliver now' : 'Scheduled'} ({counts[f]})
            </button>
          ))}
        </div>

        {said?.message ? (
          <p
            role={said.ok ? 'status' : 'alert'}
            className={`mb-3 rounded-xl px-3 py-2 text-[13px] font-bold ${
              said.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
            }`}
          >
            {said.message}
          </p>
        ) : null}

        {shown.length === 0 ? (
          <div className="flex min-h-[14rem] flex-col items-center justify-center rounded-2xl bg-[#f6f7fb] px-4 py-8 text-center">
            <p className="text-[15px] font-extrabold text-[color:var(--rider-ink)]">
              {online ? 'No offers right now.' : 'You are offline.'}
            </p>
            <p className="mt-1 max-w-sm text-[13px] font-medium text-slate-600">
              {online
                ? 'New offers appear here and in the rider app as dispatch sends them. This page checks every 20 seconds.'
                : 'Switch on "online" in the sidebar to start receiving delivery offers.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {shown.map((o) => {
              const on = current?.offerId === o.offerId;
              const left = o.expiresAt
                ? Math.max(0, Math.round((new Date(o.expiresAt).getTime() - now) / 1000))
                : null;
              return (
                <li
                  key={o.offerId}
                  className={`rounded-2xl border p-4 transition-colors ${
                    on ? 'border-gold bg-gold-soft' : 'border-[#e6e9f2] bg-white'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setPicked(o.offerId)}
                    aria-pressed={on}
                    className={`flex w-full items-start gap-3 rounded-xl text-left ${ring}`}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700"
                    >
                      <Store className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-extrabold text-[color:var(--rider-ink)]">
                        Pickup: {o.pickup}
                      </span>
                      <span className="block text-[13.5px] font-medium text-slate-600">
                        Drop: {o.dropoff}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] font-bold text-blue-700">
                        {o.tripKm != null ? (
                          <span className="inline-flex items-center gap-1">
                            <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
                            {o.tripKm} km trip
                          </span>
                        ) : null}
                        {o.toPickupKm != null ? <span>{o.toPickupKm} km to pickup</span> : null}
                        {o.etaMin != null ? <span>{o.etaMin} min away</span> : null}
                        {o.scheduledFor ? (
                          <span className="text-purple-700">
                            For{' '}
                            {new Date(o.scheduledFor).toLocaleString('en-GB', {
                              weekday: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                              timeZone: 'Africa/Nairobi',
                            })}
                          </span>
                        ) : null}
                      </span>
                      {o.collectKes ? (
                        <span className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-bold text-amber-700">
                          <Banknote className="h-3.5 w-3.5" aria-hidden="true" />
                          Collect {kes(o.collectKes)} cash
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[16px] font-extrabold tabular-nums text-[color:var(--rider-ink)]">
                        {o.payKes != null ? kes(o.payKes) : 'Rate card'}
                      </span>
                      {left != null ? (
                        <span
                          suppressHydrationWarning
                          className={`mt-0.5 inline-flex items-center gap-1 text-[12px] font-bold ${left < 15 ? 'text-red-700' : 'text-slate-500'}`}
                        >
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                          {left}s
                        </span>
                      ) : null}
                    </span>
                  </button>
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void answer(o, false)}
                      className={`rounded-xl border border-[#e3e7f0] bg-white px-4 py-2 text-[13.5px] font-extrabold text-slate-700 disabled:opacity-50 ${ring}`}
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void answer(o, true)}
                      className={`bg-gold rounded-xl px-6 py-2 text-[13.5px] font-extrabold text-[color:var(--rider-ink)] shadow-[0_6px_14px_-8px_rgb(var(--gold-deep-rgb)/0.8)] disabled:opacity-50 ${ring}`}
                    >
                      {busy === o.offerId ? 'Sending…' : 'Accept'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-[12px] font-semibold text-slate-500">
          Pay shown is the current rate card for the trip distance, before waiting time, bonuses and
          tips.
        </p>
      </section>

      <OfferMap offer={current} rider={rider} maps={maps} />
    </div>
  );
}

function useNow() {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function OfferMap({
  offer,
  rider,
  maps,
}: {
  offer: RiderOffer | null;
  rider: { lat: number; lng: number } | null;
  maps: { key: string; mapId: string };
}) {
  const host = React.useRef<HTMLDivElement>(null);
  const state = React.useRef<{
    map: google.maps.Map;
    lib: typeof google.maps;
    drawn: { setMap: (m: null) => void }[];
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);
  const live = !!maps.key && !!maps.mapId;

  React.useEffect(() => {
    if (!live) return;
    let alive = true;
    loadGoogleMaps({ key: maps.key })
      .then((lib) => {
        if (!alive || !host.current || state.current) return;
        const map = new lib.Map(host.current, {
          mapId: maps.mapId,
          center: rider ?? NAIROBI,
          zoom: 13,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
        });
        state.current = { map, lib, drawn: [] };
        setReady(true);
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      alive = false;
    };
  }, [live, maps.key, maps.mapId, rider]);

  React.useEffect(() => {
    const s = state.current;
    if (!ready || !s) return;
    for (const d of s.drawn) d.setMap(null);
    s.drawn = [];
    const pin = (at: { lat: number; lng: number }, colour: string, title: string) => {
      const dot = document.createElement('div');
      dot.style.cssText = `width:20px;height:20px;border-radius:50%;background:${colour};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)`;
      const m = new s.lib.marker.AdvancedMarkerElement({
        map: s.map,
        position: at,
        content: dot,
        title,
      });
      s.drawn.push({ setMap: () => (m.map = null) });
    };
    const bounds = new s.lib.LatLngBounds();
    if (rider) {
      pin(rider, '#2563eb', 'You');
      bounds.extend(rider);
    }
    if (offer?.pickupPoint) {
      pin(offer.pickupPoint, '#16a34a', `Pickup: ${offer.pickup}`);
      bounds.extend(offer.pickupPoint);
    }
    if (offer?.dropoffPoint) {
      pin(offer.dropoffPoint, '#dc2626', `Drop: ${offer.dropoff}`);
      bounds.extend(offer.dropoffPoint);
    }
    if (offer?.pickupPoint && offer.dropoffPoint) {
      const line = new s.lib.Polyline({
        map: s.map,
        path: [offer.pickupPoint, offer.dropoffPoint],
        strokeColor: MAP_COLOURS.ink,
        strokeOpacity: 0.85,
        strokeWeight: 4,
      });
      s.drawn.push(line);
    }
    if (rider && offer?.pickupPoint) {
      const line = new s.lib.Polyline({
        map: s.map,
        path: [rider, offer.pickupPoint],
        strokeOpacity: 0,
        icons: [
          {
            icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: '#2563eb', scale: 3 },
            offset: '0',
            repeat: '12px',
          },
        ],
      });
      s.drawn.push(line);
    }
    if (!bounds.isEmpty()) s.map.fitBounds(bounds, 60);
  }, [ready, offer, rider]);

  return (
    <section
      className={`${panel} relative min-h-[22rem] overflow-hidden !p-0`}
      aria-label="Map of the picked offer"
    >
      {live && !error ? (
        <div ref={host} className="absolute inset-0" />
      ) : (
        <div className="flex h-full min-h-[22rem] flex-col items-center justify-center gap-2 bg-[#eef2f7] p-6 text-center">
          <MapPin className="h-8 w-8 text-slate-400" aria-hidden="true" />
          <p className="text-[14px] font-extrabold">The map is not available here.</p>
          <p className="max-w-xs text-[13px] font-medium text-slate-600">
            {error ?? 'Pickup and drop-off are on each offer card.'}
          </p>
        </div>
      )}
      {live && !error ? (
        <ul className="absolute bottom-3 left-3 flex flex-wrap gap-2 text-[12px] font-bold">
          <Legend colour="#2563eb" label="You" />
          <Legend colour="#16a34a" label="Pickup" />
          <Legend colour="#dc2626" label="Drop-off" />
        </ul>
      ) : null}
    </section>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 shadow">
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 rounded-full"
        style={{ background: colour }}
      />
      {label}
    </li>
  );
}
