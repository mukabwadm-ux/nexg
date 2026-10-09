import { DASH, kes } from '@/components/host/bits';
import {
  Bar,
  Fact,
  HowItWorks,
  Kpi,
  KpiRow,
  Segmented,
  Table,
  Td,
  Tr,
  TwoColumn,
} from '@/components/host/module';
import { HostSection, hostContext } from '@/components/host/section';

export const metadata = { title: 'Analytics' };
export const dynamic = 'force-dynamic';

interface DayRow {
  day: string;
  scans: number;
  orders: number;
  order_value_cents: number;
}

interface HourRow {
  hour: number;
  dow: number;
  scans: number;
  orders: number;
}

interface UnitRow {
  unit_id: string;
  unit_name: string | null;
  property_name: string | null;
  scans: number;
  orders: number;
  order_value_cents: number;
  conversion_pct: number | null;
}

/** Below this, a percentage is arithmetic rather than a finding. */
const ENOUGH = 20;

/**
 * Scans, orders and the gap between them.
 *
 * The gap is the whole product. A card that is scanned forty
 * times and ordered from twice is not a card problem — it is a
 * menu, a delivery window or a price, and the only way a host
 * can tell which is to see the two numbers side by side.
 *
 * Conversion is withheld under twenty scans. Three scans and
 * one order is not a 33% conversion rate, it is three scans,
 * and printing the percentage invites a decision the data
 * cannot carry.
 */
