import { Card } from '@nexg/ui';

import { placeMerchantInSlot } from '@/app/featured/actions';

import {
  type MerchantOption,
  type OpenSlot,
  PlaceMerchant,
} from './place-merchant';
import Link from 'next/link';

import {
  Avatar,
  CATEGORY_LABEL,
  Chip,
  DASH,
  EligibilityList,
  EmptyRow,
  FEE_LABEL,
  FEE_TONE,
  HealthDot,
  kes,
  KIND_LABEL,
  mondayOf,
  NotMeasured,
  num,
  Pill,
  plural,
  ratio,
  shortDate,
  SLOT_TONE,
  SponsoredChip,
  STAGE_TONE,
  Tile,
  weekNumber,
  when,
  type Badges,
  type InventoryRow,
  type PerformanceRow,
  type RequestRow,
  type ScheduleRow,
} from './shared';

// ═══════════════════════════════════ G1 · Inventory

const GROUPS = [
  {
    kind: 'homepage',
    title: 'Homepage spot',
    note: 'Featured Merchants band · every guest who opens NexG in this city',
  },
  {
    kind: 'category_top',
    title: 'Category top',
    note: 'First result in Explore for that category · 1 per category per city',
  },
  {
    kind: 'popular_request',
    title: 'Popular request',
    note: 'Best-seller pinned in the Popular Requests strip',
  },
] as const;

