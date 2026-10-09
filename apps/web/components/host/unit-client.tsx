'use client';

import * as React from 'react';

import { saveUnit } from '@/app/host/actions';

import {
  Actions,
  Area,
  Drawer,
  Field,
  Grid,
  Said,
  Select,
  Submit,
  Text,
  useAction,
} from './form';
import { HANDOFFS } from './vocab';


export interface UnitForEdit {
  id: string;
  name: string;
  label_public: string | null;
  floor: string | null;
  handoff: string | null;
  caretaker_name: string | null;
  property_id: string | null;
  bedrooms: number | null;
  max_guests: number | null;
}

export function AddUnit({
  hostId,
  properties,
  presetProperty,
}: {
  hostId: string;
  properties: { id: string; name: string }[];
  presetProperty?: string;
}) {
  return (
    <UnitDrawer
      hostId={hostId}
      properties={properties}
      presetProperty={presetProperty}
      trigger={
        <span className="bg-ink inline-block rounded-lg px-4 py-2 text-[0.8125rem] font-extrabold text-white">
          + Add unit
        </span>
      }
    />
  );
}

export function EditUnit({
  hostId,
  unit,
  properties,
}: {
  hostId: string;
  unit: UnitForEdit;
  properties: { id: string; name: string }[];
}) {
  return (
    <UnitDrawer
      hostId={hostId}
      unit={unit}
      properties={properties}
      trigger={
        <span className="border-border-strong text-muted hover:text-ink inline-block rounded-md border px-2.5 py-1 text-[0.6875rem] font-extrabold transition-colors">
          Edit
        </span>
      }
    />
  );
}

/**
 * The unit form.
 *
 * The public name is separate from the internal one on purpose.
 * A host calls it B0903; a guest reading a card in a strange
 * flat needs "Apartment B0903, Riverside" to know a delivery is
 * meant for them. The card cannot be generated without it, and
 * the field says so rather than letting that surface later as a
 * refusal in a different module.
 */
function UnitDrawer({
  hostId,
  unit,
  properties,
  presetProperty,
  trigger,
}: {
  hostId: string;
  unit?: UnitForEdit;
  properties: { id: string; name: string }[];
  presetProperty?: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    name: unit?.name ?? '',
    labelPublic: unit?.label_public ?? '',
    propertyId: unit?.property_id ?? presetProperty ?? properties[0]?.id ?? '',
    floor: unit?.floor ?? '',
    handoff: unit?.handoff ?? '',
    handoffNote: '',
    caretakerName: unit?.caretaker_name ?? '',
    addressLine: '',
    bedrooms: unit?.bedrooms ? String(unit.bedrooms) : '',
    maxGuests: unit?.max_guests ? String(unit.max_guests) : '',
  });
  const { pending, outcome, run } = useAction();
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        {trigger}
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={unit ? `Edit ${unit.name}` : 'Add a unit'}
        lead={
          unit
            ? 'What a rider is told at the door comes from here. A change applies to the next delivery, never one already on its way.'
            : 'A flat, a room or a studio. It gets its own address, hand-off rule and cards, and goes live on its own readiness.'
        }
      >
        <div className="space-y-4">
          <Grid>
            <Field label="Property">
              <Select
                value={form.propertyId}
                onChange={(e) => set('propertyId')(e.target.value)}
                options={
                  properties.length > 0
                    ? properties.map((p) => ({ value: p.id, label: p.name }))
                    : [{ value: '', label: 'No properties yet' }]
                }
              />
            </Field>
            <Field label="Unit name" hint="What you call it. B0903, Room 12.">
              <Text
                value={form.name}
                onChange={(e) => set('name')(e.target.value)}
                placeholder="B0903"
              />
            </Field>
            <Field
              label="Name guests see"
              wide
              hint="Printed on the card and shown to the rider. A card cannot be generated without it — a guest in a strange flat needs more than a door number to know a delivery is theirs."
            >
              <Text
                value={form.labelPublic}
                onChange={(e) => set('labelPublic')(e.target.value)}
                placeholder="Apartment B0903 · Riverside"
              />
            </Field>
            <Field label="Floor">
              <Text
                value={form.floor}
                onChange={(e) => set('floor')(e.target.value)}
                placeholder="9"
              />
            </Field>
            <Field label="Bedrooms">
              <Text
                value={form.bedrooms}
                onChange={(e) => set('bedrooms')(e.target.value)}
                inputMode="numeric"
                placeholder="2"
              />
            </Field>
            <Field label="Sleeps">
              <Text
                value={form.maxGuests}
                onChange={(e) => set('maxGuests')(e.target.value)}
                inputMode="numeric"
                placeholder="4"
              />
            </Field>
            <Field label="Hand-off rule">
              <Select
                value={form.handoff}
                onChange={(e) => set('handoff')(e.target.value)}
                options={HANDOFFS}
              />
            </Field>
            {form.handoff === 'caretaker' || form.handoff === 'leave_with_askari' ? (
              <Field
                label={form.handoff === 'caretaker' ? 'Caretaker name' : 'Askari name'}
                wide
                hint="They are sent an SMS to confirm. Until they do, the unit is flagged — a rule naming somebody who is not expecting anyone is worse than no rule."
              >
                <Text
                  value={form.caretakerName}
                  onChange={(e) => set('caretakerName')(e.target.value)}
                  placeholder="Joseph"
                />
              </Field>
            ) : null}
            <Field
              label="Address"
              wide
              hint="Where a rider actually goes. The building, the road and anything a map will not say."
            >
              <Text
                value={form.addressLine}
                onChange={(e) => set('addressLine')(e.target.value)}
                placeholder="Riverside Drive, opposite the petrol station"
              />
            </Field>
            <Field
              label="Note for the rider"
              wide
              hint="Shown on the job card after they accept. Do not put a gate code here — it would sit in the app of every rider who ever delivers to this unit."
            >
              <Area
                value={form.handoffNote}
                onChange={(e) => set('handoffNote')(e.target.value)}
                placeholder="Use the side gate after 8pm; the main one is locked."
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
                  () => saveUnit({ hostId, unitId: unit?.id ?? null, ...form }),
                  (o) => {
                    /* Open, with the confirmation, and the
                       property and hand-off kept — adding six
                       flats in one block means six saves with
                       two fields changing. */
                    if (o.ok && !unit) {
                      setForm((f) => ({ ...f, name: '', labelPublic: '', floor: '' }));
                    }
                  },
                )
              }
            >
              {unit ? 'Save changes' : 'Add unit'}
            </Submit>
            <Submit type="button" tone="quiet" onClick={() => setOpen(false)}>
              Close
            </Submit>
          </Actions>
        </div>
      </Drawer>
    </>
  );
}
