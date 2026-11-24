'use client';

import { Button, Card, Input } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import {
  decideHostCommission,
  decideHostSubaccount,
  pauseHostSubaccount,
  requestHostCommission,
  requestHostSubaccount,
  withdrawHostCommission,
  type HostPaystackResult,
} from '@/app/hotels/host-paystack-actions';
import { day, parseRate, pct } from '@/lib/merchant-commission';
import type {
  HostCommissionCard,
  HostCommissionTerm,
  HostSplitOverview,
} from '@/lib/host-paystack';

const STATUS: Record<HostCommissionTerm['status'], { label: string; className: string }> = {
  pending: { label: 'Waiting for approval', className: 'bg-warning-bg text-warning' },
  approved: { label: 'Approved', className: 'bg-success-bg text-success' },
  rejected: { label: 'Rejected', className: 'bg-danger-bg text-danger' },
  withdrawn: { label: 'Withdrawn', className: 'bg-border/50 text-muted' },
};

const SCHEDULE: Record<string, string> = {
  auto: 'Every 2 working days (Paystack auto)',
  weekly: 'Weekly',
  monthly: 'Monthly',
  manual: 'Manual: paid when Finance releases it in Paystack',
};

const rate = (t: HostCommissionTerm) => (t.pct === null ? 'Back to the preset' : pct(t.pct));
const dates = (t: { starts_on: string; ends_on: string | null }) =>
  t.ends_on ? `${day(t.starts_on)} to ${day(t.ends_on)}` : `from ${day(t.starts_on)}`;
const kes = (cents: number) => `KES ${Math.round(cents / 100).toLocaleString('en-KE')}`;
const field = 'border-border-strong rounded-lg border px-3 py-1.5 text-[0.75rem] font-semibold';
const dark =
  'bg-ink rounded-lg px-3 py-1.5 text-[0.75rem] font-extrabold text-white disabled:opacity-40';

/**
 * What NexG keeps from this host's stays and how Paystack pays them.
 *
 * 1. NexG commission: the preset (Payout rules, per city) or a rate agreed
 *    with this host between two dates. One person asks, a second (full
 *    Finance) approves. A stay keeps the rate in force when it was held.
 * 2. Paystack sub-account: recorded by Finance, switched on by a second
 *    Finance person after their own look-up in Paystack. Paystack then splits
 *    each stay payment; a refund comes back from the host's sub-account.
 *    Without one, the host is paid in the weekly payout run.
 *
 * The rules and the audit live in rpc_host_commission_* and
 * rpc_host_subaccount_*; this only shows them and asks.
 */
export function HostPaystackCard({
  hostId,
  commission,
  overview,
}: {
  hostId: string;
  commission: HostCommissionCard | null;
  overview: HostSplitOverview | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  const run = async (work: () => Promise<HostPaystackResult>, after?: () => void) => {
    setBusy(true);
    const r = await work();
    setBusy(false);
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) {
      after?.();
      router.refresh();
    }
  };

  return (
    <Card id="host-paystack" className="p-5">
      <p className="text-[0.9375rem] font-extrabold">NexG commission · paid by Paystack</p>

      {commission?.viewer === 'staff' ? (
        <CommissionSection hostId={hostId} card={commission} busy={busy} run={run} />
      ) : (
        <p className="text-muted mt-2 text-[0.75rem] font-semibold">
          This host&apos;s commission could not be read.
        </p>
      )}

      <div className="border-border mt-5 border-t pt-4">
        {overview?.viewer === 'staff' ? (
          <SubaccountSection hostId={hostId} overview={overview} busy={busy} run={run} />
        ) : (
          <p className="text-muted text-[0.75rem] font-semibold">
            This host&apos;s Paystack sub-account could not be read.
          </p>
        )}
      </div>

      {msg && (
        <p
          role="status"
          className={`mt-3 text-[0.75rem] font-bold ${msg.ok ? 'text-success' : 'text-danger'}`}
        >
          {msg.text}
        </p>
      )}
    </Card>
  );
}

type Run = (work: () => Promise<HostPaystackResult>, after?: () => void) => Promise<void>;

