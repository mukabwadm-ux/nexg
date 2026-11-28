'use client';

import { Button, Card, Input, useToast } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import type { CommissionResult } from '@/app/merchants/commission-actions';
import {
  day,
  parseRate,
  pct,
  type CommissionCard,
  type CommissionTerm,
} from '@/lib/merchant-commission';

const STATUS: Record<CommissionTerm['status'], { label: string; className: string }> = {
  pending: { label: 'Waiting for approval', className: 'bg-warning-bg text-warning' },
  approved: { label: 'Approved', className: 'bg-success-bg text-success' },
  rejected: { label: 'Rejected', className: 'bg-danger-bg text-danger' },
  withdrawn: { label: 'Withdrawn', className: 'bg-border/50 text-muted' },
};

const rates = (t: CommissionTerm) =>
  t.own_delivery_pct === null && t.nexg_delivery_pct === null
    ? 'Back to the preset'
    : `Own delivery ${t.own_delivery_pct === null ? 'preset' : pct(t.own_delivery_pct)} · NexG rider ${
        t.nexg_delivery_pct === null ? 'preset' : pct(t.nexg_delivery_pct)
      }`;

const dates = (t: { starts_on: string; ends_on: string | null }) =>
  t.ends_on ? `${day(t.starts_on)} to ${day(t.ends_on)}` : `from ${day(t.starts_on)}`;

/**
 * Commission agreed with this merchant. Overrides the preset rate card
 * between two dates; one person asks, a second (Finance, an Ops manager or a
 * super admin) approves. Orders already placed keep the rate they were
 * charged. Rules and audit live in rpc_merchant_commission_*.
 */
