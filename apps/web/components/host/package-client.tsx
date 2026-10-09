'use client';

import * as React from 'react';

import { archivePackage, savePackage, schedulePackage } from '@/app/host/actions';

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

export interface PackageForEdit {
  id: string;
  name: string;
  description: string | null;
  price_kes: number;
  lead_hours: number;
  items: unknown;
  mine: boolean;
}

function itemsOf(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * Creating and editing a package.
 *
 * Only a host's own are editable. A NexG catalogue package is
 * shared by every host in the city, and letting one of them
 * change its price would change it for all of them — so the
 * drawer offers a copy instead, which is the thing they
 * actually wanted.
 */
export function PackageDrawer({
  hostId,
  pkg,
  copyFrom,
  trigger,
}: {
  hostId: string;
  pkg?: PackageForEdit;
  copyFrom?: PackageForEdit;
  trigger: React.ReactNode;
}) {
  const base = pkg ?? copyFrom;
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    name: pkg ? pkg.name : copyFrom ? `${copyFrom.name} (mine)` : '',
    description: base?.description ?? '',
    price: base ? String(base.price_kes) : '',
    leadHours: base ? String(base.lead_hours) : '12',
  });
  const [items, setItems] = React.useState<string[]>(
    itemsOf(base?.items).length > 0 ? itemsOf(base?.items) : [''],
  );
  const { pending, outcome, run } = useAction();
  const arch = useAction();
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        {trigger}
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={pkg ? `Edit ${pkg.name}` : copyFrom ? `Copy ${copyFrom.name}` : 'Create a package'}
        lead="What goes in a unit before a guest walks in. You set the price your guests are shown and the lead time you can actually meet."
      >
        <div className="space-y-4">
          <Grid>
            <Field label="Name" wide>
              <Text
                value={form.name}
                onChange={(e) => set('name')(e.target.value)}
                placeholder="Breakfast kit"
              />
            </Field>
            <Field label="Price" hint="Whole shillings. Zero is allowed; blank is not.">
              <Text
                value={form.price}
                onChange={(e) => set('price')(e.target.value)}
                inputMode="numeric"
                placeholder="2500"
              />
            </Field>
            <Field
              label="Lead time"
              hint="Hours you need to buy it, assemble it and get it into a unit. A package cannot be scheduled inside it."
            >
              <Text
                value={form.leadHours}
                onChange={(e) => set('leadHours')(e.target.value)}
                inputMode="numeric"
                placeholder="12"
              />
            </Field>
            <Field label="Description" wide>
              <Area
                value={form.description}
                onChange={(e) => set('description')(e.target.value)}
                placeholder="Bread, eggs, milk, fruit and coffee for two."
              />
            </Field>
          </Grid>

          <div>
            <p className="text-muted-light text-[0.6875rem] font-extrabold uppercase tracking-wide">
              What is in it
            </p>
            <div className="mt-2 space-y-2">
              {items.map((it, i) => (
                <div key={i} className="flex gap-2">
                  <Text
                    value={it}
                    onChange={(e) =>
                      setItems((xs) => xs.map((x, n) => (n === i ? e.target.value : x)))
                    }
                    placeholder="500ml milk"
                  />
                  <button
                    type="button"
                    onClick={() => setItems((xs) => xs.filter((_, n) => n !== i))}
                    className="text-muted-light hover:text-danger shrink-0 px-2 text-lg font-extrabold"
                    aria-label="Remove item"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setItems((xs) => [...xs, ''])}
                className="text-muted hover:text-ink text-[0.75rem] font-extrabold"
              >
                + Add an item
              </button>
            </div>
          </div>

          <Said outcome={outcome} />

          <Actions>
            <Submit
              type="button"
              pending={pending}
              onClick={() =>
                run(
                  () =>
                    savePackage({
                      hostId,
                      packageId: pkg?.id ?? null,
                      ...form,
                      items,
                    }),
                  (o) => {
                    if (o.ok && !pkg) {
                      setForm((f) => ({ ...f, name: '', description: '' }));
                      setItems(['']);
                    }
                  },
                )
              }
            >
              {pkg ? 'Save changes' : 'Create package'}
            </Submit>
            <Submit type="button" tone="quiet" onClick={() => setOpen(false)}>
              Close
            </Submit>
          </Actions>

          {pkg?.mine ? (
            <div className="border-border mt-6 border-t pt-5">
              <Said outcome={arch.outcome} />
              <p className="text-muted mt-2 text-[0.75rem] font-semibold leading-[1.6]">
                Retiring it takes it off the catalogue. Past orders keep their description on your
                statements, which is why it is retired rather than deleted.
              </p>
              <div className="mt-3">
                <Submit
                  type="button"
                  tone="danger"
                  pending={arch.pending}
                  onClick={() => arch.run(() => archivePackage(pkg.id))}
                >
                  Retire this package
                </Submit>
              </div>
            </div>
          ) : null}
        </div>
      </Drawer>
    </>
  );
}