export default async function HostAnalyticsPage({
  searchParams,
}: {
  searchParams?: { range?: string };
}) {
  const { home, live, nav, supabase, me } = await hostContext();
  if (!home) return null;

  const range = searchParams?.range ?? '30';
  const days = range === '7' ? 7 : range === '90' ? 90 : 30;
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  const [dailyRes, hourRes, unitRes] = await Promise.all([
    supabase
      .from('host_analytics_daily_v')
      .select('*')
      .eq('host_id', me.id)
      .gte('day', from)
      .order('day'),
    supabase.from('host_analytics_hour_v').select('*').eq('host_id', me.id),
    supabase
      .from('host_analytics_unit_v')
      .select('*')
      .eq('host_id', me.id)
      .order('scans', { ascending: false }),
  ]);

  const daily = (dailyRes.data as DayRow[] | null) ?? [];
  const hours = (hourRes.data as HourRow[] | null) ?? [];
  const units = (unitRes.data as UnitRow[] | null) ?? [];

  const scans = daily.reduce((a, d) => a + d.scans, 0);
  const orders = daily.reduce((a, d) => a + d.orders, 0);
  const valueCents = daily.reduce((a, d) => a + Number(d.order_value_cents), 0);
  const enough = scans >= ENOUGH;

  const dayMax = Math.max(1, ...daily.map((d) => d.scans));

  /* Collapsed to hour-of-day across the whole window. A 7×24
     heat map needs weeks of data to say anything; with a
     fortnight it is mostly empty squares that read as "nothing
     happens on Tuesdays". */
  const byHour = new Array(24).fill(0) as number[];
  for (const h of hours) byHour[h.hour] = (byHour[h.hour] ?? 0) + h.scans;
  const hourMax = Math.max(1, ...byHour);
  const peak = byHour.indexOf(hourMax);

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      current="/host/analytics"
      title="Analytics"
      lead="How often your cards are scanned, how many of those scans become orders, and which units carry it. Everything here counts real people — bots and our own test scans are excluded at the view."
      headlineValue={enough ? `${Math.round((orders / scans) * 100)}%` : DASH}
      headlineNote={enough ? 'Scan to order' : `${scans} scans — too few`}
    >
      <Segmented
        base="/host/analytics"
        param="range"
        current={range}
        options={[
          { key: '30', label: 'Last 30 days' },
          { key: '7', label: 'Last 7 days' },
          { key: '90', label: 'Last 90 days' },
        ]}
      />

      <KpiRow>
        <Kpi label="Scans" value={String(scans)} note={`over ${days} days`} />
        <Kpi label="Orders" value={String(orders)} note="from those scans" />
        <Kpi
          label="Conversion"
          value={enough ? `${Math.round((orders / scans) * 100)}%` : DASH}
          note={enough ? 'scan became an order' : `needs ${ENOUGH} scans`}
          tone={enough ? 'good' : 'plain'}
        />
        <Kpi label="Order value" value={kes(valueCents)} note="guests paid merchants" />
        <Kpi
          label="Busiest hour"
          value={scans > 0 ? `${String(peak).padStart(2, '0')}:00` : DASH}
          note={scans > 0 ? `${hourMax} scans` : 'no scans yet'}
        />
        <Kpi
          label="Units scanned"
          value={String(units.filter((u) => u.scans > 0).length)}
          note={`of ${home.units_total}`}
        />
      </KpiRow>

      <TwoColumn
        rail={
          <>
            <section className="border-border bg-surface rounded-xl border">
              <div className="border-border border-b px-4 py-3">
                <h2 className="text-[0.875rem] font-extrabold tracking-tight">
                  When guests scan
                </h2>
              </div>
              <div className="space-y-1.5 px-4 py-4">
                {scans === 0 ? (
                  <p className="text-muted-light text-center text-[0.75rem] font-semibold">
                    No scans yet. This fills in once a card is placed and used.
                  </p>
                ) : (
                  byHour
                    .map((n, h) => ({ n, h }))
                    .filter((x) => x.n > 0)
                    .map((x) => (
                      <Bar
                        key={x.h}
                        label={`${String(x.h).padStart(2, '0')}:00`}
                        value={x.n}
                        max={hourMax}
                      />
                    ))
                )}
              </div>
              <p className="text-muted-light border-border border-t px-4 py-2.5 text-[0.6875rem] font-semibold leading-[1.6]">
                Nairobi time. Hours with no scans are left out rather than drawn as empty rows.
              </p>
            </section>

            <section className="border-border bg-surface rounded-xl border">
              <div className="border-border border-b px-4 py-3">
                <h2 className="text-[0.875rem] font-extrabold tracking-tight">
                  What is excluded
                </h2>
              </div>
              <Fact label="Bot scans" value="not counted" />
              <Fact label="Our test scans" value="not counted" />
              <Fact label="Your own scans" value="counted" />
            </section>

            <HowItWorks title="What a scan is not">
              A scan is a card being pointed at, not a guest deciding anything. The same guest
              scanning twice in an evening is two scans. We do not fingerprint a device to collapse
              them into one person, so treat the count as interest rather than headcount.
            </HowItWorks>
          </>
        }
      >
        <section className="border-border bg-surface rounded-xl border">
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-[0.875rem] font-extrabold tracking-tight">Scans by day</h2>
            <span className="text-muted-light text-[0.6875rem] font-extrabold uppercase tracking-wide">
              {daily.length} day{daily.length === 1 ? '' : 's'} with activity
            </span>
          </div>
          {daily.length === 0 ? (
            <p className="text-muted-light px-4 py-10 text-center text-[0.8125rem] font-semibold">
              No scans in this window. A day with nothing is not drawn as a zero bar — the chart
              would read as a flat line rather than as no data.
            </p>
          ) : (
            <div className="flex h-40 items-end gap-1 px-4 py-4">
              {daily.map((d) => (
                <span
                  key={d.day}
                  title={`${d.day}: ${d.scans} scans, ${d.orders} orders`}
                  className="bg-gold hover:bg-gold-text min-w-[0.25rem] flex-1 rounded-t transition-colors"
                  style={{ height: `${Math.max(4, (d.scans / dayMax) * 100)}%` }}
                />
              ))}
            </div>
          )}
        </section>

        <Table
          head={['Unit', 'Property', '>Scans', '>Orders', '>Conversion', '>Value']}
          empty="No unit has been scanned yet."
          caption={`Conversion is withheld below ${ENOUGH} scans for a unit. Two orders from five scans is not a 40% rate, and a figure that looks like one invites a decision the numbers cannot support.`}
        >
          {units.map((u) => (
            <Tr key={u.unit_id}>
              <Td strong>{u.unit_name ?? DASH}</Td>
              <Td muted>{u.property_name ?? DASH}</Td>
              <Td right>{u.scans}</Td>
              <Td right>{u.orders}</Td>
              <Td right>{u.scans >= ENOUGH ? `${u.conversion_pct}%` : DASH}</Td>
              <Td right>{kes(u.order_value_cents)}</Td>
            </Tr>
          ))}
        </Table>
      </TwoColumn>
    </HostSection>
  );
}
