'use client';

import * as React from 'react';

import { cancelBooking, connectCalendar, removeCalendar, saveBooking } from '@/app/host/actions';

import {
  Actions,
  Drawer,
  Field,
  Grid,
  Said,
  Select,
  Submit,
  Text,
  useAction,
} from './form';

const SOURCES = [
  { value: 'entered', label: 'Entered by you' },
  { value: 'walk_in', label: 'Walk-in / direct' },
  { value: 'airbnb', label: 'Airbnb' },
  { value: 'booking_com', label: 'Booking.com' },
  { value: 'pms', label: 'PMS' },
];

const PROVIDERS = [
  { value: 'airbnb', label: 'Airbnb' },
  { value: 'booking_com', label: 'Booking.com' },
  { value: 'ical', label: 'Another iCal feed' },
  { value: 'pms_csv', label: 'Hotel PMS (CSV upload)' },
];

/** `2026-10-09T14:00` for a datetime-local, in Nairobi. */
function localInput(d: Date): string {
  const s = d.toLocaleString('sv-SE', { timeZone: 'Africa/Nairobi' });
  return s.slice(0, 16).replace(' ', 'T');
}

export function AddBooking({
  hostId,
  units,
}: {
  hostId: string;
  units: { id: string; name: string; property_name: string | null }[];
}) {
  const [open, setOpen] = React.useState(false);
  const now = new Date();
  const [form, setForm] = React.useState({
    unitId: units[0]?.id ?? '',
    guestFirstName: '',
    checkIn: localInput(new Date(now.getTime() + 86400000)),
    checkOut: localInput(new Date(now.getTime() + 4 * 86400000)),
    adults: '2',
    children: '0',
    source: 'entered',
    phone: '',
    rateKes: '',
  });
  const { pending, outcome, run } = useAction();
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-ink rounded-lg px-4 py-2 text-[0.8125rem] font-extrabold text-white"
      >
        + Add booking
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Add a booking"
        lead="A stay you took directly, or one a calendar has not picked up. Linking it to a unit is what lets an order be attributed to a guest rather than a room."
      >
        {units.length === 0 ? (
          <p className="text-muted text-[0.8125rem] font-semibold leading-[1.7]">
            You have no units yet. Add one in Units &amp; Rooms first — a booking has to sit
            somewhere.
          </p>
        ) : (
          <div className="space-y-4">
            <Grid>
              <Field label="Unit" wide>
                <Select
                  value={form.unitId}
                  onChange={(e) => set('unitId')(e.target.value)}
                  options={units.map((u) => ({
                    value: u.id,
                    label: `${u.name}${u.property_name ? ` · ${u.property_name}` : ''}`,
                  }))}
                />
              </Field>
              <Field
                label="Guest first name"
                hint="First name only. There is no column for a surname on a stay."
              >
                <Text
                  value={form.guestFirstName}
                  onChange={(e) => set('guestFirstName')(e.target.value)}
                  placeholder="Sarah"
                />
              </Field>
              <Field label="Source">
                <Select
                  value={form.source}
                  onChange={(e) => set('source')(e.target.value)}
                  options={SOURCES}
                />
              </Field>
              <Field label="Check-in">
                <Text
                  type="datetime-local"
                  value={form.checkIn}
                  onChange={(e) => set('checkIn')(e.target.value)}
                />
              </Field>
              <Field label="Check-out">
                <Text
                  type="datetime-local"
                  value={form.checkOut}
                  onChange={(e) => set('checkOut')(e.target.value)}
                />
              </Field>
              <Field label="Adults">
                <Text
                  value={form.adults}
                  onChange={(e) => set('adults')(e.target.value)}
                  inputMode="numeric"
                />
              </Field>
              <Field label="Children">
                <Text
                  value={form.children}
                  onChange={(e) => set('children')(e.target.value)}
                  inputMode="numeric"
                />
              </Field>
              <Field
                label="Phone"
                hint="Optional, and used once: to send the guest the unit's QR link before they arrive. Masked everywhere afterwards, including exports."
                wide
              >
                <Text
                  value={form.phone}
                  onChange={(e) => set('phone')(e.target.value)}
                  placeholder="+254 7.."
                />
              </Field>
              <Field
                label="Nightly rate"
                hint="Optional, for your own records. NexG does not bill on it."
                wide
              >
                <Text
                  value={form.rateKes}
                  onChange={(e) => set('rateKes')(e.target.value)}
                  inputMode="numeric"
                  placeholder="KES per night"
                />
              </Field>
            </Grid>

            <Said outcome={outcome} />

            <Actions>
              <Submit
                type="button"
                pending={pending}
                onClick={() =>
                  run(
                    () =>
                      saveBooking({
                        hostId,
                        ...form,
                        /* datetime-local has no zone; the host is
                           typing Nairobi time, so say so rather
                           than letting the server guess UTC. */
                        checkIn: `${form.checkIn}:00+03:00`,
                        checkOut: `${form.checkOut}:00+03:00`,
                      }),
                    (o) => {
                      if (o.ok) setForm((f) => ({ ...f, guestFirstName: '', phone: '' }));
                    },
                  )
                }
              >
                Save booking
              </Submit>
              <Submit type="button" tone="quiet" onClick={() => setOpen(false)}>
                Close
              </Submit>
            </Actions>

            <p className="text-muted-light text-[0.6875rem] font-semibold leading-[1.6]">
              An overlap with another booking in this unit is saved and flagged, not refused. Two
              bookings in one room happens; picking one for you is how a real guest disappears.
            </p>
          </div>
        )}
      </Drawer>
    </>
  );
}

