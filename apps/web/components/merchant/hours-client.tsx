'use client';

import * as React from 'react';

import { copyHours, setHours, setOverride } from '@/app/merchant/actions';
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
} from '@/components/partner/form';

import { DAYS, hhmm, slotLabel, type HoursRow } from './hours-vocab';


/**
 * One slot in the week grid.
 *
 * Clicking a slot opens its editor rather than turning the grid
 * into a form. A week of 21 live inputs is a page where one
 * mistyped character changes a day nobody was looking at.
 */
export function HoursSlot({
  merchantId,
  branchId,
  day,
  service,
  row,
}: {
  merchantId: string;
  branchId: string | null;
  day: number;
  service: string;
  row: HoursRow | undefined;
}) {
  const [open, setOpen] = React.useState(false);
  const [opens, setOpens] = React.useState(hhmm(row?.opens ?? null) || '09:00');
  const [closes, setCloses] = React.useState(hhmm(row?.closes ?? null) || '17:00');
  const [closed, setClosed] = React.useState(row?.closed ?? false);
  const { pending, outcome, run } = useAction();

  const label = slotLabel(row);
  const isClosed = row?.closed ?? false;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`w-full rounded-lg border px-2 py-2 text-[0.75rem] font-extrabold transition-colors ${
          !row
            ? 'border-border text-muted-light border-dashed hover:border-ink'
            : isClosed
              ? 'border-border bg-bg text-muted-light'
              : 'border-success/30 bg-success/10 text-success hover:border-success'
        }`}
      >
        {label}
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={`${service} · ${DAYS[day]}`}
        lead="Guests see one open window per day across all your services. Last orders are taken 20 minutes before close."
      >
        <div className="space-y-4">
          <label className="border-border flex cursor-pointer items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
            <span className="text-[0.8125rem] font-extrabold">Closed for this service</span>
            <input
              type="checkbox"
              checked={closed}
              onChange={(e) => setClosed(e.target.checked)}
              className="accent-gold h-4 w-4"
            />
          </label>

          {!closed ? (
            <Grid>
              <Field label="Opens">
                <Text type="time" value={opens} onChange={(e) => setOpens(e.target.value)} />
              </Field>
              <Field label="Closes">
                <Text type="time" value={closes} onChange={(e) => setCloses(e.target.value)} />
              </Field>
            </Grid>
          ) : null}

          <Said outcome={outcome} />

          <Actions>
            <Submit
              type="button"
              pending={pending}
              onClick={() =>
                run(
                  () =>
                    setHours({
                      merchantId,
                      day,
                      service,
                      opens,
                      closes,
                      closed,
                      branchId,
                    }),
                  (o) => {
                    if (o.ok) setOpen(false);
                  },
                )
              }
            >
              Save
            </Submit>
            <Submit type="button" tone="quiet" onClick={() => setOpen(false)}>
              Cancel
            </Submit>
          </Actions>
        </div>
      </Drawer>
    </>
  );
}

/**
 * Close early today.
 *
 * Two toggles that matter and are easy to get wrong the other
 * way round: orders already accepted finish regardless, and
 * guests are told rather than finding a closed kitchen.
 */
export function CloseEarly({
  merchantId,
  branchId,
}: {
  merchantId: string;
  branchId: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [closes, setCloses] = React.useState('20:00');
  const [reason, setReason] = React.useState('');
  const { pending, outcome, run } = useAction();

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-border-strong rounded-lg border px-4 py-2 text-[0.8125rem] font-extrabold"
      >
        Close early today
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Close early today"
        lead="Stops new orders from the time you set. It does not close the other branches and it does not change next week."
      >
        <div className="space-y-4">
          <Grid>
            <Field label="Close at">
              <Text type="time" value={closes} onChange={(e) => setCloses(e.target.value)} />
            </Field>
            <Field label="Reason" hint="Shown to NexG only, never to guests.">
              <Text
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Private event"
              />
            </Field>
          </Grid>

          <div className="border-border space-y-2 rounded-lg border p-3">
            <p className="text-[0.8125rem] font-extrabold">What happens</p>
            <p className="text-muted text-[0.75rem] font-semibold leading-[1.6]">
              Orders already accepted complete as normal — a kitchen that stops mid-order is a
              guest with no dinner and a rider waiting. Guests browsing Explore see
              &ldquo;closes at {closes} today&rdquo; before they order rather than after.
            </p>
          </div>

          <Said outcome={outcome} />

          <Actions>
            <Submit
              type="button"
              pending={pending}
              onClick={() =>
                run(
                  () =>
                    setOverride({
                      merchantId,
                      date: today,
                      closes,
                      closed: false,
                      reason,
                      branchId,
                    }),
                  (o) => {
                    if (o.ok) setOpen(false);
                  },
                )
              }
            >
              Apply
            </Submit>
            <Submit type="button" tone="quiet" onClick={() => setOpen(false)}>
              Cancel
            </Submit>
          </Actions>
        </div>
      </Drawer>
    </>
  );
}

export function CopyHours({
  merchantId,
  fromBranch,
  branches,
}: {
  merchantId: string;
  fromBranch: string | null;
  branches: { id: string; name: string }[];
}) {
  const [to, setTo] = React.useState(branches[0]?.id ?? '');
  const { pending, outcome, run } = useAction();

  if (branches.length === 0) return null;

  return (
    <div className="space-y-2">
      <Select
        value={to}
        onChange={(e) => setTo(e.target.value)}
        options={branches.map((b) => ({ value: b.id, label: `Copy to ${b.name}` }))}
      />
      <Submit
        type="button"
        pending={pending}
        onClick={() => run(() => copyHours(merchantId, fromBranch, to))}
      >
        Copy these hours
      </Submit>
      <Said outcome={outcome} />
    </div>
  );
}
