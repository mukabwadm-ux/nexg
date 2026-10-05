import { Card } from '@nexg/ui';
import Link from 'next/link';

import {
  CashBar,
  clock,
  DASH,
  daysSince,
  EmptyRow,
  HealthDot,
  kes,
  maskPhone,
  NotMeasured,
  num,
  pct,
  plural,
  riderName,
  Tile,
  VEHICLE_LABEL,
  when,
  type Badges,
  type RiderRow,
} from './shared';

// ═══════════════════════════════════════════ 5.2 Pipeline (B2)

/**
 * Stage is derived, never stored. A rider's position in onboarding is
 * a function of what they have actually done — documents verified,
 * background clear, training passed, kit issued — so there is no way
 * for the board and the record to disagree.
 */
export type Stage = 'applied' | 'documents' | 'background' | 'training' | 'kit' | 'active';

const STAGES: { key: Stage; label: string; tone: string }[] = [
  { key: 'applied', label: 'Applied', tone: 'bg-muted-light' },
  { key: 'documents', label: 'Documents', tone: 'bg-gold' },
  { key: 'background', label: 'Background check', tone: 'bg-warning' },
  { key: 'training', label: 'Training & test', tone: 'bg-warning' },
  { key: 'kit', label: 'Kit & activation', tone: 'bg-gold' },
  { key: 'active', label: 'Active', tone: 'bg-success' },
];

export interface PipelineRider extends RiderRow {
  background_status: string | null;
  basics_passed: boolean;
  test_trip_passed: boolean;
  kit_issued_at: string | null;
  kit_deposit_status: string | null;
  docs_verified: number;
  docs_required: number;
  last_note: string | null;
}

export function stageOf(r: PipelineRider): Stage {
  if (r.status === 'active') return 'active';
  if (r.status === 'applied') return 'applied';
  if (r.status === 'documents_pending') return 'documents';
  if (r.background_status !== 'clear') return 'background';
  if (!r.basics_passed || !r.test_trip_passed) return 'training';
  return 'kit';
}

export function PipelineTab({ riders }: { riders: PipelineRider[] }) {
  const waiting = riders.filter((r) => r.status !== 'active');
  const kitDeposits = riders.filter((r) => r.kit_deposit_status === 'held').length;

  return (
    <>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Tile
          label="Applications · 30d"
          value={num(riders.filter((r) => (daysSince(r.created_at) ?? 999) <= 30).length)}
        >
          {DASH}/week · target {DASH}
        </Tile>
        <Tile label="In onboarding" value={num(waiting.length)}>
          {num(waiting.filter((r) => stageOf(r) === 'documents').length)} waiting on applicant
        </Tile>
        <Tile label="Avg time to active" value={`${DASH} d`}>
          target 5 d
        </Tile>
        <Tile
          label="Background check"
          value={num(waiting.filter((r) => stageOf(r) === 'background').length)}
        >
          good conduct + references
        </Tile>
        <Tile label="Training pass rate" value={`${DASH}%`}>
          quiz ≥ 15/20 + test trip
        </Tile>
        {/* The count is real; the amount is not — no deposit figure has
            been set, and inventing one would misstate what NexG owes
            back to riders when they leave. */}
        <Tile label="Kit deposits held" value={kes(null)}>
          {plural(kitDeposits, 'deposit')} held · refundable on exit
        </Tile>
      </div>

      <div className="mt-5 flex gap-4 overflow-x-auto pb-2">
        {STAGES.map((stage) => {
          const cards = riders.filter((r) => stageOf(r) === stage.key);
          return (
            <section key={stage.key} className="w-[17rem] shrink-0">
              <Card className="p-0">
                <div className="border-border flex items-center justify-between gap-2 border-b px-4 py-3">
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className={`h-2 w-2 rounded-full ${stage.tone}`} />
                    <span className="text-[0.8125rem] font-extrabold">{stage.label}</span>
                  </span>
                  <span className="text-muted-light text-[0.75rem] font-extrabold">
                    {cards.length}
                  </span>
                </div>
                <div className="space-y-2 p-2">
                  {cards.map((r) => (
                    <Link
                      key={r.id}
                      href={`/riders/${r.id}`}
                      className="border-border hover:border-ink block rounded-lg border p-3 transition-colors"
                    >
                      <p className="text-[0.8125rem] font-extrabold">{riderName(r)}</p>
                      <p className="text-muted-light text-[0.6875rem] font-semibold">
                        {VEHICLE_LABEL[r.vehicle ?? ''] ?? DASH} · {r.city_name ?? DASH}
                      </p>
                      <p className="text-gold-text mt-1 text-[0.625rem] font-extrabold">
                        {daysSince(r.created_at) ?? 0} days in stage
                      </p>
                      {stage.key === 'documents' && (
                        <p className="text-muted mt-1.5 text-[0.625rem] font-semibold">
                          {r.docs_verified}/{r.docs_required} documents verified
                        </p>
                      )}
                      {r.last_note && (
                        <p className="text-muted-light mt-1.5 text-[0.625rem] font-semibold italic">
                          {r.last_note}
                        </p>
                      )}
                    </Link>
                  ))}
                  {cards.length === 0 && (
                    <p className="text-muted-light px-2 py-6 text-center text-[0.75rem] font-semibold">
                      Nothing here
                    </p>
                  )}
                </div>
              </Card>
            </section>
          );
        })}
      </div>

      <NotMeasured
        what="The funnel chart is not drawn"
        why="Average days per stage needs a history of stage transitions. rider_status_change records them from today onward, so the chart becomes real once there are 90 days of them — drawing it now would mean inventing the curve."
      />
    </>
  );
}