export function CancelBooking({ stayId, guest }: { stayId: string; guest: string }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const { pending, outcome, run } = useAction();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-border-strong text-muted hover:text-ink rounded-md border px-2.5 py-1 text-[0.6875rem] font-extrabold transition-colors"
      >
        Cancel
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={`Cancel ${guest}'s booking`}
        lead="The stay is marked cancelled and stops counting towards occupancy. Orders already placed during it keep their attribution."
      >
        <div className="space-y-4">
          <Field label="Reason" hint="Kept on the record.">
            <Text
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Guest cancelled"
            />
          </Field>
          <Said outcome={outcome} />
          <Actions>
            <Submit
              type="button"
              tone="danger"
              pending={pending}
              onClick={() =>
                run(
                  () => cancelBooking(stayId, reason),
                  (o) => {
                    if (o.ok) setOpen(false);
                  },
                )
              }
            >
              Cancel the booking
            </Submit>
            <Submit type="button" tone="quiet" onClick={() => setOpen(false)}>
              Keep it
            </Submit>
          </Actions>
        </div>
      </Drawer>
    </>
  );
}

/* ═══════════════════════════════════════════════ calendars */

export interface CalendarRow {
  id: string;
  provider: string;
  label: string | null;
  property_name: string | null;
  status: string;
  last_synced_at: string | null;
  last_error: string | null;
  stays_created: number;
}

