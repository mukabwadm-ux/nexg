import { DASH, kes, when } from '@/components/host/bits';
import {
  Fact,
  HowItWorks,
  Kpi,
  KpiRow,
  Pill,
  Table,
  Td,
  Tr,
  TwoColumn,
} from '@/components/host/module';
import { HostSection, hostContext } from '@/components/host/section';

export const metadata = { title: 'Earnings & Invoices' };
export const dynamic = 'force-dynamic';

interface Earnings {
  invoices_count: number;
  outstanding_cents: number;
  paid_cents: number;
  rewards_pending: number;
  rewards_credited_kes: number;
  guest_order_value_cents: number;
  guest_order_count: number;
}

interface StatementLine {
  id: number;
  effective_at: string;
  line_kind: string;
  memo: string | null;
  amount_cents: number;
}

interface PackageOrderRow {
  id: string;
  unit_name: string | null;
  package_name: string | null;
  price_kes: number | null;
  for_checkin_at: string;
  status: string;
  has_photo: boolean;
  created_at: string;
}

/**
 * What this costs, and what it pays.
 *
 * Two different currencies live on this page and they are not
 * the same money: guest order value is in cents, because it is
 * an order; referral rewards are in whole shillings, because
 * that is how the reward was agreed. Mixing them in one total
 * would be a number that means nothing, so they are never added
 * together — the page shows both and says which is which.
 */
