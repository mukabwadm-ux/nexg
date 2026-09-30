import { Card } from '@nexg/ui';
import Link from 'next/link';

import {
  CATEGORY_LABEL,
  DASH,
  daysSince,
  EmptyRow,
  HealthDot,
  hhmm,
  kes,
  num,
  pct,
  StatusPill,
  Tile,
  when,
  type Counts,
  type DirectoryRow,
} from './shared';

/**
 * The tabs that are a table over one domain each.
 *
 * Kept together because they share the same shape — tiles, a table, a
 * right-hand panel — and splitting six near-identical files apart buys
 * nothing but six imports.
 *
 * Every one of them reads real rows. Where a domain has produced no
 * rows yet, the tab says so in words rather than drawing an empty grid
 * that looks broken: "no snapshots yet, the nightly job has not run" is
 * information, and a blank table is not.
 */

// ══════════════════════════════════════════════════════ pipeline

const STAGES = [
  { key: 'applied', label: 'Applied', statuses: ['applied'] },
  { key: 'documents', label: 'Documents', statuses: ['documents_pending'] },
  { key: 'verification', label: 'Verification', statuses: ['under_review'] },
  { key: 'live', label: 'Live', statuses: ['live'] },
] as const;

export function PipelineTab({ rows, counts }: { rows: DirectoryRow[]; counts: Counts }) {
  const blocked = rows.filter((r) => {
    const age = daysSince(r.submitted_at ?? r.created_at);
    return (
      ['applied', 'documents_pending', 'under_review'].includes(r.status) && (age ?? 0) > 5
    );
  });

  return (
    <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Merchants total" value={num(counts.total)}>
          across every city
        </Tile>
        <Tile label="Live &amp; accepting" value={num(counts.live)}>
          {num(counts.paused)} paused · {num(counts.suspended)} suspended
        </Tile>
        <Tile label="In onboarding" value={num(counts.onboarding)}>
          somewhere between applied and live
        </Tile>
        <Tile
          label="Blocked &gt; 5 days"
          value={num(blocked.length)}
          tone={blocked.length > 0 ? 'danger' : undefined}
        >
          {blocked.length > 0
            ? `oldest ${Math.max(...blocked.map((b) => daysSince(b.submitted_at ?? b.created_at) ?? 0))} d`
            : 'nothing stuck'}
        </Tile>
      </div>

      {/*
       * Average time to live is deliberately absent rather than shown
       * as a number. It needs a run of merchants who have actually gone
       * live to average, and inventing one would put a target on this
       * page that nobody agreed to (ground rule 3).
       */}
      <div className="mt-5 grid gap-4 md:grid-cols-4">
        {STAGES.map((stage) => {
          const inStage = rows.filter((r) => (stage.statuses as readonly string[]).includes(r.status));
          return (
            <Card key={stage.key} className="p-0">
              <div className="border-border flex items-center justify-between border-b px-3 py-2.5">
                <p className="text-[0.75rem] font-extrabold uppercase tracking-wide">
                  {stage.label}
                </p>
                <span className="text-muted-light text-xs font-extrabold">{inStage.length}</span>
              </div>
              <ul className="min-h-[8rem] p-2">
                {inStage.map((m) => {
                  const age = daysSince(m.submitted_at ?? m.created_at);
                  return (
                    <li key={m.id} className="mb-2 last:mb-0">
                      <Link
                        href={`/merchants/${m.id}`}
                        className="border-border bg-bg hover:border-border-strong block rounded-lg border p-2.5 transition-colors"
                      >
                        <span className="block text-[0.8125rem] font-extrabold">
                          {m.trading_name ?? '[Trading name]'}
                        </span>
                        <span className="text-muted-light block text-[0.6875rem] font-semibold">
                          {CATEGORY_LABEL[m.category ?? 'other']} · {m.city_name ?? DASH}
                        </span>
                        {age !== null && age > 0 && (
                          <span
                            className={`mt-1 block text-[0.6875rem] font-extrabold ${
                              age > 5 ? 'text-danger' : 'text-gold-text'
                            }`}
                          >
                            {age} d in stage
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
                {inStage.length === 0 && (
                  <li className="text-muted-light px-1 py-6 text-center text-xs font-semibold">
                    Nobody here
                  </li>
                )}
              </ul>
            </Card>
          );
        })}
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════ health

export interface Weight {
  key: string;
  label: string;
  weight_pct: number;
  target: number | null;
}

export function HealthTab({
  rows,
  weights,
  strikes,
}: {
  rows: DirectoryRow[];
  weights: Weight[];
  strikes: { level: number; count: number }[];
}) {
  const scored = rows.filter((r) => r.health_score !== null);
  const green = scored.filter((r) => r.health_band === 'green');
  const amber = scored.filter((r) => r.health_band === 'amber');
  const red = scored.filter((r) => r.health_band === 'red');

  return (
    <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Green" value={num(green.length)} tone="success">
          eligible for Featured
        </Tile>
        <Tile label="Amber · watchlist" value={num(amber.length)} tone="warning">
          call this week
        </Tile>
        <Tile label="Red" value={num(red.length)} tone={red.length > 0 ? 'danger' : undefined}>
          hidden from Explore while red
        </Tile>
        <Tile label="Not enough data" value={num(rows.filter((r) => r.health_score === null).length)}>
          under the minimum order count
        </Tile>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[38rem] text-left">
            <thead>
              <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-3">Merchant</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">On-time</th>
                <th className="px-4 py-3">Orders 30d</th>
                <th className="px-4 py-3">Disputes</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((r) => r.status === 'live')
                .map((m) => (
                  <tr key={m.id} className="border-border border-b last:border-b-0">
                    <td className="px-4 py-3">
                      <Link href={`/merchants/${m.id}`} className="block">
                        <span className="block text-[0.8125rem] font-extrabold">
                          {m.trading_name ?? '[Trading name]'}
                        </span>
                        <span className="text-muted-light block text-[0.6875rem] font-semibold">
                          {CATEGORY_LABEL[m.category ?? 'other']} · {m.city_name ?? DASH}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <HealthDot band={m.health_band} score={m.health_score} />
                    </td>
                    <td className="px-4 py-3 text-[0.8125rem] font-bold">
                      {pct(m.on_time_ready_pct)}
                    </td>
                    <td className="px-4 py-3 text-[0.8125rem] font-bold">{num(m.orders_30d)}</td>
                    <td className="px-4 py-3 text-[0.8125rem] font-bold">
                      {(m.open_disputes ?? 0) > 0 ? (
                        <span className="text-danger">{m.open_disputes}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              {rows.filter((r) => r.status === 'live').length === 0 && (
                <EmptyRow colSpan={5}>No live merchants yet.</EmptyRow>
              )}
            </tbody>
          </table>
          {scored.length === 0 && (
            <p className="text-muted border-border border-t px-4 py-4 text-[0.75rem] font-semibold leading-[1.7]">
              No scores yet. Health is computed nightly from orders, and there is no orders domain
              to compute it from — every merchant shows {DASH} rather than a number nobody
              measured.
            </p>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="text-sm font-extrabold uppercase tracking-wide">
              How the score is built
            </h3>
            <ul className="mt-3 space-y-2">
              {weights.map((w) => (
                <li key={w.key}>
                  <span className="flex items-baseline justify-between gap-2 text-[0.75rem]">
                    <span className="font-bold">{w.label}</span>
                    <span className="text-muted-light font-extrabold">{w.weight_pct}%</span>
                  </span>
                  <span className="bg-bg mt-1 block h-1.5 w-full overflow-hidden rounded-full">
                    <span
                      className="bg-ink block h-full rounded-full"
                      style={{ width: `${w.weight_pct}%` }}
                    />
                  </span>
                  <span className="text-muted-light mt-0.5 block text-[0.625rem] font-semibold">
                    target {w.target === null ? DASH : w.target}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-muted mt-3 text-[0.6875rem] font-semibold leading-[1.7]">
              Weights are settings with an audit trail, not constants in code — the score decides
              who is eligible for a Featured slot and who gets delisted. Editing them applies from
              the next nightly run and never rewrites a past snapshot.
            </p>
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-extrabold uppercase tracking-wide">Strikes ladder</h3>
            <ol className="mt-3 space-y-2.5">
              {[
                { level: 1, title: 'Warning', body: 'Auto email and a call task.' },
                { level: 2, title: 'Temporary delist', body: 'Hidden from Explore, 7 days to fix.' },
                { level: 3, title: 'Suspension', body: 'Payout held · needs a second approver.' },
              ].map((s) => (
                <li key={s.level} className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-extrabold text-white ${
                      s.level === 1 ? 'bg-warning' : s.level === 2 ? 'bg-danger' : 'bg-ink'
                    }`}
                  >
                    {s.level}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[0.75rem] font-extrabold">
                      {s.title}
                      <span className="text-muted-light ml-1.5 font-semibold">
                        {num(strikes.find((x) => x.level === s.level)?.count ?? 0)} live
                      </span>
                    </span>
                    <span className="text-muted-light block text-[0.6875rem] font-semibold leading-snug">
                      {s.body}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-[1.7]">
              Level 2 and 3 are proposed as tasks and never executed by the nightly job. Taking a
              merchant off the platform is a person&rsquo;s decision.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════ disputes

export interface DisputeRow {
  id: string;
  order_reference: string | null;
  merchant_name: string | null;
  reason: string;
  fault: string;
  status: string;
  amount_claimed_kes: number | null;
  amount_refunded_kes: number | null;
  merchant_reply_due_at: string | null;
  opened_at: string;
  guest_note: string | null;
  merchant_reply: string | null;
}

const REASON_LABEL: Record<string, string> = {
  missing_item: 'Missing item',
  wrong_item: 'Wrong item delivered',
  cold: 'Cold on arrival',
  late: 'Late',
  damaged: 'Damaged',
  quality: 'Quality below promise',
  other: 'Other',
};

const DISPUTE_TONE: Record<string, string> = {
  open: 'bg-danger-bg text-danger',
  awaiting_merchant: 'bg-warning-bg text-warning',
  resolved: 'bg-success-bg text-success',
  chargeback: 'bg-danger-bg text-danger',
};

export function DisputesTab({ rows }: { rows: DisputeRow[] }) {
  const open = rows.filter((r) => r.status === 'open');
  const awaiting = rows.filter((r) => r.status === 'awaiting_merchant');
  const refunded = rows
    .filter((r) => r.status === 'resolved')
    .reduce((sum, r) => sum + (r.amount_refunded_kes ?? 0), 0);

  return (
    <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Open disputes"
          value={num(open.length + awaiting.length)}
          tone={open.length + awaiting.length > 0 ? 'danger' : undefined}
        >
          {num(awaiting.length)} waiting on a merchant reply
        </Tile>
        <Tile label="Refunded · all time" value={kes(refunded)}>
          across {num(rows.filter((r) => r.status === 'resolved').length)} resolved
        </Tile>
        <Tile label="Chargebacks" value={num(rows.filter((r) => r.status === 'chargeback').length)}>
          issued by the card network
        </Tile>
        {/* Median resolution needs a run of resolved cases to measure. */}
        <Tile label="Median resolution" value={DASH}>
          target 24 h · not measured yet
        </Tile>
      </div>

      <Card className="mt-5 overflow-x-auto p-0">
        <table className="w-full min-w-[46rem] text-left">
          <thead>
            <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Merchant</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">At fault</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="border-border border-b last:border-b-0">
                <td className="px-4 py-3 text-[0.75rem] font-extrabold tabular-nums">
                  {d.order_reference ?? DASH}
                </td>
                <td className="px-4 py-3">
                  <span className="block text-[0.8125rem] font-extrabold">
                    {d.merchant_name ?? '[Merchant]'}
                  </span>
                  <span className="text-muted-light block text-[0.6875rem] font-semibold">
                    {when(d.opened_at)}
                  </span>
                </td>
                <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">
                  {REASON_LABEL[d.reason] ?? d.reason}
                </td>
                <td className="px-4 py-3">
                  <span className="bg-bg text-ink rounded px-2 py-0.5 text-[0.5625rem] font-extrabold uppercase">
                    {d.fault}
                  </span>
                </td>
                <td className="px-4 py-3 text-[0.8125rem] font-bold">
                  {kes(d.amount_refunded_kes || d.amount_claimed_kes)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[0.625rem] font-extrabold ${
                      DISPUTE_TONE[d.status] ?? 'bg-bg text-muted'
                    }`}
                  >
                    {d.status.replace('_', ' ').toUpperCase()}
                  </span>
                  {d.status === 'awaiting_merchant' && d.merchant_reply_due_at && (
                    <span className="text-warning mt-1 block text-[0.625rem] font-bold">
                      due {when(d.merchant_reply_due_at)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <EmptyRow colSpan={6}>
                No disputes. Guests open them from an order page, which needs the orders domain —
                so this stays empty until that lands.
              </EmptyRow>
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}

// ═════════════════════════════════════════════════ hours & capacity

export interface HoursRow {
  id: string;
  trading_name: string | null;
  category: string | null;
  city_name: string | null;
  status: string;
  accepting_orders: boolean | null;
  accepting_orders_source: string | null;
  busy_mode_until: string | null;
  closed_early_at: string | null;
  capacity_per_15min: number | null;
  prep_minutes: number | null;
  opens: string | null;
  closes: string | null;
  closed: boolean | null;
  hours_source: string | null;
}

export function HoursTab({
  rows,
  exceptions,
  autoRules,
}: {
  rows: HoursRow[];
  exceptions: { id: string; label: string; date: string; default_close: string | null; enabled: boolean }[];
  autoRules: { id: string; key: string; enabled: boolean }[];
}) {
  const now = new Date();
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const toMinutes = (t: string | null) =>
    t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null;

  const state = (r: HoursRow) => {
    if (r.closed) return { text: 'Closed today', tone: 'text-muted-light' };
    const o = toMinutes(r.opens);
    const c = toMinutes(r.closes);
    if (o === null || c === null) return { text: 'No hours set', tone: 'text-muted-light' };
    const withinHours = minutesNow >= o && minutesNow < c;
    if (r.closed_early_at) return { text: 'Closed early', tone: 'text-danger' };
    /* The one the tab exists for: their hours say open, their switch says no. */
    if (withinHours && !r.accepting_orders)
      return { text: 'Not switched on', tone: 'text-warning' };
    if (withinHours) return { text: 'Open', tone: 'text-success' };
    return { text: 'Closed', tone: 'text-muted-light' };
  };

  const shouldBeOpen = rows.filter((r) => state(r).text === 'Not switched on');
  const busy = rows.filter(
    (r) => r.busy_mode_until && new Date(r.busy_mode_until) > now,
  );

  const AUTO_LABEL: Record<string, string> = {
    kitchen_running_long: 'Kitchen running long → +ETA notice',
    busy_mode_wait: 'Merchant in busy mode → show wait at checkout',
    closed_early_alternative: 'Merchant closed early → offer alternative',
    prep_shift_alert: 'Prep drift &gt; 10 min → alert ops',
  };

  return (
    <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Open now"
          value={`${num(rows.filter((r) => state(r).text === 'Open').length)} of ${num(rows.length)}`}
        >
          {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} local
        </Tile>
        <Tile
          label="Should be open but off"
          value={num(shouldBeOpen.length)}
          tone={shouldBeOpen.length > 0 ? 'warning' : undefined}
        >
          their hours say open, their switch says no
        </Tile>
        <Tile label="In busy mode" value={num(busy.length)}>
          throttled at checkout
        </Tile>
        <Tile label="Holiday closures" value={num(exceptions.filter((e) => e.enabled).length)}>
          city exceptions set
        </Tile>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[42rem] text-left">
            <thead>
              <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-3">Merchant</th>
                <th className="px-4 py-3">Now</th>
                <th className="px-4 py-3">Hours today</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Prep</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = state(r);
                return (
                  <tr key={r.id} className="border-border border-b last:border-b-0">
                    <td className="px-4 py-3">
                      <Link href={`/merchants/${r.id}`} className="block">
                        <span className="block text-[0.8125rem] font-extrabold">
                          {r.trading_name ?? '[Trading name]'}
                        </span>
                        <span className="text-muted-light block text-[0.6875rem] font-semibold">
                          {CATEGORY_LABEL[r.category ?? 'other']} · {r.city_name ?? DASH}
                        </span>
                      </Link>
                    </td>
                    <td className={`px-4 py-3 text-[0.75rem] font-extrabold ${s.tone}`}>
                      <span aria-hidden="true">● </span>
                      {s.text}
                    </td>
                    <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">
                      {r.closed ? 'closed' : `${hhmm(r.opens)} – ${hhmm(r.closes)}`}
                      {r.hours_source && r.hours_source !== 'weekly' && (
                        <span className="text-gold-text block text-[0.625rem] font-bold">
                          {r.hours_source}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.busy_mode_until && new Date(r.busy_mode_until) > now ? (
                        <span className="bg-warning-bg text-warning rounded-full px-2 py-0.5 text-[0.5625rem] font-extrabold">
                          BUSY MODE
                        </span>
                      ) : (
                        <span className="text-muted-light text-[0.75rem] font-semibold">
                          Normal
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[0.75rem] font-bold">
                      {r.prep_minutes === null ? DASH : `${r.prep_minutes} min`}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <EmptyRow colSpan={5}>No live merchants yet.</EmptyRow>}
            </tbody>
          </table>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="text-sm font-extrabold uppercase tracking-wide">City exceptions</h3>
            <ul className="mt-3 space-y-2">
              {exceptions.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block text-[0.75rem] font-extrabold">{e.label}</span>
                    <span className="text-muted-light block text-[0.6875rem] font-semibold">
                      {new Date(e.date).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                      })}
                      {e.default_close ? ` · close ${hhmm(e.default_close)}` : ''}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[0.5625rem] font-extrabold ${
                      e.enabled ? 'bg-success-bg text-success' : 'bg-bg text-muted-light'
                    }`}
                  >
                    {e.enabled ? 'ON' : 'OFF'}
                  </span>
                </li>
              ))}
              {exceptions.length === 0 && (
                <li className="text-muted-light text-[0.75rem] font-semibold">
                  None set. A public holiday with no exception means every merchant keeps their
                  usual hours.
                </li>
              )}
            </ul>
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-extrabold uppercase tracking-wide">
              Auto-messages to guests
            </h3>
            <ul className="mt-3 space-y-2">
              {autoRules.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-2">
                  <span
                    className="text-[0.75rem] font-semibold leading-snug"
                    dangerouslySetInnerHTML={{ __html: AUTO_LABEL[r.key] ?? r.key }}
                  />
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[0.5625rem] font-extrabold ${
                      r.enabled ? 'bg-success-bg text-success' : 'bg-bg text-muted-light'
                    }`}
                  >
                    {r.enabled ? 'ON' : 'OFF'}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-[1.7]">
              Read by the order service when it composes a guest message. Nothing sends yet — the
              notification worker is not wired.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════ documents

export interface DocumentRow {
  id: string;
  merchant_name: string | null;
  merchant_id: string;
  label: string;
  expires_at: string | null;
  status: string;
  essential: boolean;
}

export function DocumentsTab({
  rows,
  terms,
  automation,
}: {
  rows: DocumentRow[];
  terms: { id: string; version: string; status: string; effective_from: string }[];
  automation: { key: string; label: string; enabled: boolean }[];
}) {
  const expiring = rows.filter((d) => {
    const days = d.expires_at ? -(daysSince(d.expires_at) ?? 0) : null;
    return days !== null && days >= 0 && days <= 30;
  });
  const expired = rows.filter((d) => {
    const days = d.expires_at ? -(daysSince(d.expires_at) ?? 0) : null;
    return days !== null && days < 0;
  });
  const awaiting = rows.filter((d) => d.status === 'uploaded');

  return (
    <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Documents on file" value={num(rows.length)}>
          across every merchant
        </Tile>
        <Tile
          label="Expiring ≤ 30 days"
          value={num(expiring.length)}
          tone={expiring.length > 0 ? 'warning' : undefined}
        >
          reminders at 30 / 14 / 7
        </Tile>
        <Tile
          label="Expired"
          value={num(expired.length)}
          tone={expired.length > 0 ? 'danger' : undefined}
        >
          listing paused the day after
        </Tile>
        <Tile
          label="Awaiting verification"
          value={num(awaiting.length)}
          tone={awaiting.length > 0 ? 'warning' : undefined}
        >
          uploaded, not yet checked
        </Tile>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[38rem] text-left">
            <thead>
              <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-3">Merchant</th>
                <th className="px-4 py-3">Document</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {[...expired, ...expiring, ...awaiting].slice(0, 40).map((d) => {
                const days = d.expires_at ? -(daysSince(d.expires_at) ?? 0) : null;
                const isExpired = days !== null && days < 0;
                return (
                  <tr key={d.id} className="border-border border-b last:border-b-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/merchants/${d.merchant_id}`}
                        className="text-[0.8125rem] font-extrabold"
                      >
                        {d.merchant_name ?? '[Merchant]'}
                      </Link>
                    </td>
                    <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">{d.label}</td>
                    <td
                      className={`px-4 py-3 text-[0.75rem] font-bold ${
                        isExpired ? 'text-danger' : days !== null ? 'text-warning' : 'text-muted'
                      }`}
                    >
                      {days === null
                        ? '—'
                        : isExpired
                          ? `expired ${Math.abs(days)} d`
                          : `in ${days} d`}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[0.625rem] font-extrabold ${
                          isExpired
                            ? 'bg-danger-bg text-danger'
                            : d.status === 'uploaded'
                              ? 'bg-warning-bg text-warning'
                              : days !== null
                                ? 'bg-warning-bg text-warning'
                                : 'bg-success-bg text-success'
                        }`}
                      >
                        {isExpired
                          ? 'EXPIRED · PAUSED'
                          : d.status === 'uploaded'
                            ? 'VERIFY'
                            : days !== null
                              ? 'EXPIRING'
                              : 'VALID'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {expired.length + expiring.length + awaiting.length === 0 && (
                <EmptyRow colSpan={4}>
                  Nothing expiring, expired or waiting to be checked.
                </EmptyRow>
              )}
            </tbody>
          </table>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="text-sm font-extrabold uppercase tracking-wide">Automation</h3>
            <ul className="mt-3 space-y-2">
              {automation.map((a) => (
                <li key={a.key} className="flex items-start justify-between gap-2">
                  <span className="text-[0.75rem] font-semibold leading-snug">{a.label}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[0.5625rem] font-extrabold ${
                      a.enabled ? 'bg-success-bg text-success' : 'bg-bg text-muted-light'
                    }`}
                  >
                    {a.enabled ? 'ON' : 'OFF'}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-extrabold uppercase tracking-wide">Terms versions</h3>
            <ul className="mt-3 space-y-2">
              {terms.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block text-[0.75rem] font-extrabold">
                      Merchant terms {t.version}
                    </span>
                    <span className="text-muted-light block text-[0.6875rem] font-semibold">
                      effective{' '}
                      {new Date(t.effective_from).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[0.5625rem] font-extrabold uppercase ${
                      t.status === 'current'
                        ? 'bg-success-bg text-success'
                        : 'bg-bg text-muted-light'
                    }`}
                  >
                    {t.status}
                  </span>
                </li>
              ))}
              {terms.length === 0 && (
                <li className="text-muted-light text-[0.75rem] font-semibold leading-[1.7]">
                  No terms version published. Until one is current, no merchant can be asked to
                  accept anything — which is why the signed-terms figure is {DASH} rather than 0%.
                </li>
              )}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════ finance

export interface StatementRow {
  id: string;
  merchant_name: string | null;
  period_start: string;
  period_end: string;
  gross_kes: number;
  commission_kes: number;
  adjustments_kes: number;
  net_kes: number;
  status: string;
}

export function FinanceTab({
  statements,
  tiers,
  heldCount,
}: {
  statements: StatementRow[];
  tiers: { code: string; label: string; default_pct: number | null; criteria: string | null }[];
  heldCount: number;
}) {
  return (
    <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/*
         * Every figure here is [—] on purpose. Statements are built from
         * a ledger, there is no ledger, and a payout run total invented
         * by this page would be a number somebody tried to pay out.
         */}
        <Tile label="Payout run" value={`KES ${DASH}`}>
          no ledger to build one from
        </Tile>
        <Tile label="Commission · 30d" value={`KES ${DASH}`}>
          blended {DASH}%
        </Tile>
        <Tile label="Payouts held" value={num(heldCount)} tone={heldCount > 0 ? 'danger' : undefined}>
          suspension, KYC or an open chargeback
        </Tile>
        <Tile label="Statements sent" value={num(statements.filter((s) => s.status !== 'draft').length)}>
          {num(statements.length)} on file
        </Tile>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[40rem] text-left">
            <thead>
              <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-3">Merchant</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Gross</th>
                <th className="px-4 py-3">Commission</th>
                <th className="px-4 py-3">Net</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {statements.map((s) => (
                <tr key={s.id} className="border-border border-b last:border-b-0">
                  <td className="px-4 py-3 text-[0.8125rem] font-extrabold">
                    {s.merchant_name ?? '[Merchant]'}
                  </td>
                  <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">
                    {new Date(s.period_start).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                    })}{' '}
                    –{' '}
                    {new Date(s.period_end).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">{kes(s.gross_kes)}</td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">−{kes(s.commission_kes)}</td>
                  <td className="px-4 py-3 text-[0.8125rem] font-extrabold">{kes(s.net_kes)}</td>
                  <td className="px-4 py-3">
                    <span className="bg-bg text-muted rounded-full px-2.5 py-1 text-[0.625rem] font-extrabold uppercase">
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
              {statements.length === 0 && (
                <EmptyRow colSpan={6}>
                  No statements. They are built from a payments ledger, and this project has no
                  ledger and no payments provider — so none can honestly be produced.
                </EmptyRow>
              )}
            </tbody>
          </table>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-extrabold uppercase tracking-wide">Commission tiers</h3>
          <ul className="mt-3 space-y-3">
            {tiers.map((t) => (
              <li key={t.code}>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[0.8125rem] font-extrabold">
                    {t.code} · {t.label}
                  </span>
                  <span className="text-[0.9375rem] font-extrabold">
                    {t.default_pct === null ? DASH : `${t.default_pct}%`}
                  </span>
                </span>
                <span className="text-muted-light block text-[0.6875rem] font-semibold">
                  {t.criteria}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-muted mt-3 text-[0.6875rem] font-semibold leading-[1.7]">
            Percentages are {DASH} until finance sets them. Changing a tier takes two people and
            applies from the next statement, never retroactively.
          </p>
        </Card>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════ branches

export function BranchesTab({
  chains,
}: {
  chains: {
    parent: DirectoryRow;
    branches: DirectoryRow[];
    settings: {
      shared_catalogue: boolean;
      shared_hours: boolean;
      consolidated_statement: boolean;
    } | null;
  }[];
}) {
  return (
    <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Multi-branch merchants" value={num(chains.length)}>
          {num(chains.reduce((n, c) => n + c.branches.length, 0))} branches in total
        </Tile>
        <Tile
          label="Largest chain"
          value={
            chains.length === 0
              ? DASH
              : String(Math.max(...chains.map((c) => c.branches.length)))
          }
        >
          branches under one parent
        </Tile>
        <Tile
          label="Shared catalogues"
          value={num(chains.filter((c) => c.settings?.shared_catalogue).length)}
        >
          per-branch availability overrides
        </Tile>
        <Tile
          label="Consolidated statements"
          value={num(chains.filter((c) => c.settings?.consolidated_statement).length)}
        >
          one payout, per-branch breakdown
        </Tile>
      </div>

      {chains.length === 0 ? (
        <Card className="mt-5 p-6">
          <p className="text-muted text-[0.875rem] leading-[1.8]">
            No chains yet. A merchant becomes a parent when another merchant points at it with{' '}
            <code className="text-[0.75rem]">parent_merchant_id</code> — set when a second branch
            is added, which runs the standard onboarding prefilled from the parent and only asks
            for location, manager, hours and any branch-specific permit.
          </p>
        </Card>
      ) : (
        <div className="mt-5 space-y-5">
          {chains.map((chain) => (
            <Card key={chain.parent.id} className="p-0">
              <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                <div>
                  <p className="text-[0.9375rem] font-extrabold">
                    {chain.parent.trading_name ?? '[Chain]'} · parent account
                  </p>
                  <p className="text-muted-light text-[0.6875rem] font-semibold">
                    {chain.branches.length} branches ·{' '}
                    {new Set(chain.branches.map((b) => b.city_name)).size} cities
                    {chain.settings?.consolidated_statement && ' · consolidated payout'}
                  </p>
                </div>
              </div>
              <table className="w-full min-w-[34rem] text-left">
                <thead>
                  <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                    <th className="px-4 py-2.5">Branch</th>
                    <th className="px-4 py-2.5">30d orders</th>
                    <th className="px-4 py-2.5">On-time</th>
                    <th className="px-4 py-2.5">Health</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {chain.branches.map((b) => (
                    <tr key={b.id} className="border-border border-b last:border-b-0">
                      <td className="px-4 py-2.5">
                        <Link href={`/merchants/${b.id}`} className="block">
                          <span className="block text-[0.8125rem] font-extrabold">
                            {b.trading_name ?? '[Branch]'}
                          </span>
                          <span className="text-muted-light block text-[0.6875rem] font-semibold">
                            {b.city_name ?? DASH}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-[0.8125rem] font-bold">
                        {num(b.orders_30d)}
                      </td>
                      <td className="px-4 py-2.5 text-[0.8125rem] font-bold">
                        {pct(b.on_time_ready_pct)}
                      </td>
                      <td className="px-4 py-2.5">
                        <HealthDot band={b.health_band} score={b.health_score} />
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusPill status={b.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-5 p-5">
        <h3 className="text-sm font-extrabold uppercase tracking-wide">How inheritance works</h3>
        <dl className="mt-3 space-y-2 text-[0.8125rem] leading-[1.8]">
          <div>
            <dt className="inline font-extrabold">Parent owns: </dt>
            <dd className="text-muted inline">
              brand, shared catalogue, prices, commission tier, terms, payout account.
            </dd>
          </div>
          <div>
            <dt className="inline font-extrabold">Branch owns: </dt>
            <dd className="text-muted inline">
              hours, availability, prep time, delivery radius, manager, health score.
            </dd>
          </div>
          <div>
            <dt className="inline font-extrabold">Guests see: </dt>
            <dd className="text-muted inline">
              the nearest open branch only; the chain appears once in Explore.
            </dd>
          </div>
        </dl>
      </Card>
    </>
  );
}

// ═══════════════════════════════════════════════ catalogue ops

export function CatalogueTab({
  flags,
  edits,
  photoTasks,
  imports,
  itemsLive,
}: {
  flags: { id: string; merchant_name: string | null; app_price_kes: number | null; observed_price_kes: number | null; drift_pct: number | null; status: string }[];
  edits: { id: string; merchant_name: string | null; kind: string; status: string; created_at: string }[];
  photoTasks: { id: string; merchant_name: string | null; status: string }[];
  imports: { id: string; merchant_name: string | null; source: string; status: string }[];
  itemsLive: number;
}) {
  return (
    <>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Items live" value={num(itemsLive)}>
          visible to guests right now
        </Tile>
        <Tile
          label="Price drift flags"
          value={num(flags.filter((f) => f.status === 'open').length)}
          tone={flags.filter((f) => f.status === 'open').length > 0 ? 'warning' : undefined}
        >
          in-store cheaper by more than 10%
        </Tile>
        <Tile
          label="Pending merchant edits"
          value={num(edits.filter((e) => e.status === 'pending').length)}
          tone={edits.filter((e) => e.status === 'pending').length > 0 ? 'warning' : undefined}
        >
          price changes awaiting review
        </Tile>
        <Tile label="Imports in queue" value={num(imports.filter((i) => i.status !== 'applied').length)}>
          PDF or sheet, loaded by NexG
        </Tile>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <Card className="p-5">
          <h3 className="text-sm font-extrabold uppercase tracking-wide">Edit approvals</h3>
          <ul className="mt-3 space-y-2">
            {edits
              .filter((e) => e.status === 'pending')
              .map((e) => (
                <li
                  key={e.id}
                  className="border-border bg-bg flex items-start justify-between gap-3 rounded-lg border p-3"
                >
                  <span className="min-w-0">
                    <span className="block text-[0.8125rem] font-extrabold">
                      {e.merchant_name ?? '[Merchant]'}
                    </span>
                    <span className="text-muted-light block text-[0.6875rem] font-semibold">
                      {e.kind.replace('_', ' ')} · {when(e.created_at)}
                    </span>
                  </span>
                </li>
              ))}
            {edits.filter((e) => e.status === 'pending').length === 0 && (
              <li className="text-muted-light text-[0.75rem] font-semibold leading-[1.7]">
                Nothing waiting. A merchant&rsquo;s edit only comes here when it moves a price more
                than 15% or touches alcohol — everything else applies itself and is logged, because
                a merchant fixing a typo should not wait on us.
              </li>
            )}
          </ul>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-extrabold uppercase tracking-wide">Price drift</h3>
          <ul className="mt-3 space-y-2">
            {flags
              .filter((f) => f.status === 'open')
              .map((f) => (
                <li key={f.id} className="flex items-baseline justify-between gap-2">
                  <span className="text-[0.75rem] font-bold">{f.merchant_name ?? '[Merchant]'}</span>
                  <span className="text-warning text-[0.75rem] font-extrabold">
                    {f.drift_pct === null ? DASH : `+${Math.round(Number(f.drift_pct))}%`}
                  </span>
                </li>
              ))}
            {flags.filter((f) => f.status === 'open').length === 0 && (
              <li className="text-muted-light text-[0.75rem] font-semibold leading-[1.7]">
                No flags. Drift is spotted from a rider&rsquo;s photo of the shelf price at pickup,
                which needs the orders domain.
              </li>
            )}
          </ul>
          <h3 className="border-border mt-4 border-t pt-4 text-sm font-extrabold uppercase tracking-wide">
            Photo queue
          </h3>
          <p className="text-muted-light mt-2 text-[0.75rem] font-semibold">
            {photoTasks.length === 0
              ? 'Nothing booked.'
              : `${photoTasks.length} task${photoTasks.length === 1 ? '' : 's'}`}
          </p>
        </Card>
      </div>
    </>
  );
}