function CommissionSection({
  hostId,
  card,
  busy,
  run,
}: {
  hostId: string;
  card: HostCommissionCard;
  busy: boolean;
  run: Run;
}) {
  const [open, setOpen] = React.useState(false);
  const blank = { pct: '', startsOn: card.today, endsOn: '', reason: '', termsRef: '' };
  const [form, setForm] = React.useState(blank);
  const [note, setNote] = React.useState('');
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: event.target.value }));

  const pending = card.terms.find((t) => t.status === 'pending') ?? null;
  const history = card.terms.filter((t) => t.status !== 'pending').slice(0, 6);
  const parsed = parseRate(form.pct);
  /* A term always carries a rate: to go back to the preset, agree the preset's rate. */
  const rateValid = parsed.ok && parsed.value !== null;
  const datesValid = form.startsOn >= card.today && (!form.endsOn || form.endsOn >= form.startsOn);
  const canSend = rateValid && datesValid && form.reason.trim() !== '' && !busy;
  const now = card.charged_now;

  return (
    <div className="mt-2">
      <p className="text-muted text-[0.75rem] font-semibold leading-[1.7]">
        {now?.agreed
          ? `Charged now: ${pct(now.pct)}, agreed with this host${
              card.in_force ? ` (${dates(card.in_force)})` : ''
            }. The preset is ${pct(now.preset_pct ?? card.preset_pct)}.`
          : `Charged now: ${pct(now?.pct ?? card.preset_pct)}, the preset on Payout rules.`}{' '}
        A stay keeps the rate in force when the guest held it.
      </p>

      {pending && (
        <div className="border-border mt-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[0.8125rem] font-extrabold">{rate(pending)}</p>
            <span
              className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${STATUS.pending.className}`}
            >
              {STATUS.pending.label}
            </span>
          </div>
          <p className="text-muted mt-1 text-[0.6875rem] font-semibold leading-[1.7]">
            {dates(pending)}
            {pending.terms_ref ? ` · ${pending.terms_ref}` : ''} · asked by{' '}
            {pending.requested_by_name ?? 'staff'}
          </p>
          {pending.reason && <p className="mt-1 text-[0.75rem] leading-[1.7]">{pending.reason}</p>}
          {(pending.mine || card.can_decide) && (
            <div className="mt-2 grid gap-2">
              {card.can_decide && !pending.mine && (
                <Input
                  id={`host_commission_note_${pending.id}`}
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
                          () => decideHostCommission(pending.id, true, note),
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
                          () => decideHostCommission(pending.id, false, note),
                          () => setNote(''),
                        )
                      }
                    >
                      Reject
                    </Button>
                  </>
                )}
                {pending.mine && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => run(() => withdrawHostCommission(pending.id))}
                  >
                    Withdraw
                  </Button>
                )}
              </div>
              {pending.mine && (
                <p className="text-muted text-[0.6875rem] font-semibold">
                  You asked for this, so somebody else has to approve it.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {card.can_request && !pending && !open && (
        <div className="mt-3">
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            Agree a rate
          </Button>
        </div>
      )}

      {card.can_request && !pending && open && (
        <div className="mt-3 grid gap-3">
          <p className="text-muted text-[0.6875rem] font-semibold leading-[1.7]">
            The rate this host pays NexG between these dates. A second person (Finance) approves it.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              id="host_commission_pct"
              label="NexG commission (%)"
              inputMode="decimal"
              placeholder={`Preset ${pct(card.preset_pct)}`}
              value={form.pct}
              onChange={set('pct')}
              error={
                form.pct.trim() === '' || rateValid ? undefined : '0 to 100, two decimals at most.'
              }
            />
            <Input
              id="host_commission_starts"
              label="Starts"
              type="date"
              min={card.today}
              value={form.startsOn}
              onChange={set('startsOn')}
              error={form.startsOn < card.today ? 'Today or later.' : undefined}
            />
            <Input
              id="host_commission_ends"
              label="Ends (optional)"
              type="date"
              min={form.startsOn}
              value={form.endsOn}
              onChange={set('endsOn')}
              error={form.endsOn && form.endsOn < form.startsOn ? 'After the start.' : undefined}
            />
          </div>
          <Input
            id="host_commission_reason"
            label="What was agreed"
            maxLength={1000}
            placeholder="Who agreed it, when, and on what terms"
            value={form.reason}
            onChange={set('reason')}
          />
          <Input
            id="host_commission_ref"
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
                  () => requestHostCommission(hostId, form),
                  () => {
                    setOpen(false);
                    setForm(blank);
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
        <div className="mt-4">
          <p className="text-muted text-[0.6875rem] font-extrabold uppercase tracking-wide">
            History
          </p>
          <ul className="mt-2 grid gap-2">
            {history.map((t) => (
              <li key={t.id} className="text-[0.75rem]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">{rate(t)}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold ${STATUS[t.status].className}`}
                  >
                    {t.in_force ? 'In force' : STATUS[t.status].label}
                  </span>
                </div>
                <p className="text-muted text-[0.6875rem] font-semibold leading-[1.7]">
                  {dates(t)}
                  {t.terms_ref ? ` · ${t.terms_ref}` : ''}
                  {t.requested_by_name ? ` · asked by ${t.requested_by_name}` : ''}
                  {t.decided_by_name ? ` · ${t.status} by ${t.decided_by_name}` : ''}
                </p>
                {t.reason && (
                  <p className="text-muted text-[0.6875rem] leading-[1.7]">{t.reason}</p>
                )}
                {t.decision_note && (
                  <p className="text-muted text-[0.6875rem] leading-[1.7]">
                    Note: {t.decision_note}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SubaccountSection({
  hostId,
  overview,
  busy,
  run,
}: {
  hostId: string;
  overview: HostSplitOverview;
  busy: boolean;
  run: Run;
}) {
  const [code, setCode] = React.useState('');
  const [schedule, setSchedule] = React.useState('auto');
  const [note, setNote] = React.useState('');

  const current = overview.subaccounts.filter(
    (s) => s.status === 'active' || s.status === 'paused',
  );
  const pending = overview.subaccounts.filter((s) => s.status === 'pending');

  return (
    <>
      <p className="text-[0.8125rem] font-extrabold">Paystack sub-account</p>
      <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-[1.7]">
        With a sub-account switched on, Paystack splits each stay payment: the host gets the stay
        less NexG&apos;s commission, and NexG keeps the rest and pays Paystack&apos;s fee. A refund
        comes back from the host&apos;s sub-account. Without one, the host is paid in the weekly
        payout run.
      </p>

      {current.length === 0 && pending.length === 0 && (
        <p className="mt-3 text-[0.75rem] font-bold">
          No sub-account: paid in the weekly payout run.
        </p>
      )}

      <ul className="mt-3 space-y-2">
        {[...current, ...pending].map((s) => (
          <SubaccountRow
            key={s.id}
            row={s}
            canRecord={overview.canRecord}
            busy={busy}
            onDecide={(approve, n) => run(() => decideHostSubaccount(s.id, s.code, approve, n))}
            onPause={(pause, n) => run(() => pauseHostSubaccount(s.id, pause, n))}
          />
        ))}
      </ul>

      {overview.canRecord && pending.length === 0 && (
        <div className="border-border mt-3 rounded-lg border p-3">
          <p className="text-[0.8125rem] font-extrabold">
            {current.length > 0 ? 'Replace the sub-account' : 'Add a Paystack sub-account'}
          </p>
          <p className="text-muted mt-0.5 text-[0.6875rem] font-semibold leading-[1.7]">
            Make it in the Paystack dashboard (Settings → Subaccounts), set its payout schedule
            there, then paste its code. NexG looks it up in Paystack. Leave its percentage at 0:
            NexG sets its share on every payment.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              aria-label="Sub-account code"
              value={code}
              onChange={(e) => setCode(e.target.value.trim())}
              placeholder="ACCT_…"
              className={`${field} w-48`}
            />
            <select
              aria-label="Payout schedule"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              className={field}
            >
              {Object.entries(SCHEDULE).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <input
              aria-label="Note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
              className={`${field} min-w-[10rem] flex-1`}
            />
            <button
              type="button"
              disabled={busy || code === ''}
              onClick={() =>
                void run(
                  () => requestHostSubaccount(hostId, { code, schedule, note }),
                  () => {
                    setCode('');
                    setNote('');
                  },
                )
              }
              className={dark}
            >
              Look up and record
            </button>
          </div>
        </div>
      )}

      {overview.stays.length > 0 && (
        <div className="mt-4">
          <p className="text-[0.8125rem] font-extrabold">Stays Paystack split</p>
          <ul className="divide-border mt-2 divide-y text-[0.6875rem] font-semibold">
            {overview.stays.slice(0, 10).map((s) => (
              <li key={s.stayId} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span>
                  {s.reference || 'Stay'}
                  {s.test ? ' · test' : ''}
                  {s.checkIn ? ` · check-in ${day(s.checkIn)}` : ''}
                  {s.refunded ? ' · refunded' : ''}
                </span>
                <span>
                  paid {kes(s.totalCents)} · commission {kes(s.commissionCents)} · to host{' '}
                  {kes(s.toHostCents)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function SubaccountRow({
  row,
  canRecord,
  busy,
  onDecide,
  onPause,
}: {
  row: HostSplitOverview['subaccounts'][number];
  canRecord: boolean;
  busy: boolean;
  onDecide: (approve: boolean, note: string) => void;
  onPause: (pause: boolean, note: string) => void;
}) {
  const [note, setNote] = React.useState('');
  const d = row.details;
  const mismatch = d.paystack_schedule && d.paystack_schedule.toLowerCase() !== row.schedule;
  return (
    <li className="border-border rounded-lg border p-3">
      <p className="text-[0.8125rem] font-extrabold">
        {row.code}
        {row.test ? ' · test' : ''} · {SCHEDULE[row.schedule] ?? row.schedule}
        <span className="text-muted ml-2 font-semibold">
          {row.status === 'pending'
            ? 'waiting for a second Finance person'
            : row.status === 'paused'
              ? 'paused: stays go to the weekly payout run'
              : 'on'}
        </span>
      </p>
      <p className="text-muted mt-0.5 text-[0.6875rem] font-semibold">
        Paystack pays {d.business_name ?? 'the account'}
        {d.settlement_bank ? ` at ${d.settlement_bank}` : ''}
        {d.account_last4 ? ` ····${d.account_last4}` : ''}
        {row.requestedByName ? ` · recorded by ${row.requestedByName}` : ''}
        {row.decidedByName ? ` · switched on by ${row.decidedByName}` : ''}
      </p>
      {row.note && <p className="text-muted mt-0.5 text-[0.6875rem]">Note: {row.note}</p>}
      {mismatch && (
        <p className="text-danger mt-0.5 text-[0.6875rem] font-bold">
          Paystack shows its schedule as {d.paystack_schedule}. Change it in the Paystack dashboard
          to match, or record the sub-account again.
        </p>
      )}
      {canRecord && (
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            aria-label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={row.status === 'pending' ? 'Note (needed to turn down)' : 'Why'}
            className={`${field} min-w-[10rem] flex-1`}
          />
          {row.status === 'pending' && (
            <>
              {/* The database refuses the person who recorded it. */}
              <button
                type="button"
                disabled={busy}
                onClick={() => onDecide(true, note)}
                className={dark}
              >
                Switch on
              </button>
              <button
                type="button"
                disabled={busy || note.trim() === ''}
                onClick={() => onDecide(false, note)}
                className="border-danger text-danger rounded-lg border px-3 py-1.5 text-[0.75rem] font-extrabold disabled:opacity-40"
              >
                Turn down
              </button>
            </>
          )}
          {row.status !== 'pending' && (
            <button
              type="button"
              disabled={busy || note.trim() === ''}
              onClick={() => onPause(row.status === 'active', note)}
              className="border-border-strong rounded-lg border px-3 py-1.5 text-[0.75rem] font-extrabold disabled:opacity-40"
            >
              {row.status === 'active' ? 'Pause' : 'Resume'}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
