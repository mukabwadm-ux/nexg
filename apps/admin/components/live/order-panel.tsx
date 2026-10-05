'use client';

import { Button, Card } from '@nexg/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import {
  addNote,
  adjustItems,
  contact,
  issueRefund,
  markOrder,
  previewReprice,
  refundOrder,
  refundRoutes,
  type Outcome,
} from '@/app/orders/actions';
import { cancelOrder, previewCancel, reassignRider } from '@/app/live/actions';

import type { Candidate } from './workbench';
import {
  DASH,
  PAYMENT_LABEL,
  PAYMENT_STATUS_LABEL,
  Pill,
  STAGE_LABEL,
  STAGE_TONE,
  SectionTitle,
  clock,
  kes,
  mins,
} from './shared';

export interface OrderDetail {
  id: string;
  reference: string;
  stage: string;
  channel: string;
  payment_method: string;
  payment_status: string;
  taken_by: string | null;
  guest: string | null;
  guest_phone_masked: string | null;
  guest_vip: boolean | null;
  guest_orders_before: number | null;
  guest_disputes: number | null;
  merchant: string | null;
  branch: string | null;
  branch_address: string | null;
  rider: string | null;
  rider_phone_masked: string | null;
  rider_plate: string | null;
  rider_vehicle: string | null;
  rider_health: string | null;
  dropoff_label: string | null;
  dropoff_note: string | null;
  subtotal_cents: number;
  delivery_fee_cents: number;
  service_fee_cents: number;
  small_basket_fee_cents: number;
  night_surcharge_cents: number;
  concierge_fee_cents: number;
  cash_handling_cents: number;
  tip_cents: number;
  total_cents: number;
  commission_cents: number | null;
  commission_pct: number | null;
  currency: string;
  placed_at: string;
  delivered_at: string | null;
  picked_up_at: string | null;
  minutes_late: number | null;
  delay_minutes_total: number;
  guest_unreachable: boolean;
  guest_contact_attempts: number;
  refunded_cents: number;
  refund_in_flight_cents: number;
  refund_waiting_to_send?: { id: string; amount_cents: number }[] | null;
  awaiting_merchant_ack: boolean;
  needs_action_reads_as: string | null;
  job_id: string | null;
}

export interface TimelineRow {
  id: string;
  clock: string;
  title: string;
  detail: string | null;
  photo_path: string | null;
  by: string;
}

export interface ItemRow {
  id: string;
  name: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  note: string | null;
  removed: boolean;
}

const REFUND_REASONS = [
  { code: 'late', label: 'Arrived late' },
  { code: 'missing_items', label: 'Items missing' },
  { code: 'wrong_items', label: 'Wrong items' },
  { code: 'quality', label: 'Quality complaint' },
  { code: 'never_arrived', label: 'Never arrived' },
  { code: 'goodwill', label: 'Goodwill' },
];

/**
 * The order detail panel.
 *
 * Phone numbers are masked everywhere on this screen. Revealing one
 * is its own button and its own audit line, because the alternative
 * is a console that quietly functions as an exportable phone book.
 */