export function MerchantCommissionCard({
  card,
  onRequest,
  onDecide,
  onWithdraw,
}: {
  card: CommissionCard;
  onRequest: (input: {
    ownDelivery: string;
    nexgDelivery: string;
    startsOn: string;
    endsOn: string;
    reason: string;
    termsRef: string;
  }) => Promise<CommissionResult>;
  onDecide: (termId: string, approve: boolean, note: string) => Promise<CommissionResult>;
  onWithdraw: (termId: string) => Promise<CommissionResult>;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    ownDelivery: '',
    nexgDelivery: '',
    startsOn: card.today,
    endsOn: '',
    reason: '',
    termsRef: '',
  });
  const [note, setNote] = React.useState('');
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: event.target.value }));

  const pending = card.terms.find((t) => t.status === 'pending') ?? null;
  const history = card.terms.filter((t) => t.status !== 'pending').slice(0, 6);
  const ownValid = parseRate(form.ownDelivery).ok;
  const nexgValid = parseRate(form.nexgDelivery).ok;
  const datesValid = form.startsOn >= card.today && (!form.endsOn || form.endsOn >= form.startsOn);
  const canSend = ownValid && nexgValid && datesValid && form.reason.trim() !== '' && !busy;

  const run = async (work: () => Promise<CommissionResult>, after?: () => void) => {
    setBusy(true);
    const result = await work();
    setBusy(false);
    if (!result.ok) {
      toast({ title: 'Not saved', description: result.message, tone: 'danger' });
      return;
    }
    toast({ title: result.message });
    after?.();
    router.refresh();
  };

  const line = (
    label: string,
    help: string,
    value: number | null,
    agreed: boolean,
    preset: number | null,
    applies: boolean,
  ) => (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-sm font-semibold">
        {label}
        <span className="text-muted block text-xs">
          {help}
          {applies ? ' · applies to this merchant' : ''}
        </span>
      </dt>
      <dd className="text-right">
        <span className="text-sm font-extrabold">{pct(value)}</span>
        <span className="text-muted block text-xs font-semibold">
          {agreed ? `agreed · preset ${pct(preset)}` : 'preset'}
        </span>
      </dd>
    </div>
  );

  return (
    <Card id="commission" className="scroll-mt-24 p-5">
      <h2 className="text-sm font-extrabold uppercase tracking-wide">Commission</h2>
      <p className="text-muted mt-2 text-sm font-semibold leading-[1.7]">
        {card.charged_now?.agreed
          ? `Charged now: ${pct(card.charged_now.pct)}, agreed with this merchant${
              card.in_force ? ` (${dates(card.in_force)})` : ' (no dates)'
            }.`
          : card.charged_now?.basis === 'category'
            ? `Charged now: ${pct(card.charged_now.pct)}, its category's rate (System › Categories & Commissions).`
            : `Charged now: ${pct(card.charged_now?.pct ?? null)}, the preset rate card.`}{' '}
        Orders already placed keep the rate they were charged.
      </p>

      <dl className="mt-4 grid gap-3">
        {line(
          'Own delivery',
          'Own riders, pickup, dining',
          card.own_delivery_pct,
          card.own_delivery_agreed,
          card.preset.own_delivery_pct,
          card.own_riders,
        )}
        {line(
          'NexG rider delivers',
          'A NexG rider takes the order',
          card.nexg_delivery_pct,
          card.nexg_delivery_agreed,
          card.preset.nexg_delivery_pct,
          !card.own_riders,
        )}
      </dl>

      {pending && (
        <div className="border-border mt-5 rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-extrabold">{rates(pending)}</p>
            <span
              className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${STATUS.pending.className}`}
            >
              {STATUS.pending.label}
            </span>
          </div>
          <p className="text-muted mt-1 text-xs font-semibold leading-[1.7]">
            {dates(pending)}
            {pending.terms_ref ? ` · ${pending.terms_ref}` : ''} · asked by{' '}
            {pending.requested_by ?? 'staff'}
          </p>
          {pending.reason && <p className="mt-2 text-sm leading-[1.7]">{pending.reason}</p>}
          {pending.mine || card.can_decide ? (
            <div className="mt-3 grid gap-2">
              {card.can_decide && !pending.mine && (
                <Input
                  id={`commission_note_${pending.id}`}
                  label="Note (optional)"
                  maxLength={1000}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              )}
              <div className="flex flex-wrap gap-2">
                {card.can_decide && !pending.mine && (
                  <>
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => onDecide(pending.id, true, note),
                          () => setNote(''),
                        )
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => onDecide(pending.id, false, note),
                          () => setNote(''),
                        )
                      }
                    >
                      Reject
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => run(() => onWithdraw(pending.id))}
                >
                  Withdraw
                </Button>
              </div>
              {pending.mine && (
                <p className="text-muted text-xs font-semibold">
                  You asked for this, so somebody else has to approve it.
                </p>
              )}
            </div>
          ) : null}
        </div>
      )}

      {card.can_request && !pending && !open && (
        <div className="mt-5">
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            Agree a rate
          </Button>
        </div>
      )}

      {card.can_request && !pending && open && (
        <div className="mt-5 grid gap-3">
          <p className="text-muted text-xs font-semibold leading-[1.7]">
            Leave a rate blank to keep it on the preset; leave both blank to put this merchant back
            on the preset from the start day. A second person approves it.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              id="commission_own"
              label="Own delivery (%)"
              inputMode="decimal"
              placeholder={`Preset ${pct(card.preset.own_delivery_pct)}`}
              value={form.ownDelivery}
              onChange={set('ownDelivery')}
              error={ownValid ? undefined : '0 to 100, two decimals at most.'}
            />
            <Input
              id="commission_nexg"
              label="NexG rider delivers (%)"
              inputMode="decimal"
              placeholder={`Preset ${pct(card.preset.nexg_delivery_pct)}`}
              value={form.nexgDelivery}
              onChange={set('nexgDelivery')}
              error={nexgValid ? undefined : '0 to 100, two decimals at most.'}
            />
            <Input
              id="commission_starts"
              label="Starts"
              type="date"
              min={card.today}
              value={form.startsOn}
              onChange={set('startsOn')}
              error={form.startsOn < card.today ? 'Today or later.' : undefined}
            />
            <Input
              id="commission_ends"
              label="Ends (optional)"
              type="date"
              min={form.startsOn}
              value={form.endsOn}
              onChange={set('endsOn')}
              error={form.endsOn && form.endsOn < form.startsOn ? 'After the start.' : undefined}
            />
          </div>
          <Input
            id="commission_reason"
            label="What was agreed"
            maxLength={1000}
            placeholder="Who agreed it, when, and on what terms"
            value={form.reason}
            onChange={set('reason')}
          />
          <Input
            id="commission_ref"
            label="Agreement reference (optional)"
            maxLength={200}
            value={form.termsRef}
            onChange={set('termsRef')}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={!canSend}
              onClick={() =>
                run(
                  () => onRequest(form),
                  () => {
                    setOpen(false);
                    setForm((f) => ({
                      ...f,
                      ownDelivery: '',
                      nexgDelivery: '',
                      reason: '',
                      termsRef: '',
                      endsOn: '',
                    }));
                  },
                )
              }
            >
              {busy ? 'Sending…' : 'Ask for approval'}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-5">
          <h3 className="text-muted text-xs font-extrabold uppercase tracking-wide">History</h3>
          <ul className="mt-2 grid gap-3">
            {history.map((t) => (
              <li key={t.id} className="text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">{rates(t)}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${STATUS[t.status].className}`}
                  >
                    {t.in_force ? 'In force' : STATUS[t.status].label}
                  </span>
                </div>
                <p className="text-muted text-xs font-semibold leading-[1.7]">
                  {dates(t)}
                  {t.terms_ref ? ` · ${t.terms_ref}` : ''}
                  {t.requested_by ? ` · asked by ${t.requested_by}` : ''}
                  {t.decided_by
                    ? ` · ${t.status === 'approved' ? 'approved' : t.status} by ${t.decided_by}`
                    : ''}
                </p>
                {t.reason && <p className="text-muted text-xs leading-[1.7]">{t.reason}</p>}
                {t.decision_note && (
                  <p className="text-muted text-xs leading-[1.7]">Note: {t.decision_note}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
