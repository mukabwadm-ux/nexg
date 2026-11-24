'use client';

import {
  Banknote,
  Camera,
  Check,
  MapPin,
  Navigation,
  Package,
  Phone,
  Store,
  User,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { pickupCode, recordCash, tripStep, type TripStep } from '@/app/(customer)/rider/actions';
import { createClient } from '@/lib/supabase/client';

import { kes, panel, ring } from './ui';

/** One open job, as rpc_my_rider_jobs returns it. */
export interface RiderTrip {
  orderId: string;
  reference: string;
  stage: string;
  atPickupAt: string | null;
  pickedUpAt: string | null;
  promisedAt: string | null;
  tripKm: number | null;
  pickup: {
    name: string | null;
    branch: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    phone: string | null;
  };
  dropoff: {
    label: string | null;
    note: string | null;
    latitude: number | null;
    longitude: number | null;
    name: string | null;
    phone: string | null;
  };
  items: { id: string; name: string; quantity: number }[];
  payment: { method: string; collectCents: number | null; cashRecorded: boolean };
  proof: { guest: 'verified' | 'code' | 'code_or_photo'; attemptsLeft: number | null };
  payEstimate: { totalKes?: number } | null;
}

const HANDED = [
  { value: 'guest', label: 'The customer' },
  { value: 'askari', label: 'Askari / guard' },
  { value: 'reception', label: 'Reception' },
  { value: 'caretaker', label: 'Caretaker' },
  { value: 'lockbox', label: 'Lockbox' },
];

const PRE_PICKUP = ['placed', 'confirmed', 'preparing', 'ready'];

function directions(lat: number | null, lng: number | null, label: string | null) {
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  }
  return label
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(label)}`
    : null;
}

/**
 * The trip a rider is on, one step at a time:
 *   1. ride to the shop, "I'm at the shop", show the pickup code
 *   2. "Picked up" once the shop has it ready
 *   3. ride to the customer ("Nearly there" tells them)
 *   4. cash first if it is a cash order, then who took it, and the
 *      customer's 4-digit code or a photo, then "Finish delivery"
 * Every step is rpc_rider_order_step, which checks the order is this
 * rider's and in the right stage, records it on the order and in the
 * audit log, and on delivery writes the rider's earning.
 */
export function CurrentTrips({ trips, riderId }: { trips: RiderTrip[]; riderId: string }) {
  if (trips.length === 0) return null;
  return (
    <section aria-labelledby="trip-title" className="space-y-4">
      <h2 id="trip-title" className="text-[20px] font-extrabold text-[color:var(--rider-ink)]">
        {trips.length === 1 ? 'Your current trip' : `Your ${trips.length} current trips`}
      </h2>
      {trips.map((t) => (
        <TripCard key={t.orderId} trip={t} riderId={riderId} />
      ))}
    </section>
  );
}

function TripCard({ trip, riderId }: { trip: RiderTrip; riderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [said, setSaid] = React.useState<{ ok: boolean; message?: string } | null>(null);
  const [code, setCode] = React.useState<string | null>(null);

  const atShop = PRE_PICKUP.includes(trip.stage);
  const onTheWay = trip.stage === 'picked_up' || trip.stage === 'arriving';
  const phase = atShop ? (trip.atPickupAt ? 2 : 1) : onTheWay ? 3 : 4;

  React.useEffect(() => {
    if (phase !== 2) return;
    void pickupCode(trip.orderId).then((r) => {
      const c = (r.data as { code?: string | null } | undefined)?.code;
      setCode(c ?? null);
    });
  }, [phase, trip.orderId]);

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>, done?: string) {
    setBusy(true);
    setSaid(null);
    const r = await fn();
    setBusy(false);
    setSaid(r.ok ? { ok: true, message: done ?? r.message } : r);
    if (r.ok) router.refresh();
    return r;
  }
  const step = (s: TripStep, done: string) => run(() => tripStep(trip.orderId, s), done);

  const steps = ['To the shop', 'At the shop', 'To the customer', 'Delivered'];

  return (
    <article className={`${panel} border-[#fdd128] shadow-[0_14px_30px_-22px_rgba(180,130,0,0.9)]`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12.5px] font-bold uppercase tracking-wide text-slate-500">
            Order {trip.reference}
          </p>
          <p className="text-[18px] font-extrabold text-[color:var(--rider-ink)]">
            {trip.pickup.name ?? 'Shop'} → {trip.dropoff.label ?? 'Customer'}
          </p>
          <p className="text-[13px] font-semibold text-slate-600">
            {trip.tripKm != null ? `${trip.tripKm} km trip` : null}
            {trip.promisedAt
              ? ` · due ${new Date(trip.promisedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })}`
              : null}
            {trip.payEstimate?.totalKes != null
              ? ` · about ${kes(trip.payEstimate.totalKes)} to you`
              : null}
          </p>
        </div>
        {trip.payment.collectCents ? (
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-1.5 text-[13px] font-extrabold text-amber-800">
            <Banknote className="h-4 w-4" aria-hidden="true" />
            Collect {kes(trip.payment.collectCents / 100)} cash
          </span>
        ) : (
          <span className="rounded-xl bg-green-50 px-3 py-1.5 text-[13px] font-extrabold text-green-800">
            Paid online
          </span>
        )}
      </div>

      <ol className="mt-4 grid grid-cols-4 gap-1.5" aria-label="Trip progress">
        {steps.map((label, i) => {
          const n = i + 1;
          const done = n < phase;
          const now = n === phase;
          return (
            <li key={label} className="min-w-0">
              <span
                className={`block h-1.5 rounded-full ${done ? 'bg-green-600' : now ? 'bg-[#fdd128]' : 'bg-[#eef0f6]'}`}
              />
              <span
                className={`mt-1 block truncate text-[11.5px] font-bold ${now ? 'text-[color:var(--rider-ink)]' : 'text-slate-500'}`}
              >
                {done ? <span className="sr-only">Done: </span> : null}
                {now ? <span className="sr-only">Now: </span> : null}
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Place
          icon={<Store />}
          title={trip.pickup.name ?? 'Shop'}
          lines={[trip.pickup.branch, trip.pickup.address]}
          phone={trip.pickup.phone}
          href={directions(trip.pickup.latitude, trip.pickup.longitude, trip.pickup.address)}
          on={phase <= 2}
        />
        <Place
          icon={<User />}
          title={trip.dropoff.name ? `${trip.dropoff.name}` : 'Customer'}
          lines={[trip.dropoff.label, trip.dropoff.note]}
          phone={phase >= 3 ? trip.dropoff.phone : null}
          href={directions(trip.dropoff.latitude, trip.dropoff.longitude, trip.dropoff.label)}
          on={phase === 3}
        />
      </div>

      {trip.items.length > 0 ? (
        <details className="mt-3 rounded-xl bg-[#f6f7fb] px-3 py-2">
          <summary className="cursor-pointer text-[13px] font-extrabold">
            <Package className="mr-1 inline h-4 w-4" aria-hidden="true" />
            {trip.items.reduce((n, i) => n + i.quantity, 0)} items to collect
          </summary>
          <ul className="mt-2 space-y-0.5 text-[13px] font-semibold text-slate-700">
            {trip.items.map((i) => (
              <li key={i.id}>
                {i.quantity} × {i.name}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {said?.message ? (
        <p
          role={said.ok ? 'status' : 'alert'}
          className={`mt-3 rounded-xl px-3 py-2 text-[13px] font-bold ${said.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}
        >
          {said.message}
        </p>
      ) : null}

      <div className="mt-4 border-t border-[#eef0f6] pt-4">
        {phase === 1 ? (
          <Primary
            busy={busy}
            onClick={() => void step('at_pickup', 'The shop knows you are here.')}
          >
            I&apos;m at the shop
          </Primary>
        ) : phase === 2 ? (
          <div className="space-y-3">
            {code ? (
              <p className="text-[14px] font-semibold text-slate-700">
                Show the shop this code:{' '}
                <span className="ml-1 rounded-lg bg-[#141a2a] px-3 py-1 font-mono text-[20px] font-extrabold tracking-[0.3em] text-white">
                  {code}
                </span>
              </p>
            ) : null}
            {trip.stage === 'ready' ? (
              <Primary
                busy={busy}
                onClick={() => void step('picked_up', 'Picked up. The customer has been told.')}
              >
                I&apos;ve picked it up
              </Primary>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-[14px] font-semibold text-slate-700">
                  The shop is still getting it ready.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void step('waiting', 'The shop and ops can see you are waiting.')}
                  className={`rounded-xl border border-[#e3e7f0] px-4 py-2 text-[13.5px] font-extrabold disabled:opacity-50 ${ring}`}
                >
                  I&apos;m still waiting
                </button>
              </div>
            )}
          </div>
        ) : phase === 3 ? (
          <Deliver trip={trip} riderId={riderId} busy={busy} run={run} />
        ) : (
          <p className="flex items-center gap-2 text-[15px] font-extrabold text-green-700">
            <Check className="h-5 w-5" aria-hidden="true" /> Delivered
          </p>
        )}
      </div>
    </article>
  );
}

function Deliver({
  trip,
  riderId,
  busy,
  run,
}: {
  trip: RiderTrip;
  riderId: string;
  busy: boolean;
  run: (
    fn: () => Promise<{ ok: boolean; message?: string }>,
    done?: string,
  ) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [handedTo, setHandedTo] = React.useState('guest');
  const [code, setCode] = React.useState('');
  const [photo, setPhoto] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [left, setLeft] = React.useState<number | null>(trip.proof.attemptsLeft);
  const router = useRouter();

  const cashDue = !!trip.payment.collectCents && !trip.payment.cashRecorded;
  const guest = handedTo === 'guest';
  const verified = guest && trip.proof.guest === 'verified';
  const photoAllowed = !guest || trip.proof.guest === 'code_or_photo';
  const needsCode = guest && !verified;
  const ready = !cashDue && (verified || (guest && code.length === 4) || (photoAllowed && !!photo));

  async function finish() {
    let photoPath: string | undefined;
    if (photo && (!guest || code.length !== 4)) {
      setUploading(true);
      setUploadError(null);
      const ext = (photo.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `${riderId}/${trip.orderId}/${Date.now()}.${ext || 'jpg'}`;
      const { error } = await createClient()
        .storage.from('rider-proof')
        .upload(path, photo, { contentType: photo.type || 'image/jpeg', upsert: false });
      setUploading(false);
      if (error) {
        setUploadError(`The photo did not upload: ${error.message}`);
        return;
      }
      photoPath = path;
    }
    const r = (await run(
      () =>
        tripStep(trip.orderId, 'delivered', {
          handedTo,
          code: guest && code.length === 4 ? code : undefined,
          photoPath,
        }),
      'Delivered.',
    )) as { ok: boolean; data?: { attemptsLeft?: number } };
    if (r.ok) {
      router.push(`/rider/jobs?done=${encodeURIComponent(trip.reference)}`);
    } else if (typeof r.data?.attemptsLeft === 'number') {
      setLeft(r.data.attemptsLeft);
    }
  }

  return (
    <div className="space-y-4">
      {trip.stage === 'picked_up' ? (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(() => tripStep(trip.orderId, 'arriving'), 'The customer knows you are close.')
          }
          className={`rounded-xl border border-[#e3e7f0] px-4 py-2 text-[13.5px] font-extrabold disabled:opacity-50 ${ring}`}
        >
          I&apos;m nearly there
        </button>
      ) : null}

      {cashDue ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 p-3">
          <p className="flex-1 text-[14px] font-semibold text-amber-900">
            Collect <strong>{kes((trip.payment.collectCents ?? 0) / 100)}</strong> in cash first. It
            is NexG&apos;s and comes off your settlement.
          </p>
          <Primary
            busy={busy}
            onClick={() =>
              void run(
                () => recordCash(trip.orderId, trip.payment.collectCents ?? 0),
                'Cash recorded.',
              )
            }
          >
            I collected {kes((trip.payment.collectCents ?? 0) / 100)}
          </Primary>
        </div>
      ) : null}

      <fieldset disabled={cashDue || busy || uploading} className="space-y-3 disabled:opacity-50">
        <legend className="text-[15px] font-extrabold">Hand it over</legend>
        <label className="block text-[13px] font-bold text-slate-600">
          Who took it?
          <select
            value={handedTo}
            onChange={(e) => setHandedTo(e.target.value)}
            className="mt-1 block w-full max-w-xs rounded-xl border border-[#e3e7f0] bg-white px-3 py-2 text-[14px] font-bold text-[color:var(--rider-ink)]"
          >
            {HANDED.map((h) => (
              <option key={h.value} value={h.value}>
                {h.label}
              </option>
            ))}
          </select>
        </label>

        {verified ? (
          <p className="text-[13px] font-bold text-green-700">
            The customer&apos;s code is checked.
          </p>
        ) : needsCode ? (
          <label className="block text-[13px] font-bold text-slate-600">
            The customer&apos;s 4-digit code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={4}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="mt-1 block w-36 rounded-xl border border-[#e3e7f0] bg-white px-3 py-2 text-center font-mono text-[22px] font-extrabold tracking-[0.4em] text-[color:var(--rider-ink)]"
            />
            <span className="mt-1 block text-[12px] font-semibold text-slate-500">
              They got it by SMS when you picked up.
              {left != null ? ` ${left} tries left.` : ''}
            </span>
          </label>
        ) : null}

        {photoAllowed ? (
          <label className="block text-[13px] font-bold text-slate-600">
            {guest ? 'No code? Take a photo of the handover instead' : 'Photo of where you left it'}
            <span
              className={`mt-1 flex w-full max-w-sm cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[#c9d0de] bg-white px-3 py-2 text-[13.5px] font-bold ${ring}`}
            >
              <Camera className="h-5 w-5 text-slate-500" aria-hidden="true" />
              {photo ? photo.name : 'Take or choose a photo'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                capture="environment"
                className="sr-only"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              />
            </span>
          </label>
        ) : null}

        {uploadError ? (
          <p role="alert" className="text-[13px] font-bold text-red-700">
            {uploadError}
          </p>
        ) : null}

        <Primary busy={busy || uploading} disabled={!ready} onClick={() => void finish()}>
          {uploading ? 'Uploading photo…' : 'Finish delivery'}
        </Primary>
      </fieldset>
    </div>
  );
}

function Place({
  icon,
  title,
  lines,
  phone,
  href,
  on,
}: {
  icon: React.ReactNode;
  title: string;
  lines: (string | null)[];
  phone: string | null;
  href: string | null;
  on: boolean;
}) {
  return (
    <div
      className={`flex gap-3 rounded-2xl border p-3 ${on ? 'border-[#fdd128] bg-[#fffbe8]' : 'border-[#eef0f6]'}`}
    >
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm [&>svg]:h-5 [&>svg]:w-5"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-extrabold">{title}</p>
        {lines.filter(Boolean).map((l) => (
          <p key={l} className="text-[13px] font-semibold text-slate-600">
            <MapPin className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
            {l}
          </p>
        ))}
        <div className="mt-2 flex flex-wrap gap-2">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex items-center gap-1 rounded-lg bg-[#141a2a] px-3 py-1.5 text-[12.5px] font-extrabold text-white ${ring}`}
            >
              <Navigation className="h-3.5 w-3.5" aria-hidden="true" /> Directions
            </a>
          ) : null}
          {phone ? (
            <a
              href={`tel:${phone}`}
              className={`inline-flex items-center gap-1 rounded-lg border border-[#e3e7f0] bg-white px-3 py-1.5 text-[12.5px] font-extrabold ${ring}`}
            >
              <Phone className="h-3.5 w-3.5" aria-hidden="true" /> Call
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Primary({
  busy,
  disabled,
  onClick,
  children,
}: {
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={busy || disabled}
      onClick={onClick}
      className={`rounded-xl bg-[#fdd128] px-6 py-3 text-[15px] font-extrabold text-[color:var(--rider-ink)] shadow-[0_8px_18px_-10px_rgba(180,130,0,0.9)] disabled:opacity-50 ${ring}`}
    >
      {busy ? 'Saving…' : children}
    </button>
  );
}