export function OrderPanel({
  order,
  timeline,
  items,
  candidates,
  refundThresholdCents,
}: {
  order: OrderDetail;
  timeline: TimelineRow[];
  items: ItemRow[];
  candidates: Candidate[];
  refundThresholdCents: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [said, setSaid] = React.useState<Outcome | null>(null);

  async function run(fn: () => Promise<Outcome>) {
    setBusy(true);
    setSaid(null);
    const r = await fn();
    setSaid(r);
    setBusy(false);
    if (r.ok) {
      setOpen(null);
      router.refresh();
    }
  }

  const closed = ['delivered', 'cancelled', 'refunded'].includes(order.stage);
  const refundable = order.total_cents - order.refunded_cents - order.refund_in_flight_cents;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-extrabold">{order.reference}</h2>
          <Pill tone={STAGE_TONE[order.stage]}>{STAGE_LABEL[order.stage] ?? order.stage}</Pill>
          <Pill>
            {PAYMENT_LABEL[order.payment_method] ?? order.payment_method} ·{' '}
            {PAYMENT_STATUS_LABEL[order.payment_status] ?? order.payment_status}
          </Pill>
        </div>
        <p className="text-muted-light mt-1 text-[0.6875rem] font-semibold">
          Placed {clock(order.placed_at)}
          {order.channel === 'manual' && order.taken_by && ` · taken by ${order.taken_by}`}
          {order.minutes_late !== null && order.minutes_late > 0 && (
            <span className="text-danger"> · {mins(order.minutes_late)} past the promise</span>
          )}
        </p>
        {order.needs_action_reads_as && (
          <p className="text-danger mt-1 text-[0.75rem] font-bold">{order.needs_action_reads_as}</p>
        )}
        {order.awaiting_merchant_ack && (
          <p className="text-gold-text mt-1 text-[0.75rem] font-bold">
            The merchant has not acknowledged the last change to what they pack.
          </p>
        )}
        {order.job_id && (
          <Link
            href={`/live?selected=${order.id}`}
            className="mt-2 inline-block text-[0.75rem] font-extrabold underline underline-offset-4"
          >
            Track live →
          </Link>
        )}
      </Card>

      {said && (
        <p
          role="status"
          className={`rounded-lg px-3 py-2 text-[0.75rem] font-bold ${
            said.ok ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
          }`}
        >
          {said.message ?? (said.ok ? 'Done.' : 'That did not work.')}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Party
          title="Guest"
          name={order.guest}
          lines={[
            order.dropoff_label,
            order.guest_phone_masked,
            order.guest_orders_before !== null
              ? `${order.guest_orders_before} order${order.guest_orders_before === 1 ? '' : 's'} before${
                  order.guest_disputes ? ` · ${order.guest_disputes} disputed` : ' · no issues'
                }`
              : null,
            order.dropoff_note ? `“${order.dropoff_note}”` : null,
          ]}
          flag={order.guest_vip ? 'VIP' : order.guest_unreachable ? 'NOT ANSWERING' : null}
          onCall={() => run(() => contact(order.id, 'guest', 'call'))}
          onReveal={() => run(() => contact(order.id, 'guest', 'call', true))}
          busy={busy}
        />
        <Party
          title="Rider"
          name={order.rider}
          lines={
            order.rider
              ? [
                  `${order.rider_vehicle ?? DASH} · ${order.rider_plate ?? DASH}`,
                  order.rider_phone_masked,
                  order.rider_health ? `health ${order.rider_health}` : null,
                ]
              : ['Nobody assigned']
          }
          flag={null}
          onCall={order.rider ? () => run(() => contact(order.id, 'rider', 'call')) : undefined}
          onReveal={
            order.rider ? () => run(() => contact(order.id, 'rider', 'call', true)) : undefined
          }
          busy={busy}
        />
      </div>

      <Card className="p-4">
        <SectionTitle note={order.branch ?? undefined}>
          Items · {order.merchant ?? DASH}
        </SectionTitle>
        <ul className="mt-3 space-y-1">
          {items.map((i) => (
            <li
              key={i.id}
              className={`flex items-baseline justify-between gap-3 text-[0.8125rem] ${
                i.removed ? 'text-muted-light line-through' : ''
              }`}
            >
              <span className="font-semibold">
                {i.quantity} × {i.name}
                {i.note && <span className="text-muted-light"> · {i.note}</span>}
              </span>
              <span className="shrink-0 font-bold tabular-nums">{kes(i.line_total_cents)}</span>
            </li>
          ))}
          {items.length === 0 && (
            <li className="text-muted text-[0.8125rem] font-semibold">No items recorded.</li>
          )}
        </ul>
        <dl className="border-border mt-3 space-y-1 border-t pt-3">
          <Money label="Subtotal" cents={order.subtotal_cents} />
          <Money label="Delivery" cents={order.delivery_fee_cents} />
          <Money label="Concierge service fee" cents={order.service_fee_cents} />
          {order.small_basket_fee_cents > 0 && (
            <Money label="Small basket" cents={order.small_basket_fee_cents} />
          )}
          {order.night_surcharge_cents > 0 && (
            <Money label="Night surcharge" cents={order.night_surcharge_cents} />
          )}
          {order.cash_handling_cents > 0 && (
            <Money label="Cash handling" cents={order.cash_handling_cents} />
          )}
          {order.tip_cents > 0 && <Money label="Tip" cents={order.tip_cents} />}
          <Money
            label={`Merchant commission${order.commission_pct !== null ? ` · ${order.commission_pct}%` : ` · ${DASH}`}`}
            cents={order.commission_cents}
            muted
          />
          <Money label="Guest pays" cents={order.total_cents} strong />
          {order.refunded_cents > 0 && (
            <Money label="Refunded" cents={-order.refunded_cents} warn />
          )}
          {order.refund_in_flight_cents > 0 && (
            <Money label="Refund awaiting approval" cents={order.refund_in_flight_cents} warn />
          )}
        </dl>
      </Card>

      <Card className="p-4">
        <SectionTitle note={`${timeline.length} entries`}>Timeline</SectionTitle>
        <ol className="mt-3 space-y-2.5">
          {timeline.map((t) => (
            <li key={t.id} className="flex gap-3">
              <span className="text-muted-light w-10 shrink-0 text-[0.75rem] font-bold tabular-nums">
                {t.clock}
              </span>
              <div className="min-w-0">
                <p className="text-[0.8125rem] font-bold">{t.title}</p>
                {t.detail && <p className="text-muted text-[0.75rem] font-semibold">{t.detail}</p>}
                <p className="text-muted-light text-[0.625rem] font-semibold">{t.by}</p>
              </div>
            </li>
          ))}
          {!order.delivered_at && order.stage !== 'cancelled' && (
            <li className="flex gap-3 opacity-50">
              <span className="text-muted-light w-10 shrink-0 text-[0.75rem] font-bold">—</span>
              <div>
                <p className="text-[0.8125rem] font-bold">Delivered · payment collected</p>
                <p className="text-muted text-[0.75rem] font-semibold">Awaiting hand-off</p>
              </div>
            </li>
          )}
        </ol>
      </Card>

      <Card className="space-y-2 p-4">
        <SectionTitle>What to do</SectionTitle>

        {!closed && order.rider && (
          <Panel
            label="Reassign rider"
            open={open === 'reassign'}
            onToggle={() => setOpen(open === 'reassign' ? null : 'reassign')}
          >
            <Reassign
              candidates={candidates}
              busy={busy}
              onRun={(r, why) => run(() => reassignRider(order.id, r, why))}
            />
          </Panel>
        )}

        {!closed && (
          <Panel
            label="Adjust items"
            open={open === 'adjust'}
            onToggle={() => setOpen(open === 'adjust' ? null : 'adjust')}
          >
            <Adjust
              orderId={order.id}
              items={items.filter((i) => !i.removed)}
              pastPickup={order.picked_up_at !== null}
              busy={busy}
              onRun={(changes, reason) => run(() => adjustItems(order.id, changes, reason))}
            />
          </Panel>
        )}

        <Panel
          label="Add note"
          open={open === 'note'}
          onToggle={() => setOpen(open === 'note' ? null : 'note')}
        >
          <AddNote busy={busy} onRun={(b, v) => run(() => addNote(order.id, b, v))} />
        </Panel>

        {!order.delivered_at && order.stage !== 'cancelled' && (
          <Panel
            label="Mark delivered by hand"
            open={open === 'mark'}
            onToggle={() => setOpen(open === 'mark' ? null : 'mark')}
          >
            <MarkDelivered
              busy={busy}
              onRun={(handed, why) =>
                run(() => markOrder(order.id, 'delivered_confirmed', why, { handed_to: handed }))
              }
            />
          </Panel>
        )}

        {(order.refund_waiting_to_send ?? []).length > 0 && (
          <div className="bg-gold-soft rounded-lg p-3">
            <p className="text-gold-text text-[0.75rem] font-extrabold">
              {(order.refund_waiting_to_send ?? []).length === 1
                ? 'A refund is approved and has not left the account.'
                : `${(order.refund_waiting_to_send ?? []).length} refunds are approved and have not left the account.`}
            </p>
            {(order.refund_waiting_to_send ?? []).map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={busy}
                onClick={() => run(() => issueRefund(r.id))}
                className="bg-ink mt-2 rounded-lg px-3 py-2 text-[0.75rem] font-extrabold text-white disabled:opacity-40"
              >
                {busy ? 'Sending…' : `Send ${kes(r.amount_cents)} now`}
              </button>
            ))}
          </div>
        )}

        <Panel
          label="Refund…"
          tone="ink"
          open={open === 'refund'}
          onToggle={() => setOpen(open === 'refund' ? null : 'refund')}
          disabled={refundable <= 0}
          why={
            refundable <= 0
              ? 'The whole order is already refunded or waiting on approval.'
              : undefined
          }
        >
          <Refund
            orderId={order.id}
            maxCents={refundable}
            thresholdCents={refundThresholdCents}
            busy={busy}
            onRun={(amount, method, code, text) =>
              run(() => refundOrder(order.id, amount, method, code, text))
            }
          />
        </Panel>

        {!closed && (
          <Panel
            label="Cancel order"
            tone="danger"
            open={open === 'cancel'}
            onToggle={() => setOpen(open === 'cancel' ? null : 'cancel')}
          >
            <CancelFromOrders
              orderId={order.id}
              busy={busy}
              onRun={(code, note) => run(() => cancelOrder(order.id, code, note))}
            />
          </Panel>
        )}

        <p className="text-muted-light text-[0.6875rem] font-semibold">
          {refundThresholdCents === null
            ? `Refunds above ${DASH} need a second approver — Finance has not published the threshold, so none are held back.`
            : `Refunds from ${kes(refundThresholdCents)} need a second approver.`}{' '}
          Every action here is logged.
        </p>
      </Card>
    </div>
  );
}

