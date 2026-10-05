'use client';

import { Button, Card } from '@nexg/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import {
  assignManually,
  boostAndRetry,
  cancelOrder,
  forceStack,
  previewCancel,
  previewWiden,
  reassignRider,
  tellGuestDelay,
  widenRadius,
  type Outcome,
} from '@/app/live/actions';

import {
  DASH,
  OUTCOME_TONE,
  Pill,
  SectionTitle,
  URGENCY_LABEL,
  URGENCY_TONE,
  ago,
  kes,
  km,
  mins,
  plural,
} from './shared';

export interface LiveOrder {
  id: string;
  reference: string;
  urgency: string;
  stage: string;
  merchant: string | null;
  branch: string | null;
  dropoff_label: string | null;
  guest: string | null;
  guest_vip: boolean | null;
  placed_at: string;
  promised_delivery_at: string | null;
  minutes_late: number | null;
  rider: string | null;
  rider_phone: string | null;
  job_id: string | null;
  job_state: string | null;
  cascade_round: number | null;
  radius_km: number | null;
  boost_cents: number | null;
  escalation_reason: string | null;
  offers_made: number | null;
  declines: number | null;
  round_seconds_left: number | null;
  total_cents: number | null;
  needs_action_reasons: string[] | null;
  needs_action_reads_as: string | null;
}

export interface CascadeRow {
  id: string;
  round: number;
  rank: number;
  rider_id: string | null;
  rider: string | null;
  plate_no: string | null;
  vehicle: string | null;
  distance_km: number | null;
  eta_min: number | null;
  outcome: string;
  skip_reason: string | null;
  direct: boolean;
  note: string | null;
  answered_in_s: number | null;
  seconds_left: number | null;
  reads_as: string;
}

export interface Candidate {
  rider_id: string;
  name: string | null;
  vehicle: string | null;
  plate_no: string | null;
  distance_km: number | null;
  eta_min: number | null;
  eligible: boolean;
  skip_reason: string | null;
  note: string | null;
}

export interface Rules {
  accept_window_s: number | null;
  rounds: number | null;
  radius_km: number | null;
  boost_cents: number | null;
  boost_max_cents: number | null;
  free_cancel_min: number | null;
  reads_as: string;
}

const WIDEN_STEPS = [3, 5, 8];

const CANCEL_REASONS = [
  { code: 'merchant_closed', label: 'Merchant closed or cannot fulfil' },
  { code: 'no_rider', label: 'No rider could be found' },
  { code: 'guest_cancelled', label: 'Guest asked to cancel' },
  { code: 'guest_unreachable', label: 'Guest unreachable' },
  { code: 'address_wrong', label: 'Address is wrong or unreachable' },
  { code: 'safety', label: 'Safety · weather · incident' },
  { code: 'duplicate', label: 'Duplicate order' },
];

/**
 * The workbench.
 *
 * Every action here states its consequence before it happens, which
 * is the whole reason this panel exists rather than a row of
 * buttons: a dispatcher cannot weigh boosting against widening
 * without knowing that one is rider pay and the other is five more
 * riders. Where the figure is not published, the button says so and
 * refuses rather than guessing.
 */
