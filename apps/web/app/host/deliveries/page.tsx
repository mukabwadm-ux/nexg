import { DASH, kes, when } from '@/components/host/bits';
import {
  Bar,
  Fact,
  HowItWorks,
  Kpi,
  KpiRow,
  Pill,
  Segmented,
  Table,
  Td,
  Tr,
  TwoColumn,
} from '@/components/host/module';
import { HostSection, hostContext } from '@/components/host/section';

export const metadata = { title: 'Deliveries' };
export const dynamic = 'force-dynamic';

interface DeliveryRow {
  order_id: string;
  unit_id: string | null;
  unit_name: string | null;
  reference: string;
  stage: string;
  placed_at: string;
  delivered_at: string | null;
  eta_at: string | null;
  total_cents: number;
  merchant_name: string | null;
  handoff: string | null;
  has_proof: boolean;
  handed_to: string | null;
  guest_first_name: string | null;
}

const HANDOFF: Record<string, string> = {
  guest_meets_at_gate: 'Guest meets at gate',
  leave_with_askari: 'Leave with askari',
  lockbox: 'Lockbox',
  call_guest_first: 'Call guest first',
  reception: 'Reception',
  caretaker: 'Caretaker',
};

const IN_FLIGHT = ['placed', 'confirmed', 'preparing', 'ready', 'picked_up', 'arriving'];

const STAGE: Record<string, { label: string; tone: 'good' | 'info' | 'warn' | 'danger' | 'plain' }> =
  {
    placed: { label: 'Placed', tone: 'info' },
    confirmed: { label: 'Confirmed', tone: 'info' },
    preparing: { label: 'Preparing', tone: 'info' },
    ready: { label: 'Ready', tone: 'warn' },
    picked_up: { label: 'Picked up', tone: 'warn' },
    arriving: { label: 'Arriving', tone: 'warn' },
    delivered: { label: 'Delivered', tone: 'good' },
    cancelled: { label: 'Cancelled', tone: 'plain' },
    disputed: { label: 'Disputed', tone: 'danger' },
    refunded: { label: 'Refunded', tone: 'plain' },
  };

/**
 * Everything that arrived at a unit, and how it was handed over.
 *
 * The hand-off rule is the column that matters. A host sets it
 * once per unit and then needs to see it was actually followed
 * — "leave with askari" that turned into a knock on the door at
 * 11pm is the complaint this page exists to surface.
 *
 * The proof photo is shown as present or absent and never
 * inlined: it is a photograph of somebody's doorway, and a page
 * that renders twenty of them is a page somebody screenshots.
 */