export function CreatePackage({ hostId }: { hostId: string }) {
  return (
    <PackageDrawer
      hostId={hostId}
      trigger={
        <span className="bg-ink inline-block rounded-lg px-4 py-2 text-[0.8125rem] font-extrabold text-white">
          + Create a package
        </span>
      }
    />
  );
}

export function PackageCardActions({
  hostId,
  pkg,
  units,
}: {
  hostId: string;
  pkg: PackageForEdit;
  units: { id: string; name: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <SchedulePackage hostId={hostId} pkg={pkg} units={units} />
      {pkg.mine ? (
        <PackageDrawer
          hostId={hostId}
          pkg={pkg}
          trigger={
            <span className="border-border-strong text-muted hover:text-ink inline-block rounded-md border px-2.5 py-1 text-[0.6875rem] font-extrabold transition-colors">
              Edit
            </span>
          }
        />
      ) : (
        <PackageDrawer
          hostId={hostId}
          copyFrom={pkg}
          trigger={
            <span className="border-border-strong text-muted hover:text-ink inline-block rounded-md border px-2.5 py-1 text-[0.6875rem] font-extrabold transition-colors">
              Copy &amp; edit
            </span>
          }
        />
      )}
    </div>
  );
}

function SchedulePackage({
  hostId,
  pkg,
  units,
}: {
  hostId: string;
  pkg: PackageForEdit;
  units: { id: string; name: string }[];
}) {
  const [open, setOpen] = React.useState(false);
  const earliest = new Date(Date.now() + (pkg.lead_hours + 1) * 3600000);
  const [unitId, setUnitId] = React.useState(units[0]?.id ?? '');
  const [at, setAt] = React.useState(
    earliest.toLocaleString('sv-SE', { timeZone: 'Africa/Nairobi' }).slice(0, 16).replace(' ', 'T'),
  );
  const { pending, outcome, run } = useAction();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-ink rounded-md px-2.5 py-1 text-[0.6875rem] font-extrabold text-white"
      >
        Schedule
      </button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={`Schedule ${pkg.name}`}
        lead={`${pkg.lead_hours} hours' notice. You are billed when it is placed in the unit, not now.`}
      >
        <div className="space-y-4">
          {units.length === 0 ? (
            <p className="text-muted text-[0.8125rem] font-semibold">
              Add a unit first — a package has to go somewhere.
            </p>
          ) : (
            <>
              <Field label="Unit">
                <Select
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  options={units.map((u) => ({ value: u.id, label: u.name }))}
                />
              </Field>
              <Field
                label="For the check-in on"
                hint="We place it before the guest arrives. Earlier than the lead time is refused rather than promised."
              >
                <Text
                  type="datetime-local"
                  value={at}
                  onChange={(e) => setAt(e.target.value)}
                />
              </Field>
              <Said outcome={outcome} />
              <Actions>
                <Submit
                  type="button"
                  pending={pending}
                  onClick={() =>
                    run(
                      () =>
                        schedulePackage({
                          hostId,
                          unitId,
                          packageId: pkg.id,
                          forCheckinAt: `${at}:00+03:00`,
                        }),
                      (o) => {
                        if (o.ok) setOpen(false);
                      },
                    )
                  }
                >
                  Schedule it
                </Submit>
                <Submit type="button" tone="quiet" onClick={() => setOpen(false)}>
                  Close
                </Submit>
              </Actions>
            </>
          )}
        </div>
      </Drawer>
    </>
  );
}