export function Workbench({
  order,
  cascade,
  candidates,
  rules,
  canPause,
}: {
  order: LiveOrder;
  cascade: CascadeRow[];
  candidates: Candidate[];
  rules: Rules | null;
  canPause: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [said, setSaid] = React.useState<Outcome | null>(null);
  const assignRef = React.useRef<HTMLDivElement>(null);

  const run = React.useCallback(
    async (fn: () => Promise<Outcome>) => {
      setBusy(true);
      setSaid(null);
      try {
        const r = await fn();
        setSaid(r);
        if (r.ok) {
          setOpen(null);
          router.refresh();
        }
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  /* J/K/B/A/W/T/Esc, as the artboard specifies. Ignored while a
     field has focus, because `b` is also a letter. */
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') setOpen(null);
      else if (k === 'b') setOpen((o) => (o === 'boost' ? null : 'boost'));
      else if (k === 'w') setOpen((o) => (o === 'widen' ? null : 'widen'));
      else if (k === 't') setOpen((o) => (o === 'delay' ? null : 'delay'));
      else if (k === 'a') {
        setOpen('assign');
        requestAnimationFrame(() => assignRef.current?.focus());
      } else return;
      e.preventDefault();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const live = order.job_state === 'offering' || order.job_state === 'queued';
  const settled = order.job_state === 'assigned' || order.job_state === 'manual_assigned';
  const rounds = [...new Set(cascade.map((c) => c.round))].sort((a, b) => a - b);
  const nextWiden = WIDEN_STEPS.find((s) => s > Number(order.radius_km ?? 0)) ?? null;
  const boostedThisRound = cascade.some(
    (c) => c.round === order.cascade_round && c.note?.includes('boost'),
  );

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold">{order.reference}</h2>
              <Pill tone={URGENCY_TONE[order.urgency]}>
                {URGENCY_LABEL[order.urgency] ?? order.urgency}
              </Pill>
            </div>
            <p className="text-muted mt-1 text-[0.75rem] font-semibold">
              {order.merchant ?? DASH} → {order.dropoff_label ?? DASH}
              {' · '}
              guest waiting {ago(order.placed_at)}
            </p>
            {order.needs_action_reads_as && (
              <p className="text-danger mt-1 text-[0.75rem] font-bold">
                {order.needs_action_reads_as}
              </p>
            )}
          </div>
          <Link
            href={`/orders?selected=${order.id}`}
            className="text-[0.75rem] font-extrabold underline underline-offset-4"
          >
            Open order →
          </Link>
        </div>
      </Card>

      <Card className="p-4">
        <SectionTitle
          note={
            order.cascade_round
              ? `Round ${order.cascade_round}${rules?.rounds ? ` of ${rules.rounds}` : ''} · ranked by ETA to pickup`
              : 'Not dispatched'
          }
        >
          Dispatch cascade
        </SectionTitle>

        {cascade.length === 0 ? (
          <p className="text-muted mt-3 text-[0.8125rem] font-semibold">
            No offers have been made. If this order is live, the cascade has not run yet — which is
            itself worth knowing.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {rounds.map((r) => (
              <div key={r} className="border-border border-t pt-3 first:border-t-0 first:pt-0">
                <p className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-[0.06em]">
                  Round {r}
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {cascade
                    .filter((c) => c.round === r)
                    .map((c) => (
                      <li key={c.id} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[0.8125rem] font-bold">
                            <span className="text-muted-light tabular-nums">{c.rank}.</span>{' '}
                            {c.rider ?? DASH}
                            {c.direct && (
                              <span className="text-gold-text ml-1.5 text-[0.625rem] font-extrabold uppercase">
                                asked directly
                              </span>
                            )}
                          </p>
                          {c.note && (
                            <p className="text-muted-light truncate text-[0.6875rem] font-semibold">
                              {c.note}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <Pill tone={OUTCOME_TONE[c.outcome]}>
                            {c.outcome === 'pending' && c.seconds_left !== null
                              ? `${c.seconds_left} s left`
                              : c.outcome === 'accepted' && c.answered_in_s !== null
                                ? `Accepted · ${c.answered_in_s} s`
                                : c.reads_as.replace(/^Not asked · .*/, 'Not asked')}
                          </Pill>
                          <p className="text-muted-light mt-0.5 text-[0.625rem] font-semibold tabular-nums">
                            {km(c.distance_km)} · {c.eta_min ?? DASH} min
                          </p>
                        </div>
                      </li>
                    ))}
                </ul>
              </div>
            ))}

            {order.job_state === 'escalated' && (
              <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-[0.75rem] font-extrabold">
                Radius {order.radius_km ?? DASH} km exhausted after{' '}
                {plural(order.cascade_round ?? 0, 'round')} · escalated to the desk
              </p>
            )}
            {settled && (
              <p className="bg-success-bg text-success rounded-lg px-3 py-2 text-[0.75rem] font-extrabold">
                {order.rider ?? 'A rider'} has it
                {order.job_state === 'manual_assigned' && ' · assigned by a dispatcher'}
              </p>
            )}
          </div>
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

      {!settled && order.job_id && (
        <Card className="space-y-2 p-4">
          <SectionTitle note="B · A · W · T">What to do about it</SectionTitle>

          <BoostAction
            open={open === 'boost'}
            onToggle={() => setOpen(open === 'boost' ? null : 'boost')}
            rules={rules}
            alreadyThisRound={boostedThisRound}
            busy={busy}
            onRun={(cents) => run(() => boostAndRetry(order.job_id!, cents))}
          />

          <WidenAction
            open={open === 'widen'}
            onToggle={() => setOpen(open === 'widen' ? null : 'widen')}
            jobId={order.job_id}
            current={Number(order.radius_km ?? 0)}
            next={nextWiden}
            busy={busy}
            onRun={(r) => run(() => widenRadius(order.job_id!, r))}
          />

          <AssignAction
            ref={assignRef}
            open={open === 'assign'}
            onToggle={() => setOpen(open === 'assign' ? null : 'assign')}
            candidates={candidates}
            busy={busy}
            onAssign={(rider, reason) => run(() => assignManually(order.job_id!, rider, reason))}
            onStack={(rider, reason) => run(() => forceStack(order.job_id!, rider, reason))}
          />

          <DelayAction
            open={open === 'delay'}
            onToggle={() => setOpen(open === 'delay' ? null : 'delay')}
            freeCancelMin={rules?.free_cancel_min ?? null}
            busy={busy}
            onRun={(m, note) => run(() => tellGuestDelay(order.id, m, note))}
          />

          <CancelAction
            open={open === 'cancel'}
            onToggle={() => setOpen(open === 'cancel' ? null : 'cancel')}
            orderId={order.id}
            busy={busy}
            onRun={(code, note) => run(() => cancelOrder(order.id, code, note))}
          />
        </Card>
      )}

      {settled && (
        <Card className="space-y-2 p-4">
          <SectionTitle>What to do about it</SectionTitle>
          <p className="text-muted text-[0.75rem] font-semibold">
            {order.rider ?? 'A rider'} has this one. The cascade is finished — what is left is
            changing who carries it, moving the promise, or stopping it.
          </p>
          <ReassignAction
            open={open === 'reassign'}
            onToggle={() => setOpen(open === 'reassign' ? null : 'reassign')}
            candidates={candidates}
            busy={busy}
            onRun={(rider, reason) => run(() => reassignRider(order.id, rider, reason))}
          />
          <DelayAction
            open={open === 'delay'}
            onToggle={() => setOpen(open === 'delay' ? null : 'delay')}
            freeCancelMin={rules?.free_cancel_min ?? null}
            busy={busy}
            onRun={(m, note) => run(() => tellGuestDelay(order.id, m, note))}
          />
          <CancelAction
            open={open === 'cancel'}
            onToggle={() => setOpen(open === 'cancel' ? null : 'cancel')}
            orderId={order.id}
            busy={busy}
            onRun={(code, note) => run(() => cancelOrder(order.id, code, note))}
          />
        </Card>
      )}

      {canPause && live && (
        <p className="text-muted-light text-[0.6875rem] font-semibold">
          Zone controls are in the Zones panel below the map.
        </p>
      )}
    </div>
  );
}

function Disclosure({
  label,
  open,
  onToggle,
  tone,
  disabled,
  why,
  children,
}: {
  label: React.ReactNode;
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

function BoostAction({
  open,
  onToggle,
  rules,
  alreadyThisRound,
  busy,
  onRun,
}: {
  open: boolean;
  onToggle: () => void;
  rules: Rules | null;
  alreadyThisRound: boolean;
  busy: boolean;
  onRun: (cents: number | null) => void;
}) {
  const [amount, setAmount] = React.useState<string>('');
  const unset = rules?.boost_cents === null || rules?.boost_cents === undefined;

  return (
    <Disclosure
      label={
        <>
          ⚡ Boost fee {unset ? DASH : `+${kes(rules!.boost_cents)}`} &amp; retry
          <span className="ml-1.5 text-[0.625rem] font-bold opacity-60">B</span>
        </>
      }
      tone="ink"
      open={open}
      onToggle={onToggle}
      disabled={unset || alreadyThisRound}
      why={
        unset
          ? 'No boost amount is published for this city. Finance sets it on Settings → Fees & dispatch, and until they do there is no figure to add to a rider’s pay.'
          : alreadyThisRound
            ? 'This round has already been boosted. Let it run, or widen the radius.'
            : undefined
      }
    >
      <p className="text-muted text-[0.75rem] font-semibold">
        This adds to what the rider is paid. The guest’s price does not change.
      </p>
      <label className="block">
        <span className="text-[0.6875rem] font-extrabold uppercase tracking-[0.06em]">
          Amount (KES)
        </span>
        <input
          type="number"
          min={0}
          max={rules?.boost_max_cents ? rules.boost_max_cents / 100 : undefined}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={rules?.boost_cents ? String(rules.boost_cents / 100) : ''}
          className="border-border-strong mt-1 w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-bold"
        />
      </label>
      {rules?.boost_max_cents && (
        <p className="text-muted-light text-[0.6875rem] font-semibold">
          Up to {kes(rules.boost_max_cents)} in this city.
        </p>
      )}
      <Button
        onClick={() => onRun(amount === '' ? null : Math.round(Number(amount) * 100))}
        disabled={busy}
      >
        {busy ? 'Boosting…' : 'Boost and ask again'}
      </Button>
    </Disclosure>
  );
}

function WidenAction({
  open,
  onToggle,
  jobId,
  current,
  next,
  busy,
  onRun,
}: {
  open: boolean;
  onToggle: () => void;
  jobId: string;
  current: number;
  next: number | null;
  busy: boolean;
  onRun: (radius: number) => void;
}) {
  const [preview, setPreview] = React.useState<string | null>(null);
  const [looking, setLooking] = React.useState(false);

  React.useEffect(() => {
    if (!open || next === null) return;
    let alive = true;
    setLooking(true);
    previewWiden(jobId, next).then((r) => {
      if (alive) {
        setPreview(r.message ?? null);
        setLooking(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [open, jobId, next]);

  return (
    <Disclosure
      label={
        <>
          Widen radius to {next ?? DASH} km
          <span className="ml-1.5 text-[0.625rem] font-bold opacity-60">W</span>
        </>
      }
      open={open}
      onToggle={onToggle}
      disabled={next === null}
      why={
        next === null
          ? `Already searching ${current} km, which is the widest step. Boosting, or telling the guest, is what is left.`
          : undefined
      }
    >
      <p className="text-[0.8125rem] font-bold">
        {looking ? 'Counting who that reaches…' : (preview ?? '')}
      </p>
      <p className="text-muted-light text-[0.6875rem] font-semibold">
        The steps are 3 → 5 → 8 km, so a rider is never sent somewhere nobody decided was
        reasonable.
      </p>
      <Button onClick={() => next !== null && onRun(next)} disabled={busy || next === null}>
        {busy ? 'Widening…' : `Search ${next ?? DASH} km`}
      </Button>
    </Disclosure>
  );
}

const AssignAction = React.forwardRef<
  HTMLDivElement,
  {
    open: boolean;
    onToggle: () => void;
    candidates: Candidate[];
    busy: boolean;
    onAssign: (riderId: string, reason: string) => void;
    onStack: (riderId: string, reason: string) => void;
  }
>(function AssignAction({ open, onToggle, candidates, busy, onAssign, onStack }, ref) {
  const [reason, setReason] = React.useState('');

  return (
    <Disclosure
      label={
        <>
          Assign manually
          <span className="ml-1.5 text-[0.625rem] font-bold opacity-60">A</span>
        </>
      }
      open={open}
      onToggle={onToggle}
    >
      <div ref={ref} tabIndex={-1} className="space-y-2 outline-none">
        <label className="block">
          <span className="text-[0.6875rem] font-extrabold uppercase tracking-[0.06em]">
            Why this rider
          </span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="The cascade had its reasons; this overrides them."
            className="border-border-strong mt-1 w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
          />
        </label>
        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {candidates.length === 0 && (
            <li className="text-muted text-[0.75rem] font-semibold">
              Nobody is online in this city right now.
            </li>
          )}
          {candidates.map((c) => {
            const hard =
              c.skip_reason === 'wrong_vehicle' ||
              c.skip_reason === 'cash_over_cap' ||
              c.skip_reason === 'not_alcohol_eligible' ||
              c.skip_reason === 'not_large_item_eligible';
            const stackable = c.skip_reason === 'stacking_not_allowed';
            return (
              <li
                key={c.rider_id}
                className="border-border flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-[0.8125rem] font-bold">{c.name ?? DASH}</p>
                  <p className="text-muted-light truncate text-[0.6875rem] font-semibold">
                    {c.vehicle ?? DASH} · {c.plate_no ?? DASH} · {km(c.distance_km)} ·{' '}
                    {c.eta_min ?? DASH} min
                  </p>
                  {!c.eligible && c.note && (
                    <p className="text-muted-light truncate text-[0.6875rem] font-semibold italic">
                      why not offered: {c.note}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busy || hard || !reason.trim()}
                  title={
                    hard
                      ? `Cannot: ${c.note}. That is not a judgement call.`
                      : !reason.trim()
                        ? 'Say why first.'
                        : undefined
                  }
                  onClick={() =>
                    stackable ? onStack(c.rider_id, reason) : onAssign(c.rider_id, reason)
                  }
                  className="bg-ink shrink-0 rounded-lg px-3 py-1.5 text-[0.6875rem] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {stackable ? 'Stack' : 'Assign'}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Disclosure>
  );
});

function DelayAction({
  open,
  onToggle,
  freeCancelMin,
  busy,
  onRun,
}: {
  open: boolean;
  onToggle: () => void;
  freeCancelMin: number | null;
  busy: boolean;
  onRun: (minutes: number, note: string) => void;
}) {
  const [minutes, setMinutes] = React.useState(15);
  const [note, setNote] = React.useState('');
  const free = freeCancelMin !== null && minutes >= freeCancelMin;

  return (
    <Disclosure
      label={
        <>
          Tell guest · {mins(minutes)}
          <span className="ml-1.5 text-[0.625rem] font-bold opacity-60">T</span>
        </>
      }
      open={open}
      onToggle={onToggle}
    >
      <label className="block">
        <span className="text-[0.6875rem] font-extrabold uppercase tracking-[0.06em]">
          How much later
        </span>
        <div className="mt-1 flex gap-1.5">
          {[10, 15, 20, 30].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMinutes(m)}
              className={`rounded-lg px-3 py-1.5 text-[0.75rem] font-extrabold ${
                minutes === m ? 'bg-ink text-white' : 'border-border-strong border'
              }`}
            >
              +{m}
            </button>
          ))}
        </div>
      </label>
      <label className="block">
        <span className="text-[0.6875rem] font-extrabold uppercase tracking-[0.06em]">
          What to tell them
        </span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="merchant running long"
          className="border-border-strong mt-1 w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
        />
      </label>
      <p className="text-muted text-[0.75rem] font-semibold">
        {freeCancelMin === null
          ? 'No free-cancellation threshold is published for this city, so no refund is offered with this notice. Finance sets it on Settings → Fees & dispatch.'
          : free
            ? `At +${minutes} min the guest is also offered a cancellation with their money back.`
            : `A free cancellation is offered from +${freeCancelMin} min.`}
      </p>
      <Button onClick={() => onRun(minutes, note)} disabled={busy}>
        {busy ? 'Telling them…' : `Move the promise by ${minutes} min`}
      </Button>
    </Disclosure>
  );
}

function ReassignAction({
  open,
  onToggle,
  candidates,
  busy,
  onRun,
}: {
  open: boolean;
  onToggle: () => void;
  candidates: Candidate[];
  busy: boolean;
  onRun: (riderId: string, reason: string) => void;
}) {
  const [reason, setReason] = React.useState('');

  return (
    <Disclosure label="Reassign rider" open={open} onToggle={onToggle}>
      <p className="text-muted text-[0.75rem] font-semibold">
        The order has no rider until the new one accepts, so the guest is not told about somebody
        who then declines.
      </p>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why — the outgoing rider is told this"
        className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
      />
      <ul className="max-h-60 space-y-1.5 overflow-y-auto">
        {candidates
          .filter((c) => c.eligible)
          .map((c) => (
            <li
              key={c.rider_id}
              className="border-border flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-[0.8125rem] font-bold">{c.name ?? DASH}</p>
                <p className="text-muted-light text-[0.6875rem] font-semibold">
                  {km(c.distance_km)} · {c.eta_min ?? DASH} min
                </p>
              </div>
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
    </Disclosure>
  );
}

function CancelAction({
  open,
  onToggle,
  orderId,
  busy,
  onRun,
}: {
  open: boolean;
  onToggle: () => void;
  orderId: string;
  busy: boolean;
  onRun: (code: string, note: string) => void;
}) {
  const [code, setCode] = React.useState('');
  const [note, setNote] = React.useState('');
  const [what, setWhat] = React.useState<Record<string, unknown> | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    previewCancel(orderId).then((r) => alive && setWhat(r.data ?? null));
    return () => {
      alive = false;
    };
  }, [open, orderId]);

  return (
    <Disclosure label="Cancel order" tone="danger" open={open} onToggle={onToggle}>
      {what && (
        <div className="bg-surface space-y-1 rounded-lg p-3">
          <p className="text-[0.6875rem] font-extrabold uppercase tracking-[0.06em]">
            What this costs
          </p>
          <Consequence
            label="Guest refund"
            value={
              (what.guest_paid as boolean)
                ? kes(what.guest_refund_cents as number)
                : 'nothing — they had not paid'
            }
          />
          <Consequence
            label="Rider compensation"
            value={
              what.rider_compensation_set === false
                ? `${DASH} · the rider collected this order and no rate is published`
                : what.rider_compensation_cents === null
                  ? 'none — no rider had collected it'
                  : kes(what.rider_compensation_cents as number)
            }
            warn={what.rider_compensation_set === false}
          />
          <Consequence
            label="Merchant compensation"
            value={
              what.merchant_compensation_set === false
                ? `${DASH} · the merchant had confirmed and no rate is published`
                : what.merchant_compensation_cents === null
                  ? 'none — the merchant had not confirmed'
                  : kes(what.merchant_compensation_cents as number)
            }
            warn={what.merchant_compensation_set === false}
          />
          {(what.needs_second_person as boolean) && (
            <p className="text-gold-text text-[0.75rem] font-extrabold">
              Over {kes(what.threshold_cents as number)} — this goes to the approvals queue rather
              than happening now.
            </p>
          )}
        </div>
      )}
      <label className="block">
        <span className="text-[0.6875rem] font-extrabold uppercase tracking-[0.06em]">Reason</span>
        <select
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="border-border-strong mt-1 w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-bold"
        >
          <option value="">Pick one — the guest and the merchant are told it</option>
          {CANCEL_REASONS.map((r) => (
            <option key={r.code} value={r.code}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
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
    </Disclosure>
  );
}

function Consequence({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <p className="flex items-baseline justify-between gap-2 text-[0.75rem]">
      <span className="text-muted font-semibold">{label}</span>
      <span className={`text-right font-bold ${warn ? 'text-danger' : ''}`}>{value}</span>
    </p>
  );
}