export function InventoryTab({
  rows,
  openSlots,
  merchants,
  badges,
  week,
  selected,
  cityName,
  requests,
}: {
  rows: InventoryRow[];
  openSlots: OpenSlot[];
  merchants: MerchantOption[];
  badges: Badges;
  week: string;
  selected: string | null;
  cityName: string;
  requests: RequestRow[];
}) {
  const sold = rows.filter((r) => r.slot_status && r.slot_status !== 'open').length;
  const revenue = rows
    .filter((r) => r.slot_status === 'live')
    .reduce((s, r) => s + (r.price ?? 0), 0);
  const chosen = selected ? rows.find((r) => r.placement_id === selected) : undefined;

  const href = (placementId: string) =>
    `/featured?tab=inventory&week=${week}&selected=${placementId}`;

  return (
    <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Tile label="Slots this week" value={`${sold} / ${rows.length}`}>
          sold / total · {cityName}
        </Tile>
        <Tile
          label="Occupancy"
          value={rows.length === 0 ? `${DASH}%` : `${Math.round((sold / rows.length) * 100)}%`}
        >
          target ≥ 80 %
        </Tile>
        <Tile
          label="Featured revenue · wk"
          value={revenue > 0 ? kes(revenue) : kes(null)}
        >
          billed via weekly settlement
        </Tile>
        <Tile label="Waitlist" value={num(requests.filter((r) => r.status === 'waitlisted').length)}>
          eligible merchants waiting
        </Tile>
        <Tile
          label="Auto-paused"
          value={num(badges.auto_paused)}
          tone={badges.auto_paused > 0 ? 'danger' : undefined}
        >
          health dropped below green
        </Tile>
      </div>

      {badges.cities_without_prices > 0 && (
        <Card className="border-warning mt-5 border-2 p-4">
          <p className="text-[0.875rem] font-extrabold">
            Quotes are blocked in {plural(badges.cities_without_prices, 'city', 'cities')}.
          </p>
          <p className="text-muted mt-1.5 text-[0.75rem] font-semibold leading-relaxed">
            No rate-card price is set, so a slot there cannot be quoted at all. Finance sets it on
            the Rules tab — nobody types a price into a quote.
          </p>
        </Card>
      )}

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start">
        <div className="space-y-5">
          {GROUPS.map((group) => {
            const slots = rows
              .filter((r) => r.kind === group.kind)
              .sort((a, b) =>
                a.category && b.category
                  ? a.category.localeCompare(b.category)
                  : a.position - b.position,
              );
            if (slots.length === 0) return null;

            return (
              <Card key={group.kind} className="p-0">
                <div className="border-border flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
                  <h2 className="text-[0.9375rem] font-extrabold">{group.title}</h2>
                  <p className="text-muted-light text-[0.6875rem] font-semibold">
                    {group.note} · {plural(slots.length, 'slot')}
                  </p>
                </div>
                <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
                  {slots.map((slot) => (
                    <SlotCard
                      key={slot.placement_id}
                      slot={slot}
                      href={href(slot.placement_id)}
                      on={selected === slot.placement_id}
                    />
                  ))}
                </div>
              </Card>
            );
          })}
        </div>

        <div className="space-y-5">
          <PlaceMerchant
            slots={openSlots}
            merchants={merchants}
            onPlace={placeMerchantInSlot}
          />

          {chosen ? (
            <SlotPanel slot={chosen} requests={requests} />
          ) : (
            <Card className="p-5">
              <p className="text-muted text-sm font-semibold">Pick a slot to open it.</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function SlotCard({
  slot,
  href,
  on,
}: {
  slot: InventoryRow;
  href: string;
  on: boolean;
}) {
  const status = slot.slot_status ?? 'open';
  const open = status === 'open';

  return (
    <Link
      href={href}
      className={`block rounded-xl p-3 transition-colors ${
        status === 'auto_paused'
          ? 'bg-danger-bg border-danger border'
          : open
            ? 'border-border-strong hover:border-ink border border-dashed'
            : 'border-border hover:border-ink border'
      } ${on ? 'ring-gold ring-2' : ''}`}
    >
      <p className="flex items-center justify-between gap-2">
        <span className="text-muted-light text-[0.5625rem] font-extrabold uppercase tracking-wide">
          {slot.category
            ? `Slot ${CATEGORY_LABEL[slot.category] ?? slot.category}`
            : `Slot ${slot.position}`}
        </span>
        <Pill tone={SLOT_TONE[status]}>
          {status === 'held' ? 'HELD · 48 H' : status.replace(/_/g, '-').toUpperCase()}
        </Pill>
      </p>

      <p className="mt-2 text-[0.8125rem] font-extrabold">
        {slot.trading_name ?? 'Unsold'}
      </p>

      <p className="text-muted-light mt-0.5 text-[0.6875rem] font-semibold leading-snug">
        {slot.trading_name
          ? [
              slot.merchant_category
                ? (CATEGORY_LABEL[slot.merchant_category] ?? slot.merchant_category)
                : null,
              slot.end_date ? `until ${shortDate(slot.end_date)}` : null,
              status === 'auto_paused' ? `paused · ${slot.pause_reason ?? 'health'}` : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : 'no eligible request'}
      </p>

      <p className="mt-2.5 flex items-center justify-between gap-2">
        {slot.trading_name ? <SponsoredChip /> : <span />}
        <span className="text-[0.6875rem] font-extrabold">
          {slot.price ?? slot.rate_card_price
            ? `${kes(slot.price ?? slot.rate_card_price)} / wk`
            : `KES ${DASH} / wk`}
        </span>
      </p>
    </Link>
  );
}

function SlotPanel({ slot, requests }: { slot: InventoryRow; requests: RequestRow[] }) {
  const status = slot.slot_status ?? 'open';
  const booking = requests.find((r) => r.id === slot.booking_id);

  /* For an open slot: who is waiting and actually qualifies. */
  const waiting = requests
    .filter(
      (r) =>
        ['requested', 'waitlisted'].includes(r.status) &&
        r.placement_kind === slot.kind &&
        (r.category ?? null) === (slot.category ?? null) &&
        r.eligible,
    )
    .slice(0, 3);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-[1rem] font-extrabold">{slot.label}</span>
          <Pill tone={SLOT_TONE[status]}>{status.replace(/_/g, '-').toUpperCase()}</Pill>
        </p>
        <p className="text-muted-light mt-2 text-[0.6875rem] font-semibold leading-relaxed">
          {slot.city_name ?? DASH}
          {slot.trading_name ? ` · ${slot.trading_name}` : ' · unsold'}
          {slot.auto_renew ? ' · auto-renews weekly until cancelled' : ''}
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Fact
            label="Price / week"
            value={
              slot.price ?? slot.rate_card_price
                ? kes(slot.price ?? slot.rate_card_price)
                : kes(null)
            }
          />
          <Fact label="Status" value={status.replace(/_/g, ' ')} />
          <Fact label="Ends" value={shortDate(slot.end_date)} />
        </div>
      </Card>

      {booking && (
        <Card className="p-5">
          <p className="text-[0.9375rem] font-extrabold">Eligibility · checked nightly</p>
          <div className="mt-3">
            <EligibilityList eligibility={booking.eligibility} />
          </div>
        </Card>
      )}

      {status === 'auto_paused' && (
        <Card className="border-danger border-2 p-5">
          <p className="text-[0.9375rem] font-extrabold">Why it paused</p>
          <p className="text-muted mt-2 text-[0.75rem] font-semibold leading-relaxed">
            {slot.pause_reason ?? 'A nightly check stopped passing.'} The unused days are credited
            pro-rata and the merchant has been told.
          </p>
          <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-[1.7]">
            It does not come back on its own. A merchant who flips green and amber day to day
            would otherwise appear and vanish from the homepage inside a week — somebody looks
            first, and Restore only works while they pass.
          </p>
        </Card>
      )}

      {status === 'open' && (
        <Card className="p-0">
          <p className="border-border border-b px-4 py-3 text-[0.9375rem] font-extrabold">
            Eligible and waiting
          </p>
          <ul className="divide-border divide-y">
            {waiting.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-[0.8125rem] font-extrabold">
                    {r.trading_name ?? DASH}
                  </span>
                  <span className="text-muted-light block text-[0.6875rem] font-semibold">
                    waiting {plural(r.waiting_days, 'day')}
                  </span>
                </span>
                <Link
                  href={`/featured?tab=requests&selected=${r.id}`}
                  className="bg-ink hover:bg-ink/90 shrink-0 rounded-lg px-3 py-1.5 text-[0.75rem] font-bold text-white transition-colors"
                >
                  Offer this slot
                </Link>
              </li>
            ))}
            {waiting.length === 0 && (
              <li className="text-muted px-4 py-6 text-center text-[0.75rem] font-semibold">
                Nobody eligible is waiting for this one.
              </li>
            )}
          </ul>
        </Card>
      )}

      <Card className="p-5">
        <p className="text-[0.9375rem] font-extrabold">Preview</p>
        <p className="text-muted mt-2 text-[0.75rem] font-semibold leading-[1.7]">
          Shown as guests see it — cover photo, name, &ldquo;{'{Category}'} · {DASH} min&rdquo;,
          always with the <SponsoredChip /> label. Concierge picks stay separate and cannot be
          bought.
        </p>
      </Card>

      <Card className="p-4">
        <div className="grid grid-cols-2 gap-2">
          {slot.merchant_id && (
            <Link
              href={`/merchants?selected=${slot.merchant_id}`}
              className="border-border-strong hover:border-ink rounded-lg border px-3 py-2 text-center text-[0.8125rem] font-bold transition-colors"
            >
              Open merchant
            </Link>
          )}
          {slot.booking_id && (
            <Link
              href={`/featured?tab=requests&selected=${slot.booking_id}`}
              className="border-border-strong hover:border-ink rounded-lg border px-3 py-2 text-center text-[0.8125rem] font-bold transition-colors"
            >
              Open booking
            </Link>
          )}
        </div>
        <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-snug">
          Price changes and refunds need Finance approval · every change is in the Audit log.
        </p>
      </Card>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg rounded-lg p-2.5">
      <p className="text-muted-light text-[0.5625rem] font-extrabold uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1 text-[0.8125rem] font-extrabold capitalize">{value}</p>
    </div>
  );
}

// ═══════════════════════════════ G2 · Requests & waitlist

export function RequestsTab({
  requests,
  badges,
  filter,
  selected,
}: {
  requests: RequestRow[];
  badges: Badges;
  filter: string;
  selected: string | null;
}) {
  const needsAction = requests.filter(
    (r) => r.stage === 'ELIGIBLE' || (r.stage === 'QUOTED' && (r.quote_hours_left ?? 99) < 12),
  );

  const visible = requests.filter((r) => {
    switch (filter) {
      case 'action':
        return needsAction.includes(r);
      case 'waitlist':
        return r.status === 'waitlisted';
      case 'quoted':
        return r.status === 'quoted';
      case 'booked':
        return ['booked', 'live'].includes(r.status);
      case 'declined':
        return r.status === 'declined';
      default:
        return true;
    }
  });

  const chosen = selected ? requests.find((r) => r.id === selected) : undefined;
  const href = (f: string, s?: string | null) => {
    const p = new URLSearchParams({ tab: 'requests' });
    if (f !== 'all') p.set('filter', f);
    const sel = s === undefined ? selected : s;
    if (sel) p.set('selected', sel);
    return `/featured?${p.toString()}`;
  };

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Chip on={filter === 'action'} href={href('action')}>
          Needs action {needsAction.length}
        </Chip>
        <Chip on={filter === 'waitlist'} href={href('waitlist')}>
          Waitlist {requests.filter((r) => r.status === 'waitlisted').length}
        </Chip>
        <Chip on={filter === 'quoted'} href={href('quoted')}>
          Quoted
        </Chip>
        <Chip on={filter === 'booked'} href={href('booked')}>
          Booked · upcoming
        </Chip>
        <Chip on={filter === 'declined'} href={href('declined')}>
          Declined
        </Chip>
        <Chip on={filter === 'all'} href={href('all')}>
          All
        </Chip>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Open requests" value={num(badges.open_requests)}>
          {plural(needsAction.length, 'needs a decision', 'need a decision')} today
        </Tile>
        <Tile label="Eligible now" value={num(badges.eligible_now)} tone="success">
          pass all five checks
        </Tile>
        <Tile
          label="Blocked by health"
          value={num(badges.blocked_by_health)}
          tone={badges.blocked_by_health > 0 ? 'danger' : undefined}
        >
          amber or red · told why
        </Tile>
        <Tile label="Avg wait · homepage" value={`${DASH} wk`}>
          needs a few weeks of requests
        </Tile>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_27rem] xl:items-start">
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[44rem] text-left">
            <thead>
              <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-3">Merchant</th>
                <th className="px-4 py-3">Placement</th>
                <th className="px-4 py-3">Health</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Waiting</th>
                <th className="px-4 py-3">Price / wk</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr
                  key={r.id}
                  className={`border-border hover:bg-bg border-b last:border-b-0 ${
                    selected === r.id ? 'bg-bg ring-gold ring-1 ring-inset' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <Link href={href(filter, r.id)} className="flex items-center gap-2.5">
                      <Avatar name={r.trading_name ?? 'M'} />
                      <span className="min-w-0">
                        <span className="block text-[0.8125rem] font-extrabold">
                          {r.trading_name ?? DASH}
                        </span>
                        <span className="text-muted-light block text-[0.6875rem] font-semibold">
                          {r.merchant_category
                            ? (CATEGORY_LABEL[r.merchant_category] ?? r.merchant_category)
                            : DASH}
                          {r.city_name ? ` · ${r.city_name}` : ''}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">
                    {KIND_LABEL[r.placement_kind] ?? r.placement_kind}
                    {r.category && ` · ${CATEGORY_LABEL[r.category] ?? r.category}`}
                  </td>
                  <td className="px-4 py-3">
                    <HealthDot band={r.health_band} days={r.health_green_days} />
                  </td>
                  <td className="px-4 py-3">
                    <Pill tone={STAGE_TONE[r.stage]}>
                      {r.stage === 'WAITLIST'
                        ? `WAITLIST · #${r.waitlist_rank ?? 1}`
                        : r.stage === 'QUOTED'
                          ? `QUOTED · ${r.quote_hours_left ?? 0} H`
                          : r.stage === 'NOT_YET'
                            ? `NOT YET · ${r.days_until_live_30d} D`
                            : r.stage === 'BLOCKED'
                              ? 'BLOCKED · HEALTH'
                              : r.stage}
                    </Pill>
                  </td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">
                    {r.waiting_days} d
                  </td>
                  <td className="px-4 py-3 text-[0.8125rem] font-extrabold">
                    {r.quoted_price ?? r.rate_card_price
                      ? kes(r.quoted_price ?? r.rate_card_price)
                      : '—'}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <EmptyRow colSpan={6}>
                  Nothing here. Requests arrive from the merchant dashboard.
                </EmptyRow>
              )}
            </tbody>
          </table>
        </Card>

        <div className="space-y-4">
          {chosen ? (
            <RequestPanel request={chosen} />
          ) : (
            <Card className="p-5">
              <p className="text-muted text-sm font-semibold">Pick a request to open it.</p>
            </Card>
          )}

          <Card className="p-5">
            <p className="text-[0.9375rem] font-extrabold">How a request becomes a slot</p>
            <ol className="mt-3 space-y-3">
              {[
                ['Requested', 'From the merchant dashboard, or booked on their behalf here.'],
                [
                  'Eligibility · automatic',
                  'Five checks, re-run nightly while the slot is live.',
                ],
                [
                  'Quoted · held 48 h',
                  'Rate-card price. Nobody types one — a placement with no price cannot be quoted.',
                ],
                [
                  'Booked',
                  'Merchant accepts in their dashboard · creative approved by Growth.',
                ],
                [
                  'Live → Ended',
                  'Mon 00:00 to Fri 23:59 weeks · auto-renew unless cancelled by Friday 23:59.',
                ],
              ].map(([title, body], i) => (
                <li key={title} className="flex gap-2.5">
                  <span className="bg-ink flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-extrabold text-white">
                    {i + 1}
                  </span>
                  <span>
                    <span className="block text-[0.75rem] font-extrabold">{title}</span>
                    <span className="text-muted-light block text-[0.6875rem] font-semibold leading-snug">
                      {body}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}

function RequestPanel({ request }: { request: RequestRow }) {
  return (
    <Card className="p-5">
      <p className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[1rem] font-extrabold">{request.trading_name ?? DASH}</span>
        <Pill tone={STAGE_TONE[request.stage]}>{request.stage.replace(/_/g, ' ')}</Pill>
      </p>
      <p className="text-muted-light mt-2 text-[0.6875rem] font-semibold leading-relaxed">
        Asked via the {request.requested_via === 'staff' ? 'console' : 'merchant dashboard'} ·{' '}
        {when(request.requested_at)} · wants{' '}
        {KIND_LABEL[request.placement_kind] ?? request.placement_kind}
        {request.category && ` · ${CATEGORY_LABEL[request.category] ?? request.category}`}
        {request.city_name && ` · ${request.city_name}`} · {plural(request.weeks, 'week')}
      </p>

      <div className="border-border mt-4 border-t pt-4">
        <EligibilityList eligibility={request.eligibility} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Fact
          label="Price / week"
          value={
            request.quoted_price ?? request.rate_card_price
              ? `${kes(request.quoted_price ?? request.rate_card_price)}`
              : 'not set'
          }
        />
        <Fact
          label="Start"
          value={shortDate(request.start_date ?? request.wanted_start)}
        />
      </div>

      {request.rate_card_price === null && request.quoted_price === null && (
        <p className="text-warning mt-3 text-[0.6875rem] font-bold leading-snug">
          No rate-card price for this placement, so it cannot be quoted. Finance sets it on the
          Rules tab.
        </p>
      )}

      {request.declined_reason && (
        <p className="text-muted mt-3 text-[0.75rem] font-semibold leading-relaxed">
          Declined: {request.declined_reason}
        </p>
      )}

      <p className="text-muted-light mt-4 text-[0.6875rem] font-semibold leading-[1.7]">
        Merchant confirms in their dashboard · the slot goes live Monday 00:00 · the first week is
        billed in that Friday&rsquo;s settlement.
      </p>
    </Card>
  );
}

// ═══════════════════════════════════════════ Schedule

export function ScheduleTab({ rows, weeks }: { rows: ScheduleRow[]; weeks: string[] }) {
  /* The order the inventory is sold in, not alphabetical — otherwise
     "Category top · Drinks" leads a grid whose headline row is the
     homepage. */
  const KIND_ORDER: Record<string, number> = {
    homepage: 0,
    category_top: 1,
    popular_request: 2,
  };

  const placements = [
    ...new Map(rows.map((r) => [r.placement_id, r])).values(),
  ].sort((a, b) =>
    a.kind === b.kind
      ? a.position - b.position || (a.category ?? '').localeCompare(b.category ?? '')
      : (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9),
  );

  const cell = (placementId: string, week: string) =>
    rows.find((r) => r.placement_id === placementId && r.week_start === week);

  const thisWeek = mondayOf(new Date());

  return (
    <>
      <Card className="mt-5 overflow-x-auto p-0">
        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <h2 className="text-[0.9375rem] font-extrabold">Schedule</h2>
          <p className="flex flex-wrap items-center gap-2">
            {[
              ['live', 'live'],
              ['booked', 'booked'],
              ['held', 'held'],
              ['auto_paused', 'paused'],
              ['open', 'open'],
            ].map(([key, label]) => (
              <span key={key} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={`h-2.5 w-2.5 rounded ${
                    key === 'live'
                      ? 'bg-success'
                      : key === 'booked'
                        ? 'bg-info'
                        : key === 'held'
                          ? 'bg-gold'
                          : key === 'auto_paused'
                            ? 'bg-danger'
                            : 'border-border-strong border border-dashed'
                  }`}
                />
                <span className="text-muted-light text-[0.625rem] font-bold">{label}</span>
              </span>
            ))}
          </p>
        </div>

        {/* A real table, with row and column headers, so the grid is
            navigable rather than a picture of one. */}
        <table className="w-full min-w-[48rem] text-left">
          <thead>
            <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
              <th scope="col" className="px-4 py-3">
                Placement
              </th>
              {weeks.map((w) => (
                <th key={w} scope="col" className="px-2 py-3 text-center">
                  Wk {weekNumber(w)}
                  {w === thisWeek && <span className="text-gold-text"> · now</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {placements.map((p) => (
              <tr key={p.placement_id} className="border-border border-b last:border-b-0">
                <th
                  scope="row"
                  className="px-4 py-2 text-left text-[0.75rem] font-extrabold"
                >
                  {KIND_LABEL[p.kind] ?? p.kind}
                  <span className="text-muted-light font-semibold">
                    {' · '}
                    {p.category ? (CATEGORY_LABEL[p.category] ?? p.category) : p.position}
                  </span>
                </th>
                {weeks.map((w) => {
                  const c = cell(p.placement_id, w);
                  const status = c?.status ?? 'open';
                  return (
                    <td key={w} className="px-1 py-1.5">
                      <span
                        className={`block truncate rounded px-1.5 py-1 text-center text-[0.625rem] font-bold ${
                          status === 'open'
                            ? 'border-border-strong text-muted-light border border-dashed'
                            : SLOT_TONE[status]
                        }`}
                        title={c?.trading_name ?? 'Open'}
                      >
                        {c?.trading_name ?? '—'}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
            {placements.length === 0 && (
              <EmptyRow colSpan={weeks.length + 1}>
                No placements in this city.
              </EmptyRow>
            )}
          </tbody>
        </table>
      </Card>

      <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-relaxed">
        Twelve weeks are materialised ahead. The homepage reads this table rather than working out
        availability from bookings at request time, which is what keeps the band fast.
      </p>
    </>
  );
}

// ══════════════════════════ G3 · Performance & billing

export function PerformanceTab({
  rows,
  badges,
}: {
  rows: PerformanceRow[];
  badges: Badges;
}) {
  const totals = rows.reduce(
    (a, r) => ({
      views: a.views + r.views,
      taps: a.taps + r.taps,
      orders: a.orders + r.orders,
      revenue: a.revenue + (r.fee_ex_vat ?? 0),
    }),
    { views: 0, taps: 0, orders: 0, revenue: 0 },
  );

  const byKind = (kind: string) =>
    rows.filter((r) => r.kind === kind).reduce((s, r) => s + (r.fee_ex_vat ?? 0), 0);

  return (
    <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
      <div className="space-y-5">
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[46rem] text-left">
            <thead>
              <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-3">Merchant</th>
                <th className="px-4 py-3">Placement</th>
                <th className="px-4 py-3">Views</th>
                <th className="px-4 py-3">Taps</th>
                <th className="px-4 py-3">Orders</th>
                <th className="px-4 py-3">CTR</th>
                <th className="px-4 py-3">Conv.</th>
                <th className="px-4 py-3">Billing</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.booking_id}-${r.week_start}`}
                  className="border-border hover:bg-bg border-b last:border-b-0"
                >
                  <td className="px-4 py-3">
                    <span className="block text-[0.8125rem] font-extrabold">
                      {r.trading_name ?? DASH}
                    </span>
                    <span className="text-muted-light block text-[0.6875rem] font-semibold">
                      {r.placement_label ?? DASH}
                      {r.week_start && ` · wk ${weekNumber(r.week_start)}`}
                    </span>
                  </td>
                  <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">
                    {r.kind ? (KIND_LABEL[r.kind] ?? r.kind) : DASH}
                  </td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">{num(r.views)}</td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">{num(r.taps)}</td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">{num(r.orders)}</td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">{ratio(r.ctr)}</td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">{ratio(r.conversion)}</td>
                  <td className="px-4 py-3">
                    {r.fee_status ? (
                      <Pill tone={FEE_TONE[r.fee_status]}>
                        {FEE_LABEL[r.fee_status] ?? r.fee_status}
                      </Pill>
                    ) : (
                      <span className="text-muted-light text-[0.75rem] font-semibold">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <EmptyRow colSpan={8}>
                  No slot has run yet. Numbers appear once a booking goes live on a Monday.
                </EmptyRow>
              )}
            </tbody>
          </table>
          <p className="text-muted-light border-border border-t px-4 py-3 text-[0.6875rem] font-semibold leading-snug">
            An order counts when it is placed within 30 minutes of a tap on that slot, in the same
            session. These are the numbers the merchant gets on Monday — the same table, not a
            second calculation.
          </p>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="p-5">
          <p className="text-[0.9375rem] font-extrabold">Featured revenue</p>
          <p className="mt-2 text-[1.75rem] font-extrabold leading-tight">
            {totals.revenue > 0 ? kes(totals.revenue) : kes(null)}
          </p>
          <ul className="mt-4 space-y-2.5">
            {(['homepage', 'category_top', 'popular_request'] as const).map((k) => {
              const v = byKind(k);
              const share = totals.revenue > 0 ? (v / totals.revenue) * 100 : 0;
              return (
                <li key={k}>
                  <p className="flex items-center justify-between gap-2">
                    <span className="text-[0.75rem] font-semibold">{KIND_LABEL[k]}</span>
                    <span className="text-[0.75rem] font-extrabold">
                      {v > 0 ? kes(v) : kes(null)}
                    </span>
                  </p>
                  <span className="bg-bg mt-1 block h-1.5 w-full overflow-hidden rounded-full">
                    <span
                      className="bg-gold block h-full rounded-full"
                      style={{ width: `${Math.round(share)}%` }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-snug">
            Featured is a Growth revenue line in Finance → Overview. Fee levels are placeholders
            until the rate card is set.
          </p>
        </Card>

        <Card className="p-0">
          <p className="border-border border-b px-4 py-3 text-[0.9375rem] font-extrabold">
            Billing · how featured fees move
          </p>
          <ul className="divide-border divide-y">
            {[
              [
                'Weekly fee',
                'Deducted from the merchant’s Friday settlement as a separate line “Featured · Homepage · wk 39” · never a separate payment to chase.',
              ],
              [
                'Tax',
                'VAT on the fee is NexG’s output tax, shown on the settlement statement · confirm the rate with a tax advisor.',
              ],
              [
                'Auto-pause',
                'Health drops below green → the slot pauses at the next 00:00 · unused days are credited pro-rata.',
              ],
              [
                'Refunds',
                'Only for NexG-side outages · two different people approve · logged.',
              ],
              [
                'Reporting',
                'Monday email to the merchant: views, taps, orders, cost per order · identical to this table.',
              ],
            ].map(([title, body]) => (
              <li key={title} className="px-4 py-3">
                <p className="text-[0.75rem] font-extrabold">{title}</p>
                <p className="text-muted mt-1 text-[0.6875rem] font-semibold leading-relaxed">
                  {body}
                </p>
              </li>
            ))}
          </ul>
        </Card>

        {badges.pro_rata_reviews > 0 && (
          <Card className="border-danger border-2 p-5">
            <p className="text-[0.875rem] font-extrabold">
              {plural(badges.pro_rata_reviews, 'line')} waiting on a pro-rata decision
            </p>
            <p className="text-muted mt-1.5 text-[0.75rem] font-semibold leading-relaxed">
              These are held out of the settlement build until somebody confirms how many days
              actually ran. They bill on the next statement, not this one.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════ Rules

export interface RuleRow {
  key: string;
  value: unknown;
  label: string;
  updated_at: string;
}

export interface RateCardRow {
  id: string;
  city_id: string;
  city_name: string | null;
  version: string;
  status: string;
  effective_from: string;
  prices: {
    homepage?: number | null;
    category_top?: { default?: number | null; overrides?: Record<string, number> };
    popular_request?: number | null;
  };
  vat_pct: number | null;
  approved_by: string | null;
  second_approver_id: string | null;
}

export function RulesTab({
  rules,
  cards,
  placementCounts,
}: {
  rules: RuleRow[];
  cards: RateCardRow[];
  placementCounts: { city_name: string | null; kind: string; n: number }[];
}) {
  const missing = cards.filter(
    (c) =>
      c.prices?.homepage == null ||
      c.prices?.category_top?.default == null ||
      c.prices?.popular_request == null,
  );

  return (
    <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start">
      <div className="space-y-5">
        {missing.length > 0 && (
          <Card className="border-warning border-2 p-5">
            <p className="text-[0.9375rem] font-extrabold">
              Quotes are blocked where a price is missing
            </p>
            <p className="text-muted mt-2 text-[0.75rem] font-semibold leading-[1.7]">
              {missing.map((c) => c.city_name).filter(Boolean).join(', ')} —{' '}
              {plural(missing.length, 'rate card')} with at least one placement unpriced. The quote
              RPC refuses rather than letting anybody type a number, so nothing can be sold there
              until finance publishes one.
            </p>
          </Card>
        )}

        <Card className="overflow-x-auto p-0">
          <p className="border-border border-b px-4 py-3 text-[0.9375rem] font-extrabold">
            Rate cards
          </p>
          <table className="w-full min-w-[40rem] text-left">
            <thead>
              <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Homepage</th>
                <th className="px-4 py-3">Category top</th>
                <th className="px-4 py-3">Popular</th>
                <th className="px-4 py-3">VAT</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => (
                <tr key={c.id} className="border-border border-b last:border-b-0">
                  <td className="px-4 py-3 text-[0.8125rem] font-extrabold">
                    {c.city_name ?? DASH}
                  </td>
                  <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">
                    {c.version} · from {shortDate(c.effective_from)}
                  </td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">
                    {c.prices?.homepage == null ? kes(null) : kes(c.prices.homepage)}
                  </td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">
                    {c.prices?.category_top?.default == null
                      ? kes(null)
                      : kes(c.prices.category_top.default)}
                  </td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">
                    {c.prices?.popular_request == null ? kes(null) : kes(c.prices.popular_request)}
                  </td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">
                    {c.vat_pct === null ? `${DASH}%` : `${c.vat_pct}%`}
                  </td>
                  <td className="px-4 py-3">
                    <Pill
                      tone={
                        c.status === 'current'
                          ? 'bg-success-bg text-success'
                          : c.status === 'scheduled'
                            ? 'bg-gold-soft text-gold-text'
                            : 'bg-bg text-muted'
                      }
                    >
                      {c.status.toUpperCase()}
                    </Pill>
                  </td>
                </tr>
              ))}
              {cards.length === 0 && <EmptyRow colSpan={7}>No rate cards yet.</EmptyRow>}
            </tbody>
          </table>
          <p className="text-muted-light border-border border-t px-4 py-3 text-[0.6875rem] font-semibold leading-snug">
            A change is proposed by finance and approved by a second person, takes effect on a
            future Monday, and does not alter a quote already sent. Merchants on a live
            auto-renewing slot are told two weeks ahead.
          </p>
        </Card>

        <Card className="overflow-x-auto p-0">
          <p className="border-border border-b px-4 py-3 text-[0.9375rem] font-extrabold">
            Slot counts
          </p>
          <table className="w-full text-left">
            <thead>
              <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Placement</th>
                <th className="px-4 py-3">Slots</th>
              </tr>
            </thead>
            <tbody>
              {placementCounts.map((p) => (
                <tr
                  key={`${p.city_name}-${p.kind}`}
                  className="border-border border-b last:border-b-0"
                >
                  <td className="px-4 py-3 text-[0.8125rem] font-extrabold">
                    {p.city_name ?? DASH}
                  </td>
                  <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">
                    {KIND_LABEL[p.kind] ?? p.kind}
                  </td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">{p.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-muted-light border-border border-t px-4 py-3 text-[0.6875rem] font-semibold leading-snug">
            Reducing a count never evicts a live slot — the extra position simply closes when its
            booking ends.
          </p>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="p-0">
          <p className="border-border border-b px-4 py-3 text-[0.9375rem] font-extrabold">
            Rules
          </p>
          <ul className="divide-border divide-y">
            {rules.map((r) => (
              <li key={r.key} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <span className="text-muted min-w-0 text-[0.75rem] font-semibold">{r.label}</span>
                <span className="shrink-0 text-[0.75rem] font-extrabold">
                  {Array.isArray(r.value)
                    ? `${(r.value as unknown[]).length} terms`
                    : String(r.value).replace(/"/g, '')}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <NotMeasured
          what="Why these live in a table"
          why="Growth changes an eligibility threshold or a hold window by editing a row, not by shipping a deploy. Every one is read at decision time, so a change takes effect on the next request rather than the next release."
        />
      </div>
    </div>
  );
}
