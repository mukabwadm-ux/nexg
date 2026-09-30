import { Card } from '@nexg/ui';
import Link from 'next/link';

import {
  ageLabel,
  Avatar,
  Chip,
  DASH,
  EmptyRow,
  FOLIO_LABEL,
  FOLIO_TONE,
  HANDOFF_LABEL,
  HOST_KIND_LABEL,
  HOST_STATUS_TONE,
  HOTEL_STATUS_TONE,
  kes,
  NotMeasured,
  num,
  pct,
  Pill,
  plural,
  TierChip,
  Tile,
  when,
  type Badges,
  type DataRequestRow,
  type FolioRow,
  type GuestRow,
  type HostRow,
  type HotelRow,
} from './shared';

// ═══════════════════════════════════ C4 · Airbnb hosts & units

export interface UnitRow {
  id: string;
  host_id: string;
  name: string;
  label_public: string | null;
  area: string | null;
  status: string;
  handoff: string | null;
  handoff_sentence: string | null;
  readiness: Record<string, boolean>;
  qr_code: string | null;
  qr_state: string | null;
  placed_confirmed_at: string | null;
}

const HOST_FILTERS = [
  { key: 'all', label: (_b: Badges, n: number) => `All hosts ${n}` },
  { key: 'managers', label: () => 'Property managers' },
  { key: 'single', label: () => 'Single unit' },
  { key: 'setting_up', label: (b: Badges) => `Setting up ${b.units_setting_up}` },
  { key: 'packages', label: () => 'Packages on' },
  { key: 'paused', label: () => 'Paused' },
] as const;

export function HostsTab({
  hosts,
  units,
  badges,
  filter,
  selected,
}: {
  hosts: HostRow[];
  units: UnitRow[];
  badges: Badges;
  filter: string;
  selected: string | null;
}) {
  const visible = hosts.filter((h) => {
    switch (filter) {
      case 'managers':
        return h.kind === 'property_manager';
      case 'single':
        return h.kind === 'single_unit';
      case 'setting_up':
        return h.units_setting_up > 0;
      case 'packages':
        return h.packages_enabled;
      case 'paused':
        return h.status === 'paused';
      default:
        return true;
    }
  });

  const href = (next: { filter?: string; selected?: string | null }) => {
    const p = new URLSearchParams({ tab: 'hosts' });
    const f = next.filter ?? filter;
    if (f !== 'all') p.set('filter', f);
    const s = next.selected === undefined ? selected : next.selected;
    if (s) p.set('selected', s);
    return `/hotels?${p.toString()}`;
  };

  const chosen = selected ? hosts.find((h) => h.id === selected) : undefined;

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {HOST_FILTERS.map((f) => (
          <Chip key={f.key} on={filter === f.key} href={href({ filter: f.key })}>
            {f.label(badges, hosts.length)}
          </Chip>
        ))}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Airbnb hosts" value={num(badges.hosts_live)}>
          {plural(hosts.reduce((s, h) => s + h.units, 0), 'unit')} ·{' '}
          {plural(new Set(hosts.map((h) => h.city_id).filter(Boolean)).size, 'city', 'cities')}
        </Tile>
        <Tile label="Orders from Airbnb units · 30d" value={DASH}>
          {DASH}% of all orders · avg {kes(null)}
        </Tile>
        <Tile
          label="Units setting up"
          value={num(badges.units_setting_up)}
          tone={badges.units_stuck > 0 ? 'warning' : undefined}
        >
          QR not placed · rule incomplete
        </Tile>
        <Tile label="Welcome packages · month" value={kes(null)}>
          host-billed
        </Tile>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_28rem] xl:items-start">
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[40rem] text-left">
            <thead>
              <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-3">Host</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Units</th>
                <th className="px-4 py-3">Ord 30d</th>
                <th className="px-4 py-3">Packages</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((h) => (
                <tr
                  key={h.id}
                  className={`border-border hover:bg-bg border-b last:border-b-0 ${
                    selected === h.id ? 'bg-bg ring-gold ring-1 ring-inset' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <Link href={href({ selected: h.id })} className="flex items-center gap-2.5">
                      <Avatar name={h.display_name ?? h.contact_name ?? 'Host'} square />
                      <span className="min-w-0">
                        <span className="block text-[0.8125rem] font-extrabold">
                          {h.display_name ?? '[Host name]'}
                        </span>
                        <span className="text-muted-light block text-[0.6875rem] font-semibold">
                          {HOST_KIND_LABEL[h.kind] ?? h.kind}
                          {h.areas?.length ? ` · ${h.areas[0]}` : h.city_name ? ` · ${h.city_name}` : ''}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <TierChip tier={h.tier} />
                  </td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">{num(h.units)}</td>
                  <td className="text-muted-light px-4 py-3 text-[0.8125rem] font-bold">
                    {num(h.orders_30d)}
                  </td>
                  <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">
                    {h.packages_enabled ? `Auto · ${plural(h.units_live, 'unit')}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Pill tone={HOST_STATUS_TONE[h.status]}>
                      {h.status === 'live' && h.units_setting_up > 0
                        ? h.qr_not_placed > 0
                          ? 'SETTING UP · QR'
                          : 'SETTING UP · RULES'
                        : h.status === 'paused'
                          ? 'PAUSED · HOST REQUEST'
                          : h.status.toUpperCase()}
                    </Pill>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <EmptyRow colSpan={6}>Nobody matches that filter.</EmptyRow>
              )}
            </tbody>
          </table>
        </Card>

        {chosen ? (
          <HostPanel host={chosen} units={units.filter((u) => u.host_id === chosen.id)} />
        ) : (
          <Card className="p-5">
            <p className="text-muted text-sm font-semibold">Pick a host to open their record.</p>
          </Card>
        )}
      </div>
    </>
  );
}

