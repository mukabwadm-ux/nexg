import { Card } from '@nexg/ui';
import Link from 'next/link';

import {
  Avatar,
  CashBar,
  Chip,
  DASH,
  kes,
  maskPhone,
  num,
  pct,
  plural,
  PresencePill,
  riderName,
  StatusPill,
  Tile,
  VEHICLE_LABEL,
  when,
  type Badges,
  type RiderRow,
} from './shared';

/**
 * Directory (B1) — the default tab.
 *
 * Trips, acceptance and on-time render [—]: there is no orders domain,
 * and a zero would read as "did nothing" rather than "not measured".
 * That difference decides whether somebody gets a coaching call.
 *
 * Cash is the exception — it is real, it comes from the ledger, and it
 * is the column that stops a rider being offered work.
 */

const FILTERS = [
  { key: 'all', label: (b: Badges) => `All ${num(b.active + b.onboarding + b.suspended)}` },
  { key: 'online', label: (b: Badges) => `Online ${num(b.online_now)}` },
  { key: 'on_trip', label: (b: Badges) => `On trip ${num(b.on_trip)}` },
  { key: 'onboarding', label: (b: Badges) => `Onboarding ${num(b.onboarding)}` },
  { key: 'cooldown', label: (b: Badges) => `Cooldown ${num(b.on_cooldown)}` },
  { key: 'suspended', label: (b: Badges) => `Suspended ${num(b.suspended)}` },
  { key: 'fleet', label: (b: Badges) => `Fleet ${num(b.fleet)}` },
] as const;

export function Directory({
  rows,
  badges,
  filter,
  selected,
}: {
  rows: RiderRow[];
  badges: Badges;
  filter: string;
  selected: string | null;
}) {
  const visible = rows.filter((r) => {
    switch (filter) {
      case 'online':
        return r.presence === 'online';
      case 'on_trip':
        return r.presence === 'on_trip';
      case 'onboarding':
        return ['applied', 'documents_pending', 'under_review'].includes(r.status);
      case 'cooldown':
        return !!r.cooldown_until && new Date(r.cooldown_until) > new Date();
      case 'suspended':
        return r.status === 'suspended';
      case 'fleet':
        return !!r.employer_merchant_id;
      default:
        return true;
    }
  });

  const href = (next: { filter?: string; selected?: string | null }) => {
    const params = new URLSearchParams({ tab: 'directory' });
    const f = next.filter ?? filter;
    if (f !== 'all') params.set('filter', f);
    const s = next.selected === undefined ? selected : next.selected;
    if (s) params.set('selected', s);
    return `/riders?${params.toString()}`;
  };

  const chosen = selected ? rows.find((r) => r.id === selected) : undefined;
  const overCap = rows.filter(
    (r) => r.cash_cap_effective !== null && (r.cash_on_hand ?? 0) >= r.cash_cap_effective,
  ).length;

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Chip key={f.key} on={filter === f.key} href={href({ filter: f.key })}>
            {f.label(badges)}
          </Chip>
        ))}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Riders active · 30d" value={num(badges.active)}>
          {plural(badges.online_now ?? 0, 'rider')} online now
        </Tile>
        <Tile label="Avg acceptance" value={`${DASH}%`}>
          first-offer · needs an orders domain
        </Tile>
        <Tile
          label="Cash on hand · all"
          value={kes(badges.cash_all)}
          tone={overCap > 0 ? 'danger' : undefined}
        >
          {plural(overCap, 'rider')} over cap
        </Tile>
        <Tile
          label="Insurance expiring ≤ 30 d"
          value={num(rows.filter((r) => (r.documents_expiring ?? 0) > 0).length)}
          tone={rows.some((r) => (r.documents_expired ?? 0) > 0) ? 'warning' : undefined}
        >
          listing pauses on lapse
        </Tile>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start">
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[52rem] text-left">
            <thead>
              <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-3">Rider</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Vehicle</th>
                <th className="px-4 py-3">Plate</th>
                <th className="px-4 py-3">Rating</th>
                <th className="px-4 py-3">Accept</th>
                <th className="px-4 py-3">Trips 30d</th>
                <th className="px-4 py-3">Cash</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const over =
                  r.cash_cap_effective !== null &&
                  (r.cash_on_hand ?? 0) >= r.cash_cap_effective;
                return (
                  <tr
                    key={r.id}
                    className={`border-border hover:bg-bg border-b last:border-b-0 ${
                      selected === r.id ? 'bg-bg ring-gold ring-1 ring-inset' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <Link href={href({ selected: r.id })} className="flex items-center gap-2.5">
                        <Avatar name={riderName(r)} />
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[0.8125rem] font-extrabold">
                              {riderName(r)}
                            </span>
                            <PresencePill
                              presence={r.presence}
                              cooldownUntil={r.cooldown_until}
                            />
                            {r.top_decile && (
                              <span className="border-gold text-gold-text rounded-full border px-1.5 py-0.5 text-[0.5625rem] font-extrabold">
                                TOP 10%
                              </span>
                            )}
                          </span>
                          <span className="text-muted-light block text-[0.6875rem] font-semibold">
                            {r.city_name ?? DASH}
                            {r.employer_name && (
                              <span className="ml-1 rounded bg-purple-100 px-1.5 py-0.5 text-[0.5625rem] font-extrabold text-purple-800">
                                FLEET · {r.employer_name}
                              </span>
                            )}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-[0.8125rem] font-bold">
                      {VEHICLE_LABEL[r.vehicle ?? ''] ?? DASH}
                    </td>
                    <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">
                      {r.plate_no ?? 'plate pending'}
                    </td>
                    <td className="px-4 py-3 text-[0.8125rem] font-bold">
                      {r.rating_avg === null ? DASH : Number(r.rating_avg).toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-[0.8125rem] font-bold">
                      {pct(r.acceptance_pct)}
                    </td>
                    <td className="px-4 py-3 text-[0.8125rem] font-bold">{num(r.trips_30d)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-[0.8125rem] font-extrabold ${over ? 'text-danger' : ''}`}
                      >
                        {kes(r.cash_on_hand)}
                        {over && ' · owed'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="text-muted px-4 py-10 text-center text-sm font-semibold"
                  >
                    Nobody matches that filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="text-muted-light border-border border-t px-4 py-3 text-[0.6875rem] font-semibold">
            Showing {visible.length} of {rows.length} riders
          </p>
        </Card>

        {chosen ? <DetailPanel rider={chosen} /> : <EmptyPanel />}
      </div>
    </>
  );
}

