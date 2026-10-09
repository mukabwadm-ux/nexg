'use client';

import * as React from 'react';

import {
  deleteBranch,
  pauseBranch,
  resumeBranch,
  saveBranch,
} from '@/app/merchant/actions';
import {
  Actions,
  Area,
  ConfirmByName,
  Drawer,
  Field,
  Grid,
  Said,
  Submit,
  Text,
  useAction,
} from '@/components/partner/form';

export interface BranchRow {
  id: string;
  name: string;
  address_text: string | null;
  zone_name: string | null;
  is_primary: boolean;
  pickup_instructions: string | null;
  rider_phone: string | null;
  state: string;
  pause_reason: string | null;
  orders_today: number;
  prep_avg_minutes: number | null;
  orders_30d: number;
  rating: number | null;
}

/**
 * Opening a branch and changing it.
 *
 * The three RPCs that existed before this covered add, rename
 * and close. Everything a branch actually needs in order to
 * work — where a rider goes, which counter to ask for, a number
 * to ring — had nowhere to be typed.
 */
export function BranchDrawer({
  merchantId,
  branch,
  trigger,
}: {
  merchantId: string;
  branch?: BranchRow;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    name: branch?.name ?? '',
    addressText: branch?.address_text ?? '',
    pickupInstructions: branch?.pickup_instructions ?? '',
    riderPhone: branch?.rider_phone ?? '',
  });
  const [pauseReason, setPauseReason] = React.useState('');
  const save = useAction();
  const pause = useAction();
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
        title={branch ? branch.name : 'Add a branch'}
        lead={
          branch
            ? 'Each branch has its own address, hours and counter device, and goes live on its own.'
            : 'A new branch starts in setup. It gets its own hours and device, and NexG looks at the address before it shows on Explore.'
        }
      >
        <div className="space-y-4">
          <Grid>
            <Field label="Branch name" wide hint="What guests and your team see.">
              <Text
                value={form.name}
                onChange={(e) => set('name')(e.target.value)}
                placeholder="Lavington"
              />
            </Field>
            <Field label="Address" wide>
              <Text
                value={form.addressText}
                onChange={(e) => set('addressText')(e.target.value)}
                placeholder="James Gichuru Rd, Lavington"
              />
            </Field>
            <Field
              label="Phone for riders"
              hint="Masked to the rider. Rung only while an order is being collected."
            >
              <Text
                value={form.riderPhone}
                onChange={(e) => set('riderPhone')(e.target.value)}
                placeholder="+254 7.."
              />
            </Field>
            <Field
              label="Pickup instructions"
              wide
              hint="Shown to the rider on the job card. Where to stand, who to ask for."
            >
              <Area
                value={form.pickupInstructions}
                onChange={(e) => set('pickupInstructions')(e.target.value)}
                placeholder="Side counter on the left, not the front door. Ask for the order number."
              />
            </Field>
          </Grid>

          <Said outcome={save.outcome} />

          <Actions>
            <Submit
              type="button"
              pending={save.pending}
              onClick={() =>
                save.run(
                  () => saveBranch({ merchantId, branchId: branch?.id ?? null, ...form }),
                  (o) => {
                    if (o.ok && !branch) {
                      setForm({
                        name: '',
                        addressText: '',
                        pickupInstructions: form.pickupInstructions,
                        riderPhone: '',
                      });
                    }
                  },
                )
              }
            >
              {branch ? 'Save changes' : 'Add branch'}
            </Submit>
            <Submit type="button" tone="quiet" onClick={() => setOpen(false)}>
              Close
            </Submit>
          </Actions>

          {branch ? (
            <div className="border-border mt-6 space-y-5 border-t pt-5">
              {/* Pause and resume, which is what a merchant
                  actually wants nine times out of ten when they
                  reach for Delete. */}
              <div>
                <p className="text-muted-light text-[0.6875rem] font-extrabold uppercase tracking-wide">
                  {branch.state === 'paused' ? 'Paused' : 'Pause this branch'}
                </p>
                {branch.state === 'paused' ? (
                  <>
                    <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-[1.6]">
                      Closed to guests{branch.pause_reason ? ` — ${branch.pause_reason}` : ''}.
                    </p>
                    <div className="mt-2">
                      <Submit
                        type="button"
                        pending={pause.pending}
                        onClick={() => pause.run(() => resumeBranch(branch.id))}
                      >
                        Open it again
                      </Submit>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-[1.6]">
                      Stops new orders here. Orders already accepted finish as normal, and the
                      other branches are unaffected.
                    </p>
                    <div className="mt-2 space-y-2">
                      <Text
                        value={pauseReason}
                        onChange={(e) => setPauseReason(e.target.value)}
                        placeholder="Why — your team and NexG see this"
                      />
                      <Submit
                        type="button"
                        pending={pause.pending}
                        onClick={() => pause.run(() => pauseBranch(branch.id, pauseReason))}
                      >
                        Pause
                      </Submit>
                    </div>
                  </>
                )}
                <div className="mt-2">
                  <Said outcome={pause.outcome} />
                </div>
              </div>

              <div>
                <Said outcome={del.outcome} />
                <div className="mt-2">
                  <ConfirmByName
                    name={branch.name}
                    label="Remove this branch"
                    pending={del.pending}
                    onConfirm={(typed) => del.run(() => deleteBranch(branch.id, typed))}
                  />
                </div>
                <p className="text-muted-light mt-2 text-[0.6875rem] font-semibold leading-[1.6]">
                  Refused while orders are in progress here, and refused if it is your only
                  branch — that would take the business off Explore entirely. Statements and the
                  audit trail are kept either way.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </Drawer>
    </>
  );
}

export function AddBranch({ merchantId }: { merchantId: string }) {
  return (
    <BranchDrawer
      merchantId={merchantId}
      trigger={
        <span className="bg-ink inline-block rounded-lg px-4 py-2 text-[0.8125rem] font-extrabold text-white">
          + Add branch
        </span>
      }
    />
  );
}

export function OpenBranch({
  merchantId,
  branch,
}: {
  merchantId: string;
  branch: BranchRow;
}) {
  return (
    <BranchDrawer
      merchantId={merchantId}
      branch={branch}
      trigger={
        <span className="bg-ink inline-block rounded-md px-2.5 py-1 text-[0.6875rem] font-extrabold text-white">
          Open
        </span>
      }
    />
  );
}
