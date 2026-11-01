'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

export interface Resource {
  id: string;
  model: 'exclusive' | 'capacity';
  kind: string;
  name: string;
  price_cents: number | null;
  price_unit: 'booking' | 'seat' | 'hour' | 'day';
  quote_required: boolean;
  capacity: number;
  duration_minutes: number | null;
  buffer_minutes: number;
  min_notice_minutes: number;
  instant_confirm: boolean;
  active: boolean;
}

export interface Slot {
  id: string;
  resource_id: string;
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  status: string;
}

export interface Booking {
  id: string;
  reference: string;
  resource_id: string;
  starts_at: string;
  ends_at: string;
  quantity: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show' | 'blocked';
  guest_name: string | null;
  guest_phone: string | null;
  notes: string | null;
  total_cents: number | null;
  source: string;
}

const card = 'border-border bg-surface rounded-xl border p-4';
const input =
  'border-border bg-bg focus:border-gold w-full rounded-lg border px-3 py-2 text-[0.875rem] font-semibold outline-none';
const label = 'text-muted mb-1 block text-[0.6875rem] font-extrabold uppercase tracking-[0.08em]';
const primary =
  'bg-gold text-ink rounded-lg px-3.5 py-2 text-[0.8125rem] font-extrabold disabled:opacity-50';
const quiet =
  'border-border rounded-lg border px-3 py-1.5 text-[0.75rem] font-extrabold disabled:opacity-50';

const STATUS_TONE: Record<Booking['status'], string> = {
  pending: 'bg-gold/20 text-ink',
  confirmed: 'bg-success-bg text-success',
  completed: 'bg-bg text-muted',
  cancelled: 'bg-bg text-muted line-through',
  no_show: 'bg-danger-bg text-danger',
  blocked: 'bg-ink text-white',
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-KE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

const kes = (cents: number | null) =>
  cents == null ? 'Quote' : `KES ${(cents / 100).toLocaleString('en-KE')}`;

/** datetime-local gives a local wall time; the database wants an instant. */
const toIso = (local: string) => new Date(local).toISOString();

export function BookingsBoard({
  resources,
  bookings,
  slots,
  merchantId,
}: {
  resources: Resource[];
  bookings: Booking[];
  slots: Slot[];
  merchantId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const db = React.useMemo(() => createClient() as unknown as SupabaseClient, []);

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setError(null);
    const { error: e } = await fn();
    setBusy(false);
    if (e) {
      setError(e.message);
      return false;
    }
    router.refresh();
    return true;
  }

  const byId = new Map(resources.map((r) => [r.id, r]));
  const pending = bookings.filter((b) => b.status === 'pending');
  const rest = bookings.filter((b) => b.status !== 'pending');

  return (
    <div className="space-y-6">
      {error ? (
        <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-[0.8125rem] font-bold">
          {error}
        </p>
      ) : null}

      {pending.length > 0 ? (
        <section className="border-gold bg-gold/10 rounded-xl border-2 p-4">
          <h2 className="mb-3 text-[0.9375rem] font-extrabold">
            {pending.length} waiting for your answer
          </h2>
          <BookingList
            items={pending}
            byId={byId}
            busy={busy}
            onStatus={(id, status) =>
              run(() => db.rpc('rpc_booking_set_status', { p_booking_id: id, p_status: status }))
            }
          />
        </section>
      ) : null}

      <section className={card}>
        <h2 className="mb-3 text-[0.9375rem] font-extrabold">Upcoming and recent</h2>
        {rest.length === 0 ? (
          <p className="text-muted text-[0.875rem] font-semibold">Nothing booked yet.</p>
        ) : (
          <BookingList
            items={rest}
            byId={byId}
            busy={busy}
            onStatus={(id, status) =>
              run(() => db.rpc('rpc_booking_set_status', { p_booking_id: id, p_status: status }))
            }
          />
        )}
      </section>

      {resources.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <ManualBooking resources={resources} slots={slots} busy={busy} db={db} run={run} />
          <BlockTime resources={resources} busy={busy} db={db} run={run} />
        </div>
      ) : null}

      <section className={card}>
        <h2 className="mb-3 text-[0.9375rem] font-extrabold">What people can book</h2>
        {resources.length === 0 ? (
          <p className="text-muted mb-3 text-[0.875rem] font-semibold">
            Add your first one: a car, a room, a provider, or a session with seats.
          </p>
        ) : (
          <ul className="divide-border mb-4 divide-y">
            {resources.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <p className="text-[0.875rem] font-extrabold">
                    {r.name}
                    {!r.active ? <span className="text-muted"> (paused)</span> : null}
                  </p>
                  <p className="text-muted text-[0.75rem] font-semibold">
                    {r.model === 'capacity'
                      ? `${r.capacity} seats per session`
                      : 'One booking at a time'}
                    {' · '}
                    {r.quote_required
                      ? 'Quote on request'
                      : `${kes(r.price_cents)} per ${r.price_unit}`}
                    {r.buffer_minutes ? ` · ${r.buffer_minutes} min turnaround` : ''}
                    {r.instant_confirm ? ' · confirms instantly' : ''}
                  </p>
                </div>
                <button
                  className={quiet}
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      db.from('bookable_resource').update({ active: !r.active }).eq('id', r.id),
                    )
                  }
                >
                  {r.active ? 'Pause' : 'Resume'}
                </button>
              </li>
            ))}
          </ul>
        )}
        <AddResource busy={busy} db={db} run={run} merchantId={merchantId} />
      </section>

      {resources.some((r) => r.model === 'capacity') ? (
        <AddSession resources={resources} slots={slots} busy={busy} db={db} run={run} />
      ) : null}
    </div>
  );
}

