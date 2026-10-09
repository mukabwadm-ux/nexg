'use client';

import * as React from 'react';

import {
  createRequest,
  escalateRequest,
  resolveRequest,
  updateRequest,
} from '@/app/host/actions';

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

const TYPES = [
  { value: 'amenities', label: 'Amenities' },
  { value: 'late_checkout', label: 'Late check-out' },
  { value: 'transport', label: 'Transport' },
  { value: 'access', label: 'Access · locked out · gate' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'recommendations', label: 'Recommendations' },
  { value: 'order', label: 'An order' },
  { value: 'rider_conduct', label: 'A rider' },
  { value: 'other', label: 'Something else' },
];

const PRIORITIES = [
  { value: 'high', label: 'High · 15 minutes' },
  { value: 'medium', label: 'Medium · 2 hours' },
  { value: 'low', label: 'Low · same day' },
];

const STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'waiting_on_host', label: 'Waiting on you' },
  { value: 'waiting_on_guest', label: 'Waiting on the guest' },
];

/**
 * Raising something.
 *
 * The priority picker shows the minutes each level buys,
 * because that is the only thing choosing between them
 * actually does. A list reading "High, Medium, Low" invites
 * everything to be filed as high, and then the red rows stop
 * meaning anything.
 */
export function RaiseRequest({
  hostId,
  units,
}: {
  hostId: string;
  units: { id: string; name: string }[];
}) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    title: '',
    detail: '',
    kind: 'issue',
    type: 'other',
    priority: 'medium',
    unitId: '',
    ownerKind: 'nexg_concierge',
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
        + Raise a request
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Raise a request or an issue"
        lead="Something you need from NexG, or something gone wrong you want on the record. Either way it gets a clock and a place to be answered."
      >
        <div className="space-y-4">
          <Grid>
            <Field
              label="What is needed"
              wide
              hint="One line. It is what your team and NexG read first."
            >
              <Text
                value={form.title}
                onChange={(e) => set('title')(e.target.value)}
                placeholder="Lift out of service in Block A"
              />
            </Field>
            <Field label="Kind">
              <Select
                value={form.kind}
                onChange={(e) => set('kind')(e.target.value)}
                options={[
                  { value: 'issue', label: 'Issue · something is wrong' },
                  { value: 'request', label: 'Request · something is needed' },
                ]}
              />
            </Field>
            <Field label="Type">
              <Select
                value={form.type}
                onChange={(e) => set('type')(e.target.value)}
                options={TYPES}
              />
            </Field>
            <Field
              label="Priority"
              hint="This sets the countdown. Filing everything as high is how red rows stop meaning anything."
            >
              <Select
                value={form.priority}
                onChange={(e) => set('priority')(e.target.value)}
                options={PRIORITIES}
              />
            </Field>
            <Field label="Unit">
              <Select
                value={form.unitId}
                onChange={(e) => set('unitId')(e.target.value)}
                options={[
                  { value: '', label: 'Not about one unit' },
                  ...units.map((u) => ({ value: u.id, label: u.name })),
                ]}
              />
            </Field>
            <Field label="Who handles it" wide>
              <Select
                value={form.ownerKind}
                onChange={(e) => set('ownerKind')(e.target.value)}
                options={[
                  { value: 'nexg_concierge', label: 'NexG concierge' },
                  { value: 'host', label: 'My team' },
                  { value: 'nexg_support', label: 'NexG support' },
                ]}
              />
            </Field>
            <Field label="Detail" wide>
              <Area
                value={form.detail}
                onChange={(e) => set('detail')(e.target.value)}
                placeholder="Engineer booked for Thursday. Guests on floors 8 and above need the service lift code."
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
                  () => createRequest({ hostId, ...form }),
                  (o) => {
                    if (o.ok) setForm((f) => ({ ...f, title: '', detail: '' }));
                  },
                )
              }
            >
              Raise it
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

/* ═══════════════════════════════════ act on an existing one */

export function RequestActions({
  requestId,
  reference,
  title,
  resolved,
}: {
  requestId: string;
  reference: string;
  title: string;
  resolved: boolean;
}) {
  const [sheet, setSheet] = React.useState<null | 'update' | 'escalate' | 'resolve'>(null);
  const [status, setStatus] = React.useState('in_progress');
  const [text, setText] = React.useState('');
  const { pending, outcome, run } = useAction();

  if (resolved) {
    return <span className="text-muted-light text-[0.6875rem] font-semibold">Closed</span>;
  }

  const close = () => {
    setSheet(null);
    setText('');
  };

  return (
    <>
      <div className="flex flex-wrap justify-end gap-1.5">
        <Mini onClick={() => setSheet('update')}>Update</Mini>
        <Mini onClick={() => setSheet('escalate')}>Escalate</Mini>
        <Mini onClick={() => setSheet('resolve')} tone="good">
          Resolve
        </Mini>
      </div>

      <Drawer
        open={sheet !== null}
        onClose={close}
        title={
          sheet === 'resolve'
            ? `Resolve ${reference}`
            : sheet === 'escalate'
              ? `Escalate ${reference} to NexG`
              : `Update ${reference}`
        }
        lead={title}
      >
        <div className="space-y-4">
          {sheet === 'update' ? (
            <Field label="Status">
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                options={STATUSES}
              />
            </Field>
          ) : null}

          <Field
            label={
              sheet === 'resolve'
                ? 'What was done'
                : sheet === 'escalate'
                  ? 'What you need from NexG'
                  : 'Note'
            }
            hint={
              sheet === 'resolve'
                ? 'This is what the guest is told, and what you will read in six months.'
                : sheet === 'escalate'
                  ? 'The clock resets to fifteen minutes. An escalation with no reason sits behind the ones that have one.'
                  : 'Appended with a timestamp. Nothing already written is overwritten.'
            }
          >
            <Area
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                sheet === 'resolve'
                  ? 'Spare key cut and left with the caretaker.'
                  : sheet === 'escalate'
                    ? 'Guest is locked out and I am two hours away.'
                    : 'Engineer confirmed for Thursday morning.'
              }
            />
          </Field>

          <Said outcome={outcome} />

          <Actions>
            <Submit
              type="button"
              pending={pending}
              tone={sheet === 'escalate' ? 'danger' : 'ink'}
              onClick={() =>
                run(
                  () =>
                    sheet === 'resolve'
                      ? resolveRequest(requestId, text)
                      : sheet === 'escalate'
                        ? escalateRequest(requestId, text)
                        : updateRequest(requestId, status, text),
                  (o) => {
                    if (o.ok) close();
                  },
                )
              }
            >
              {sheet === 'resolve'
                ? 'Mark resolved'
                : sheet === 'escalate'
                  ? 'Send to NexG'
                  : 'Save update'}
            </Submit>
            <Submit type="button" tone="quiet" onClick={close}>
              Cancel
            </Submit>
          </Actions>
        </div>
      </Drawer>
    </>
  );
}

function Mini({
  children,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: 'good';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-[0.6875rem] font-extrabold transition-colors ${
        tone === 'good'
          ? 'border-success/40 text-success hover:bg-success/5'
          : 'border-border-strong text-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
