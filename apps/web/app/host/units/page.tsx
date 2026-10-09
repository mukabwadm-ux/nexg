import Link from 'next/link';

import { DASH, when } from '@/components/host/bits';
import { HowItWorks, Kpi, KpiRow, Pill, Table, Td, Tr, TwoColumn } from '@/components/host/module';
import { AddUnit, EditUnit, type UnitForEdit } from '@/components/host/unit-client';
import { handoffLabel } from '@/components/host/vocab';
import { HostSection, hostContext } from '@/components/host/section';

export const metadata = { title: 'Units & Rooms' };
export const dynamic = 'force-dynamic';

interface UnitRow {
  id: string;
  property_id: string | null;
  property_name: string | null;
  name: string;
  label_public: string | null;
  status: string;
  floor: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  max_guests: number | null;
  photos: unknown;
  handoff: string | null;
  caretaker_name: string | null;
  caretaker_confirmed_at: string | null;
  readiness: Record<string, boolean> | null;
  nightly_rate_kes: number | null;
  guest_now: string | null;
  guest_out: string | null;
  guest_adults: number | null;
  guest_children: number | null;
  guest_source: string | null;
  next_check_in: string | null;
  next_guest: string | null;
  qr_cards: number;
  qr_placed: number;
  orders_30d: number;
  occupied: boolean;
  departing_today: boolean;
}

function state(u: UnitRow): { label: string; tone: 'good' | 'warn' | 'info' | 'danger' | 'plain' } {
  if (u.status === 'paused') return { label: 'Paused', tone: 'plain' };
  if (u.status === 'setting_up') return { label: 'Setup', tone: 'warn' };
  if (u.departing_today) return { label: 'Departing', tone: 'warn' };
  if (u.occupied) return { label: 'Occupied', tone: 'info' };
  return { label: 'Vacant', tone: 'good' };
}

/**
 * Every unit, three ways.
 *
 * Table, cards and tiles are the same rows from one view. A
 * property manager with forty units scans a table; somebody
 * with three wants to see the photographs. Three separate
 * queries would be three places for "occupied" to drift into
 * meaning something slightly different.
 */