type Run = (fn: () => PromiseLike<{ error: { message: string } | null }>) => Promise<boolean>;

function BookingList({
  items,
  byId,
  busy,
  onStatus,
}: {
  items: Booking[];
  byId: Map<string, Resource>;
  busy: boolean;
  onStatus: (id: string, status: Booking['status']) => void;
}) {
  return (
    <ul className="divide-border divide-y">
      {items.map((b) => (
        <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="text-[0.875rem] font-extrabold">
              {byId.get(b.resource_id)?.name ?? 'Booking'}
              {b.quantity > 1 ? ` × ${b.quantity}` : ''}{' '}
              <span
                className={`ml-1 rounded-full px-2 py-0.5 text-[0.625rem] font-extrabold uppercase ${STATUS_TONE[b.status]}`}
              >
                {b.status === 'blocked' ? 'blocked' : b.status.replace('_', ' ')}
              </span>
            </p>
            <p className="text-muted text-[0.75rem] font-semibold">
              {fmt(b.starts_at)} → {fmt(b.ends_at)}
              {b.guest_name ? ` · ${b.guest_name}` : ''}
              {b.guest_phone ? ` · ${b.guest_phone}` : ''}
              {b.status !== 'blocked' ? ` · ${kes(b.total_cents)}` : ''}
              {b.notes ? ` · ${b.notes}` : ''}
            </p>
            <p className="text-muted text-[0.6875rem] font-bold">{b.reference}</p>
          </div>
          <div className="flex gap-2">
            {b.status === 'pending' ? (
              <>
                <button
                  className={primary}
                  disabled={busy}
                  onClick={() => onStatus(b.id, 'confirmed')}
                >
                  Confirm
                </button>
                <button
                  className={quiet}
                  disabled={busy}
                  onClick={() => onStatus(b.id, 'cancelled')}
                >
                  Decline
                </button>
              </>
            ) : null}
            {b.status === 'confirmed' ? (
              <>
                <button
                  className={quiet}
                  disabled={busy}
                  onClick={() => onStatus(b.id, 'completed')}
                >
                  Done
                </button>
                <button className={quiet} disabled={busy} onClick={() => onStatus(b.id, 'no_show')}>
                  No-show
                </button>
                <button
                  className={quiet}
                  disabled={busy}
                  onClick={() => onStatus(b.id, 'cancelled')}
                >
                  Cancel
                </button>
              </>
            ) : null}
            {b.status === 'blocked' ? (
              <button className={quiet} disabled={busy} onClick={() => onStatus(b.id, 'cancelled')}>
                Unblock
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function AddResource({
  busy,
  db,
  run,
  merchantId,
}: {
  busy: boolean;
  db: SupabaseClient;
  run: Run;
  merchantId: string;
}) {
  const [model, setModel] = React.useState<'exclusive' | 'capacity'>('exclusive');
  const [name, setName] = React.useState('');
  const [price, setPrice] = React.useState('');
  const [unit, setUnit] = React.useState('booking');
  const [quote, setQuote] = React.useState(false);
  const [capacity, setCapacity] = React.useState('10');
  const [buffer, setBuffer] = React.useState('0');
  const [instant, setInstant] = React.useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run(() =>
      db.from('bookable_resource').insert({
        merchant_id: merchantId,
        model,
        name: name.trim(),
        price_cents: quote || price === '' ? null : Math.round(Number(price) * 100),
        price_unit: model === 'capacity' ? 'seat' : unit,
        quote_required: quote,
        capacity: model === 'capacity' ? Math.max(1, Number(capacity) || 1) : 1,
        buffer_minutes: model === 'exclusive' ? Math.max(0, Number(buffer) || 0) : 0,
        instant_confirm: instant,
      }),
    );
    if (ok) {
      setName('');
      setPrice('');
    }
  }

  return (
    <form onSubmit={add} className="bg-bg grid gap-3 rounded-lg p-3 sm:grid-cols-2">
      <div>
        <span className={label}>Type</span>
        <select
          className={input}
          value={model}
          onChange={(e) => setModel(e.target.value as typeof model)}
        >
          <option value="exclusive">One at a time (car, room, provider)</option>
          <option value="capacity">Sessions with seats (tour, class)</option>
        </select>
      </div>
      <div>
        <span className={label}>Name</span>
        <input className={input} required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <span className={label}>Price (KES)</span>
        <input
          className={input}
          type="number"
          min="0"
          disabled={quote}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </div>
      {model === 'exclusive' ? (
        <div>
          <span className={label}>Charged per</span>
          <select className={input} value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="booking">Booking</option>
            <option value="hour">Hour</option>
            <option value="day">Day</option>
          </select>
        </div>
      ) : (
        <div>
          <span className={label}>Seats per session</span>
          <input
            className={input}
            type="number"
            min="1"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </div>
      )}
      {model === 'exclusive' ? (
        <div>
          <span className={label}>Turnaround after each booking (min)</span>
          <input
            className={input}
            type="number"
            min="0"
            value={buffer}
            onChange={(e) => setBuffer(e.target.value)}
          />
        </div>
      ) : null}
      <div className="flex flex-col justify-end gap-2 text-[0.8125rem] font-bold">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={quote} onChange={(e) => setQuote(e.target.checked)} />
          Price on request (I quote each booking)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={instant}
            disabled={quote}
            onChange={(e) => setInstant(e.target.checked)}
          />
          Confirm bookings instantly
        </label>
      </div>
      <div className="sm:col-span-2">
        <button className={primary} disabled={busy || !name.trim()}>
          Add
        </button>
      </div>
    </form>
  );
}

function AddSession({
  resources,
  slots,
  busy,
  db,
  run,
}: {
  resources: Resource[];
  slots: Slot[];
  busy: boolean;
  db: SupabaseClient;
  run: Run;
}) {
  const sessions = resources.filter((r) => r.model === 'capacity');
  const [rid, setRid] = React.useState(sessions[0]?.id ?? '');
  const [start, setStart] = React.useState('');
  const [end, setEnd] = React.useState('');

  return (
    <section className={card}>
      <h2 className="mb-3 text-[0.9375rem] font-extrabold">Sessions and departures</h2>
      {slots.length > 0 ? (
        <ul className="mb-4 space-y-1 text-[0.8125rem] font-semibold">
          {slots.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2">
              <span>
                {resources.find((r) => r.id === s.resource_id)?.name} · {fmt(s.starts_at)}
                {s.status !== 'open' ? ` (${s.status})` : ''}
              </span>
              {s.status === 'open' ? (
                <button
                  className={quiet}
                  disabled={busy}
                  onClick={() =>
                    run(() => db.from('booking_slot').update({ status: 'closed' }).eq('id', s.id))
                  }
                >
                  Close
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="bg-bg grid gap-3 rounded-lg p-3 sm:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() =>
            db
              .from('booking_slot')
              .insert({ resource_id: rid, starts_at: toIso(start), ends_at: toIso(end) }),
          );
        }}
      >
        <div>
          <span className={label}>For</span>
          <select className={input} value={rid} onChange={(e) => setRid(e.target.value)}>
            {sessions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Starts</span>
          <input
            className={input}
            type="datetime-local"
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div>
          <span className={label}>Ends</span>
          <input
            className={input}
            type="datetime-local"
            required
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <button className={primary} disabled={busy || !start || !end}>
            Add session
          </button>
        </div>
      </form>
    </section>
  );
}

function ManualBooking({
  resources,
  slots,
  busy,
  db,
  run,
}: {
  resources: Resource[];
  slots: Slot[];
  busy: boolean;
  db: SupabaseClient;
  run: Run;
}) {
  const [rid, setRid] = React.useState(resources[0]?.id ?? '');
  const [start, setStart] = React.useState('');
  const [end, setEnd] = React.useState('');
  const [slotId, setSlotId] = React.useState('');
  const [qty, setQty] = React.useState('1');
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const r = resources.find((x) => x.id === rid);
  const openSlots = slots.filter((s) => s.resource_id === rid && s.status === 'open');

  return (
    <form
      className={`${card} grid gap-3 sm:grid-cols-2`}
      onSubmit={(e) => {
        e.preventDefault();
        void run(() =>
          db.rpc('rpc_booking_create', {
            p_resource_id: rid,
            p_starts_at: r?.model === 'exclusive' && start ? toIso(start) : null,
            p_ends_at: r?.model === 'exclusive' && end ? toIso(end) : null,
            p_slot_id: r?.model === 'capacity' ? slotId || null : null,
            p_quantity: Number(qty) || 1,
            p_guest_name: name || null,
            p_guest_phone: phone || null,
          }),
        );
      }}
    >
      <h2 className="text-[0.9375rem] font-extrabold sm:col-span-2">Add a booking yourself</h2>
      <div className="sm:col-span-2">
        <span className={label}>What</span>
        <select className={input} value={rid} onChange={(e) => setRid(e.target.value)}>
          {resources.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </div>
      {r?.model === 'capacity' ? (
        <>
          <div>
            <span className={label}>Session</span>
            <select
              className={input}
              required
              value={slotId}
              onChange={(e) => setSlotId(e.target.value)}
            >
              <option value="">Choose</option>
              {openSlots.map((s) => (
                <option key={s.id} value={s.id}>
                  {fmt(s.starts_at)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className={label}>Seats</span>
            <input
              className={input}
              type="number"
              min="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
        </>
      ) : (
        <>
          <div>
            <span className={label}>From</span>
            <input
              className={input}
              type="datetime-local"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div>
            <span className={label}>Until</span>
            <input
              className={input}
              type="datetime-local"
              required={!r?.duration_minutes}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
        </>
      )}
      <div>
        <span className={label}>Guest name</span>
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <span className={label}>Guest phone</span>
        <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <button className={primary} disabled={busy}>
          Book it
        </button>
      </div>
    </form>
  );
}

function BlockTime({
  resources,
  busy,
  db,
  run,
}: {
  resources: Resource[];
  busy: boolean;
  db: SupabaseClient;
  run: Run;
}) {
  const options = resources.filter((r) => r.model === 'exclusive');
  const [rid, setRid] = React.useState(options[0]?.id ?? '');
  const [start, setStart] = React.useState('');
  const [end, setEnd] = React.useState('');
  const [why, setWhy] = React.useState('');

  if (options.length === 0) return null;
  return (
    <form
      className={`${card} grid gap-3 sm:grid-cols-2`}
      onSubmit={(e) => {
        e.preventDefault();
        void run(() =>
          db.rpc('rpc_booking_block', {
            p_resource_id: rid,
            p_starts_at: toIso(start),
            p_ends_at: toIso(end),
            p_notes: why || null,
          }),
        );
      }}
    >
      <h2 className="text-[0.9375rem] font-extrabold sm:col-span-2">Block time off</h2>
      <p className="text-muted text-[0.75rem] font-semibold sm:col-span-2">
        For servicing, holidays or anything that makes it unavailable.
      </p>
      <div className="sm:col-span-2">
        <span className={label}>What</span>
        <select className={input} value={rid} onChange={(e) => setRid(e.target.value)}>
          {options.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <span className={label}>From</span>
        <input
          className={input}
          type="datetime-local"
          required
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </div>
      <div>
        <span className={label}>Until</span>
        <input
          className={input}
          type="datetime-local"
          required
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <span className={label}>Reason</span>
        <input className={input} value={why} onChange={(e) => setWhy(e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <button className={primary} disabled={busy}>
          Block
        </button>
      </div>
    </form>
  );
}