function Party({
  title,
  name,
  lines,
  flag,
  onCall,
  onReveal,
  busy,
}: {
  title: string;
  name: string | null;
  lines: (string | null)[];
  flag: string | null;
  onCall?: () => void;
  onReveal?: () => void;
  busy: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-[0.06em]">
            {title}
          </p>
          <p className="truncate text-[0.875rem] font-extrabold">{name ?? DASH}</p>
          {lines.filter(Boolean).map((l) => (
            <p key={l} className="text-muted truncate text-[0.75rem] font-semibold">
              {l}
            </p>
          ))}
        </div>
        {flag && <Pill tone="bg-gold-soft text-gold-text">{flag}</Pill>}
      </div>
      {onCall && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onCall}
            disabled={busy}
            className="border-border-strong hover:border-ink rounded-lg border px-2.5 py-1.5 text-[0.6875rem] font-extrabold disabled:opacity-40"
          >
            Record a call
          </button>
          <button
            type="button"
            onClick={onReveal}
            disabled={busy}
            className="text-[0.6875rem] font-extrabold underline underline-offset-4 disabled:opacity-40"
          >
            Show the number
          </button>
        </div>
      )}
    </Card>
  );
}

function Money({
  label,
  cents,
  strong,
  muted,
  warn,
}: {
  label: string;
  cents: number | null;
  strong?: boolean;
  muted?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt
        className={`text-[0.75rem] ${strong ? 'font-extrabold' : muted ? 'text-muted-light font-semibold' : 'text-muted font-semibold'}`}
      >
        {label}
      </dt>
      <dd
        className={`shrink-0 tabular-nums ${
          strong
            ? 'text-[0.875rem] font-extrabold'
            : warn
              ? 'text-danger text-[0.75rem] font-bold'
              : muted
                ? 'text-muted-light text-[0.75rem] font-semibold'
                : 'text-[0.75rem] font-bold'
        }`}
      >
        {kes(cents)}
      </dd>
    </div>
  );
}

