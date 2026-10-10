'use client';

import * as React from 'react';

import {
  acceptDispute,
  openTicket,
  replyToDispute,
  replyToReview,
  saveMerchantSettings,
} from '@/app/merchant/actions';
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
} from '@/components/partner/form';

/* ══════════════════════════════════════════════ disputes */

export interface DisputeRow {
  id: string;
  order_reference: string | null;
  reason: string | null;
  amount_claimed_kes: number | null;
  guest_note: string | null;
  merchant_reply: string | null;
  hours_left: number | null;
  overdue: boolean;
  open: boolean;
  status: string;
  resolution: string | null;
  charged_to: string | null;
}

/**
 * Replying to a dispute.
 *
 * Both buttons are here on purpose. A merchant who knows the
 * item really was missing should be able to say so in one
 * press rather than writing a defence they do not believe —
 * and accepting is cheaper for them than losing on evidence.
 */
export function DisputeReply({ dispute }: { dispute: DisputeRow }) {
  const [open, setOpen] = React.useState(false);
  const [reply, setReply] = React.useState('');
  const send = useAction();
  const accept = useAction();

  if (!dispute.open) {
    return (
      <span className="text-muted-light text-[0.6875rem] font-semibold">
        {dispute.resolution ?? 'Decided'}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-ink rounded-md px-2.5 py-1 text-[0.6875rem] font-extrabold text-white"
      >
        Reply
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={`${dispute.order_reference ?? 'Order'} · ${dispute.reason ?? 'claim'}`}
        lead={
          dispute.hours_left === null
            ? 'NexG decides within one working day and both sides see the reasoning.'
            : `${dispute.hours_left} hours left to reply. After that it is decided on what we have.`
        }
      >
        <div className="space-y-4">
          <div className="border-border space-y-2 rounded-xl border p-3">
            <p className="text-muted-light text-[0.6875rem] font-extrabold uppercase tracking-wide">
              What the guest said
            </p>
            <p className="text-[0.8125rem] font-semibold leading-[1.6]">
              {dispute.guest_note ?? 'No note given.'}
            </p>
            {dispute.amount_claimed_kes !== null ? (
              <p className="text-muted text-[0.75rem] font-semibold">
                Amount at stake: KES {Number(dispute.amount_claimed_kes).toLocaleString('en-KE')}
              </p>
            ) : null}
          </div>

          <Field
            label="Your reply"
            hint="Visible to NexG support only. The guest sees the decision, not your evidence."
          >
            <Area
              rows={5}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="We photograph every bag at hand-over; the juice is in the photo at 09:17."
            />
          </Field>

          <Said outcome={send.outcome} />

          <Actions>
            <Submit
              type="button"
              pending={send.pending}
              onClick={() =>
                send.run(
                  () => replyToDispute(dispute.id, reply),
                  (o) => {
                    if (o.ok) setOpen(false);
                  },
                )
              }
            >
              Submit reply
            </Submit>
            <Submit type="button" tone="quiet" onClick={() => setOpen(false)}>
              Close
            </Submit>
          </Actions>

          <div className="border-border border-t pt-4">
            <Said outcome={accept.outcome} />
            <p className="text-muted mt-2 text-[0.75rem] font-semibold leading-[1.6]">
              If the claim is right, accepting it now costs the same and takes a second. It
              appears on Friday&apos;s statement with the reason.
            </p>
            <div className="mt-3">
              <Submit
                type="button"
                tone="danger"
                pending={accept.pending}
                onClick={() =>
                  accept.run(
                    () => acceptDispute(dispute.id),
                    (o) => {
                      if (o.ok) setOpen(false);
                    },
                  )
                }
              >
                Accept the charge
              </Submit>
            </div>
          </div>
        </div>
      </Drawer>
    </>
  );
}

/* ═══════════════════════════════════════════════ reviews */

export function ReviewReply({
  ratingId,
  stars,
  comment,
}: {
  ratingId: string;
  stars: number;
  comment: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [body, setBody] = React.useState('');
  const { pending, outcome, run } = useAction();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-border-strong text-muted hover:text-ink rounded-md border px-2.5 py-1 text-[0.6875rem] font-extrabold transition-colors"
      >
        Reply
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={`Reply to ${stars} ★`}
        lead="Public on your Explore page after moderation, usually within minutes. No offers or discounts in replies, and no personal details."
      >
        <div className="space-y-4">
          {comment ? (
            <p className="bg-bg rounded-lg px-3 py-2.5 text-[0.8125rem] font-semibold italic leading-[1.6]">
              “{comment}”
            </p>
          ) : null}

          <Field label="Your reply" hint="Under 600 characters. Kiswahili is welcome.">
            <Area
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Asante for telling us. The juice should have been in the bag — we now check every order against the ticket at the counter."
            />
          </Field>

          <Said outcome={outcome} />

          <Actions>
            <Submit
              type="button"
              pending={pending}
              onClick={() =>
                run(
                  () => replyToReview(ratingId, body),
                  (o) => {
                    if (o.ok) setOpen(false);
                  },
                )
              }
            >
              Send for moderation
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

/* ══════════════════════════════════════════════ settings */

const EVENTS = [
  { key: 'new_order', label: 'New order', channel: 'Push + sound' },
  { key: 'order_late', label: 'Order running late', channel: 'In-app' },
  { key: 'dispute', label: 'Dispute opened / deadline', channel: 'Push + WhatsApp' },
  { key: 'catalogue_review', label: 'Catalogue review result', channel: 'In-app' },
  { key: 'document_expiring', label: 'Document expiring', channel: 'Push + email' },
  { key: 'payout', label: 'Payout result · statement ready', channel: 'Email + WhatsApp' },
  { key: 'health', label: 'Health band change', channel: 'Push' },
];

const ROLES = ['owner', 'managers', 'counter'] as const;

export function MerchantSettings({
  merchantId,
  rules,
  quiet,
}: {
  merchantId: string;
  rules: Record<string, string[]>;
  quiet: { from?: string; to?: string } | null;
}) {
  const [matrix, setMatrix] = React.useState<Record<string, string[]>>(rules ?? {});
  const [hours, setHours] = React.useState({
    from: quiet?.from ?? '23:00',
    to: quiet?.to ?? '07:00',
  });
  const { pending, outcome, run } = useAction();

  const toggle = (event: string, role: string) =>
    setMatrix((m) => {
      const on = m[event] ?? [];
      return { ...m, [event]: on.includes(role) ? on.filter((x) => x !== role) : [...on, role] };
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted text-[0.8125rem] font-semibold">
          Who is told about what, and when to stay quiet.
        </p>
        <Submit
          type="button"
          pending={pending}
          onClick={() =>
            run(() =>
              saveMerchantSettings(merchantId, {
                notification_rules: matrix,
                quiet_hours: hours,
              }),
            )
          }
        >
          Save
        </Submit>
      </div>

      <Said outcome={outcome} />

      <div className="border-border bg-surface overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-border bg-bg border-b">
              <tr className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-2">Event</th>
                <th className="px-4 py-2">Owner</th>
                <th className="px-4 py-2">Managers</th>
                <th className="px-4 py-2">Counter</th>
                <th className="px-4 py-2">Channel</th>
              </tr>
            </thead>
            <tbody>
              {EVENTS.map((e) => (
                <tr
                  key={e.key}
                  className="border-border border-b text-[0.8125rem] font-semibold last:border-0"
                >
                  <td className="px-4 py-2.5">{e.label}</td>
                  {ROLES.map((r) => (
                    <td key={r} className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => toggle(e.key, r)}
                        className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold transition-colors ${
                          (matrix[e.key] ?? []).includes(r)
                            ? 'bg-success/10 text-success'
                            : 'bg-bg text-muted-light'
                        }`}
                      >
                        {(matrix[e.key] ?? []).includes(r) ? 'On' : '—'}
                      </button>
                    </td>
                  ))}
                  <td className="text-muted-light px-4 py-2.5 text-[0.75rem]">{e.channel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-border border-t p-4">
          <Grid>
            <Field
              label="Quiet hours"
              hint="New orders still come through while you are Open — a quiet setting that silenced those would cost you the order."
            >
              <div className="flex items-center gap-2">
                <Text
                  type="time"
                  value={hours.from}
                  onChange={(e) => setHours({ ...hours, from: e.target.value })}
                />
                <span className="text-muted-light text-[0.75rem] font-extrabold">to</span>
                <Text
                  type="time"
                  value={hours.to}
                  onChange={(e) => setHours({ ...hours, to: e.target.value })}
                />
              </div>
            </Field>
          </Grid>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════ support */

const TOPICS = [
  { value: 'partner_merchant', label: 'Merchant ops — orders, catalogue, documents' },
  { value: 'payment_or_refund', label: 'Money — payouts, statements, a refund' },
  { value: 'hotel_partnership', label: 'Partnerships — agreement, fees, new branches' },
  { value: 'something_else', label: 'Product & bugs — something broken or an idea' },
];

export function ReportProblem({ page = 'Merchant portal' }: { page?: string }) {
  const [open, setOpen] = React.useState(false);
  const [topic, setTopic] = React.useState('partner_merchant');
  const [body, setBody] = React.useState('');
  const { pending, outcome, run } = useAction();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-ink rounded-lg px-4 py-2 text-[0.8125rem] font-extrabold text-white"
      >
        Report or suggest
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Report a problem or suggest an improvement"
        lead="It opens a ticket you can follow. The portal version and the page you were on are attached; nothing about a guest is."
      >
        <div className="space-y-4">
          <Field label="Who it is for">
            <Select
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              options={TOPICS}
            />
          </Field>
          <Field label="What happened, or what you would like">
            <Area
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="The new-order sound stops after the screen locks on the counter phone."
            />
          </Field>

          <Said outcome={outcome} />

          <Actions>
            <Submit
              type="button"
              pending={pending}
              onClick={() =>
                run(
                  () => openTicket({ topic, body, page }),
                  (o) => {
                    if (o.ok) setBody('');
                  },
                )
              }
            >
              Send to the NexG team
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
