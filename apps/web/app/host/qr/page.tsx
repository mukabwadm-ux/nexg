import { DASH, when } from '@/components/host/bits';
import { HowItWorks, Kpi, KpiRow, Pill, Table, Td, Tr, TwoColumn } from '@/components/host/module';
import { CardActions, GenerateCards, type UnitOption } from '@/components/host/qr-client';
import { spotLabel } from '@/components/host/vocab';
import { HostSection, hostContext } from '@/components/host/section';

export const metadata = { title: 'QR Cards' };
export const dynamic = 'force-dynamic';

interface CardRow {
  id: string;
  code: string;
  unit_id: string | null;
  unit_name: string | null;
  property_name: string | null;
  spot: string;
  label: string | null;
  generated_at: string | null;
  placed_confirmed_at: string | null;
  voided_at: string | null;
  scans_30d: number;
  orders: number;
  last_scan_at: string | null;
  status: string;
}

interface UnitRow {
  id: string;
  name: string;
  label_public: string | null;
  property_name: string | null;
  status: string;
}

/**
 * The cards guests scan, and the controls to make more.
 *
 * The table is server-rendered; only the buttons are a client
 * island. A front desk loading this on a tired tablet gets the
 * list without waiting for JavaScript.
 */
export default async function HostQrPage() {
  const { home, live, nav, supabase, me } = await hostContext();
  if (!home) return null;

  const [cardRes, unitRes] = await Promise.all([
    supabase
      .from('host_qr_list_v')
      .select('*')
      .eq('host_id', me.id)
      .order('generated_at', { ascending: false, nullsFirst: false }),
    supabase
      .from('host_unit_list_v')
      .select('id, name, label_public, property_name, status')
      .eq('host_id', me.id)
      .order('name'),
  ]);

  const cards = (cardRes.data as CardRow[] | null) ?? [];
  const units = (unitRes.data as UnitRow[] | null) ?? [];

  const placed = cards.filter((c) => c.status === 'placed');
  const generated = cards.filter((c) => c.status === 'generated');
  const voided = cards.filter((c) => c.status === 'voided');
  const voidedStillScanned = voided.filter((c) => c.scans_30d > 0);

  const scans = cards.reduce((a, c) => a + Number(c.scans_30d), 0);
  const orders = cards.reduce((a, c) => a + Number(c.orders), 0);

  /* Which spots each unit already has a live card in, so the
     drawer can say so rather than letting the host find out
     from a refusal. */
  const taken = new Map<string, string[]>();
  for (const c of cards) {
    if (c.voided_at || !c.unit_id) continue;
    taken.set(c.unit_id, [...(taken.get(c.unit_id) ?? []), c.spot]);
  }
  const options: UnitOption[] = units
    .filter((u) => u.status !== 'archived')
    .map((u) => ({
      id: u.id,
      name: u.name,
      label_public: u.label_public,
      property_name: u.property_name,
      taken: taken.get(u.id) ?? [],
    }));

  const bySpot = new Map<string, number>();
  for (const c of cards) bySpot.set(c.spot, (bySpot.get(c.spot) ?? 0) + Number(c.scans_30d));
  const topSpot = [...bySpot.entries()].sort((a, b) => b[1] - a[1])[0];

  const unitsWithoutCard = units.filter(
    (u) => u.status !== 'archived' && !cards.some((c) => c.unit_id === u.id && !c.voided_at),
  );

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      current="/host/qr"
      title="QR Cards"
      lead="One card per spot: bedside, kitchen counter, reception. Each card opens that unit's page, and records where and when it was scanned and what the guest ordered."
      headlineValue={`${placed.length} / ${cards.length}`}
      headlineNote="Cards placed"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted text-[0.8125rem] font-semibold">
          {cards.length} card{cards.length === 1 ? '' : 's'} across {units.length} unit
          {units.length === 1 ? '' : 's'}
        </p>
        <GenerateCards units={options} />
      </div>

      {!live ? (
        <div className="border-gold/40 bg-gold-soft rounded-xl border p-5">
          <p className="text-gold-text text-[0.9375rem] font-extrabold">
            Cards work once you are verified
          </p>
          <p className="text-muted mt-1 text-[0.8125rem] font-semibold leading-[1.7]">
            You can generate and print them now. They will not resolve for a guest until
            verification is done — a live card pointing at a unit nobody has checked is real is a
            card with our name on it.
          </p>
        </div>
      ) : null}

      <KpiRow>
        <Kpi label="Cards" value={String(cards.length)} note={`${placed.length} placed`} />
        <Kpi
          label="To place"
          value={String(generated.length)}
          note={generated.length > 0 ? 'generated, not in a room' : 'all placed'}
          tone={generated.length > 0 ? 'gold' : 'good'}
        />
        <Kpi label="Scans · 30 d" value={String(scans)} note="real guests only" />
        <Kpi
          label="Scan → order"
          value={scans >= 20 ? `${Math.round((orders / scans) * 100)}%` : DASH}
          note={scans >= 20 ? `${orders} orders` : `${scans} scans — too few`}
        />
        <Kpi
          label="Top spot"
          value={topSpot ? spotLabel(topSpot[0]).split(' · ')[0] ?? DASH : DASH}
          note={topSpot ? `${topSpot[1]} scans` : 'no scans yet'}
        />
        <Kpi
          label="Retired, still scanned"
          value={String(voidedStillScanned.length)}
          note={voidedStillScanned.length > 0 ? 'an old card is still out there' : 'none'}
          tone={voidedStillScanned.length > 0 ? 'danger' : 'good'}
        />
      </KpiRow>

      <TwoColumn
        rail={
          <>
            {unitsWithoutCard.length > 0 ? (
              <section className="border-gold/40 bg-gold-soft rounded-xl border p-4">
                <h2 className="text-[0.875rem] font-extrabold tracking-tight">
                  {unitsWithoutCard.length} unit{unitsWithoutCard.length === 1 ? '' : 's'} with no
                  card
                </h2>
                <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-[1.65]">
                  {unitsWithoutCard.map((u) => u.name).join(', ')} — a unit with no card cannot be
                  ordered from, however ready everything else is.
                </p>
              </section>
            ) : null}

            <section className="border-border bg-surface rounded-xl border">
              <div className="border-border border-b px-4 py-3">
                <h2 className="text-[0.875rem] font-extrabold tracking-tight">Scans by spot</h2>
              </div>
              {bySpot.size === 0 ? (
                <p className="text-muted-light px-4 py-6 text-center text-[0.75rem] font-semibold">
                  No scans yet.
                </p>
              ) : (
                <div className="divide-border divide-y">
                  {[...bySpot.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([s, n]) => (
                      <div key={s} className="flex justify-between gap-3 px-4 py-2.5">
                        <span className="text-muted text-[0.8125rem] font-semibold">
                          {spotLabel(s)}
                        </span>
                        <span className="text-[0.8125rem] font-extrabold tabular-nums">{n}</span>
                      </div>
                    ))}
                </div>
              )}
            </section>

            <HowItWorks title="How tracking works">
              Every scan is one row: card, spot, unit, time, device type. If the guest orders in
              that session the order is attributed to the card. You see which spots work and what
              gets bought; guests are shown by first name only.
            </HowItWorks>

            <HowItWorks title="Why one card per spot">
              A second card on the same bedside table splits the attribution between two codes and
              neither number is then worth reading. Replace a card rather than adding one.
            </HowItWorks>
          </>
        }
      >
        <Table
          head={['Card', 'Unit', 'Spot', 'Generated', '>Scans 30d', '>Orders', 'Status', '>Actions']}
          empty={
            units.length === 0
              ? 'No units yet, so nowhere for a card to point. Add a unit first.'
              : 'No cards yet. Generate one above — it takes a second and you print it yourself.'
          }
          caption="A voided card still logs its scans, so you can tell when an old one is sitting on somebody's counter."
        >
          {cards.map((c) => (
            <Tr
              key={c.id}
              tone={
                c.status === 'voided' && c.scans_30d > 0
                  ? 'danger'
                  : c.status === 'generated'
                    ? 'warn'
                    : 'plain'
              }
            >
              <Td strong note={c.last_scan_at ? `last scan ${when(c.last_scan_at)}` : undefined}>
                {c.code}
              </Td>
              <Td note={c.property_name ?? undefined}>{c.unit_name ?? DASH}</Td>
              <Td>{spotLabel(c.spot)}</Td>
              <Td muted>{when(c.generated_at)}</Td>
              <Td right>{c.scans_30d}</Td>
              <Td right>{c.orders}</Td>
              <Td>
                {c.status === 'voided' ? (
                  <Pill tone={c.scans_30d > 0 ? 'danger' : 'plain'}>
                    {c.scans_30d > 0 ? 'Voided · still scanned' : 'Voided'}
                  </Pill>
                ) : c.status === 'placed' ? (
                  <Pill tone="good">Placed</Pill>
                ) : (
                  <Pill tone="warn">Place it</Pill>
                )}
              </Td>
              <Td right>
                <CardActions qrId={c.id} status={c.status} code={c.code} />
              </Td>
            </Tr>
          ))}
        </Table>
      </TwoColumn>
    </HostSection>
  );
}