function HostPanel({ host, units }: { host: HostRow; units: UnitRow[] }) {
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <Avatar name={host.display_name ?? 'Host'} />
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-[1.0625rem] font-extrabold">
                {host.display_name ?? '[Host name]'}
              </span>
              <TierChip tier={host.tier} />
              <Pill tone="bg-bg text-muted">
                {(HOST_KIND_LABEL[host.kind] ?? host.kind).toUpperCase()}
              </Pill>
            </p>
            <p className="text-muted-light mt-2 text-[0.6875rem] font-semibold leading-relaxed">
              {plural(host.units, 'unit')}
              {host.areas?.length ? ` · ${host.areas.join(', ')}` : ''}
              {host.superhost_claimed ? ' · Airbnb Superhost' : ''} · {host.phone_masked ?? DASH} ·
              host since {when(host.went_live_at ?? host.created_at)}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Tile label="Orders · 30d" value={num(host.orders_30d)} />
        <Tile label="Guests ordering" value={pct(null)} />
        <Tile
          label="QR scans"
          value={DASH}
        />
        <Tile label="Packages · month" value={num(host.packages_month)} />
      </div>

      <Card className="p-0">
        <div className="border-border flex items-center justify-between gap-2 border-b px-4 py-3">
          <p className="text-[0.9375rem] font-extrabold">Units · hand-off rules riders see</p>
        </div>
        <ul className="divide-border divide-y">
          {units.map((u) => {
            const missing = Object.entries(u.readiness ?? {})
              .filter(([, ok]) => !ok)
              .map(([k]) =>
                k === 'qr_placed'
                  ? 'QR not yet placed'
                  : k === 'contact_confirmed'
                    ? 'confirm caretaker number'
                    : k === 'delivery_hours' || k === 'hours'
                      ? 'set delivery hours'
                      : `add ${k}`,
              );
            return (
              <li key={u.id} className="px-4 py-3">
                <p className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[0.8125rem] font-extrabold">
                    {u.label_public ?? u.name}
                    {u.area ? ` · ${u.area}` : ''}
                  </span>
                  <Pill
                    tone={
                      u.status === 'live'
                        ? 'bg-success-bg text-success'
                        : 'bg-warning-bg text-warning'
                    }
                  >
                    {u.status === 'live' ? 'LIVE' : 'SETTING UP'}
                  </Pill>
                </p>
                {/*
                 * Verbatim. This is the sentence the rider reads at the
                 * gate, assembled by the database so the host's preview,
                 * this panel and the rider app cannot drift apart.
                 */}
                <p className="text-muted mt-1 text-[0.6875rem] font-semibold leading-relaxed">
                  {u.handoff_sentence ??
                    (u.handoff ? HANDOFF_LABEL[u.handoff] : 'No hand-off rule set yet')}
                </p>
                {missing.length > 0 && (
                  <p className="text-danger mt-1 text-[0.6875rem] font-extrabold">
                    Missing: {missing.join(' · ')}
                  </p>
                )}
              </li>
            );
          })}
          {units.length === 0 && (
            <li className="text-muted px-4 py-8 text-center text-[0.75rem] font-semibold">
              No units yet.
            </li>
          )}
        </ul>
      </Card>

      <Card className="p-5">
        <p className="text-[0.9375rem] font-extrabold">Host billing · welcome packages</p>
        <p className="text-muted mt-2 text-[0.75rem] font-semibold">
          {plural(host.packages_month, 'package')} this month · {kes(null)}
        </p>
        <p className="text-muted-light mt-1 text-[0.6875rem] font-semibold leading-snug">
          Hosts pay nothing to list. The only thing billed is a welcome package they ordered.
        </p>
      </Card>

      {(host.status === 'applied' || host.status === 'verifying') && (
        <Card className="border-gold border-2 p-5">
          <p className="text-[0.9375rem] font-extrabold">Verify this host</p>
          <p className="text-muted mt-2 text-[0.75rem] font-semibold leading-[1.7]">
            Listing ownership, an ID document, or a call. Whichever it is, the method and the
            evidence are recorded — a host who is live is one somebody checked.
          </p>
          <Link
            href={`/hotels/hosts/${host.id}/verify`}
            className="bg-ink hover:bg-ink/90 mt-3 inline-block rounded-lg px-4 py-2 text-[0.8125rem] font-bold text-white transition-colors"
          >
            Open verification
          </Link>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════ C1 · Hotels

export function HotelsTab({
  hotels,
  badges,
  filter,
  selected,
  setting,
  accessRule,
  contacts,
  activity,
}: {
  hotels: HotelRow[];
  badges: Badges;
  filter: string;
  selected: string | null;
  setting: Record<string, unknown> | null;
  accessRule: { version: number; text: string; after_hours_handoff: string | null } | null;
  contacts: {
    id: string;
    name: string;
    role: string | null;
    phone_last2: string | null;
    email: string | null;
    ext: string | null;
  }[];
  activity: { id: number; kind: string; at: string; notes: string | null }[];
}) {
  const visible = hotels.filter((h) => {
    switch (filter) {
      case 'partner':
        return h.status === 'partner';
      case 'charge':
        return h.charge_to_room;
      case 'prospect':
        return h.status === 'prospect';
      case 'paused':
        return h.status === 'paused';
      default:
        return true;
    }
  });

  const href = (next: { filter?: string; selected?: string | null }) => {
    const p = new URLSearchParams({ tab: 'hotels' });
    const f = next.filter ?? filter;
    if (f !== 'all') p.set('filter', f);
    const s = next.selected === undefined ? selected : next.selected;
    if (s) p.set('selected', s);
    return `/hotels?${p.toString()}`;
  };

  const chosen = selected ? hotels.find((h) => h.id === selected) : undefined;

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Chip on={filter === 'all'} href={href({ filter: 'all' })}>
          All {hotels.length}
        </Chip>
        <Chip on={filter === 'partner'} href={href({ filter: 'partner' })}>
          Partner
        </Chip>
        <Chip on={filter === 'charge'} href={href({ filter: 'charge' })}>
          Charge to room
        </Chip>
        <Chip on={filter === 'prospect'} href={href({ filter: 'prospect' })}>
          Prospect {badges.hotels_prospect}
        </Chip>
        <Chip on={filter === 'paused'} href={href({ filter: 'paused' })}>
          Paused
        </Chip>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Partner hotels" value={num(badges.hotels_partner)}>
          {plural(badges.rooms_covered, 'room')} covered
        </Tile>
        <Tile label="Orders from hotels · 30d" value={DASH}>
          {DASH}% of all orders
        </Tile>
        <Tile label="Charge-to-room volume" value={kes(badges.posted_this_month)}>
          {plural(badges.hotels_charge_to_room, 'hotel')} enabled
        </Tile>
        <Tile
          label="Prospects in pipeline"
          value={num(badges.hotels_prospect)}
          tone={badges.prospects_overdue > 0 ? 'warning' : undefined}
        >
          {badges.prospects_overdue > 0
            ? `${plural(badges.prospects_overdue, 'overdue action')}`
            : 'all actions on time'}
        </Tile>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_28rem] xl:items-start">
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[40rem] text-left">
            <thead>
              <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-3">Hotel</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Rooms</th>
                <th className="px-4 py-3">Ord 30d</th>
                <th className="px-4 py-3">Chg-room</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((h) => (
                <tr
                  key={h.id}
                  className={`border-border hover:bg-bg border-b last:border-b-0 ${
                    selected === h.id ? 'bg-bg ring-gold ring-1 ring-inset' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <Link href={href({ selected: h.id })} className="flex items-center gap-2.5">
                      <Avatar name={h.name} square />
                      <span className="min-w-0">
                        <span className="block text-[0.8125rem] font-extrabold">{h.name}</span>
                        <span className="text-muted-light block text-[0.6875rem] font-semibold">
                          {h.area ?? h.city_name ?? DASH}
                          {h.star_rating ? ` · ${h.star_rating}★` : ''}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <TierChip tier={h.tier} />
                  </td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">{num(h.rooms)}</td>
                  <td className="text-muted-light px-4 py-3 text-[0.8125rem] font-bold">
                    {num(h.orders_30d)}
                  </td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">
                    {h.charge_to_room ? kes(h.posted_30d_kes) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Pill tone={HOTEL_STATUS_TONE[h.status]}>
                      {h.status === 'prospect' && h.next_action_at
                        ? `PROSPECT · ${new Date(h.next_action_at)
                            .toLocaleDateString('en-GB', { weekday: 'short' })
                            .toUpperCase()}`
                        : h.status.toUpperCase()}
                    </Pill>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && <EmptyRow colSpan={6}>No hotels match that.</EmptyRow>}
            </tbody>
          </table>
        </Card>

        {chosen ? (
          <HotelPanel
            hotel={chosen}
            setting={setting}
            accessRule={accessRule}
            contacts={contacts}
            activity={activity}
          />
        ) : (
          <Card className="p-5">
            <p className="text-muted text-sm font-semibold">Pick a hotel to open its record.</p>
          </Card>
        )}
      </div>
    </>
  );
}

function HotelPanel({
  hotel,
  setting,
  accessRule,
  contacts,
  activity,
}: {
  hotel: HotelRow;
  setting: Record<string, unknown> | null;
  accessRule: { version: number; text: string; after_hours_handoff: string | null } | null;
  contacts: {
    id: string;
    name: string;
    role: string | null;
    phone_last2: string | null;
    email: string | null;
    ext: string | null;
  }[];
  activity: { id: number; kind: string; at: string; notes: string | null }[];
}) {
  const isProspect = hotel.status === 'prospect';

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <Avatar name={hotel.name} square />
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-[1.0625rem] font-extrabold">{hotel.name}</span>
              <Pill tone={HOTEL_STATUS_TONE[hotel.status]}>{hotel.status.toUpperCase()}</Pill>
              <TierChip tier={hotel.tier} />
              {hotel.charge_to_room && (
                <Pill tone="bg-gold-soft text-gold-text">CHARGE TO ROOM</Pill>
              )}
            </p>
            <p className="text-muted-light mt-2 text-[0.6875rem] font-semibold leading-relaxed">
              {[hotel.area, hotel.city_name].filter(Boolean).join(', ') || DASH} ·{' '}
              {hotel.rooms ? plural(hotel.rooms, 'room') : `${DASH} rooms`}
              {hotel.star_rating ? ` · ${hotel.star_rating}★` : ''} · GM{' '}
              {hotel.gm_name ?? '[Name]'} · agreement {hotel.agreement_version ?? DASH} signed{' '}
              {when(hotel.agreement_signed_at)}
            </p>
          </div>
        </div>
      </Card>

      {isProspect ? (
        <Card className="p-5">
          <p className="text-[0.9375rem] font-extrabold">Pipeline</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {['identified', 'contacted', 'site_visit_booked', 'proposal', 'agreement', 'won'].map(
              (s) => (
                <span
                  key={s}
                  className={`rounded-full px-2.5 py-1 text-[0.625rem] font-extrabold uppercase ${
                    hotel.prospect_stage === s
                      ? 'bg-ink text-white'
                      : 'border-border-strong text-muted border'
                  }`}
                >
                  {s.replace(/_/g, ' ')}
                </span>
              ),
            )}
          </div>
          <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold">
            Next action {hotel.next_action_at ? when(hotel.next_action_at) : DASH}
          </p>
          <ul className="mt-3 space-y-2">
            {activity.slice(0, 5).map((a) => (
              <li key={a.id} className="text-muted text-[0.75rem] font-semibold">
                <span className="text-muted-light text-[0.625rem] font-extrabold uppercase">
                  {a.kind.replace(/_/g, ' ')} · {when(a.at)}
                </span>
                {a.notes && <span className="block">{a.notes}</span>}
              </li>
            ))}
            {activity.length === 0 && (
              <li className="text-muted-light text-[0.75rem] font-semibold">
                Nothing logged yet.
              </li>
            )}
          </ul>
          <p className="text-muted-light mt-4 text-[0.6875rem] font-semibold leading-snug">
            Activating a partner needs a signed agreement, a desk contact, a finance contact and an
            access rule for riders — and two people. The request names what is still missing.
          </p>
        </Card>
      ) : (
        <>
          <Card className="p-0">
            <p className="border-border border-b px-4 py-3 text-[0.9375rem] font-extrabold">
              Programme settings
            </p>
            <div className="divide-border divide-y">
              <SettingRow
                label="Charge to room"
                on={hotel.charge_to_room}
                sub={
                  hotel.charge_cap_per_stay === null
                    ? 'No cap agreed — the option is not offered at checkout'
                    : `Cap ${kes(hotel.charge_cap_per_stay)} / stay · folio sync ${
                        (setting?.['folio_sync'] as string) ?? DASH
                      }`
                }
              />
              <SettingRow
                label="In-room QR & cards"
                on={!!setting?.['in_room_qr']}
                sub={`Room-level links · ${num(
                  setting?.['room_cards_printed'] as number,
                )} printed`}
              />
              <SettingRow
                label="Front-desk ordering"
                on={!!setting?.['front_desk_ordering']}
                sub="Staff can order for guests"
              />
              <SettingRow
                label="Preferred suppliers"
                on={((setting?.['preferred_suppliers'] as unknown[]) ?? []).length > 0}
                sub={`${plural(
                  ((setting?.['preferred_suppliers'] as unknown[]) ?? []).length,
                  'merchant',
                )} pinned for this hotel`}
              />
            </div>
          </Card>

          <Card className="p-5">
            <p className="flex items-center justify-between gap-2">
              <span className="text-[0.9375rem] font-extrabold">Access rules for riders</span>
              {accessRule && (
                <span className="text-muted-light text-[0.625rem] font-extrabold uppercase">
                  v{accessRule.version}
                </span>
              )}
            </p>
            {accessRule ? (
              <p className="border-gold bg-gold-soft/40 text-ink mt-3 rounded-lg border-l-4 p-3 text-[0.75rem] font-semibold leading-[1.7]">
                {accessRule.text}
              </p>
            ) : (
              <p className="text-warning mt-2 text-[0.75rem] font-bold leading-relaxed">
                No access rule has been written. A rider arriving at this hotel would not know
                which entrance to use — activation is blocked until there is one.
              </p>
            )}
            <p className="text-muted-light mt-2 text-[0.6875rem] font-semibold leading-snug">
              Editing publishes a new version. Riders already on a delivery keep the version they
              left with.
            </p>
          </Card>
        </>
      )}

      <Card className="p-0">
        <p className="border-border border-b px-4 py-3 text-[0.9375rem] font-extrabold">Contacts</p>
        <ul className="divide-border divide-y">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="block text-[0.8125rem] font-extrabold">{c.name}</span>
                <span className="text-muted-light block text-[0.6875rem] font-semibold">
                  {c.role ?? DASH}
                </span>
              </span>
              <span className="text-muted shrink-0 text-[0.6875rem] font-semibold">
                {c.phone_last2 ? `+254 7•• ••• •${c.phone_last2}` : (c.email ?? DASH)}
                {c.ext ? ` ext ${c.ext}` : ''}
              </span>
            </li>
          ))}
          {contacts.length === 0 && (
            <li className="text-muted px-4 py-6 text-center text-[0.75rem] font-semibold">
              No contacts recorded.
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}

function SettingRow({ label, on, sub }: { label: string; on: boolean; sub: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[0.8125rem] font-extrabold">{label}</p>
        <p className="text-muted-light mt-0.5 text-[0.6875rem] font-semibold">{sub}</p>
      </div>
      <span
        aria-label={on ? 'on' : 'off'}
        className={`relative h-5 w-9 shrink-0 rounded-full ${on ? 'bg-ink' : 'bg-border-strong'}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full ${
            on ? 'bg-gold left-[1.125rem]' : 'left-0.5 bg-white'
          }`}
        />
      </span>
    </div>
  );
}

// ═══════════════════════════════════ C2 · Charge to room

export function ChargeTab({
  folios,
  badges,
  filter,
  caps,
}: {
  folios: FolioRow[];
  badges: Badges;
  filter: string;
  caps: {
    hotel_id: string;
    name: string;
    charge_cap_per_stay: number | null;
    folio_sync: string | null;
  }[];
}) {
  const visible = folios.filter((f) => {
    switch (filter) {
      case 'pending':
        return f.status === 'awaiting_desk';
      case 'rejected':
        return f.status.startsWith('rejected');
      case 'posted':
        return f.status === 'posted';
      default:
        return true;
    }
  });

  const oldest = folios
    .filter((f) => f.status === 'awaiting_desk')
    .reduce((m, f) => Math.max(m, f.age_minutes), 0);

  const href = (f: string) =>
    `/hotels?tab=charge${f === 'live' ? '' : `&filter=${f}`}`;

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Chip on={filter === 'live'} href={href('live')}>
          Live
        </Chip>
        <Chip on={filter === 'pending'} href={href('pending')}>
          Pending confirmation
        </Chip>
        <Chip on={filter === 'rejected'} href={href('rejected')}>
          Rejected
        </Chip>
        <Chip on={filter === 'posted'} href={href('posted')}>
          Posted
        </Chip>
        <Chip on={filter === 'recon'} href={href('recon')}>
          Month-end reconciliation
        </Chip>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Tile label="Posted to folios · this month" value={kes(badges.posted_this_month)}>
          {plural(folios.filter((f) => f.status === 'posted').length, 'order')}
        </Tile>
        <Tile
          label="Awaiting hotel confirmation"
          value={num(badges.folios_awaiting)}
          tone={badges.folios_over_sla > 0 ? 'warning' : undefined}
        >
          {oldest > 0 ? `oldest ${ageLabel(oldest).toLowerCase()} · ` : ''}auto-escalate at 60
        </Tile>
        <Tile
          label="Rejected by hotel"
          value={num(badges.folios_rejected_30d)}
          tone={badges.folios_rejected_30d > 0 ? 'danger' : undefined}
        >
          guest checked out · re-charge to card
        </Tile>
        <Tile
          label="Unreconciled · month-end"
          value={num(badges.recon_open)}
          tone={badges.recon_open > 0 ? 'warning' : undefined}
        >
          lines needing a person
        </Tile>
        <Tile label="Hotel invoices due" value={num(badges.invoices_due)}>
          net 14
        </Tile>
        <Tile label="Failure rate" value={pct(null)}>
          target &lt; 1 % · needs a month of postings
        </Tile>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[44rem] text-left">
            <thead>
              <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Hotel · guest</th>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Folio ref</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((f) => (
                <tr key={f.id} className="border-border hover:bg-bg border-b last:border-b-0">
                  <td className="px-4 py-3 text-[0.75rem] font-extrabold">{f.order_reference}</td>
                  <td className="px-4 py-3">
                    <span className="block text-[0.8125rem] font-extrabold">{f.hotel_name}</span>
                    <span className="text-muted-light block text-[0.6875rem] font-semibold">
                      [{f.guest_surname}]
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">{f.room_no}</td>
                  <td className="px-4 py-3 text-[0.8125rem] font-extrabold">{kes(f.amount)}</td>
                  <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">
                    {f.folio_ref ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Pill tone={FOLIO_TONE[f.status]}>
                      {FOLIO_LABEL[f.status] ?? f.status}
                      {f.status === 'awaiting_desk' && ` · ${ageLabel(f.age_minutes)}`}
                    </Pill>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <EmptyRow colSpan={6}>
                  Nothing here. A posting appears when a guest picks &ldquo;charge to my
                  room&rdquo;.
                </EmptyRow>
              )}
            </tbody>
          </table>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <p className="text-[0.9375rem] font-extrabold">How charge-to-room works</p>
            <ol className="mt-3 space-y-2.5">
              {[
                'Guest picks Charge to my room · enters room + surname',
                'Front desk gets an SMS/portal prompt · confirms guest is in-house · 60 min SLA',
                'Order proceeds · line posted to folio with NexG reference',
                'Hotel invoiced net 14 for the month · commission netted',
                'Rejected or checked-out · guest re-charged to saved card or M-Pesa',
              ].map((step, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="bg-ink flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-extrabold text-white">
                    {i + 1}
                  </span>
                  <span className="text-muted text-[0.75rem] font-semibold leading-snug">
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="overflow-x-auto p-0">
            <p className="border-border border-b px-4 py-3 text-[0.9375rem] font-extrabold">
              Per-hotel caps
            </p>
            <table className="w-full text-left">
              <thead>
                <tr className="border-border text-muted-light border-b text-[0.5625rem] font-extrabold uppercase tracking-wide">
                  <th className="px-4 py-2">Hotel</th>
                  <th className="px-4 py-2">Cap / stay</th>
                  <th className="px-4 py-2">Sync</th>
                </tr>
              </thead>
              <tbody>
                {caps.map((c) => (
                  <tr key={c.hotel_id} className="border-border border-b last:border-b-0">
                    <td className="px-4 py-2 text-[0.75rem] font-bold">{c.name}</td>
                    <td className="px-4 py-2 text-[0.75rem] font-extrabold">
                      {kes(c.charge_cap_per_stay)}
                    </td>
                    <td className="px-4 py-2">
                      <Pill tone="bg-bg text-muted">
                        {(c.folio_sync ?? 'manual').toUpperCase()}
                      </Pill>
                    </td>
                  </tr>
                ))}
                {caps.length === 0 && (
                  <EmptyRow colSpan={3}>No hotel has charge-to-room on.</EmptyRow>
                )}
              </tbody>
            </table>
            <p className="text-muted-light border-border border-t px-4 py-3 text-[0.6875rem] font-semibold leading-snug">
              A hotel with no agreed cap is not offered charge-to-room at checkout. An unbounded
              charge to somebody else&rsquo;s bill is not a default.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}

// ═════════════════════════════════ Front desk & access

export function DeskTab({
  hotels,
  folios,
  rules,
}: {
  hotels: HotelRow[];
  folios: FolioRow[];
  rules: {
    hotel_id: string;
    hotel_name: string;
    version: number;
    text: string;
    updated_at: string;
  }[];
}) {
  const partners = hotels.filter((h) => h.status === 'partner');
  const perHotel = partners.map((h) => {
    const mine = folios.filter((f) => f.hotel_id === h.id && f.desk_action_at);
    const avg =
      mine.length === 0
        ? null
        : mine.reduce(
            (s, f) =>
              s +
              (new Date(f.desk_action_at!).getTime() - new Date(f.created_at).getTime()) / 60000,
            0,
          ) / mine.length;
    const overSla = folios.filter(
      (f) =>
        f.hotel_id === h.id &&
        f.status === 'awaiting_desk' &&
        f.age_minutes > (f.escalate_after_minutes ?? 60),
    ).length;
    const rejected = folios.filter(
      (f) => f.hotel_id === h.id && f.status.startsWith('rejected'),
    ).length;
    return { hotel: h, avg, overSla, rejected, total: mine.length };
  });

  return (
    <>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Desks online now" value={DASH}>
          needs desk-portal sessions
        </Tile>
        <Tile
          label="Avg confirm time"
          value={
            perHotel.some((p) => p.avg !== null)
              ? `${Math.round(
                  perHotel.filter((p) => p.avg !== null).reduce((s, p) => s + p.avg!, 0) /
                    perHotel.filter((p) => p.avg !== null).length,
                )} min`
              : DASH
          }
        />
        <Tile
          label="Postings > SLA"
          value={num(perHotel.reduce((s, p) => s + p.overSla, 0))}
          tone={perHotel.some((p) => p.overSla > 0) ? 'danger' : undefined}
        />
        <Tile label="Access incidents · 30d" value={DASH}>
          reported from the rider app
        </Tile>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        <Card className="overflow-x-auto p-0">
          <p className="border-border border-b px-4 py-3 text-[0.9375rem] font-extrabold">
            Desk performance
          </p>
          <table className="w-full min-w-[34rem] text-left">
            <thead>
              <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-3">Hotel</th>
                <th className="px-4 py-3">Avg confirm</th>
                <th className="px-4 py-3">&gt; SLA</th>
                <th className="px-4 py-3">Rejects</th>
              </tr>
            </thead>
            <tbody>
              {perHotel.map((p) => (
                <tr key={p.hotel.id} className="border-border border-b last:border-b-0">
                  <td className="px-4 py-3 text-[0.8125rem] font-extrabold">{p.hotel.name}</td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">
                    {p.avg === null ? DASH : `${Math.round(p.avg)} min`}
                  </td>
                  <td
                    className={`px-4 py-3 text-[0.8125rem] font-bold ${
                      p.overSla > 0 ? 'text-danger' : ''
                    }`}
                  >
                    {p.overSla}
                  </td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">{p.rejected}</td>
                </tr>
              ))}
              {perHotel.length === 0 && (
                <EmptyRow colSpan={4}>No partner hotels yet.</EmptyRow>
              )}
            </tbody>
          </table>
        </Card>

        <div className="space-y-4">
          <Card className="p-0">
            <p className="border-border border-b px-4 py-3 text-[0.9375rem] font-extrabold">
              Access rules
            </p>
            <ul className="divide-border divide-y">
              {rules.map((r) => (
                <li key={r.hotel_id} className="px-4 py-3">
                  <p className="flex items-center justify-between gap-2">
                    <span className="text-[0.8125rem] font-extrabold">{r.hotel_name}</span>
                    <span className="text-muted-light text-[0.625rem] font-extrabold">
                      v{r.version} · {when(r.updated_at)}
                    </span>
                  </p>
                  <p className="text-muted mt-1 text-[0.6875rem] font-semibold leading-relaxed">
                    {r.text}
                  </p>
                </li>
              ))}
              {rules.length === 0 && (
                <li className="text-muted px-4 py-6 text-center text-[0.75rem] font-semibold">
                  No access rules written yet.
                </li>
              )}
            </ul>
          </Card>

          <NotMeasured
            what="Riders currently in hotels"
            why="This reads trip events — at security, in the lift, at the door — which come from the orders and dispatch domains. Neither exists yet, so the list would be empty in a way that looks like nobody is delivering."
          />
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════ C3 · Guests

export function GuestsTab({
  guests,
  requests,
  badges,
  filter,
  selected,
  retention,
}: {
  guests: GuestRow[];
  requests: DataRequestRow[];
  badges: Badges;
  filter: string;
  selected: string | null;
  retention: { key: string; subject: string; retain_for: string | null; basis: string }[];
}) {
  const visible = guests.filter((g) => {
    switch (filter) {
      case 'in_house':
        return !!g.last_stay;
      case 'vip':
        return g.vip;
      case 'blocked':
        return g.blocked;
      default:
        return true;
    }
  });

  const chosen = selected ? guests.find((g) => g.id === selected) : undefined;
  const href = (f: string, s?: string) => {
    const p = new URLSearchParams({ tab: 'guests' });
    if (f !== 'all') p.set('filter', f);
    if (s ?? selected) p.set('selected', (s ?? selected)!);
    return `/hotels?${p.toString()}`;
  };

  const marketingOptedIn = guests.filter((g) => g.consent_marketing).length;

  return (
    <>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Tile label="Guests · 90d" value={num(guests.length)}>
          {plural(guests.filter((g) => g.has_account).length, 'account')} ·{' '}
          {guests.filter((g) => !g.has_account).length} guest checkout
        </Tile>
        <Tile label="Repeat rate" value={pct(null)}>
          ordered 2+ times in a stay
        </Tile>
        <Tile
          label="Open data requests"
          value={num(badges.data_requests_open)}
          tone={badges.data_requests_due_soon > 0 ? 'warning' : undefined}
        >
          30-day SLA
        </Tile>
        <Tile
          label="Blocked guests"
          value={num(badges.guests_blocked)}
          tone={badges.guests_blocked > 0 ? 'danger' : undefined}
        >
          repeat refusals · fraud
        </Tile>
        <Tile label="Avg spend / stay" value={kes(null)}>
          partner hotels
        </Tile>
        <Tile
          label="Consent · marketing"
          value={guests.length === 0 ? `${DASH}%` : pct((marketingOptedIn / guests.length) * 100)}
        >
          opted in
        </Tile>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Chip on={filter === 'all'} href={href('all')}>
          All
        </Chip>
        <Chip on={filter === 'in_house'} href={href('in_house')}>
          In-house now
        </Chip>
        <Chip on={filter === 'vip'} href={href('vip')}>
          VIP
        </Chip>
        <Chip on={filter === 'blocked'} href={href('blocked')}>
          Blocked
        </Chip>
        <span className="text-muted-light ml-1 text-[0.6875rem] font-semibold">
          Phone numbers masked · reveal is logged
        </span>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start">
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[36rem] text-left">
            <thead>
              <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-3">Guest</th>
                <th className="px-4 py-3">Orders</th>
                <th className="px-4 py-3">Spend</th>
                <th className="px-4 py-3">Last order</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((g) => (
                <tr
                  key={g.id}
                  className={`border-border hover:bg-bg border-b last:border-b-0 ${
                    selected === g.id ? 'bg-bg ring-gold ring-1 ring-inset' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <Link href={href(filter, g.id)} className="flex items-center gap-2.5">
                      <Avatar name={g.name ?? 'Guest'} />
                      <span className="min-w-0">
                        <span className="block text-[0.8125rem] font-extrabold">
                          {g.anonymised_at ? '[erased]' : (g.name ?? '[Guest]')}
                        </span>
                        <span className="text-muted-light block text-[0.6875rem] font-semibold">
                          {g.phone_masked ?? DASH}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">{num(g.repeat_count)}</td>
                  <td className="text-muted-light px-4 py-3 text-[0.8125rem] font-bold">
                    {kes(null)}
                  </td>
                  <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">
                    {when(g.last_order_at)}
                  </td>
                  <td className="px-4 py-3">
                    {g.blocked ? (
                      <Pill tone="bg-danger-bg text-danger">
                        BLOCKED{g.refusal_count > 0 && ` · ${g.refusal_count} REFUSALS`}
                      </Pill>
                    ) : g.anonymised_at ? (
                      <Pill tone="bg-bg text-muted-light">ERASED</Pill>
                    ) : g.vip ? (
                      <Pill tone="bg-success-bg text-success">VIP</Pill>
                    ) : g.has_account ? (
                      <Pill tone="bg-bg text-muted">ACCOUNT</Pill>
                    ) : (
                      <Pill tone="bg-bg text-muted">GUEST CHECKOUT</Pill>
                    )}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <EmptyRow colSpan={5}>No guests match that.</EmptyRow>
              )}
            </tbody>
          </table>
        </Card>

        <div className="space-y-4">
          {chosen && (
            <Card className="p-5">
              <p className="flex flex-wrap items-center gap-2">
                <Avatar name={chosen.name ?? 'Guest'} />
                <span className="text-[1rem] font-extrabold">
                  {chosen.anonymised_at ? '[erased]' : (chosen.name ?? '[Guest]')}
                </span>
                {chosen.vip && <Pill tone="bg-success-bg text-success">VIP</Pill>}
              </p>
              <dl className="mt-4 space-y-2 text-[0.75rem] font-semibold">
                <Row label="Preferences" value={preferenceLine(chosen.preferences)} />
                <Row
                  label="Payment"
                  value={(chosen.payment_summary?.['summary'] as string) ?? DASH}
                />
                <Row
                  label="Consent"
                  value={`Service SMS ${chosen.consent_service_sms ? '✓' : '✗'} · marketing ${
                    chosen.consent_marketing ? '✓' : '✗'
                  }`}
                />
                <Row
                  label="Refusals / disputes"
                  value={`${chosen.refusal_count} / ${chosen.dispute_count}`}
                />
                <Row label="Notes (staff only)" value={chosen.staff_notes ?? DASH} />
              </dl>
              <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-snug">
                Staff notes are disclosed to the guest under an access request. Keep them factual.
              </p>
            </Card>
          )}

          <Card className="p-0">
            <div className="border-border flex items-center justify-between gap-2 border-b px-4 py-3">
              <p className="text-[0.9375rem] font-extrabold">Data requests · KDPA</p>
              {requests.length > 0 && (
                <Pill tone="bg-gold-soft text-gold-text">{requests.length} OPEN</Pill>
              )}
            </div>
            <ul className="divide-border divide-y">
              {requests.slice(0, 4).map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <p className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[0.8125rem] font-extrabold capitalize">
                      {r.kind} · {r.requester_masked ?? r.requester_email ?? DASH}
                    </span>
                    <Pill
                      tone={
                        r.days_left <= 7
                          ? 'bg-danger-bg text-danger'
                          : 'bg-gold-soft text-gold-text'
                      }
                    >
                      DUE IN {r.days_left} D
                    </Pill>
                  </p>
                  <p className="text-muted-light mt-1 text-[0.6875rem] font-semibold">
                    Received {when(r.received_at)}
                    {r.channel ? ` via ${r.channel}` : ''} ·{' '}
                    {r.identity_verified_at
                      ? `identity verified by ${r.identity_method?.toUpperCase()}`
                      : 'identity not yet verified'}{' '}
                    · scope: {r.scope.join(', ')}
                  </p>
                  {Object.keys(r.blocking_reasons ?? {}).length > 0 && (
                    <p className="text-warning mt-1 text-[0.6875rem] font-bold">
                      {Object.values(r.blocking_reasons).join(' ')}
                    </p>
                  )}
                </li>
              ))}
              {requests.length === 0 && (
                <li className="text-muted px-4 py-6 text-center text-[0.75rem] font-semibold">
                  Nothing open.
                </li>
              )}
            </ul>
            <p className="text-muted-light border-border border-t px-4 py-3 text-[0.6875rem] font-semibold leading-[1.7]">
              30-day statutory window. Anonymisation keeps order totals for accounting but removes
              name, phone, addresses and chat. Every request and action is in the audit log.
            </p>
          </Card>

          <Card className="p-5">
            <p className="text-[0.9375rem] font-extrabold">Retention rules</p>
            <ul className="mt-3 space-y-1.5">
              {retention.map((r) => (
                <li key={r.key} className="text-muted text-[0.75rem] font-semibold">
                  • {r.subject}: {r.retain_for ?? DASH}
                </li>
              ))}
            </ul>
            <p className="text-warning mt-3 text-[0.6875rem] font-bold leading-snug">
              These periods have not been confirmed with counsel under the Kenya Data Protection
              Act. They are stored rather than hard-coded, so confirming them is a row update.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}

function preferenceLine(prefs: Record<string, unknown>): string {
  const values = Object.values(prefs ?? {}).filter(Boolean);
  return values.length > 0 ? values.map(String).join(' · ') : DASH;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted shrink-0">{label}</dt>
      <dd className="text-right font-extrabold">{value}</dd>
    </div>
  );
}

// ═══════════════════════════════════ Data requests (the queue)

const REQUEST_TONE: Record<string, string> = {
  received: 'bg-gold-soft text-gold-text',
  identity_pending: 'bg-warning-bg text-warning',
  in_progress: 'bg-warning-bg text-warning',
  bundle_ready: 'bg-success-bg text-success',
  fulfilled: 'bg-success-bg text-success',
  refused: 'bg-danger-bg text-danger',
  withdrawn: 'bg-bg text-muted',
};

export function DataRequestsTab({
  requests,
  badges,
  filter,
}: {
  requests: DataRequestRow[];
  badges: Badges;
  filter: string;
}) {
  const open = requests.filter(
    (r) => !['fulfilled', 'refused', 'withdrawn'].includes(r.status),
  );
  const visible = requests.filter((r) => {
    switch (filter) {
      case 'open':
        return !['fulfilled', 'refused', 'withdrawn'].includes(r.status);
      case 'identity':
        return !r.identity_verified_at && r.status !== 'fulfilled';
      case 'due':
        return r.days_left <= 7 && !['fulfilled', 'refused'].includes(r.status);
      case 'fulfilled':
        return r.status === 'fulfilled';
      case 'refused':
        return r.status === 'refused';
      default:
        return true;
    }
  });

  const fulfilled = requests.filter((r) => r.status === 'fulfilled' && r.fulfilled_at);
  const medianDays =
    fulfilled.length === 0
      ? null
      : Math.round(
          [...fulfilled]
            .map(
              (r) =>
                (new Date(r.fulfilled_at!).getTime() - new Date(r.received_at).getTime()) /
                86_400_000,
            )
            .sort((a, b) => a - b)[Math.floor(fulfilled.length / 2)] ?? 0,
        );

  const href = (f: string) => `/hotels?tab=data${f === 'all' ? '' : `&filter=${f}`}`;

  return (
    <>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Open" value={num(open.length)} />
        <Tile
          label="Due ≤ 7 days"
          value={num(badges.data_requests_due_soon)}
          tone={badges.data_requests_due_soon > 0 ? 'danger' : undefined}
        />
        <Tile label="Median days to fulfil" value={medianDays === null ? DASH : `${medianDays} d`} />
        <Tile label="Fulfilled · 12m" value={num(fulfilled.length)} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {[
          ['all', 'All'],
          ['open', 'Open'],
          ['identity', 'Identity pending'],
          ['due', 'Due ≤ 7 d'],
          ['fulfilled', 'Fulfilled'],
          ['refused', 'Refused'],
        ].map(([k, label]) => (
          <Chip key={k} on={filter === k} href={href(k!)}>
            {label}
          </Chip>
        ))}
      </div>

      <Card className="mt-5 overflow-x-auto p-0">
        <table className="w-full min-w-[46rem] text-left">
          <thead>
            <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
              <th className="px-4 py-3">Kind</th>
              <th className="px-4 py-3">Requester</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Received</th>
              <th className="px-4 py-3">Due</th>
              <th className="px-4 py-3">Handled by</th>
              <th className="px-4 py-3">Blocking</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className="border-border hover:bg-bg border-b last:border-b-0">
                <td className="px-4 py-3 text-[0.8125rem] font-extrabold capitalize">{r.kind}</td>
                <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">
                  {r.requester_masked ?? r.requester_email ?? DASH}
                </td>
                <td className="px-4 py-3">
                  <Pill tone={REQUEST_TONE[r.status]}>{r.status.replace(/_/g, ' ')}</Pill>
                </td>
                <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">
                  {when(r.received_at)}
                </td>
                <td className="px-4 py-3">
                  {['fulfilled', 'refused', 'withdrawn'].includes(r.status) ? (
                    <span className="text-muted-light text-[0.75rem] font-semibold">—</span>
                  ) : (
                    <span
                      className={`text-[0.75rem] font-extrabold ${
                        r.days_left <= 7 ? 'text-danger' : ''
                      }`}
                    >
                      {r.days_left} d
                    </span>
                  )}
                </td>
                <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">
                  {r.handled_by_name ?? '—'}
                </td>
                <td className="text-warning px-4 py-3 text-[0.6875rem] font-bold">
                  {Object.keys(r.blocking_reasons ?? {}).length > 0
                    ? Object.keys(r.blocking_reasons).join(', ')
                    : '—'}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <EmptyRow colSpan={7}>Nothing matches that filter.</EmptyRow>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="mt-5 p-5">
        <p className="text-[0.9375rem] font-extrabold">The rules this queue works to</p>
        <ul className="text-muted mt-3 space-y-2 text-[0.75rem] font-semibold leading-relaxed">
          <li>• Nothing is fulfilled before identity is verified.</li>
          <li>• An erasure is refused while a blocking reason is open — an unresolved dispute,
            for one.</li>
          <li>
            • Finance records inside their retention period are never deleted. They are
            anonymised, and the bundle says so.
          </li>
          <li>• Every request, reveal and decision is in the audit log against a named person.</li>
        </ul>
      </Card>
    </>
  );
}
