import { DASH, when } from '@/components/host/bits';
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

export const metadata = { title: 'Data & Privacy' };
export const dynamic = 'force-dynamic';

interface RequestRow {
  id: string;
  kind: string;
  status: string;
  received_at: string;
  due_at: string | null;
  verified: boolean;
  /* text[], not text. Rendered straight, React concatenates the
     elements with no separator and "order, guest" reads back as
     "orderguest". */
  scope: string[] | null;
  fulfilled_at: string | null;
  overdue: boolean;
}

const KIND: Record<string, string> = {
  access: 'Access — a copy of what we hold',
  erasure: 'Erasure — delete it',
  rectification: 'Rectification — correct it',
  restriction: 'Restriction — stop using it',
};

/**
 * What we hold about a guest, and the request that makes us
 * hand it over or delete it.
 *
 * Kenya's Data Protection Act gives a guest thirty days and a
 * right to all four of these. The clock on this page is that
 * statutory one, not an internal target, which is why an
 * overdue row is red rather than amber.
 */
export default async function HostPrivacyPage() {
  const { home, live, nav, supabase, photoUrl } = await hostContext();
  if (!home) return null;

  const { data } = await supabase
    .from('host_data_request_v')
    .select('*')
    .order('received_at', { ascending: false });

  const rows = (data as RequestRow[] | null) ?? [];
  const open = rows.filter((r) => r.fulfilled_at === null);
  const overdue = rows.filter((r) => r.overdue);
  const unverified = open.filter((r) => !r.verified);

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      photoUrl={photoUrl}
      current="/host/privacy"
      title="Data & Privacy"
      lead="What we hold about guests who ordered through your cards, what you can see of it, and the requests a guest can make about their own data."
      headlineValue={String(open.length)}
      headlineNote="Open requests"
    >
      <KpiRow>
        <Kpi label="Requests" value={String(rows.length)} note="all time" />
        <Kpi label="Open" value={String(open.length)} note="not yet fulfilled" />
        <Kpi
          label="Overdue"
          value={String(overdue.length)}
          note="past the 30 days"
          tone={overdue.length > 0 ? 'danger' : 'good'}
        />
        <Kpi
          label="Awaiting identity"
          value={String(unverified.length)}
          note="cannot start yet"
          tone={unverified.length > 0 ? 'gold' : 'good'}
        />
        <Kpi
          label="Fulfilled"
          value={String(rows.length - open.length)}
          note="closed out"
        />
        <Kpi label="Statutory window" value="30 days" note="Data Protection Act" />
      </KpiRow>

      <div className="border-border bg-surface rounded-xl border p-5">
        <h2 className="text-[0.9375rem] font-extrabold tracking-tight">
          What you can see about a guest
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-success text-[0.6875rem] font-extrabold uppercase tracking-wide">
              You see
            </p>
            <ul className="text-muted mt-1.5 space-y-1 text-[0.8125rem] font-semibold leading-[1.6]">
              <li>· First name, where a booking carried one</li>
              <li>· Which unit, and the dates of the stay</li>
              <li>· That an order was placed, and its value</li>
              <li>· A masked phone, on bookings you typed</li>
            </ul>
          </div>
          <div>
            <p className="text-danger text-[0.6875rem] font-extrabold uppercase tracking-wide">
              You never see
            </p>
            <ul className="text-muted mt-1.5 space-y-1 text-[0.8125rem] font-semibold leading-[1.6]">
              <li>· Surname, email or ID number</li>
              <li>· The unmasked phone, including in exports</li>
              <li>· What they ordered, item by item</li>
              <li>· Card or M-Pesa details, ever</li>
            </ul>
          </div>
        </div>
        <p className="text-muted-light mt-4 text-[0.75rem] font-semibold leading-[1.65]">
          This is a database rule, not a screen rule. The columns for a guest&apos;s surname and
          email do not exist on a stay, so there is nothing for a future page, a future export or
          a future bug to leak.
        </p>
      </div>

      <TwoColumn
        rail={
          <>
            <section className="border-border bg-surface rounded-xl border">
              <div className="border-border border-b px-4 py-3">
                <h2 className="text-[0.875rem] font-extrabold tracking-tight">
                  The four requests
                </h2>
              </div>
              <Fact label="Access" value="a copy" />
              <Fact label="Rectification" value="correct it" />
              <Fact label="Erasure" value="delete it" />
              <Fact label="Restriction" value="stop using it" />
            </section>

            <HowItWorks title="Identity first">
              Nothing is handed over or deleted until we have verified the person asking is the
              person the data is about. An access request answered to the wrong person is itself
              a breach, and it is the easier of the two mistakes to make.
            </HowItWorks>

            <HowItWorks title="Erasure is not total">
              An order we are legally required to keep for tax stays, with the guest detached
              from it. We say that to the guest in the response rather than reporting a deletion
              that did not fully happen.
            </HowItWorks>
          </>
        }
      >
        <Table
          head={['Request', 'Scope', 'Received', 'Due', 'Identity', 'Status']}
          empty="No data requests. One arrives through the public privacy form or from the Data Protection Officer, not from this page."
          caption="Handled by NexG's Data Protection Officer, who is the registered contact for them. You are shown them because they may concern a guest who stayed with you."
        >
          {rows.map((r) => (
            <Tr key={r.id} tone={r.overdue ? 'danger' : 'plain'}>
              <Td strong>{KIND[r.kind] ?? r.kind}</Td>
              <Td muted>{r.scope && r.scope.length > 0 ? r.scope.join(', ') : DASH}</Td>
              <Td muted>{when(r.received_at)}</Td>
              <Td muted>{r.due_at ? when(r.due_at) : DASH}</Td>
              <Td>
                {r.verified ? (
                  <Pill tone="good">Verified</Pill>
                ) : (
                  <Pill tone="warn">Awaiting</Pill>
                )}
              </Td>
              <Td>
                {r.overdue ? (
                  <Pill tone="danger">Overdue</Pill>
                ) : r.fulfilled_at ? (
                  <Pill tone="good">Fulfilled</Pill>
                ) : (
                  <Pill tone="info">{r.status.replace(/_/g, ' ')}</Pill>
                )}
              </Td>
            </Tr>
          ))}
        </Table>
      </TwoColumn>
    </HostSection>
  );
}
