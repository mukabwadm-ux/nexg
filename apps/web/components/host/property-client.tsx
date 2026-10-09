'use client';

import * as React from 'react';

import { deleteProperty, saveProperty } from '@/app/host/actions';

import {
  Actions,
  Area,
  ConfirmByName,
  Drawer,
  Field,
  Grid,
  Said,
  Select,
  Submit,
  Text,
  useAction,
} from './form';
import { KINDS } from './vocab';

/**
 * Adding and editing a property.
 *
 * Address and map pin are deliberately not on this form. A host
 * adding four buildings in one sitting should not have to find
 * four pins first — the pin belongs to the unit, which is what
 * a rider actually navigates to, and the readiness checks ask
 * for it before anything goes live.
 */


export interface PropertyForEdit {
  id: string;
  name: string;
  kind: string;
  area: string | null;
  floors: number | null;
  check_in_from: string | null;
  check_out_by: string | null;
  units: number;
  units_live: number;
}

export function AddProperty({ hostId }: { hostId: string }) {
  return (
    <PropertyDrawer
      hostId={hostId}
      trigger={
        <span className="bg-ink inline-block rounded-lg px-4 py-2 text-[0.8125rem] font-extrabold text-white">
          + Add property
        </span>
      }
    />
  );
}

export function EditProperty({
  hostId,
  property,
}: {
  hostId: string;
  property: PropertyForEdit;
}) {
  return (
    <PropertyDrawer
      hostId={hostId}
      property={property}
      trigger={
        <span className="border-border-strong text-muted hover:text-ink inline-block rounded-md border px-2.5 py-1 text-[0.6875rem] font-extrabold transition-colors">
          Edit
        </span>
      }
    />
  );
}

function PropertyDrawer({
  hostId,
  property,
  trigger,
}: {
  hostId: string;
  property?: PropertyForEdit;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    name: property?.name ?? '',
    kind: property?.kind ?? 'apartment_block',
    area: property?.area ?? '',
    floors: property?.floors ? String(property.floors) : '',
    summary: '',
    checkInFrom: property?.check_in_from?.slice(0, 5) ?? '14:00',
    checkOutBy: property?.check_out_by?.slice(0, 5) ?? '11:00',
  });
  const { pending, outcome, run } = useAction();
  const del = useAction();
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        {trigger}
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={property ? `Edit ${property.name}` : 'Add a property'}
        lead={
          property
            ? 'Changes here apply to the building. Addresses and hand-off rules live on each unit, where a rider reads them.'
            : 'A hotel, an apartment block or a single Airbnb. Units come next; each one gets its own cards and goes live on its own readiness.'
        }
      >
        <div className="space-y-4">
          <Grid>
            <Field label="Name" wide hint="What you and your team will look for in a list.">
              <Text
                value={form.name}
                onChange={(e) => set('name')(e.target.value)}
                placeholder="Riverside Apartments"
              />
            </Field>
            <Field label="Type">
              <Select
                value={form.kind}
                onChange={(e) => set('kind')(e.target.value)}
                options={KINDS}
              />
            </Field>
            <Field label="Area">
              <Text
                value={form.area}
                onChange={(e) => set('area')(e.target.value)}
                placeholder="Kilimani"
              />
            </Field>
            <Field label="Floors" hint="Optional. Helps a rider find a unit in a tower.">
              <Text
                value={form.floors}
                onChange={(e) => set('floors')(e.target.value)}
                inputMode="numeric"
                placeholder="6"
              />
            </Field>
            <Field label="Check-in from">
              <Text
                type="time"
                value={form.checkInFrom}
                onChange={(e) => set('checkInFrom')(e.target.value)}
              />
            </Field>
            <Field label="Check-out by">
              <Text
                type="time"
                value={form.checkOutBy}
                onChange={(e) => set('checkOutBy')(e.target.value)}
              />
            </Field>
            <Field
              label="Description"
              wide
              hint="Shown to guests on the unit page. Reviewed by host ops before it appears."
            >
              <Area
                value={form.summary}
                onChange={(e) => set('summary')(e.target.value)}
                placeholder="Quiet block off Argwings Kodhek, five minutes from Yaya."
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
                    saveProperty({
                      hostId,
                      propertyId: property?.id ?? null,
                      ...form,
                    }),
                  (o) => {
                    /* Stays open on success, showing what it
                       said. Closing on save threw the
                       confirmation away at the moment it was
                       earned, and somebody adding four blocks
                       in a row had to reopen the drawer each
                       time. The form clears instead. */
                    if (o.ok && !property) {
                      setForm({
                        name: '',
                        kind: form.kind,
                        area: form.area,
                        floors: '',
                        summary: '',
                        checkInFrom: form.checkInFrom,
                        checkOutBy: form.checkOutBy,
                      });
                    }
                  },
                )
              }
            >
              {property ? 'Save changes' : 'Add property'}
            </Submit>
            <Submit type="button" tone="quiet" onClick={() => setOpen(false)}>
              Close
            </Submit>
          </Actions>

          {property ? (
            <div className="border-border mt-6 border-t pt-5">
              <Said outcome={del.outcome} />
              <div className="mt-3">
                <ConfirmByName
                  name={property.name}
                  label="Remove this property"
                  pending={del.pending}
                  onConfirm={(typed) => del.run(() => deleteProperty(property.id, typed))}
                />
              </div>
              <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-[1.6]">
                Refused while it has live units, bookings today or still to come, or an unpaid
                invoice — and the refusal says which. Statements and the audit trail are kept for
                seven years either way.
              </p>
            </div>
          ) : null}
        </div>
      </Drawer>
    </>
  );
}