export default async function HostEarningsPage() {
  const { home, live, nav, supabase, me, photoUrl } = await hostContext();
  if (!home) return null;

  const [earnRes, pkgRes, stmtRes] = await Promise.all([
    supabase.from('host_earnings_v').select('*').eq('host_id', me.id).maybeSingle(),
    supabase
      .from('host_package_order_v')
      .select('*')
      .eq('host_id', me.id)
      .order('for_checkin_at', { ascending: false }),
    /* The ledger, not the invoice table. Finance reads the same
       entries through `finance_host_v`, so the two cannot drift
       — which is the whole reason host money was put on the
       ledger rather than left in standalone tables. */
    supabase
      .from('host_statement_v')
      .select('*')
      .eq('host_id', me.id)
      .order('effective_at', { ascending: false })
      .limit(50),
  ]);

  const e = (earnRes.data as Earnings | null) ?? {
    invoices_count: 0,
    outstanding_cents: 0,
    paid_cents: 0,
    rewards_pending: 0,
    rewards_credited_kes: 0,
    guest_order_value_cents: 0,
    guest_order_count: 0,
  };
  const packages = (pkgRes.data as PackageOrderRow[] | null) ?? [];
  const statement = (stmtRes.data as StatementLine[] | null) ?? [];
  const balanceCents = statement.reduce((a, l) => a + Number(l.amount_cents), 0);
  const billable = packages.filter((p) => p.status !== 'cancelled');
  const owedKes = billable.reduce((a, p) => a + Number(p.price_kes ?? 0), 0);

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      photoUrl={photoUrl}
      current="/host/earnings"
      title="Earnings & Invoices"
      lead="What guests ordered through your cards, what you owe us for welcome packages, and what your referrals have earned."
      headlineValue={e.outstanding_cents > 0 ? kes(e.outstanding_cents) : 'KES 0'}
      headlineNote="Outstanding to NexG"
    >
      {/*
        First, before any figure. "What does this cost me" is the
        question that brings a host to this page, and a page that
        makes them scroll for the answer reads as though there is
        something being kept back.
      */}
      <div className="border-border bg-surface rounded-xl border p-5">
        <h2 className="text-[0.9375rem] font-extrabold tracking-tight">
          Listing costs you nothing
        </h2>
        <p className="text-muted mt-1 text-[0.8125rem] font-semibold leading-[1.7]">
          Guests pay per order, the same as anybody else ordering from NexG. You are invoiced only
          for welcome packages you ask us to place in a unit. There is no commission share on
          guest orders — and if that ever changes it will be in your Host Agreement before it
          appears on this page.
        </p>
      </div>

      <KpiRow>
        <Kpi
          label="Guest orders"
          value={String(e.guest_order_count)}
          note="through your cards"
        />
        <Kpi
          label="Order value"
          value={kes(e.guest_order_value_cents)}
          note="paid to merchants, not to you"
        />
        <Kpi
          label="Package charges"
          value={`KES ${owedKes.toLocaleString('en-KE')}`}
          note={`${billable.length} placed or scheduled`}
        />
        <Kpi
          label="Outstanding"
          value={kes(e.outstanding_cents)}
          note={e.invoices_count === 0 ? 'no invoice yet' : `${e.invoices_count} invoices`}
          tone={e.outstanding_cents > 0 ? 'gold' : 'good'}
        />
        <Kpi label="Paid" value={kes(e.paid_cents)} note="settled invoices" />
        <Kpi
          label="Referral rewards"
          value={`KES ${Number(e.rewards_credited_kes).toLocaleString('en-KE')}`}
          note={e.rewards_pending > 0 ? `${e.rewards_pending} pending` : 'credited'}
          href="/host/refer"
        />
      </KpiRow>

      <TwoColumn
        rail={
          <>
            <section className="border-border bg-surface rounded-xl border">
              <div className="border-border border-b px-4 py-3">
                <h2 className="text-[0.875rem] font-extrabold tracking-tight">
                  The two numbers
                </h2>
              </div>
              <Fact
                label={<>Order value <span className="text-muted-light">· not yours</span></>}
                value={kes(e.guest_order_value_cents)}
              />
              <Fact
                label={<>Package charges <span className="text-muted-light">· you owe</span></>}
                value={`KES ${owedKes.toLocaleString('en-KE')}`}
              />
              <Fact
                label={<>Referral rewards <span className="text-muted-light">· you earn</span></>}
                value={`KES ${Number(e.rewards_credited_kes).toLocaleString('en-KE')}`}
              />
              <p className="text-muted-light px-4 py-3 text-[0.6875rem] font-semibold leading-[1.6]">
                These are not added together anywhere. Order value is a guest paying a merchant
                and passes nowhere near your account; a combined total would be a number that
                means nothing.
              </p>
            </section>

            <HowItWorks title="When an invoice appears">
              A package is charged when it is placed in the unit, not when you scheduled it. A
              scheduled package you cancel before check-in costs nothing, and a cancelled one is
              never on an invoice.
            </HowItWorks>

            <HowItWorks title="Statements">
              A monthly statement in PDF and Excel is built from the first full month after you
              go live. Until there is a full month to describe, this page is the record — an
              export of two weeks labelled &ldquo;monthly&rdquo; is worse than none.
            </HowItWorks>
          </>
        }
      >
        <Table
          head={['Package', 'Unit', 'For check-in', '>Price', 'Status']}
          empty="No welcome packages yet. Browse them in Packages & Amenities — you are charged only for ones actually placed."
          caption="Prices are in whole shillings, as quoted in the catalogue. A package is billed when it is placed in the unit."
        >
          {packages.map((p) => (
            <Tr key={p.id}>
              <Td strong>{p.package_name ?? DASH}</Td>
              <Td>{p.unit_name ?? DASH}</Td>
              <Td muted>
                {new Date(p.for_checkin_at).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  timeZone: 'Africa/Nairobi',
                })}
              </Td>
              <Td right>
                {p.price_kes === null ? DASH : `KES ${Number(p.price_kes).toLocaleString('en-KE')}`}
              </Td>
              <Td>
                {p.status === 'photo_confirmed' ? (
                  <Pill tone="good">Photo confirmed</Pill>
                ) : p.status === 'delivered' ? (
                  <Pill tone="good">Delivered</Pill>
                ) : p.status === 'placed' ? (
                  <Pill tone="info">Placed</Pill>
                ) : p.status === 'cancelled' ? (
                  <Pill tone="plain">Cancelled · not billed</Pill>
                ) : (
                  <Pill tone="warn">Scheduled</Pill>
                )}
              </Td>
            </Tr>
          ))}
        </Table>
        <section className="border-border bg-surface rounded-xl border">
          <div className="border-border flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-[0.875rem] font-extrabold tracking-tight">Your statement</h2>
            <span
              className={`text-[0.875rem] font-extrabold tabular-nums ${
                balanceCents < 0 ? 'text-danger' : 'text-success'
              }`}
            >
              {balanceCents < 0 ? `You owe ${kes(-balanceCents)}` : `Owed to you ${kes(balanceCents)}`}
            </span>
          </div>
          {statement.length === 0 ? (
            <p className="text-muted-light px-4 py-10 text-center text-[0.8125rem] font-semibold leading-[1.65]">
              Nothing on your statement yet. Invoices and referral rewards appear here the moment
              they are raised, from the same ledger entries the finance team reads.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-border bg-bg border-b">
                  <tr className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-wide">
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2">Description</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.map((l) => (
                    <tr
                      key={l.id}
                      className="border-border border-b text-[0.8125rem] font-semibold last:border-0"
                    >
                      <td className="text-muted px-4 py-2.5">{when(l.effective_at)}</td>
                      <td className="px-4 py-2.5">
                        {l.line_kind === 'reward' ? (
                          <Pill tone="good">Reward</Pill>
                        ) : (
                          <Pill tone="info">Invoice</Pill>
                        )}
                      </td>
                      <td className="text-muted px-4 py-2.5">{l.memo ?? DASH}</td>
                      <td
                        className={`px-4 py-2.5 text-right font-extrabold tabular-nums ${
                          Number(l.amount_cents) < 0 ? 'text-danger' : 'text-success'
                        }`}
                      >
                        {Number(l.amount_cents) < 0 ? '−' : '+'}
                        {kes(Math.abs(Number(l.amount_cents)))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-muted-light border-border border-t px-4 py-2.5 text-[0.6875rem] font-semibold leading-[1.6]">
            These are ledger entries, not a summary of them. The finance team reads the same rows,
            so what you see here and what they see cannot disagree — and a reconciliation check
            asserts it on every test run.
          </p>
        </section>
      </TwoColumn>
    </HostSection>
  );
}