export function Calendars({
  hostId,
  connections,
  properties,
}: {
  hostId: string;
  connections: CalendarRow[];
  properties: { id: string; name: string }[];
}) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    provider: 'airbnb',
    url: '',
    label: '',
    propertyId: '',
  });
  const { pending, outcome, run } = useAction();
  const rm = useAction();
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <section className="border-border bg-surface rounded-xl border">
      <div className="border-border border-b px-4 py-3">
        <h2 className="text-[0.875rem] font-extrabold tracking-tight">Connected calendars</h2>
      </div>

      {connections.length === 0 ? (
        <p className="text-muted-light px-4 py-5 text-center text-[0.8125rem] font-semibold leading-[1.65]">
          None connected. Paste an iCal link from Airbnb or Booking.com and we will pull dates,
          units and guest first names — never a phone, an email or a payment detail.
        </p>
      ) : (
        <div className="divide-border divide-y">
          {connections.map((c) => (
            <div key={c.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.8125rem] font-extrabold">
                    {PROVIDERS.find((p) => p.value === c.provider)?.label ?? c.provider}
                    {c.label ? <span className="text-muted-light"> · {c.label}</span> : null}
                  </p>
                  <p className="text-muted-light mt-0.5 text-[0.6875rem] font-semibold">
                    {c.property_name ?? 'All properties'} ·{' '}
                    {c.stays_created > 0
                      ? `${c.stays_created} bookings pulled`
                      : 'nothing pulled yet'}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${
                    c.status === 'ok'
                      ? 'bg-success/10 text-success'
                      : c.status === 'failing'
                        ? 'bg-danger/10 text-danger'
                        : 'bg-warn/10 text-warn'
                  }`}
                >
                  {c.status === 'ok'
                    ? 'Syncing'
                    : c.status === 'failing'
                      ? 'Failing'
                      : 'Waiting for first sync'}
                </span>
              </div>
              {c.last_error ? (
                <p className="text-danger mt-1 text-[0.6875rem] font-semibold">{c.last_error}</p>
              ) : null}
              <button
                type="button"
                onClick={() => rm.run(() => removeCalendar(c.id))}
                disabled={rm.pending}
                className="text-muted-light hover:text-danger mt-1.5 text-[0.6875rem] font-extrabold disabled:opacity-50"
              >
                Disconnect
              </button>
            </div>
          ))}
        </div>
      )}

      {rm.outcome?.message ? (
        <p className="text-muted border-border border-t px-4 py-2.5 text-[0.6875rem] font-semibold">
          {rm.outcome.message}
        </p>
      ) : null}

      <div className="border-border border-t px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border-border-strong w-full rounded-lg border px-4 py-2 text-[0.8125rem] font-extrabold"
        >
          + Add calendar
        </button>
      </div>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Connect a calendar"
        lead="Airbnb and Booking.com both publish an iCal link per listing. We read dates, the unit and a first name — nothing else is in the feed and nothing else would be imported if it were."
      >
        <div className="space-y-4">
          <Field label="Where from">
            <Select
              value={form.provider}
              onChange={(e) => set('provider')(e.target.value)}
              options={PROVIDERS}
            />
          </Field>

          {form.provider === 'pms_csv' ? (
            <p className="bg-gold-soft text-gold-text rounded-lg px-3 py-2.5 text-[0.75rem] font-semibold leading-[1.6]">
              PMS imports are done by host ops from your daily export, with a column map and a
              row-by-row report. Connect it here and they will be in touch to set the mapping up.
            </p>
          ) : (
            <Field
              label="iCal link"
              hint="In Airbnb: Calendar → Availability → Sync calendars → Export. It ends in .ics."
            >
              <Text
                value={form.url}
                onChange={(e) => set('url')(e.target.value)}
                placeholder="https://www.airbnb.com/calendar/ical/12345.ics?s=..."
              />
            </Field>
          )}

          <Field label="Label" hint="Optional. Useful when you have several listings.">
            <Text
              value={form.label}
              onChange={(e) => set('label')(e.target.value)}
              placeholder="Riverside 2-bed"
            />
          </Field>

          {properties.length > 1 ? (
            <Field label="Property">
              <Select
                value={form.propertyId}
                onChange={(e) => set('propertyId')(e.target.value)}
                options={[
                  { value: '', label: 'All properties' },
                  ...properties.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            </Field>
          ) : null}

          <Said outcome={outcome} />

          <Actions>
            <Submit
              type="button"
              pending={pending}
              onClick={() =>
                run(
                  () => connectCalendar({ hostId, ...form }),
                  (o) => {
                    if (o.ok) setForm((f) => ({ ...f, url: '', label: '' }));
                  },
                )
              }
            >
              Connect
            </Submit>
            <Submit type="button" tone="quiet" onClick={() => setOpen(false)}>
              Close
            </Submit>
          </Actions>

          <p className="text-muted-light text-[0.6875rem] font-semibold leading-[1.6]">
            It saves as waiting, not as connected. The sync worker runs separately, and a green
            tick before anything had actually read your feed would have you stop entering bookings
            by hand for nothing.
          </p>
        </div>
      </Drawer>
    </section>
  );
}