// ═══════════════════════════════════════ 5.3 Health & safety (B3)

export interface IncidentRow {
  id: string;
  kind: string;
  severity: string;
  status: string;
  happened_at: string;
  description: string | null;
  resolution: string | null;
  acknowledged_at: string | null;
  rider: { first_name: string | null; last_name: string | null } | null;
}

export interface Weight {
  key: string;
  label: string;
  weight_pct: number;
}

export interface FraudRuleRow {
  kind: string;
  label: string;
  enabled: boolean;
}

export function HealthTab({
  riders,
  incidents,
  weights,
  fraudRules,
  badges,
}: {
  riders: RiderRow[];
  incidents: IncidentRow[];
  weights: Weight[];
  fraudRules: FraudRuleRow[];
  badges: Badges;
}) {
  const band = (b: string) => riders.filter((r) => r.health_band === b).length;
  const open = incidents.filter((i) => i.status === 'open' || i.status === 'investigating');

  return (
    <>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Tile label="Green" value={num(band('green'))} tone="success">
          eligible for peak bonus
        </Tile>
        <Tile label="Amber · watchlist" value={num(band('amber'))} tone="warning">
          coaching call this week
        </Tile>
        <Tile label="Red" value={num(band('red'))} tone={band('red') > 0 ? 'danger' : undefined}>
          {DASH} cooldown · {DASH} final warning
        </Tile>
        <Tile label="Incidents · 30d" value={num(incidents.length)}>
          {plural(incidents.filter((i) => i.kind === 'accident').length, 'accident')} ·{' '}
          {plural(incidents.filter((i) => i.kind === 'guest_complaint').length, 'guest complaint')}
        </Tile>
        <Tile
          label="Fraud flags"
          value={num(badges.fraud_open)}
          tone={badges.fraud_open > 0 ? 'danger' : undefined}
        >
          GPS spoof · fake delivery
        </Tile>
        <Tile label="Avg speed on trip" value={`${DASH} km/h`}>
          over 60 km/h flagged
        </Tile>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        <Card className="overflow-x-auto p-0">
          <p className="border-border border-b px-4 py-3 text-[0.9375rem] font-extrabold">
            Scorecard
          </p>
          <table className="w-full min-w-[42rem] text-left">
            <thead>
              <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-3">Rider</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Accept</th>
                <th className="px-4 py-3">On-time</th>
                <th className="px-4 py-3">Rating</th>
                <th className="px-4 py-3">Issues</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {riders
                .filter((r) => r.status === 'active')
                .map((r) => (
                  <tr key={r.id} className="border-border hover:bg-bg border-b last:border-b-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/riders/${r.id}`}
                        className="text-[0.8125rem] font-extrabold hover:underline"
                      >
                        {riderName(r)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <HealthDot band={r.health_band} score={r.health_score} />
                    </td>
                    <td className="px-4 py-3 text-[0.8125rem] font-bold">
                      {pct(r.acceptance_pct)}
                    </td>
                    <td className="px-4 py-3 text-[0.8125rem] font-bold">{pct(r.on_time_pct)}</td>
                    <td className="px-4 py-3 text-[0.8125rem] font-bold">
                      {r.rating_avg === null ? DASH : Number(r.rating_avg).toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-[0.8125rem] font-bold">{num(r.issues_30d)}</td>
                    <td className="text-gold-text px-4 py-3 text-[0.75rem] font-extrabold">
                      {(r.active_strikes ?? 0) > 0
                        ? `${r.active_strikes} active strike${r.active_strikes === 1 ? '' : 's'}`
                        : DASH}
                    </td>
                  </tr>
                ))}
              {riders.filter((r) => r.status === 'active').length === 0 && (
                <EmptyRow colSpan={7}>No active riders yet.</EmptyRow>
              )}
            </tbody>
          </table>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <p className="text-[0.9375rem] font-extrabold">Score weights</p>
            <ul className="mt-3 space-y-2">
              {weights.map((w) => (
                <li key={w.key} className="flex items-center justify-between gap-3">
                  <span className="text-[0.75rem] font-semibold">{w.label}</span>
                  <span className="text-[0.8125rem] font-extrabold tabular-nums">
                    {w.weight_pct}%
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-[1.7]">
              Rolling 30 days, min 20 trips. Green ≥ 80 · amber 60–79 · red &lt; 60. Red = 2 h
              cooldown after each late delivery; red for 7 days = review.
            </p>
            <p className="text-warning mt-2 text-[0.6875rem] font-bold leading-snug">
              No score is computed yet — every input comes from the orders domain, which does not
              exist. The weights are stored and the nightly job runs; it writes [—] rather than
              marking live riders red for having no trips.
            </p>
          </Card>

          {open.length > 0 ? (
            <Card className="p-5">
              <p className="text-[0.9375rem] font-extrabold">Open incident</p>
              {open.slice(0, 1).map((i) => (
                <div key={i.id} className="mt-2">
                  <span className="bg-danger-bg text-danger inline-block rounded-full px-2 py-0.5 text-[0.5625rem] font-extrabold uppercase">
                    {i.kind.replace(/_/g, ' ')} · {i.severity}
                  </span>
                  <p className="mt-2 text-[0.8125rem] font-extrabold">
                    {i.rider ? riderName(i.rider) : 'Unnamed rider'} · {clock(i.happened_at)}
                  </p>
                  <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-relaxed">
                    {i.description ?? 'No account recorded yet.'}
                  </p>
                  <Link
                    href={`/riders/incidents/${i.id}`}
                    className="bg-ink hover:bg-ink/90 mt-3 inline-block rounded-lg px-4 py-2 text-[0.8125rem] font-bold text-white transition-colors"
                  >
                    Open incident
                  </Link>
                </div>
              ))}
            </Card>
          ) : (
            <Card className="p-5">
              <p className="text-[0.8125rem] font-extrabold">No open incidents</p>
              <p className="text-muted mt-1.5 text-[0.75rem] font-semibold">
                An SOS raised from the rider app shows here and as a banner on every tab until
                somebody acknowledges it.
              </p>
            </Card>
          )}

          <Card className="p-5">
            <p className="text-[0.9375rem] font-extrabold">Fraud signals</p>
            <ul className="mt-3 space-y-2.5">
              {fraudRules.map((rule) => (
                <li key={rule.kind} className="flex items-center justify-between gap-3">
                  <span className="text-[0.75rem] font-semibold">{rule.label}</span>
                  <span
                    aria-label={rule.enabled ? 'on' : 'off'}
                    className={`relative h-5 w-9 shrink-0 rounded-full ${
                      rule.enabled ? 'bg-success' : 'bg-border-strong'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white ${
                        rule.enabled ? 'left-[1.125rem]' : 'left-0.5'
                      }`}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════ 5.4 Cash ledger (B4)

export interface CashEventRow {
  id: number;
  rider_id: string;
  kind: string;
  amount_kes: number;
  order_reference: string | null;
  note: string | null;
  created_at: string;
}

export interface DepositRow {
  id: string;
  provider_ref: string;
  msisdn: string | null;
  amount_kes: number;
  account_reference: string | null;
  paid_at: string;
  match_status: string;
}

export interface CashRuleRow {
  city_id: string;
  city_name: string | null;
  cap_default_kes: number | null;
  cap_new_rider_kes: number | null;
  cap_new_rider_days: number;
  remind_at_pct: number;
  pause_at_pct: number;
  netting_cutoff: string;
  two_person_threshold_kes: number | null;
}

export function CashTab({
  riders,
  events,
  deposits,
  rules,
  selected,
  badges,
}: {
  riders: RiderRow[];
  events: CashEventRow[];
  deposits: DepositRow[];
  rules: CashRuleRow[];
  selected: string | null;
  badges: Badges;
}) {
  const holding = riders.filter((r) => (r.cash_on_hand ?? 0) > 0);
  const overCap = holding.filter(
    (r) => r.cash_cap_effective !== null && (r.cash_on_hand ?? 0) >= r.cash_cap_effective,
  );
  const unmatched = deposits.filter((d) => d.match_status === 'unmatched');
  const chosen = selected ? riders.find((r) => r.id === selected) : undefined;

  /*
   * The rules card showed whichever city_id sorted first, next to a
   * table of riders from a different one — so the card could say "no
   * cap set" while the bar beside it read 106% of KES 5,000.
   *
   * Scope it: the selected rider's city, else the city most of the
   * riders holding cash are in, and name the city on the card so it is
   * never ambiguous which one is being described.
   */
  const cityTally = new Map<string, number>();
  for (const r of holding) {
    if (r.city_id) cityTally.set(r.city_id, (cityTally.get(r.city_id) ?? 0) + 1);
  }
  const busiest = [...cityTally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const cityId = chosen?.city_id ?? busiest ?? null;
  const rule = (cityId ? rules.find((r) => r.city_id === cityId) : undefined) ?? rules[0];

  return (
    <>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Tile label="Cash on hand · all riders" value={kes(badges.cash_all)}>
          {plural(badges.riders_holding_cash ?? 0, 'rider')} holding cash
        </Tile>
        <Tile
          label="Over cap"
          value={num(overCap.length)}
          tone={overCap.length > 0 ? 'danger' : undefined}
        >
          offers paused until deposit
        </Tile>
        {/* Matched only. An unmatched deposit has arrived at the
            Paybill but has not been credited to any rider, so counting
            it here would show money as banked that no ledger reflects. */}
        <Tile
          label="Deposited today"
          value={kes(
            deposits
              .filter(
                (d) =>
                  (daysSince(d.paid_at) ?? 99) === 0 &&
                  (d.match_status === 'auto_matched' || d.match_status === 'manual_matched'),
              )
              .reduce((s, d) => s + d.amount_kes, 0),
          )}
        >
          Paybill deposits · auto-matched
        </Tile>
        <Tile
          label="Unmatched deposits"
          value={num(unmatched.length)}
          tone={unmatched.length > 0 ? 'warning' : undefined}
        >
          wrong reference · match manually
        </Tile>
        <Tile
          label="Netted from payouts"
          value={kes(
            events.filter((e) => e.kind === 'netted').reduce((s, e) => s - e.amount_kes, 0),
          )}
        >
          last run
        </Tile>
        <Tile
          label="Written off · 90d"
          value={kes(
            events.filter((e) => e.kind === 'write_off').reduce((s, e) => s - e.amount_kes, 0),
          )}
        >
          suspended riders · recovery
        </Tile>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[44rem] text-left">
            <thead>
              <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-3">Rider</th>
                <th className="px-4 py-3">Holding</th>
                <th className="px-4 py-3">% of cap</th>
                <th className="px-4 py-3">Oldest</th>
                <th className="px-4 py-3">Last deposit</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {holding.map((r) => {
                const over =
                  r.cash_cap_effective !== null && (r.cash_on_hand ?? 0) >= r.cash_cap_effective;
                return (
                  <tr key={r.id} className="border-border hover:bg-bg border-b last:border-b-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/riders?tab=cash&selected=${r.id}`}
                        className="text-[0.8125rem] font-extrabold hover:underline"
                      >
                        {riderName(r)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[0.8125rem] font-extrabold">
                      {kes(r.cash_on_hand)}
                    </td>
                    <td className="w-40 px-4 py-3">
                      <CashBar held={r.cash_on_hand} cap={r.cash_cap_effective} />
                    </td>
                    <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">
                      {when(r.oldest_undeposited_at)}
                    </td>
                    <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">
                      {when(r.last_deposit_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[0.5625rem] font-extrabold ${
                          r.status === 'suspended'
                            ? 'bg-danger-bg text-danger'
                            : over
                              ? 'bg-danger-bg text-danger'
                              : 'bg-success-bg text-success'
                        }`}
                      >
                        {r.status === 'suspended'
                          ? 'OWED · RECOVERY'
                          : over
                            ? 'OVER CAP · PAUSED'
                            : 'OK'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {holding.length === 0 && (
                <EmptyRow colSpan={6}>Nobody is holding NexG cash right now.</EmptyRow>
              )}
            </tbody>
          </table>
        </Card>

        <div className="space-y-4">
          {chosen && (
            <Card className="p-0">
              <div className="border-border flex items-center justify-between gap-2 border-b px-4 py-3">
                <p className="text-[0.9375rem] font-extrabold">{riderName(chosen)} · ledger</p>
                <span className="bg-warning-bg text-warning rounded-full px-2 py-0.5 text-[0.5625rem] font-extrabold">
                  {kes(chosen.cash_on_hand)} HELD
                </span>
              </div>
              <ul className="divide-border divide-y">
                {events
                  .filter((e) => e.rider_id === chosen.id)
                  .slice(0, 12)
                  .map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <span className="min-w-0">
                        <span className="block text-[0.75rem] font-bold capitalize">
                          {e.kind.replace(/_/g, ' ')}
                          {e.order_reference ? ` · ${e.order_reference}` : ''}
                        </span>
                        <span className="text-muted-light block text-[0.625rem] font-semibold">
                          {e.note ?? when(e.created_at)}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 text-[0.8125rem] font-extrabold tabular-nums ${
                          e.amount_kes < 0 ? 'text-success' : ''
                        }`}
                      >
                        {e.amount_kes > 0 ? '+' : '−'}
                        {kes(Math.abs(e.amount_kes)).replace('KES ', 'KES ')}
                      </span>
                    </li>
                  ))}
                {events.filter((e) => e.rider_id === chosen.id).length === 0 && (
                  <li className="text-muted px-4 py-6 text-center text-[0.75rem] font-semibold">
                    No cash movements recorded.
                  </li>
                )}
              </ul>
            </Card>
          )}

          <Card className="p-5">
            <p className="text-[0.9375rem] font-extrabold">
              Rules{rule?.city_name ? ` · ${rule.city_name}` : ''}
            </p>
            {rule ? (
              <ul className="text-muted mt-3 space-y-2 text-[0.75rem] font-semibold leading-relaxed">
                <li>
                  Cap per rider {kes(rule.cap_default_kes)} (new riders{' '}
                  {kes(rule.cap_new_rider_kes)} for first {rule.cap_new_rider_days} days)
                </li>
                <li>At {rule.remind_at_pct}% remind</li>
                <li>At {rule.pause_at_pct}% no more cash orders until deposit</li>
                <li>
                  Deposits via Paybill {DASH} with rider code as reference · auto-matched within 5
                  min
                </li>
                <li>Anything still held on {rule.netting_cutoff} is netted from Friday payout</li>
                <li>M-Pesa-to-NexG at the door is preferred and never counts as cash held</li>
              </ul>
            ) : (
              <p className="text-muted mt-2 text-[0.75rem] font-semibold">No city rules loaded.</p>
            )}
            {rule && rule.cap_default_kes === null && (
              <p className="text-warning mt-3 text-[0.6875rem] font-bold leading-snug">
                No cap has been set for this city. Until one is, dispatch is told no rider may take
                cash — an unset cap is not permission.
              </p>
            )}
          </Card>

          <Card className="p-0">
            <p className="border-border border-b px-4 py-3 text-[0.9375rem] font-extrabold">
              Unmatched deposits
            </p>
            <ul className="divide-border divide-y">
              {unmatched.map((d) => (
                <li key={d.id} className="px-4 py-3">
                  <p className="text-[0.8125rem] font-extrabold">{kes(d.amount_kes)}</p>
                  <p className="text-muted-light mt-0.5 text-[0.6875rem] font-semibold">
                    ref &ldquo;{d.account_reference ?? d.provider_ref}&rdquo; · {when(d.paid_at)}{' '}
                    {clock(d.paid_at)} · from {maskPhone(d.msisdn)}
                  </p>
                </li>
              ))}
              {unmatched.length === 0 && (
                <li className="text-muted px-4 py-6 text-center text-[0.75rem] font-semibold">
                  Every deposit has found its rider.
                </li>
              )}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

// ═════════════════════════════════════ 5.5 Weekly settlement (B5)

export interface SettlementLineRow {
  id: string;
  rider_id: string;
  trips: number;
  earnings_kes: number;
  bonuses_kes: number;
  cash_net_kes: number;
  net_pay_kes: number;
  status: string;
  payout_msisdn: string | null;
  failure_reason: string | null;
  paid_to_merchant_id: string | null;
  rider: { first_name: string | null; last_name: string | null; status: string } | null;
}

export interface RunRow {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  total_gross_kes: number;
  total_cash_netted_kes: number;
  total_net_kes: number;
  approved_by: string | null;
  second_approver_id: string | null;
}

export interface RateCardRow {
  id: string;
  version: string;
  status: string;
  effective_from: string;
  base_per_trip_kes: number | null;
  per_km_after_2km_kes: number | null;
  paid_waiting_per_5min_kes: number | null;
  second_pickup_bonus_kes: number | null;
  peak_bonus_dinner_kes: number | null;
  peak_bonus_rain_kes: number | null;
  cancellation_after_pickup_kes: number | null;
  guest_tips_pass_through_pct: number;
}

export interface BonusRuleRow {
  id: string;
  key: string;
  enabled: boolean;
  params: Record<string, unknown>;
}

const LINE_TONE: Record<string, string> = {
  ready: 'bg-success-bg text-success',
  cash_netted: 'bg-gold-soft text-gold-text',
  name_mismatch: 'bg-warning-bg text-warning',
  held: 'bg-warning-bg text-warning',
  failed: 'bg-danger-bg text-danger',
  paid: 'bg-success-bg text-success',
};

export function SettlementTab({
  run,
  lines,
  rateCard,
  bonuses,
}: {
  run: RunRow | null;
  lines: SettlementLineRow[];
  rateCard: RateCardRow | null;
  bonuses: BonusRuleRow[];
}) {
  return (
    <>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Tile label="Friday settlement · riders" value={kes(run?.total_net_kes)}>
          part of the weekly run · 2 approvals
        </Tile>
        <Tile
          label="Trip earnings"
          value={kes(lines.reduce((s, l) => s + l.earnings_kes, 0) || null)}
        >
          base + distance + waiting
        </Tile>
        <Tile
          label="Peak bonuses"
          value={kes(lines.reduce((s, l) => s + l.bonuses_kes, 0) || null)}
        >
          trips qualified
        </Tile>
        <Tile label="Tips passed through" value={kes(null)}>
          100 % to rider
        </Tile>
        <Tile
          label="Cash netted"
          value={`−${kes(run?.total_cash_netted_kes ?? 0)}`}
          tone={(run?.total_cash_netted_kes ?? 0) > 0 ? 'warning' : undefined}
        >
          riders held cash past Thu
        </Tile>
        <Tile
          label="Failed last run"
          value={num(lines.filter((l) => l.status === 'failed').length)}
          tone={lines.some((l) => l.status === 'failed') ? 'danger' : undefined}
        >
          M-Pesa name · retry
        </Tile>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        <Card className="overflow-x-auto p-0">
          <div className="border-border flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <p className="text-[0.9375rem] font-extrabold">
              {run
                ? `${new Date(run.period_start).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                  })} – ${new Date(run.period_end).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                  })}`
                : 'This run'}
            </p>
            {run && (
              <span className="text-muted-light text-[0.6875rem] font-extrabold uppercase tracking-wide">
                {run.status.replace(/_/g, ' ')}
                {run.approved_by && !run.second_approver_id && ' · 1 of 2 approvals'}
              </span>
            )}
          </div>
          <table className="w-full min-w-[46rem] text-left">
            <thead>
              <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-3">Rider</th>
                <th className="px-4 py-3">Trips</th>
                <th className="px-4 py-3">Earnings</th>
                <th className="px-4 py-3">Bonuses</th>
                <th className="px-4 py-3">Cash net</th>
                <th className="px-4 py-3">Net pay</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-border hover:bg-bg border-b last:border-b-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/riders/${l.rider_id}`}
                      className="text-[0.8125rem] font-extrabold hover:underline"
                    >
                      {l.rider ? riderName(l.rider) : DASH}
                    </Link>
                    <span className="text-muted-light block text-[0.625rem] font-semibold">
                      {l.payout_msisdn
                        ? `M-Pesa •${l.payout_msisdn.slice(-2)}`
                        : 'no M-Pesa number'}
                      {l.rider?.status === 'suspended' && ' · suspended'}
                      {l.paid_to_merchant_id && ' · paid to employer'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">{num(l.trips)}</td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">{kes(l.earnings_kes)}</td>
                  <td className="text-success px-4 py-3 text-[0.8125rem] font-bold">
                    {l.bonuses_kes > 0 ? `+${kes(l.bonuses_kes)}` : kes(0)}
                  </td>
                  <td
                    className={`px-4 py-3 text-[0.8125rem] font-bold ${
                      l.cash_net_kes > 0 ? 'text-danger' : ''
                    }`}
                  >
                    {l.cash_net_kes > 0 ? `−${kes(l.cash_net_kes)}` : '0'}
                  </td>
                  <td className="px-4 py-3 text-[0.8125rem] font-extrabold">
                    {kes(l.net_pay_kes)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[0.5625rem] font-extrabold uppercase ${
                        LINE_TONE[l.status] ?? 'bg-bg text-muted'
                      }`}
                    >
                      {l.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                </tr>
              ))}
              {lines.length === 0 && (
                <EmptyRow colSpan={7}>
                  No run has been built. A run needs earnings, which need an orders domain.
                </EmptyRow>
              )}
            </tbody>
          </table>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <p className="text-[0.9375rem] font-extrabold">
              Rate card {rateCard ? `· ${rateCard.version}` : ''}
            </p>
            {rateCard ? (
              <ul className="mt-3 space-y-2">
                <RateLine label="Base per trip" value={rateCard.base_per_trip_kes} />
                <RateLine label="Per km after 2 km" value={rateCard.per_km_after_2km_kes} />
                <RateLine
                  label="Paid waiting after 10 min, per 5"
                  value={rateCard.paid_waiting_per_5min_kes}
                />
                <RateLine label="Second pickup" value={rateCard.second_pickup_bonus_kes} />
                <RateLine label="Dinner peak bonus" value={rateCard.peak_bonus_dinner_kes} />
                <RateLine label="Rain bonus" value={rateCard.peak_bonus_rain_kes} />
                <RateLine
                  label="Cancellation after pickup"
                  value={rateCard.cancellation_after_pickup_kes}
                />
                <li className="flex items-center justify-between gap-3">
                  <span className="text-[0.75rem] font-semibold">Guest tips</span>
                  <span className="text-[0.8125rem] font-extrabold">
                    {rateCard.guest_tips_pass_through_pct}%
                  </span>
                </li>
              </ul>
            ) : (
              <p className="text-warning mt-2 text-[0.75rem] font-bold leading-relaxed">
                No rate card has been published. Until one is, nothing can tell a rider what a trip
                pays — and `rpc_rate_card_publish` refuses a card with no base and no per-km rate
                rather than going live empty.
              </p>
            )}
            <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-[1.7]">
              Shown to riders in the app before they accept. Changes need Ops manager + Finance.
            </p>
          </Card>

          <Card className="p-5">
            <p className="text-[0.9375rem] font-extrabold">Bonus rules</p>
            <ul className="mt-3 space-y-2.5">
              {bonuses.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3">
                  <span className="text-[0.75rem] font-semibold capitalize">
                    {b.key.replace(/_/g, ' ')}
                  </span>
                  <span
                    aria-label={b.enabled ? 'on' : 'off'}
                    className={`relative h-5 w-9 shrink-0 rounded-full ${
                      b.enabled ? 'bg-success' : 'bg-border-strong'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white ${
                        b.enabled ? 'left-[1.125rem]' : 'left-0.5'
                      }`}
                    />
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-snug">
              Amounts are {DASH} until finance sets them. A bonus figure this console invented is
              one a rider would be owed.
            </p>
          </Card>

          {lines.some((l) => l.status === 'name_mismatch') && (
            <Card className="border-warning border-2 p-5">
              <p className="text-[0.9375rem] font-extrabold">Name mismatch</p>
              <p className="text-muted mt-2 text-[0.75rem] font-semibold leading-relaxed">
                M-Pesa B2C returned &ldquo;name does not match&rdquo;. Payout held, not lost.
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function RateLine({ label, value }: { label: string; value: number | null }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-[0.75rem] font-semibold">{label}</span>
      <span className="text-[0.8125rem] font-extrabold tabular-nums">{kes(value)}</span>
    </li>
  );
}

// ═════════════════════════════════════ 5.6 Supply & shifts (B6)

export interface ZoneRow {
  id: string;
  name: string;
  tier: string;
  online_now: number | null;
  on_trip: number | null;
  riders_needed: number | null;
  gap: number | null;
  committed: number;
}

export function SupplyTab({
  zones,
  badges,
  liveBonuses,
}: {
  zones: ZoneRow[];
  badges: Badges;
  liveBonuses: BonusRuleRow[];
}) {
  const short = zones.filter((z) => (z.gap ?? 0) > 0);

  return (
    <>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Tile
          label="Online now"
          value={`${num(badges.online_now)} of ${num(badges.active)} active`}
        >
          {num(badges.on_trip)} on trip
        </Tile>
        <Tile label="Demand vs supply · next hour" value={`${DASH}×`}>
          needs live orders to compare against
        </Tile>
        <Tile
          label="Committed shifts tonight"
          value={num(zones.reduce((s, z) => s + z.committed, 0))}
        >
          {DASH}% showed up last week
        </Tile>
        <Tile label="Idle > 30 min" value={DASH}>
          nudge to move toward demand
        </Tile>
        <Tile
          label="Peak bonus live"
          value={num(liveBonuses.filter((b) => b.enabled).length)}
          tone={liveBonuses.some((b) => b.enabled) ? 'success' : undefined}
        >
          dinner · rain
        </Tile>
        <Tile label="Avg online hours / rider / day" value={`${DASH} h`}>
          target {DASH} h
        </Tile>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        <Card className="overflow-x-auto p-0">
          <p className="border-border border-b px-4 py-3 text-[0.9375rem] font-extrabold">
            Shift commitments · tonight
          </p>
          <table className="w-full min-w-[36rem] text-left">
            <thead>
              <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-3">Zone</th>
                <th className="px-4 py-3">Needed</th>
                <th className="px-4 py-3">Committed</th>
                <th className="px-4 py-3">Online now</th>
                <th className="px-4 py-3">Gap</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.id} className="border-border hover:bg-bg border-b last:border-b-0">
                  <td className="px-4 py-3 text-[0.8125rem] font-extrabold">{z.name}</td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">{num(z.riders_needed)}</td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">{num(z.committed)}</td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">{num(z.online_now)}</td>
                  <td className="px-4 py-3">
                    {z.gap === null ? (
                      <span className="text-muted-light text-[0.75rem] font-semibold">{DASH}</span>
                    ) : z.gap > 0 ? (
                      <span className="text-danger text-[0.75rem] font-extrabold">
                        short {z.gap}
                      </span>
                    ) : (
                      <span className="text-success text-[0.75rem] font-extrabold">covered</span>
                    )}
                  </td>
                </tr>
              ))}
              {zones.length === 0 && <EmptyRow colSpan={5}>No zones are defined yet.</EmptyRow>}
            </tbody>
          </table>
          <p className="text-muted-light border-border border-t px-4 py-3 text-[0.6875rem] font-semibold leading-snug">
            Orders per hour vs riders online. Red = fewer than 1 free rider per 3 orders · offers
            cascade further and later. The needed column is {DASH} until a demand forecast is loaded
            — a gap computed against a number nobody set would send riders to the wrong zone.
          </p>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <p className="text-[0.9375rem] font-extrabold">
              Actions for the gap {short[0] ? `· ${short[0].name}` : ''}
            </p>
            <ul className="text-muted mt-3 space-y-2.5 text-[0.75rem] font-semibold leading-relaxed">
              <li>Raise zone bonus to +KES {DASH}</li>
              <li>Nudge idle riders toward the zone</li>
              <li>Broadcast open shift · 2 h · bonus guaranteed</li>
              <li>Widen dispatch radius to 5 km — temporary</li>
            </ul>
            <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-snug">
              Every action expires on its own. A bonus left on because nobody remembered is a bonus
              nobody budgeted for.
            </p>
          </Card>

          <NotMeasured
            what="The heatmap is not drawn"
            why="Demand by zone and hour comes from live orders and zone_demand_forecast. Neither has data, and a heatmap drawn from nothing is a picture of a guess."
          />
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════ 5.7 Documents (B7)

export interface DocumentRow {
  id: string;
  owner_id: string;
  status: string;
  expires_at: string | null;
  label: string;
  essential: boolean;
  rider: { first_name: string | null; last_name: string | null } | null;
}

export interface AutomationRule {
  key: string;
  label: string;
  enabled: boolean;
}

export function DocumentsTab({
  documents,
  automation,
  agreementPct,
}: {
  documents: DocumentRow[];
  automation: AutomationRule[];
  agreementPct: number | null;
}) {
  const expiring = documents.filter(
    (d) => d.expires_at && daysSince(d.expires_at)! >= -30 && daysSince(d.expires_at)! < 0,
  );
  const expired = documents.filter((d) => d.expires_at && daysSince(d.expires_at)! >= 0);
  const awaiting = documents.filter((d) => d.status === 'uploaded');

  return (
    <>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Tile label="Documents on file" value={num(documents.length)} />
        <Tile
          label="Expiring < 30 days"
          value={num(expiring.length)}
          tone={expiring.length > 0 ? 'warning' : undefined}
        >
          insurance · licence
        </Tile>
        <Tile
          label="Expired · offers paused"
          value={num(expired.length)}
          tone={expired.length > 0 ? 'danger' : undefined}
        />
        <Tile
          label="Awaiting verification"
          value={num(awaiting.length)}
          tone={awaiting.length > 0 ? 'warning' : undefined}
        >
          uploaded in app
        </Tile>
        <Tile label="Good conduct renewals due" value={DASH}>
          annual · issued by DCI
        </Tile>
        <Tile label="Agreement signed · current" value={pct(agreementPct)} />
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[38rem] text-left">
            <thead>
              <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-3">Rider</th>
                <th className="px-4 py-3">Document</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {documents.slice(0, 60).map((d) => {
                const days = d.expires_at ? -(daysSince(d.expires_at) ?? 0) : null;
                const state =
                  days !== null && days < 0
                    ? 'EXPIRED · PAUSED'
                    : days !== null && days <= 30
                      ? 'EXPIRING'
                      : d.status === 'uploaded'
                        ? 'VERIFY'
                        : d.status === 'verified'
                          ? 'VALID'
                          : d.status.toUpperCase();
                return (
                  <tr key={d.id} className="border-border hover:bg-bg border-b last:border-b-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/riders/${d.owner_id}`}
                        className="text-[0.8125rem] font-extrabold hover:underline"
                      >
                        {d.rider ? riderName(d.rider) : DASH}
                      </Link>
                    </td>
                    <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">{d.label}</td>
                    <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">
                      {d.expires_at
                        ? new Date(d.expires_at).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: '2-digit',
                          })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[0.5625rem] font-extrabold ${
                          state.startsWith('EXPIRED')
                            ? 'bg-danger-bg text-danger'
                            : state === 'EXPIRING'
                              ? 'bg-warning-bg text-warning'
                              : state === 'VERIFY'
                                ? 'bg-gold-soft text-gold-text'
                                : 'bg-success-bg text-success'
                        }`}
                      >
                        {state}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {documents.length === 0 && (
                <EmptyRow colSpan={4}>No rider documents on file.</EmptyRow>
              )}
            </tbody>
          </table>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <p className="text-[0.9375rem] font-extrabold">Automation</p>
            <ul className="mt-3 space-y-2.5">
              {automation.map((rule) => (
                <li key={rule.key} className="flex items-center justify-between gap-3">
                  <span className="text-[0.75rem] font-semibold">{rule.label}</span>
                  <span
                    aria-label={rule.enabled ? 'on' : 'off'}
                    className={`relative h-5 w-9 shrink-0 rounded-full ${
                      rule.enabled ? 'bg-success' : 'bg-border-strong'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white ${
                        rule.enabled ? 'left-[1.125rem]' : 'left-0.5'
                      }`}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <p className="text-[0.9375rem] font-extrabold">Privacy note</p>
            <p className="text-muted mt-2 text-[0.75rem] font-semibold leading-[1.7]">
              ID and licence images are stored encrypted, visible only to Rider ops and Super admin,
              watermarked on view, and deleted 12 months after a rider leaves. Access is logged.
            </p>
            <p className="text-warning mt-2 text-[0.6875rem] font-bold leading-snug">
              The 12-month retention period has not been confirmed against the Kenyan Data
              Protection Act. Confirm before this text is shown to a rider.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════ 5.8 Comms (B8)

export interface MessageRow {
  id: string;
  rider_id: string;
  direction: string;
  channel: string;
  subject: string | null;
  body: string;
  created_at: string;
  rider: { first_name: string | null; last_name: string | null } | null;
}

export interface TemplateRow {
  id: string;
  name: string;
  channel: string;
}

export function CommsTab({
  messages,
  templates,
  riders,
  selected,
}: {
  messages: MessageRow[];
  templates: TemplateRow[];
  riders: RiderRow[];
  selected: string | null;
}) {
  const chosen = selected ? riders.find((r) => r.id === selected) : undefined;
  const thread = chosen ? messages.filter((m) => m.rider_id === chosen.id) : [];

  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)_22rem] xl:items-start">
      <Card className="p-5">
        <p className="text-[0.9375rem] font-extrabold">New broadcast</p>
        <p className="text-muted-light mt-1 text-[0.6875rem] font-semibold uppercase tracking-wide">
          Audience
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {['City', 'Online now', 'Zone', 'Green only', 'Offline', 'Vehicle', 'Fleet'].map((c) => (
            <span
              key={c}
              className="border-border-strong rounded-full border px-2.5 py-1 text-[0.6875rem] font-bold"
            >
              {c}
            </span>
          ))}
        </div>
        <p className="text-muted-light mt-4 text-[0.6875rem] font-semibold uppercase tracking-wide">
          Channel
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {['WhatsApp', 'SMS', 'Push', 'In-app banner'].map((c) => (
            <span
              key={c}
              className="border-border-strong rounded-full border px-2.5 py-1 text-[0.6875rem] font-bold"
            >
              {c}
            </span>
          ))}
        </div>
        <p className="text-muted-light mt-4 text-[0.6875rem] font-semibold uppercase tracking-wide">
          Template
        </p>
        <ul className="mt-2 space-y-1">
          {templates.slice(0, 8).map((t) => (
            <li key={t.id} className="text-muted text-[0.75rem] font-semibold">
              {t.name}
            </li>
          ))}
          {templates.length === 0 && (
            <li className="text-muted-light text-[0.75rem] font-semibold">
              No templates have been written yet.
            </li>
          )}
        </ul>
        <p className="text-muted-light mt-4 text-[0.6875rem] font-semibold leading-[1.7]">
          Kiswahili version auto-attached · never sends while a rider is on a trip.
        </p>
        <p className="text-warning mt-2 text-[0.6875rem] font-bold leading-snug">
          Nothing is delivered yet. Messages queue as notification rows; no provider is wired, so
          the send button is not shown rather than lying about what it does.
        </p>
      </Card>

      <Card className="p-0">
        <p className="border-border border-b px-4 py-3 text-[0.9375rem] font-extrabold">
          Recent messages
        </p>
        <ul className="divide-border divide-y">
          {messages.slice(0, 20).map((m) => (
            <li key={m.id} className="px-4 py-3">
              <p className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/riders?tab=comms&selected=${m.rider_id}`}
                  className="text-[0.8125rem] font-extrabold hover:underline"
                >
                  {m.rider ? riderName(m.rider) : DASH}
                </Link>
                <span className="bg-bg text-muted rounded px-1.5 py-0.5 text-[0.5625rem] font-extrabold uppercase">
                  {m.channel}
                </span>
                <span className="text-muted-light text-[0.625rem] font-semibold">
                  {when(m.created_at)}
                </span>
              </p>
              <p className="text-muted mt-1 text-[0.75rem] font-semibold">{m.body}</p>
            </li>
          ))}
          {messages.length === 0 && (
            <li className="text-muted px-4 py-10 text-center text-sm font-semibold">
              Nothing has been sent to a rider yet.
            </li>
          )}
        </ul>
      </Card>

      <Card className="p-0">
        <p className="border-border border-b px-4 py-3 text-[0.9375rem] font-extrabold">
          {chosen ? `${riderName(chosen)} · message log` : 'Message log'}
        </p>
        {chosen ? (
          <ul className="divide-border divide-y">
            {thread.map((m) => (
              <li key={m.id} className="px-4 py-3">
                <p className="text-muted-light text-[0.625rem] font-extrabold uppercase">
                  {m.channel} · {when(m.created_at)}
                </p>
                <p className="mt-1 text-[0.75rem] font-semibold">{m.body}</p>
              </li>
            ))}
            {thread.length === 0 && (
              <li className="text-muted px-4 py-8 text-center text-[0.75rem] font-semibold">
                Nothing said to this rider yet.
              </li>
            )}
          </ul>
        ) : (
          <p className="text-muted px-4 py-8 text-center text-[0.75rem] font-semibold">
            Pick a rider to see their thread.
          </p>
        )}
      </Card>
    </div>
  );
}
