'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { CalendarDays, Check, Clock3, Users } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import {
  BOOKING_STATUS_LABEL,
  bookingErrorMessage,
  dateTimeLabel,
  durationLabel,
  estimateCents,
  kes,
  lengthChoice,
  type MyBooking,
  nairobiDate,
  priceLabel,
  type PublicResource,
  timeLabel,
} from '@/lib/booking/customer';
import { createClient } from '@/lib/supabase/client';

interface OpenTime {
  starts_at: string;
  ends_at: string;
}
interface Session {
  slot_id: string;
  starts_at: string;
  ends_at: string;
  seats_left: number;
}
interface Created {
  reference: string;
  status: MyBooking['status'];
  starts_at: string;
  ends_at: string;
  total_cents: number | null;
}

const card = 'border-border bg-surface rounded-2xl border p-5 sm:p-6';
const label = 'text-muted mb-1.5 block text-[0.6875rem] font-extrabold uppercase tracking-[0.08em]';
const input =
  'border-border bg-bg focus:border-gold w-full rounded-lg border px-3 py-2.5 text-[0.9375rem] font-semibold outline-none';
const primary =
  'bg-gold text-ink inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-[0.875rem] font-extrabold disabled:opacity-50';
const chip = (on: boolean) =>
  `rounded-lg border px-3 py-2 text-[0.8125rem] font-extrabold transition-colors disabled:opacity-40 ${
    on ? 'border-gold bg-gold/15 text-ink' : 'border-border bg-bg hover:border-gold'
  }`;

