import Link from 'next/link';

import { DASH } from '@/components/host/bits';
import { HowItWorks, Kpi, KpiRow, Pill, Table, Td, Tr, TwoColumn } from '@/components/host/module';
import { AddProperty, EditProperty, type PropertyForEdit } from '@/components/host/property-client';
import { kindLabel } from '@/components/host/vocab';
import { HostSection, hostContext } from '@/components/host/section';

export const metadata = { title: 'My Properties' };
export const dynamic = 'force-dynamic';

interface PropertyRow {
  id: string;
  name: string;
  slug: string;
  kind: string;
  area: string | null;
  listed: boolean | null;
  floors: number | null;
  check_in_from: string | null;
  check_out_by: string | null;
  photos: unknown;
  units: number;
  units_live: number;
  units_setup: number;
  in_house: number;
  qr_placed: number;
  qr_cards: number;
  orders_30d: number;
  rating: number | null;
}

/**
 * The buildings, as opposed to the units inside them.
 *
 * A host with one flat does not need the distinction; a
 * property manager with forty cannot work without it. So the
 * page is quiet when there is one and useful when there are
 * several, rather than insisting on the structure either way.
 */
export default async function HostPropertiesPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  const { home, live, nav, supabase, me } = await hostContext();
  if (!home) return null;

  const { data } = await supabase
    .from('host_property_list_v')
    .select('*')
    .eq('host_id', me.id)
    .order('created_at');

  const all = (data as PropertyRow[] | null) ?? [];
  const tab = searchParams?.tab ?? 'all';
  const liveOnes = all.filter((p) => p.units_live > 0);
  const setup = all.filter((p) => p.units_live === 0);
  const rows = tab === 'live' ? liveOnes : tab === 'setup' ? setup : all;

  const units = all.reduce((a, p) => a + Number(p.units), 0);
  const unitsLive = all.reduce((a, p) => a + Number(p.units_live), 0);
  const inHouse = all.reduce((a, p) => a + Number(p.in_house), 0);
  const placed = all.reduce((a, p) => a + Number(p.qr_placed), 0);
  const cards = all.reduce((a, p) => a + Number(p.qr_cards), 0);
  const orders = all.reduce((a, p) => a + Number(p.orders_30d), 0);

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      current="/host/properties"
      title="My Properties"
      lead="Every property on your account, with its units, QR coverage and who is in-house. Add a property to start; units, cards and team access hang off it."
      headlineValue={String(all.length)}
      headlineNote={all.length === 1 ? 'Property' : 'Properties'}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="border-border-strong bg-bg flex flex-wrap items-center gap-0.5 rounded-lg border p-0.5">
          {[
            { k: 'all', l: 'All', n: all.length },
            { k: 'live', l: 'Live', n: liveOnes.length },
            { k: 'setup', l: 'Setup', n: setup.length },
          ].map((t) => (
            <Link
              key={t.k}
              href={t.k === 'all' ? '/host/properties' : `/host/properties?tab=${t.k}`}
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
        <AddProperty hostId={me.id} />
      </div>

      <KpiRow>
        <Kpi
          label="Properties"
          value={String(all.length)}
          note={setup.length > 0 ? `${setup.length} in setup` : 'all have live units'}
        />
        <Kpi label="Units" value={String(units)} note={`${unitsLive} live`} />
        <Kpi label="Guests in-house" value={String(inHouse)} note="right now" />
        <Kpi
          label="QR placed"
          value={`${placed} / ${cards}`}
          note={cards - placed > 0 ? `${cards - placed} to place` : 'all placed'}
          tone={cards - placed > 0 ? 'gold' : 'good'}
          href="/host/qr"
        />
        <Kpi label="Orders · 30 d" value={String(orders)} note="via your cards" />
        <Kpi
          label="Rating"
          value={
            all.some((p) => p.rating !== null)
              ? (
                  all.filter((p) => p.rating !== null).reduce((a, p) => a + Number(p.rating), 0) /
                  all.filter((p) => p.rating !== null).length
                ).toFixed(1)
              : DASH
          }
          note="from stay reviews"
        />
      </KpiRow>

      {rows.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => (
            <article
              key={p.id}
              className="border-border bg-surface overflow-hidden rounded-xl border"
            >
              {/* The design calls for a cover photograph. Until
                  one is uploaded this is the branded block, not
                  a stock image of somebody else's building. */}
              <div className="bg-ink relative flex h-28 items-end p-4">
                <span className="absolute inset-0 bg-gradient-to-br from-white/[0.07] to-transparent" />
                <span className="absolute left-4 top-3 text-[0.5625rem] font-extrabold uppercase tracking-[0.12em] text-white/40">
                  {Array.isArray(p.photos) && p.photos.length > 0 ? 'Photo' : 'No photo yet'}
                </span>
                <span className="absolute right-3 top-3">
                  {p.units_live > 0 ? (
                    <Pill tone="good">
                      {p.units_setup > 0 ? `Live · ${p.units_setup} in setup` : 'Live'}
                    </Pill>
                  ) : (
                    <Pill tone="warn">Setting up</Pill>
                  )}
                </span>
                <div className="relative">
                  <h2 className="text-[1.0625rem] font-extrabold tracking-tight text-white">
                    {p.name}
                  </h2>
                  <p className="text-[0.75rem] font-semibold text-white/60">
                    {kindLabel(p.kind)}
                    {p.area ? ` · ${p.area}` : ''}
                  </p>
                </div>
              </div>
              <div className="text-muted-light flex flex-wrap gap-x-3 gap-y-1 px-4 py-2.5 text-[0.6875rem] font-extrabold uppercase tracking-wide">
                <span>
                  {p.units} unit{p.units === 1 ? '' : 's'} · {p.units_live} live
                </span>
                <span>{p.in_house > 0 ? `${p.in_house} in-house` : 'vacant'}</span>
                <span>
                  QR {p.qr_placed}/{p.qr_cards}
                </span>
              </div>
              <div className="border-border flex flex-wrap gap-1.5 border-t px-4 py-3">
                <Link
                  href={`/host/units?property=${p.id}`}
                  className="bg-ink rounded-md px-2.5 py-1 text-[0.6875rem] font-extrabold text-white"
                >
                  Units
                </Link>
                <EditProperty hostId={me.id} property={p as PropertyForEdit} />
                <Link
                  href={`/host/qr`}
                  className="border-border-strong text-muted hover:text-ink rounded-md border px-2.5 py-1 text-[0.6875rem] font-extrabold transition-colors"
                >
                  QR
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <TwoColumn
        rail={
          <>
            <section className="bg-ink rounded-xl p-5 text-white">
              <h2 className="text-gold text-[0.5625rem] font-extrabold uppercase tracking-[0.12em]">
                Add a property
              </h2>
              <p className="mt-2 text-[1.0625rem] font-extrabold leading-snug tracking-tight">
                Hotel, apartment block or a single Airbnb
              </p>
              <p className="mt-2 text-[0.75rem] font-semibold leading-[1.65] text-white/60">
                Name and type to start. Units come next; each one gets its own address, hand-off
                rule and cards, and goes live on its own readiness rather than waiting for the
                others.
              </p>
              <div className="mt-4">
                <AddProperty hostId={me.id} />
              </div>
            </section>

            <HowItWorks title="Deleting a property">
              One with live units, bookings today or still to come, or an unpaid invoice cannot be
              removed — pause it instead. Deleting keeps its statements and audit trail for seven
              years and takes it off your account. You confirm by typing the name.
            </HowItWorks>
          </>
        }
      >
        <Table
          head={['Property', 'Type', '>Units', '>Live', '>QR', '>Orders 30d', 'Rating', 'Status']}
          empty="No properties yet. Add one — it takes a name and a type, and units hang off it."
          caption="Occupancy and orders are counted from bookings you entered or synced, and from scans of this property's cards."
        >
          {rows.map((p) => (
            <Tr key={p.id} tone={p.units === 0 ? 'warn' : 'plain'}>
              <Td strong note={p.area ?? undefined}>
                {p.name}
              </Td>
              <Td>{kindLabel(p.kind)}</Td>
              <Td right>{p.units}</Td>
              <Td right>{p.units_live}</Td>
              <Td right>
                {p.qr_placed}/{p.qr_cards}
              </Td>
              <Td right>{p.orders_30d}</Td>
              <Td>{p.rating === null ? DASH : `${p.rating} ★`}</Td>
              <Td>
                {p.units === 0 ? (
                  <Pill tone="warn">No units yet</Pill>
                ) : p.units_live > 0 ? (
                  <Pill tone="good">Live</Pill>
                ) : (
                  <Pill tone="plain">Setting up</Pill>
                )}
              </Td>
            </Tr>
          ))}
        </Table>
      </TwoColumn>
    </HostSection>
  );
}