function EmptyPanel() {
  return (
    <Card className="p-5">
      <p className="text-muted text-sm font-semibold">Pick a rider to open their record.</p>
    </Card>
  );
}

/**
 * The 410 px panel.
 *
 * The four control cards are the reason this panel exists. Each is a
 * real write through `rpc_rider_set_control`, and each carries the
 * sub-label the design specifies — including, when the system paused
 * something, the reason it did.
 */
function DetailPanel({ rider }: { rider: RiderRow }) {
  const cooling = !!rider.cooldown_until && new Date(rider.cooldown_until) > new Date();
  const twoWheeler = rider.vehicle === 'motorbike' || rider.vehicle === 'bicycle';

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <Avatar name={riderName(rider)} />
          <div className="min-w-0">
            <p className="text-[1.0625rem] font-extrabold leading-tight">{riderName(rider)}</p>
            <p className="mt-1 flex flex-wrap gap-1.5">
              <StatusPill status={rider.status} />
              <PresencePill presence={rider.presence} cooldownUntil={rider.cooldown_until} />
              {rider.top_decile && (
                <span className="border-gold text-gold-text rounded-full border px-1.5 py-0.5 text-[0.5625rem] font-extrabold">
                  TOP 10%
                </span>
              )}
              {rider.employer_name && (
                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[0.5625rem] font-extrabold text-purple-800">
                  FLEET
                </span>
              )}
            </p>
            <p className="text-muted-light mt-2 text-[0.6875rem] font-semibold leading-relaxed">
              {VEHICLE_LABEL[rider.vehicle ?? ''] ?? DASH} · {rider.plate_no ?? 'plate pending'} ·{' '}
              {rider.city_name ?? DASH} · joined {when(rider.activated_at ?? rider.created_at)} ·{' '}
              {maskPhone(rider.phone)}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Tile label="Trips 30d" value={num(rider.trips_30d)} />
        <Tile label="Acceptance" value={pct(rider.acceptance_pct)} />
        <Tile label="On-time" value={pct(rider.on_time_pct)} />
        <Tile
          label="Rating"
          value={rider.rating_avg === null ? DASH : Number(rider.rating_avg).toFixed(1)}
        />
      </div>

      {/* ───────────────────────────────────────── the controls */}
      <Card className="p-0">
        <p className="border-border border-b px-4 py-3 text-[0.9375rem] font-extrabold">
          Controls
        </p>
        <div className="divide-border divide-y">
          <ControlRow
            riderId={rider.id}
            control="can_receive_offers"
            label="Can receive offers"
            on={!!rider.can_receive_offers && !cooling}
            sub={
              cooling
                ? `On cooldown until ${new Date(rider.cooldown_until!).toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : rider.offers_paused_reason
                  ? `Paused · ${rider.offers_paused_reason}`
                  : 'Not on cooldown'
            }
            locked={cooling}
          />
          <ControlRow
            riderId={rider.id}
            control="pay_on_delivery_eligible"
            label="Pay-on-delivery eligible"
            on={!!rider.pay_on_delivery_eligible}
            sub={
              rider.cash_cap_effective === null
                ? 'No cash cap set for this city — cash orders stay off'
                : rider.offers_paused_reason === 'over_cap'
                  ? `Paused by the system · over cap ${kes(rider.cash_cap_effective)}`
                  : `Cash cap ${kes(rider.cash_cap_effective)}`
            }
            locked={rider.offers_paused_reason === 'over_cap'}
          />
          <ControlRow
            riderId={rider.id}
            control="alcohol_eligible"
            label="Alcohol deliveries"
            on={false}
            sub="Needs alcohol module"
            locked
          />
          <ControlRow
            riderId={rider.id}
            control="large_items_eligible"
            label="Large items (car only)"
            on={!twoWheeler}
            sub={twoWheeler ? `${VEHICLE_LABEL[rider.vehicle ?? '']} · not eligible` : 'Eligible'}
            locked={twoWheeler}
          />
        </div>
      </Card>

      {/* ───────────────────────────────────────── cash on hand */}
      <Card className="p-5">
        <p className="text-[0.9375rem] font-extrabold">Cash on hand</p>
        <p className="mt-2 text-[1.5rem] font-extrabold leading-tight">
          {kes(rider.cash_on_hand)}
        </p>
        <p className="text-muted-light mt-1 text-[0.6875rem] font-semibold">
          {rider.oldest_undeposited_at
            ? `oldest collection ${when(rider.oldest_undeposited_at)}`
            : 'nothing un-deposited'}
          {' · last deposit '}
          {when(rider.last_deposit_at)}
        </p>
        <div className="mt-3">
          <CashBar held={rider.cash_on_hand} cap={rider.cash_cap_effective} />
        </div>
        <p className="text-muted-light mt-2 text-[0.6875rem] font-semibold leading-snug">
          Deposits by Paybill · netted Friday if not deposited
        </p>
      </Card>

      {/* ──────────────────────────────────────────── the footer */}
      <Card className="p-4">
        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`/riders/${rider.id}`}
            className="bg-ink hover:bg-ink/90 rounded-lg px-3 py-2 text-center text-[0.8125rem] font-bold text-white transition-colors"
          >
            Open record
          </Link>
          <Link
            href={`/riders?tab=comms&selected=${rider.id}`}
            className="border-border-strong hover:border-ink rounded-lg border px-3 py-2 text-center text-[0.8125rem] font-bold transition-colors"
          >
            Message
          </Link>
          <Link
            href={`/riders/${rider.id}#location`}
            className="border-border-strong hover:border-ink rounded-lg border px-3 py-2 text-center text-[0.8125rem] font-bold transition-colors"
          >
            Live location
          </Link>
          <Link
            href={`/riders/${rider.id}#cooldown`}
            className="border-border-strong hover:border-ink rounded-lg border px-3 py-2 text-center text-[0.8125rem] font-bold transition-colors"
          >
            Put on cooldown
          </Link>
        </div>
        <Link
          href={`/riders/${rider.id}#suspend`}
          className="border-danger text-danger hover:bg-danger-bg mt-2 block rounded-lg border px-3 py-2 text-center text-[0.8125rem] font-bold transition-colors"
        >
          Suspend…
        </Link>
        <p className="text-muted-light mt-2 text-[0.6875rem] font-semibold leading-snug">
          Suspension needs a reason and a second approver · pending earnings are held, not
          forfeited
        </p>
      </Card>
    </div>
  );
}

/**
 * One control. A link to the record rather than an inline toggle: the
 * write needs a reason for most of these, and a switch that silently
 * takes a rider off work is the wrong affordance for it.
 */
function ControlRow({
  riderId,
  control,
  label,
  on,
  sub,
  locked,
}: {
  riderId: string;
  control: string;
  label: string;
  on: boolean;
  sub: string;
  locked?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[0.8125rem] font-extrabold">{label}</p>
        <p className="text-muted-light mt-0.5 text-[0.6875rem] font-semibold">{sub}</p>
      </div>
      {locked ? (
        <span
          aria-hidden="true"
          className={`h-5 w-9 shrink-0 rounded-full opacity-40 ${on ? 'bg-success' : 'bg-border-strong'}`}
        />
      ) : (
        <Link
          href={`/riders/${riderId}#${control}`}
          aria-label={`${label} — currently ${on ? 'on' : 'off'}. Change on the rider's record.`}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
            on ? 'bg-success' : 'bg-border-strong'
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
              on ? 'left-[1.125rem]' : 'left-0.5'
            }`}
          />
        </Link>
      )}
    </div>
  );
}