function Panel({
  label,
  open,
  onToggle,
  tone,
  disabled,
  why,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  tone?: 'ink' | 'danger';
  disabled?: boolean;
  why?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        title={disabled ? why : undefined}
        aria-expanded={open}
        className={`w-full rounded-lg px-3 py-2.5 text-left text-[0.8125rem] font-extrabold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          tone === 'danger'
            ? 'border-danger text-danger hover:bg-danger-bg border'
            : tone === 'ink'
              ? 'bg-ink text-white hover:opacity-90'
              : 'border-border-strong hover:border-ink border'
        }`}
      >
        {label}
      </button>
      {disabled && why && (
        <p className="text-muted-light mt-1 px-1 text-[0.6875rem] font-semibold">{why}</p>
      )}
      {open && !disabled && <div className="bg-bg mt-2 space-y-2 rounded-lg p-3">{children}</div>}
    </div>
  );
}

function Adjust({
  orderId,
  items,
  pastPickup,
  busy,
  onRun,
}: {
  orderId: string;
  items: ItemRow[];
  pastPickup: boolean;
  busy: boolean;
  onRun: (changes: { item_id: string; quantity: number }[], reason: string) => void;
}) {
  const [qty, setQty] = React.useState<Record<string, number>>(
    Object.fromEntries(items.map((i) => [i.id, i.quantity])),
  );
  const [reason, setReason] = React.useState('');
  const [preview, setPreview] = React.useState<Record<string, unknown> | null>(null);

  const changes = items
    .filter((i) => (qty[i.id] ?? i.quantity) !== i.quantity)
    .map((i) => ({ item_id: i.id, quantity: qty[i.id] ?? i.quantity }));

  React.useEffect(() => {
    if (changes.length === 0) {
      setPreview(null);
      return;
    }
    let alive = true;
    previewReprice(orderId, changes).then((r) => alive && setPreview(r.data ?? null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, JSON.stringify(changes)]);

  if (pastPickup) {
    return (
      <p className="text-muted text-[0.75rem] font-semibold">
        The rider has the bag. Items cannot change once it has been collected — a refund or a fee
        waiver is what is left.
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-1.5">
        {items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-[0.8125rem] font-semibold">{i.name}</span>
            <input
              type="number"
              min={0}
              value={qty[i.id] ?? i.quantity}
              onChange={(e) => setQty({ ...qty, [i.id]: Math.max(0, Number(e.target.value)) })}
              className="border-border-strong w-16 shrink-0 rounded-lg border px-2 py-1 text-right text-[0.8125rem] font-bold tabular-nums"
            />
          </li>
        ))}
      </ul>
      {preview && (
        <p className="bg-surface rounded-lg px-3 py-2 text-[0.75rem] font-bold">
          {preview.ok === false
            ? (preview.message as string)
            : `New total ${kes(preview.total_cents as number)} · ${
                (preview.delta_cents as number) >= 0 ? '+' : ''
              }${kes(preview.delta_cents as number)} · priced on the fees in force when the order was placed`}
        </p>
      )}
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why — the guest and the merchant are both told"
        className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
      />
      <Button
        onClick={() => onRun(changes, reason)}
        disabled={busy || changes.length === 0 || !reason.trim()}
      >
        {busy ? 'Adjusting…' : 'Apply and reprice'}
      </Button>
    </>
  );
}

function Refund({
  orderId,
  maxCents,
  thresholdCents,
  busy,
  onRun,
}: {
  orderId: string;
  maxCents: number;
  thresholdCents: number | null;
  busy: boolean;
  onRun: (amountCents: number, method: string, code: string, text: string) => void;
}) {
  const [amount, setAmount] = React.useState(String(Math.round(maxCents / 100)));
  const [method, setMethod] = React.useState('');
  const [code, setCode] = React.useState('');
  const [text, setText] = React.useState('');
  const [routes, setRoutes] = React.useState<RefundRoute[]>([]);

  /*
   * Which routes work is a fact about this order — a cash-on-
   * delivery order has nothing to reverse — so the choice offered
   * is the one the database will accept, rather than four options
   * and a constraint error.
   */
  React.useEffect(() => {
    let alive = true;
    refundRoutes(orderId).then((r) => {
      if (!alive) return;
      const list = (r.data?.routes as RefundRoute[] | undefined) ?? [];
      setRoutes(list);
      setMethod((r.data?.suggested as string | undefined) ?? '');
    });
    return () => {
      alive = false;
    };
  }, [orderId]);

  const cents = Math.round(Number(amount || 0) * 100);
  const needsTwo = thresholdCents !== null && cents >= thresholdCents;

  return (
    <>
      <label className="block">
        <span className="text-[0.6875rem] font-extrabold uppercase tracking-[0.06em]">
          Amount (KES, up to {kes(maxCents)})
        </span>
        <input
          type="number"
          min={0}
          max={Math.round(maxCents / 100)}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="border-border-strong mt-1 w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-bold"
        />
      </label>

      <fieldset className="space-y-1">
        <legend className="text-[0.6875rem] font-extrabold uppercase tracking-[0.06em]">
          How it gets back
        </legend>
        {routes.map((r) => (
          <label
            key={r.key}
            className={`flex items-start gap-2 text-[0.75rem] ${
              r.available ? 'font-semibold' : 'text-muted-light font-medium'
            }`}
          >
            <input
              type="radio"
              name="refund-method"
              value={r.key}
              checked={method === r.key}
              disabled={!r.available}
              onChange={() => setMethod(r.key)}
              className="mt-0.5"
            />
            <span>
              {r.label}
              {!r.available && r.why && <span className="block text-[0.6875rem]">{r.why}</span>}
            </span>
          </label>
        ))}
      </fieldset>

      <select
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-bold"
      >
        <option value="">Reason code — Finance reconciles against it</option>
        {REFUND_REASONS.map((r) => (
          <option key={r.code} value={r.code}>
            {r.label}
          </option>
        ))}
      </select>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What happened — required, and read months later"
        className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
      />
      {needsTwo && (
        <p className="text-gold-text text-[0.75rem] font-extrabold">
          {kes(cents)} is at or over the threshold, so this goes to the approvals queue rather than
          out now.
        </p>
      )}
      <p className="text-muted-light text-[0.6875rem] font-semibold">
        No payment provider is connected, so an approved refund is recorded rather than moved.
        Finance settles it by hand.
      </p>
      <Button
        onClick={() => onRun(cents, method, code, text)}
        disabled={busy || !code || !method || !text.trim() || cents <= 0 || cents > maxCents}
      >
        {busy ? 'Recording…' : needsTwo ? 'Request approval' : 'Approve this refund'}
      </Button>
    </>
  );
}

interface RefundRoute {
  key: string;
  label: string;
  available: boolean;
  why: string | null;
}

function AddNote({
  busy,
  onRun,
}: {
  busy: boolean;
  onRun: (body: string, visibleTo: string) => void;
}) {
  const [body, setBody] = React.useState('');
  const [who, setWho] = React.useState('staff');
  return (
    <>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
      />
      <select
        value={who}
        onChange={(e) => setWho(e.target.value)}
        className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-bold"
      >
        <option value="staff">Staff only</option>
        <option value="merchant">Also the merchant</option>
        <option value="rider">Also the rider</option>
      </select>
      <Button onClick={() => onRun(body, who)} disabled={busy || !body.trim()}>
        {busy ? 'Saving…' : 'Add note'}
      </Button>
    </>
  );
}

function MarkDelivered({
  busy,
  onRun,
}: {
  busy: boolean;
  onRun: (handedTo: string, reason: string) => void;
}) {
  const [handed, setHanded] = React.useState('');
  const [reason, setReason] = React.useState('');
  return (
    <>
      <p className="text-muted text-[0.75rem] font-semibold">
        The rider app normally does this. Marking it by hand means somebody will ask why, so say who
        took it and what happened.
      </p>
      <select
        value={handed}
        onChange={(e) => setHanded(e.target.value)}
        className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-bold"
      >
        <option value="">Who took it</option>
        <option value="guest">The guest</option>
        <option value="reception">Reception</option>
        <option value="security">Security</option>
        <option value="neighbour">A neighbour</option>
        <option value="left_at_door">Left at the door</option>
      </select>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why the app did not record it"
        className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
      />
      <Button onClick={() => onRun(handed, reason)} disabled={busy || !handed || !reason.trim()}>
        {busy ? 'Recording…' : 'Mark delivered'}
      </Button>
    </>
  );
}

function Reassign({
  candidates,
  busy,
  onRun,
}: {
  candidates: Candidate[];
  busy: boolean;
  onRun: (riderId: string, reason: string) => void;
}) {
  const [reason, setReason] = React.useState('');
  const free = candidates.filter((c) => c.eligible);
  return (
    <>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why — the outgoing rider is told this"
        className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
      />
      {free.length === 0 && (
        <p className="text-muted text-[0.75rem] font-semibold">
          Nobody else is free and eligible right now.
        </p>
      )}
      <ul className="max-h-56 space-y-1.5 overflow-y-auto">
        {free.map((c) => (
          <li
            key={c.rider_id}
            className="border-border flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2"
          >
            <span className="truncate text-[0.8125rem] font-bold">{c.name ?? DASH}</span>
            <button
              type="button"
              disabled={busy || !reason.trim()}
              onClick={() => onRun(c.rider_id, reason)}
              className="bg-ink shrink-0 rounded-lg px-3 py-1.5 text-[0.6875rem] font-extrabold text-white disabled:opacity-40"
            >
              Hand over
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function CancelFromOrders({
  orderId,
  busy,
  onRun,
}: {
  orderId: string;
  busy: boolean;
  onRun: (code: string, note: string) => void;
}) {
  const [code, setCode] = React.useState('');
  const [note, setNote] = React.useState('');
  const [what, setWhat] = React.useState<Record<string, unknown> | null>(null);

  React.useEffect(() => {
    let alive = true;
    previewCancel(orderId).then((r) => alive && setWhat(r.data ?? null));
    return () => {
      alive = false;
    };
  }, [orderId]);

  return (
    <>
      {what && (
        <div className="bg-surface space-y-1 rounded-lg p-3 text-[0.75rem]">
          <p className="font-extrabold uppercase tracking-[0.06em]">What this costs</p>
          <p className="flex justify-between gap-2">
            <span className="text-muted font-semibold">Guest refund</span>
            <span className="font-bold">
              {(what.guest_paid as boolean)
                ? kes(what.guest_refund_cents as number)
                : 'nothing — not paid'}
            </span>
          </p>
          {what.rider_compensation_set === false && (
            <p className="text-danger font-bold">
              The rider collected this and no compensation rate is published.
            </p>
          )}
          {what.merchant_compensation_set === false && (
            <p className="text-danger font-bold">
              The merchant confirmed and no compensation rate is published.
            </p>
          )}
          {(what.needs_second_person as boolean) && (
            <p className="text-gold-text font-extrabold">
              Over the threshold — this goes to approvals.
            </p>
          )}
        </div>
      )}
      <select
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-bold"
      >
        <option value="">Reason — the guest and the merchant are told it</option>
        <option value="merchant_closed">Merchant closed or cannot fulfil</option>
        <option value="no_rider">No rider could be found</option>
        <option value="guest_cancelled">Guest asked to cancel</option>
        <option value="guest_unreachable">Guest unreachable</option>
        <option value="address_wrong">Address is wrong or unreachable</option>
        <option value="safety">Safety · weather · incident</option>
        <option value="duplicate">Duplicate order</option>
      </select>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Anything else worth recording"
        className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
      />
      <button
        type="button"
        disabled={busy || !code}
        onClick={() => onRun(code, note)}
        className="bg-danger w-full rounded-lg px-3 py-2.5 text-[0.8125rem] font-extrabold text-white disabled:opacity-40"
      >
        {busy ? 'Cancelling…' : 'Cancel this order'}
      </button>
    </>
  );
}