export default async function HostDeliveriesPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  const { home, live, nav, supabase, me } = await hostContext();
  if (!home) return null;

  const { data } = await supabase
    .from('host_delivery_v')
    .select('*')
    .eq('host_id', me.id)
    .order('placed_at', { ascending: false })
    .limit(200);

  const all = (data as DeliveryRow[] | null) ?? [];
  const tab = searchParams?.tab ?? 'all';

  const inFlight = all.filter((d) => IN_FLIGHT.includes(d.stage));
  const delivered = all.filter((d) => d.stage === 'delivered');
  const problems = all.filter((d) => d.stage === 'disputed' || d.stage === 'cancelled');
  const rows =
    tab === 'in_flight'
      ? inFlight
      : tab === 'delivered'
        ? delivered
        : tab === 'problems'
          ? problems
          : all;

  const value = delivered.reduce((a, d) => a + Number(d.total_cents), 0);
  const withProof = delivered.filter((d) => d.has_proof).length;

  /* Minutes from placed to delivered, median rather than mean —
     one order that sat uncollected for three hours would drag an
     average somewhere nobody recognises. */
  const times = delivered
    .filter((d) => d.delivered_at)
    .map(
      (d) =>
        (new Date(d.delivered_at as string).getTime() - new Date(d.placed_at).getTime()) / 60000,
    )
    .sort((a, b) => a - b);
  const median = times.length > 0 ? Math.round(times[Math.floor(times.length / 2)] as number) : null;

  const byRule = new Map<string, number>();
  for (const d of delivered) {
    const k = d.handoff ?? 'unset';
    byRule.set(k, (byRule.get(k) ?? 0) + 1);
  }
  const ruleRows = [...byRule.entries()].sort((a, b) => b[1] - a[1]);
  const ruleMax = ruleRows[0]?.[1] ?? 0;

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      current="/host/deliveries"
      title="Deliveries"
      lead="Everything that arrived at your units, which hand-off rule was applied, and whether there is a photo proving it was left where you said."
      headlineValue={String(inFlight.length)}
      headlineNote="On the way now"
    >
      <KpiRow>
        <Kpi label="Deliveries" value={String(all.length)} note="last 200" />
        <Kpi label="On the way" value={String(inFlight.length)} note="right now" />
        <Kpi label="Delivered" value={String(delivered.length)} note="completed" />
        <Kpi
          label="Order value"
          value={kes(value)}
          note="guests paid the merchants"
          tone="plain"
        />
        <Kpi
          label="Median time"
          value={median === null ? DASH : `${median}m`}
          note={times.length < 5 ? `${times.length} delivered — too few` : 'placed to doorstep'}
        />
        <Kpi
          label="Photo proof"
          value={delivered.length === 0 ? DASH : `${Math.round((withProof / delivered.length) * 100)}%`}
          note={`${withProof} of ${delivered.length}`}
          tone={delivered.length > 0 && withProof < delivered.length ? 'gold' : 'good'}
        />
      </KpiRow>

      <Segmented
        base="/host/deliveries"
        param="tab"
        current={tab}
        options={[
          { key: 'all', label: 'All', count: all.length },
          { key: 'in_flight', label: 'On the way', count: inFlight.length },
          { key: 'delivered', label: 'Delivered', count: delivered.length },
          { key: 'problems', label: 'Problems', count: problems.length },
        ]}
      />

      <TwoColumn
        rail={
          <>
            <section className="border-border bg-surface rounded-xl border">
              <div className="border-border border-b px-4 py-3">
                <h2 className="text-[0.875rem] font-extrabold tracking-tight">
                  Hand-off rules used
                </h2>
              </div>
              <div className="space-y-2.5 px-4 py-4">
                {ruleRows.length === 0 ? (
                  <p className="text-muted-light text-center text-[0.75rem] font-semibold">
                    Nothing delivered yet, so no rule has been exercised.
                  </p>
                ) : (
                  ruleRows.map(([k, n]) => (
                    <Bar key={k} label={HANDOFF[k] ?? 'No rule set'} value={n} max={ruleMax} />
                  ))
                )}
              </div>
              <p className="text-muted-light border-border border-t px-4 py-2.5 text-[0.6875rem] font-semibold leading-[1.6]">
                Change a rule in Guest Operations. It applies to the next delivery, never to one
                already on the way.
              </p>
            </section>

            <section className="border-border bg-surface rounded-xl border">
              <div className="border-border border-b px-4 py-3">
                <h2 className="text-[0.875rem] font-extrabold tracking-tight">Where it went</h2>
              </div>
              <Fact label="Units receiving" value={String(new Set(all.map((d) => d.unit_id)).size)} />
              <Fact
                label="Merchants used"
                value={String(new Set(all.map((d) => d.merchant_name).filter(Boolean)).size)}
              />
              <Fact label="Disputed" value={String(all.filter((d) => d.stage === 'disputed').length)} />
            </section>

            <HowItWorks title="The photo">
              A rider takes one photograph at hand-over and it is stored against the order, not
              against the guest. You can open it from the order; it is not shown inline here and
              it is not in any export.
            </HowItWorks>
          </>
        }
      >
        <Table
          head={['Order', 'Unit', 'From', 'Hand-off', '>Value', 'Stage', 'Proof']}
          empty={
            live
              ? 'No deliveries yet. They appear the moment a guest orders from one of your cards.'
              : 'Nothing yet — deliveries start once your first unit is live and a card is placed.'
          }
          caption="A delivery is listed here when the guest reached the merchant through one of your QR cards. Orders a guest placed on their own phone from the open app are not yours to see."
        >
          {rows.map((d) => {
            const st = STAGE[d.stage] ?? { label: d.stage, tone: 'plain' as const };
            return (
              <Tr key={d.order_id} tone={d.stage === 'disputed' ? 'danger' : 'plain'}>
                <Td strong note={when(d.placed_at)}>
                  {d.reference}
                </Td>
                <Td note={d.guest_first_name ?? undefined}>{d.unit_name ?? DASH}</Td>
                <Td>{d.merchant_name ?? DASH}</Td>
                <Td>{d.handoff ? (HANDOFF[d.handoff] ?? d.handoff) : DASH}</Td>
                <Td right>{kes(d.total_cents)}</Td>
                <Td>
                  <Pill tone={st.tone}>{st.label}</Pill>
                </Td>
                <Td muted>{d.has_proof ? 'Photo' : d.stage === 'delivered' ? 'None' : DASH}</Td>
              </Tr>
            );
          })}
        </Table>
      </TwoColumn>
    </HostSection>
  );
}