export function CustomerBookingForm({
  merchant,
  resources,
  initialResourceId,
  today,
  signedIn,
  defaults,
}: {
  merchant: { id: string; name: string };
  resources: PublicResource[];
  initialResourceId: string | null;
  /** Today in Nairobi, from the server, so the first render matches. */
  today: string;
  signedIn: boolean;
  defaults: { name: string; phone: string };
}) {
  const db = React.useMemo(() => createClient() as unknown as SupabaseClient, []);
  const [resourceId, setResourceId] = React.useState(
    resources.some((r) => r.id === initialResourceId) ? initialResourceId! : resources[0]!.id,
  );
  const resource = resources.find((r) => r.id === resourceId) ?? resources[0]!;
  const choice = lengthChoice(resource);
  const [units, setUnits] = React.useState(1);
  const minutes =
    choice.kind === 'fixed' ? choice.minutes : choice.kind === 'days' ? units * 1440 : units * 60;

  const [date, setDate] = React.useState(today);
  const [times, setTimes] = React.useState<OpenTime[] | null>(null);
  const [sessions, setSessions] = React.useState<Session[] | null>(null);
  const [start, setStart] = React.useState<OpenTime | null>(null);
  const [session, setSession] = React.useState<Session | null>(null);
  const [quantity, setQuantity] = React.useState(1);
  const [name, setName] = React.useState(defaults.name);
  const [phone, setPhone] = React.useState(defaults.phone);
  const [notes, setNotes] = React.useState('');
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [created, setCreated] = React.useState<Created | null>(null);
  const [reload, setReload] = React.useState(0);

  const maxDate = nairobiDate(new Date(`${today}T12:00:00+03:00`), resource.max_advance_days);

  React.useEffect(() => {
    let stale = false;
    setStart(null);
    setSession(null);
    setLoadError(null);
    if (resource.model === 'exclusive') {
      setTimes(null);
      void db
        .rpc('rpc_booking_open_times', {
          p_resource_id: resource.id,
          p_date: date,
          p_minutes: minutes,
        })
        .then(({ data, error: e }) => {
          if (stale) return;
          if (e) setLoadError(e.message);
          setTimes((data as OpenTime[] | null) ?? []);
        });
    } else {
      setSessions(null);
      const from = new Date();
      const to = new Date(from.getTime() + Math.min(resource.max_advance_days, 90) * 864e5);
      void db
        .rpc('rpc_booking_slots', {
          p_resource_id: resource.id,
          p_from: from.toISOString(),
          p_to: to.toISOString(),
        })
        .then(({ data, error: e }) => {
          if (stale) return;
          if (e) setLoadError(e.message);
          setSessions((data as Session[] | null) ?? []);
        });
    }
    return () => {
      stale = true;
    };
  }, [db, resource.id, resource.model, resource.max_advance_days, date, minutes, reload]);

  const qty = resource.model === 'capacity' ? quantity : 1;
  const estimate = estimateCents(resource, minutes, qty);
  const picked = resource.model === 'exclusive' ? start : session;
  const nextHref = `/book/${merchant.id}?resource=${resource.id}`;

  async function book(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) return;
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await db.rpc('rpc_booking_create', {
      p_resource_id: resource.id,
      p_starts_at: resource.model === 'exclusive' ? start!.starts_at : null,
      p_ends_at: resource.model === 'exclusive' ? start!.ends_at : null,
      p_slot_id: resource.model === 'capacity' ? session!.slot_id : null,
      p_quantity: qty,
      p_guest_name: name.trim(),
      p_guest_phone: phone.trim(),
      p_notes: notes.trim() || null,
    });
    setBusy(false);
    if (rpcError) {
      setError(bookingErrorMessage(rpcError.message));
      setReload((n) => n + 1);
      return;
    }
    setCreated(data as Created);
  }

  if (created) {
    return (
      <div className={card} role="status">
        <span className="bg-success-bg text-success flex h-11 w-11 items-center justify-center rounded-xl">
          <Check aria-hidden="true" className="h-5 w-5" />
        </span>
        <h2 className="mt-4 text-2xl font-extrabold tracking-tight">
          {created.status === 'confirmed' ? 'You’re booked' : 'Booking requested'}
        </h2>
        <p className="text-muted mt-2 text-[0.9375rem] leading-[1.7]">
          {resource.name} at {merchant.name}, {dateTimeLabel(created.starts_at)}.{' '}
          {created.status === 'confirmed'
            ? 'The business has your booking.'
            : `${merchant.name} will confirm it. You can follow it in your account.`}
        </p>
        <dl className="border-border mt-5 grid gap-3 rounded-xl border p-4 text-[0.875rem] sm:grid-cols-3">
          <div>
            <dt className={label}>Reference</dt>
            <dd className="font-extrabold">{created.reference}</dd>
          </div>
          <div>
            <dt className={label}>Status</dt>
            <dd className="font-extrabold">{BOOKING_STATUS_LABEL[created.status]}</dd>
          </div>
          <div>
            <dt className={label}>To pay at the venue</dt>
            <dd className="font-extrabold">
              {created.total_cents == null ? 'Price on request' : kes(created.total_cents)}
            </dd>
          </div>
        </dl>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/account?tab=bookings" className={primary}>
            See your bookings
          </Link>
          <button
            type="button"
            className="border-border rounded-lg border px-4 py-2.5 text-[0.875rem] font-extrabold"
            onClick={() => {
              setCreated(null);
              setReload((n) => n + 1);
            }}
          >
            Book another time
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={book} className="space-y-4">
      {/* ------------------------------------------------------------ what */}
      <fieldset className={card}>
        <legend className="sr-only">What to book</legend>
        <p className={label}>What would you like to book?</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {resources.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={r.id === resource.id}
              onClick={() => {
                setResourceId(r.id);
                setUnits(1);
                setQuantity(1);
                setError(null);
              }}
              className={`rounded-xl border p-3 text-left transition-colors ${
                r.id === resource.id ? 'border-gold bg-gold/10' : 'border-border hover:border-gold'
              }`}
            >
              <span className="block text-[0.9375rem] font-extrabold">{r.name}</span>
              <span className="text-muted block text-[0.75rem] font-bold">
                {priceLabel(r)}
                {r.duration_minutes ? ` · ${durationLabel(r.duration_minutes)}` : ''}
              </span>
            </button>
          ))}
        </div>
        {resource.description && (
          <p className="text-muted mt-3 text-[0.875rem] leading-[1.7]">{resource.description}</p>
        )}
      </fieldset>

      {/* ------------------------------------------------------------ when */}
      <fieldset className={card}>
        <legend className="sr-only">When</legend>
        {resource.model === 'exclusive' ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className={label}>
                  <CalendarDays aria-hidden="true" className="mr-1 inline h-3.5 w-3.5" />
                  {choice.kind === 'days' ? 'From' : 'Date'}
                </span>
                <input
                  type="date"
                  required
                  className={input}
                  min={today}
                  max={maxDate}
                  value={date}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                />
              </label>
              {choice.kind !== 'fixed' && (
                <label>
                  <span className={label}>How long</span>
                  <select
                    className={input}
                    value={units}
                    onChange={(e) => setUnits(Number(e.target.value))}
                  >
                    {choice.options.map((n) => (
                      <option key={n} value={n}>
                        {n}{' '}
                        {choice.kind === 'days'
                          ? n === 1
                            ? 'day'
                            : 'days'
                          : n === 1
                            ? 'hour'
                            : 'hours'}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <p className={`${label} mt-4`}>
              <Clock3 aria-hidden="true" className="mr-1 inline h-3.5 w-3.5" />
              {choice.kind === 'days' ? 'Pick-up time' : 'Start time'}
            </p>
            {times == null ? (
              <p className="text-muted text-sm font-semibold">Checking free times…</p>
            ) : times.length === 0 ? (
              <p className="text-muted text-sm font-semibold">
                {loadError
                  ? 'Free times could not be loaded. Try again in a moment.'
                  : 'No free times on this day. Try another date.'}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {times.map((t) => (
                  <button
                    key={t.starts_at}
                    type="button"
                    aria-pressed={start?.starts_at === t.starts_at}
                    className={chip(start?.starts_at === t.starts_at)}
                    onClick={() => setStart(t)}
                  >
                    {timeLabel(t.starts_at)}
                  </button>
                ))}
              </div>
            )}
            {start && (
              <p className="text-muted mt-3 text-[0.8125rem] font-semibold">
                {dateTimeLabel(start.starts_at)} until {dateTimeLabel(start.ends_at)}
              </p>
            )}
          </>
        ) : (
          <>
            <p className={label}>
              <CalendarDays aria-hidden="true" className="mr-1 inline h-3.5 w-3.5" />
              Pick a session
            </p>
            {sessions == null ? (
              <p className="text-muted text-sm font-semibold">Checking sessions…</p>
            ) : sessions.length === 0 ? (
              <p className="text-muted text-sm font-semibold">
                {loadError
                  ? 'Sessions could not be loaded. Try again in a moment.'
                  : 'No sessions are open for booking right now.'}
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {sessions.map((s) => (
                  <button
                    key={s.slot_id}
                    type="button"
                    disabled={s.seats_left < 1}
                    aria-pressed={session?.slot_id === s.slot_id}
                    className={`${chip(session?.slot_id === s.slot_id)} text-left`}
                    onClick={() => {
                      setSession(s);
                      setQuantity((q) => Math.min(q, s.seats_left));
                    }}
                  >
                    <span className="block">{dateTimeLabel(s.starts_at)}</span>
                    <span className="text-muted block text-[0.75rem] font-bold">
                      {s.seats_left < 1 ? 'Full' : `${s.seats_left} left`}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {session && (
              <label className="mt-4 block max-w-[12rem]">
                <span className={label}>
                  <Users aria-hidden="true" className="mr-1 inline h-3.5 w-3.5" />
                  People
                </span>
                <select
                  className={input}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                >
                  {Array.from({ length: Math.min(session.seats_left, 10) }, (_, i) => i + 1).map(
                    (n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ),
                  )}
                </select>
              </label>
            )}
          </>
        )}
      </fieldset>

      {/* ------------------------------------------------------------- who */}
      <fieldset className={card}>
        <legend className="sr-only">Your details</legend>
        {signedIn ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className={label}>Your name</span>
              <input
                className={input}
                required
                maxLength={120}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              <span className={label}>Phone</span>
              <input
                className={input}
                required
                type="tel"
                pattern="[+0-9 ]{9,16}"
                title="A phone number the business can call, such as 0712 345 678"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <label className="sm:col-span-2">
              <span className={label}>Anything they should know? (optional)</span>
              <textarea
                className={input}
                rows={2}
                maxLength={500}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </div>
        ) : (
          <p className="text-[0.9375rem] font-semibold leading-[1.7]">
            <Link
              href={`/sign-in?next=${encodeURIComponent(nextHref)}`}
              className="text-ink font-extrabold underline underline-offset-4"
            >
              Sign in
            </Link>{' '}
            to book. Your bookings then stay in your account, where you can follow or cancel them.
          </p>
        )}
      </fieldset>

      {/* ----------------------------------------------------------- total */}
      <div className={`${card} flex flex-wrap items-center justify-between gap-4`}>
        <div>
          <p className={label}>{estimate == null ? 'Price' : 'Total, paid at the venue'}</p>
          <p className="text-xl font-extrabold">
            {estimate == null ? 'Price on request' : kes(estimate)}
          </p>
          <p className="text-muted text-[0.75rem] font-semibold">
            {resource.instant_confirm && !resource.quote_required
              ? 'Confirmed straight away.'
              : `${merchant.name} confirms each booking.`}
            {resource.cancel_cutoff_minutes > 0 &&
              ` Cancel online up to ${durationLabel(resource.cancel_cutoff_minutes)} before.`}
          </p>
        </div>
        {signedIn ? (
          <button type="submit" className={primary} disabled={!picked || busy}>
            {busy ? 'Booking…' : picked ? 'Book now' : 'Pick a time first'}
          </button>
        ) : (
          <Link href={`/sign-in?next=${encodeURIComponent(nextHref)}`} className={primary}>
            Sign in to book
          </Link>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-[0.875rem] font-bold"
        >
          {error}
        </p>
      )}
    </form>
  );
}