export default async function HostUnitsPage({
  searchParams,
}: {
  searchParams?: { view?: string; tab?: string; property?: string };
}) {
  const { home, live, nav, supabase, me, photoUrl } = await hostContext();
  if (!home) return null;

  const [unitRes, propRes] = await Promise.all([
    supabase.from('host_unit_list_v').select('*').eq('host_id', me.id).order('name'),
    supabase
      .from('host_property_list_v')
      .select('id, name')
      .eq('host_id', me.id)
      .order('created_at'),
  ]);

  const everything = (unitRes.data as UnitRow[] | null) ?? [];
  const properties = (propRes.data as { id: string; name: string }[] | null) ?? [];

  const view = searchParams?.view ?? 'table';
  const tab = searchParams?.tab ?? 'all';
  const propertyFilter = searchParams?.property ?? '';

  const all = propertyFilter
    ? everything.filter((u) => u.property_id === propertyFilter)
    : everything;

  const occupied = all.filter((u) => u.occupied);
  const vacant = all.filter((u) => !u.occupied && u.status === 'live');
  const setup = all.filter((u) => u.status === 'setting_up');
  const rows =
    tab === 'occupied' ? occupied : tab === 'vacant' ? vacant : tab === 'setup' ? setup : all;

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const arrivals = all.filter(
    (u) =>
      u.next_check_in &&
      new Date(u.next_check_in).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }) ===
        today,
  );
  const withRule = all.filter((u) => u.handoff);

  /* The things that will not fix themselves, named by unit. */
  const attention: { unit: string; what: string }[] = [];
  for (const u of all) {
    if (!u.handoff) attention.push({ unit: u.name, what: 'No hand-off rule · unit cannot go live' });
    else if (u.handoff === 'caretaker' && !u.caretaker_confirmed_at)
      attention.push({ unit: u.name, what: 'Caretaker has not confirmed' });
    if (u.qr_cards === 0) attention.push({ unit: u.name, what: 'No QR card generated' });
    else if (u.qr_placed < u.qr_cards)
      attention.push({ unit: u.name, what: 'A card is generated but not placed' });
    if (!u.label_public)
      attention.push({ unit: u.name, what: 'No public name · a card cannot be printed' });
    if (u.departing_today)
      attention.push({ unit: u.name, what: 'Guest departs today · cleaning not scheduled' });
  }

  const tabs = [
    { k: 'all', l: 'All', n: all.length },
    { k: 'occupied', l: 'Occupied', n: occupied.length },
    { k: 'vacant', l: 'Vacant', n: vacant.length },
    { k: 'setup', l: 'Setup', n: setup.length },
  ];
  const views = [
    { k: 'table', l: 'List' },
    { k: 'cards', l: 'Cards' },
    { k: 'tiles', l: 'Tiles' },
  ];
  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    const merged = { view, tab, property: propertyFilter, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v && v !== 'all' && v !== 'table') p.set(k, v);
    const s = p.toString();
    return s ? `/host/units?${s}` : '/host/units';
  };

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      photoUrl={photoUrl}
      current="/host/units"
      title="Units & Rooms"
      lead="All your units across every property: who is in them, how riders hand over, and what each one still needs. Open a unit for its bookings, cards and access details."
      headlineValue={`${occupied.length}/${all.length}`}
      headlineNote="Occupied tonight"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="border-border-strong bg-bg flex flex-wrap items-center gap-0.5 rounded-lg border p-0.5">
          {tabs.map((t) => (
            <Link
              key={t.k}
              href={qs({ tab: t.k })}
              aria-current={tab === t.k ? 'page' : undefined}
              className={`rounded-md px-3 py-1.5 text-[0.8125rem] font-extrabold transition-colors ${
                tab === t.k ? 'bg-ink text-white' : 'text-muted hover:text-ink'
              }`}
            >
              {t.l}
              <span className="ml-1.5 opacity-70">{t.n}</span>
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="border-border-strong bg-bg flex items-center gap-0.5 rounded-lg border p-0.5">
            {views.map((v) => (
              <Link
                key={v.k}
                href={qs({ view: v.k })}
                aria-current={view === v.k ? 'page' : undefined}
                className={`rounded-md px-2.5 py-1.5 text-[0.75rem] font-extrabold transition-colors ${
                  view === v.k ? 'bg-ink text-white' : 'text-muted hover:text-ink'
                }`}
              >
                {v.l}
              </Link>
            ))}
          </div>
          <AddUnit
            hostId={me.id}
            properties={properties}
            presetProperty={propertyFilter || undefined}
          />
        </div>
      </div>

      {properties.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href={qs({ property: '' })}
            className={`rounded-full px-3 py-1 text-[0.75rem] font-extrabold transition-colors ${
              !propertyFilter ? 'bg-ink text-white' : 'border-border-strong text-muted border'
            }`}
          >
            All properties
          </Link>
          {properties.map((p) => (
            <Link
              key={p.id}
              href={qs({ property: p.id })}
              className={`rounded-full px-3 py-1 text-[0.75rem] font-extrabold transition-colors ${
                propertyFilter === p.id
                  ? 'bg-ink text-white'
                  : 'border-border-strong text-muted border'
              }`}
            >
              {p.name}
            </Link>
          ))}
        </div>
      ) : null}

      <KpiRow>
        <Kpi
          label="Units"
          value={String(all.length)}
          note={`${all.filter((u) => u.status === 'live').length} live · ${setup.length} setup`}
        />
        <Kpi
          label="Occupied tonight"
          value={String(occupied.length)}
          note={all.length > 0 ? `${Math.round((occupied.length / all.length) * 100)}%` : DASH}
        />
        <Kpi label="Arrivals today" value={String(arrivals.length)} note="from your bookings" />
        <Kpi
          label="Departing today"
          value={String(all.filter((u) => u.departing_today).length)}
          note="cleaning to book"
          tone={all.some((u) => u.departing_today) ? 'gold' : 'plain'}
        />
        <Kpi
          label="Hand-off rules"
          value={`${withRule.length} / ${all.length}`}
          note={withRule.length < all.length ? 'one unit cannot go live' : 'all set'}
          tone={withRule.length < all.length ? 'danger' : 'good'}
          href="/host/operations"
        />
        <Kpi
          label="Orders · 30 d"
          value={String(all.reduce((a, u) => a + Number(u.orders_30d), 0))}
          note="through these units"
        />
      </KpiRow>

      <TwoColumn
        rail={
          <>
            <section className="border-border bg-surface rounded-xl border">
              <div className="border-border border-b px-4 py-3">
                <h2 className="text-[0.875rem] font-extrabold tracking-tight">Needs attention</h2>
              </div>
              {attention.length === 0 ? (
                <p className="text-success px-4 py-6 text-center text-[0.8125rem] font-extrabold">
                  Nothing outstanding.
                </p>
              ) : (
                <div className="divide-border divide-y">
                  {attention.slice(0, 8).map((a, i) => (
                    <div key={`${a.unit}-${i}`} className="flex items-start gap-2.5 px-4 py-2.5">
                      <span className="bg-bg text-muted shrink-0 rounded px-1.5 py-0.5 text-[0.625rem] font-extrabold">
                        {a.unit}
                      </span>
                      <span className="text-muted text-[0.75rem] font-semibold leading-[1.5]">
                        {a.what}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <HowItWorks title="What makes a unit live">
              An address, a hand-off rule, a confirmed contact, delivery hours and a placed card.
              Each unit goes live on its own readiness rather than waiting for the rest of the
              property.
            </HowItWorks>

            <HowItWorks title="Who you see in a unit">
              A guest&apos;s first name and the dates, from a booking you entered or a calendar
              synced. Never a surname, an email or an unmasked phone — those columns do not exist
              on a stay.
            </HowItWorks>
          </>
        }
      >
        {view === 'table' ? (
          <Table
            head={[
              'Unit',
              'Property',
              'Guest now',
              'Next booking',
              'Hand-off',
              '>QR',
              '>Orders',
              'Status',
              '>Edit',
            ]}
            empty={
              properties.length === 0
                ? 'No properties yet. Add one first — a unit belongs to a building.'
                : 'No units here yet. Add one above.'
            }
            caption="Guests are shown by first name. Changing a hand-off rule applies to the next delivery, never one already on its way."
          >
            {rows.map((u) => {
              const st = state(u);
              return (
                <Tr key={u.id} tone={!u.handoff ? 'danger' : u.departing_today ? 'warn' : 'plain'}>
                  <Td
                    strong
                    note={
                      [u.floor ? `floor ${u.floor}` : null, u.bedrooms ? `${u.bedrooms} bed` : null]
                        .filter(Boolean)
                        .join(' · ') || undefined
                    }
                  >
                    {u.name}
                  </Td>
                  <Td muted>{u.property_name ?? DASH}</Td>
                  <Td note={u.guest_out ? `out ${when(u.guest_out)}` : undefined}>
                    {u.guest_now ?? (u.occupied ? 'Guest' : 'Vacant')}
                  </Td>
                  <Td muted>
                    {u.next_check_in ? `${when(u.next_check_in)}${u.next_guest ? ` · ${u.next_guest}` : ''}` : DASH}
                  </Td>
                  <Td>
                    {u.handoff ? (
                      handoffLabel(u.handoff)
                    ) : (
                      <Pill tone="danger">Not set</Pill>
                    )}
                  </Td>
                  <Td right>
                    {u.qr_placed}/{u.qr_cards}
                  </Td>
                  <Td right>{u.orders_30d}</Td>
                  <Td>
                    <Pill tone={st.tone}>{st.label}</Pill>
                  </Td>
                  <Td right>
                    <EditUnit
                      hostId={me.id}
                      unit={u as UnitForEdit}
                      properties={properties}
                    />
                  </Td>
                </Tr>
              );
            })}
          </Table>
        ) : (
          <div
            className={
              view === 'tiles'
                ? 'grid gap-3 sm:grid-cols-3 xl:grid-cols-4'
                : 'grid gap-3 sm:grid-cols-2'
            }
          >
            {rows.length === 0 ? (
              <p className="text-muted-light border-border bg-surface col-span-full rounded-xl border px-4 py-10 text-center text-[0.8125rem] font-semibold">
                Nothing here. Add a unit above.
              </p>
            ) : null}
            {rows.map((u) => {
              const st = state(u);
              return (
                <article
                  key={u.id}
                  className="border-border bg-surface overflow-hidden rounded-xl border"
                >
                  <div
                    className={`bg-ink relative flex items-end p-3 ${view === 'tiles' ? 'h-20' : 'h-24'}`}
                  >
                    <span className="absolute inset-0 bg-gradient-to-br from-white/[0.07] to-transparent" />
                    <span className="absolute right-2.5 top-2.5">
                      <Pill tone={st.tone}>{st.label}</Pill>
                    </span>
                    <div className="relative">
                      <h2 className="text-[0.9375rem] font-extrabold tracking-tight text-white">
                        {u.name}
                      </h2>
                      <p className="text-[0.6875rem] font-semibold text-white/60">
                        {u.property_name ?? DASH}
                        {u.floor ? ` · floor ${u.floor}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1.5 px-3 py-3">
                    <p className="text-[0.8125rem] font-extrabold">
                      {u.occupied ? (u.guest_now ?? 'Guest') : 'Vacant'}
                      {u.occupied && u.guest_out ? (
                        <span className="text-muted-light font-semibold">
                          {' '}
                          · out {when(u.guest_out)}
                        </span>
                      ) : null}
                    </p>
                    {view === 'cards' ? (
                      <>
                        <p className="text-muted text-[0.75rem] font-semibold">
                          {handoffLabel(u.handoff)}
                        </p>
                        <p className="text-muted-light text-[0.6875rem] font-extrabold uppercase tracking-wide">
                          QR {u.qr_placed}/{u.qr_cards} · {u.orders_30d} orders 30d
                        </p>
                      </>
                    ) : null}
                  </div>
                  <div className="border-border flex gap-1.5 border-t px-3 py-2.5">
                    <EditUnit hostId={me.id} unit={u as UnitForEdit} properties={properties} />
                    <Link
                      href="/host/qr"
                      className="border-border-strong text-muted hover:text-ink rounded-md border px-2.5 py-1 text-[0.6875rem] font-extrabold transition-colors"
                    >
                      Cards
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </TwoColumn>
    </HostSection>
  );
}
