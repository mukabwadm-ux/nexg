'use client';

import { Briefcase, Home, Info, MapPin } from 'lucide-react';
import * as React from 'react';

import { ACCURACY_NEEDS_CONFIRMING_M, accuracyBand } from './geolocation';
import { useLocation } from './store';
import type { Place } from './types';

/**
 * Confirm your spot.
 *
 * The step between "roughly here" and an address a rider can
 * find. Addresses, not distance, are what make deliveries late
 * in Nairobi — an estate name and a GPS circle are not a gate.
 *
 * Three things are deliberate:
 *
 * The accuracy circle is drawn and its radius is stated. A
 * laptop fix is routinely several hundred metres wide, and a
 * visitor who can see that moves the pin; one shown a confident
 * marker does not.
 *
 * Above 100 m the pin cannot be confirmed as-is — it has to be
 * moved or explicitly acknowledged. That threshold is the line
 * between an address and a neighbourhood.
 *
 * The free-text fields are the ones no geocoder returns: the
 * gate number, the floor, the landmark, the phone to ring at the
 * gate. They travel to the rider verbatim.
 */
export function ConfirmPin({
  candidate,
  onConfirm,
  onCancel,
}: {
  candidate: Place;
  onConfirm: (place: Place) => Promise<void> | void;
  onCancel: () => void;
}) {
  const { actions } = useLocation();
  const [place, setPlace] = React.useState<Place>(candidate);
  const [unit, setUnit] = React.useState(candidate.unit_no ?? '');
  const [gate, setGate] = React.useState(candidate.gate_no ?? '');
  const [landmark, setLandmark] = React.useState(candidate.landmark ?? '');
  const [phone, setPhone] = React.useState(candidate.rider_phone ?? '');
  const [saveAs, setSaveAs] = React.useState<'Home' | 'Work' | 'Just this once'>('Just this once');
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [nudged, setNudged] = React.useState(false);

  const accuracy = place.accuracy_m ?? 0;
  const coarse = accuracy > ACCURACY_NEEDS_CONFIRMING_M;
  const blocked = coarse && !nudged && !acknowledged;

  async function nudge(dLat: number, dLng: number) {
    const next = { ...place, lat: place.lat + dLat, lng: place.lng + dLng };
    setNudged(true);
    const cover = await actions.coverage(next.lat, next.lng);
    setPlace({ ...next, ...cover, accuracy_m: Math.min(accuracy, 25) } as Place);
  }

  async function confirm() {
    setSaving(true);
    const label =
      saveAs === 'Just this once'
        ? (place.address_line ?? place.zone ?? 'Delivery address')
        : saveAs;

    const finished: Place = {
      ...place,
      label,
      unit_no: unit.trim() || null,
      gate_no: gate.trim() || null,
      landmark: landmark.trim() || null,
      rider_phone: phone.trim() || null,
    };

    /* Written to the account when there is one; an anonymous
       visitor's copy stays in their browser. The RPC answers the
       same shape either way so there is one path here. */
    try {
      await actions.confirm({
        ...finished,
        save: saveAs !== 'Just this once',
        consent_state: 'granted',
      });
    } catch {
      /* The place still works for this visit even if it could not
         be stored. Losing a save is not a reason to stop somebody
         ordering. */
    }

    await onConfirm(finished);
    setSaving(false);
  }

  return (
    <div className="border-border bg-surface mt-3 overflow-hidden rounded-2xl border">
      {/* ─────────────────────────────────────── the circle, stated */}
      <div className="border-border bg-bg relative border-b px-4 py-3">
        <p className="text-muted flex flex-wrap items-center gap-1.5 text-[0.75rem] font-semibold">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Browser accuracy{' '}
          <span className="text-ink font-extrabold tabular-nums">±{Math.round(accuracy)} m</span>
          <span className="text-muted-light">
            · {accuracyBand(accuracy) === 'exact' ? 'precise enough' : 'please confirm the exact spot'}
          </span>
        </p>

        <div className="relative mt-3 flex h-36 items-center justify-center overflow-hidden rounded-xl bg-[color:var(--color-border)]/30">
          {/* The accuracy ring, drawn to scale against the pin so the
              uncertainty is a size rather than a number. */}
          <span
            aria-hidden="true"
            className="bg-ink/10 ring-ink/20 absolute rounded-full ring-1"
            style={{
              width: `${Math.min(140, 28 + accuracy / 12)}px`,
              height: `${Math.min(140, 28 + accuracy / 12)}px`,
            }}
          />
          <span className="bg-gold ring-surface relative flex h-8 w-8 items-center justify-center rounded-full ring-4">
            <MapPin className="text-ink h-4 w-4" aria-hidden="true" />
          </span>
          <span className="bg-ink absolute bottom-3 rounded-full px-3 py-1 text-[0.6875rem] font-extrabold text-white">
            Move the pin to your gate or entrance
          </span>
        </div>

        {/* Keyboard-reachable nudges. A drag-only control is
            unusable without a mouse, and this is on the path to
            paying for something. */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
            Nudge
          </span>
          {(
            [
              ['North', 0.0002, 0],
              ['South', -0.0002, 0],
              ['East', 0, 0.0002],
              ['West', 0, -0.0002],
            ] as const
          ).map(([label, dLat, dLng]) => (
            <button
              key={label}
              type="button"
              onClick={() => void nudge(dLat, dLng)}
              className="border-border-strong bg-surface hover:border-ink rounded-full border px-2.5 py-1 text-[0.6875rem] font-extrabold transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ─────────────────────────────────── what a rider needs */}
      <div className="space-y-2.5 p-4">
        <div>
          <p className="text-sm font-extrabold">{place.address_line ?? 'Your pinned spot'}</p>
          <p className="text-muted-light text-[0.75rem] font-semibold">
            {[place.zone, place.city, place.plus_code].filter(Boolean).join(' · ') ||
              `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`}
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Apartment / floor / room" value={unit} onChange={setUnit} />
          <Field label="Gate or house number" value={gate} onChange={setGate} />
        </div>
        <Field
          label="Landmark for the rider (e.g. opposite the chemist)"
          value={landmark}
          onChange={setLandmark}
        />
        <Field label="Phone for the rider (masked to riders)" value={phone} onChange={setPhone} />

        <div>
          <p className="text-muted-light mb-1.5 text-[0.625rem] font-extrabold uppercase tracking-[0.12em]">
            Save as
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(['Home', 'Work', 'Just this once'] as const).map((option) => {
              const Icon = option === 'Home' ? Home : option === 'Work' ? Briefcase : null;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSaveAs(option)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.75rem] font-extrabold transition-colors ${
                    saveAs === option
                      ? 'bg-ink border-ink text-white'
                      : 'border-border-strong bg-surface hover:border-ink'
                  }`}
                >
                  {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                  {option}
                </button>
              );
            })}
          </div>
        </div>

        {/* Coverage, before anything is saved rather than at checkout. */}
        {place.coverage === 'covered' ? (
          <p className="text-success text-[0.75rem] font-extrabold">
            We deliver here{place.zone ? ` · ${place.zone}` : ''}
            {place.eta_min && place.eta_max ? ` · ${place.eta_min}–${place.eta_max} min typical` : ''}
          </p>
        ) : place.coverage === 'unknown' ? null : (
          <p className="text-danger text-[0.75rem] font-extrabold">{place.message}</p>
        )}

        {blocked ? (
          <label className="border-gold/40 bg-gold/5 flex items-start gap-2 rounded-lg border px-3 py-2">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5"
            />
            <span className="text-[0.75rem] font-semibold">
              This pin is only accurate to about {Math.round(accuracy)} m — roughly a city block.
              Move it to your gate, or tick to confirm it is close enough.
            </span>
          </label>
        ) : null}

        <p className="text-muted-light text-[0.6875rem] font-semibold">
          Saved places stay on this device for 90 days, and in your account if you sign in. Only the
          pin you confirm is stored — never a history of where you have been.
        </p>

        <button
          type="button"
          onClick={() => void confirm()}
          disabled={blocked || saving}
          className="bg-ink w-full rounded-xl py-3 text-sm font-extrabold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Deliver here'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border-border-strong hover:border-ink w-full rounded-xl border py-2.5 text-sm font-extrabold transition-colors"
        >
          Back to search
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        className="border-border focus:border-ink placeholder:text-muted-light w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold outline-none transition-colors"
      />
    </label>
  );
}
