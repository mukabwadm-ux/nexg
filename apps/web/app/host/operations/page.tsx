import { DASH } from '@/components/host/bits';
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

export const metadata = { title: 'Guest Operations' };
export const dynamic = 'force-dynamic';

interface RuleRow {
  unit_id: string;
  unit_name: string;
  property_name: string | null;
  rule: string | null;
  handoff_note: string | null;
  caretaker_name: string | null;
  caretaker_confirmed_at: string | null;
  /* jsonb, not text. The first version of this page declared it
     a string, the cast made TypeScript agree, and React was
     handed an object at runtime. A hand-written interface over
     a view is an assertion, not a check. */
  delivery_hours: { from?: string; to?: string } | null;
  unit_status: string;
  rule_missing: boolean;
}

/** `{from: "06:00", to: "22:00"}` as a person reads it. */
function hours(h: { from?: string; to?: string } | null): string {
  if (!h || (!h.from && !h.to)) return 'Any time';
  return `${h.from ?? '00:00'}–${h.to ?? '24:00'}`;
}

const HANDOFF: Record<string, { label: string; needs: string }> = {
  guest_meets_at_gate: {
    label: 'Guest meets at gate',
    needs: 'The guest gets a call; nobody enters the compound.',
  },
  leave_with_askari: {
    label: 'Leave with askari',
    needs: 'Needs a gate that is manned at the hours you deliver.',
  },
  lockbox: { label: 'Lockbox', needs: 'Needs a box and a code the guest already has.' },
  call_guest_first: { label: 'Call guest first', needs: 'The rider waits for an answer.' },
  reception: { label: 'Reception', needs: 'Needs a desk that is staffed.' },
  caretaker: { label: 'Caretaker', needs: 'Needs a named caretaker who has confirmed.' },
};

/**
 * One rule per unit, for what a rider does at the door.
 *
 * The rule a host picks is a promise to somebody else — the
 * askari who will be handed a bag, the caretaker whose phone
 * will ring. "Leave with askari" set on a gate with no askari
 * after 8pm is the single most common way a delivery goes
 * wrong, so an unconfirmed caretaker is flagged rather than
 * silently trusted.
 */
export default async function HostOperationsPage() {
  const { home, live, nav, supabase, me } = await hostContext();
  if (!home) return null;

  const { data } = await supabase
    .from('host_handoff_rule_v')
    .select('*')
    .eq('host_id', me.id)
    .order('unit_name');

  const rows = (data as RuleRow[] | null) ?? [];
  const missing = rows.filter((r) => r.rule_missing);
  const needsCaretaker = rows.filter(
    (r) => r.rule === 'caretaker' && r.caretaker_confirmed_at === null,
  );
  const noHours = rows.filter((r) => !r.delivery_hours?.from && !r.delivery_hours?.to);

  const byRule = new Map<string, number>();
  for (const r of rows) byRule.set(r.rule ?? 'unset', (byRule.get(r.rule ?? 'unset') ?? 0) + 1);

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      current="/host/operations"
      title="Guest Operations"
      lead="What a rider does when they reach your door. One rule per unit, plus the hours you accept deliveries and who the rider should ask for."
      headlineValue={`${rows.length - missing.length}/${rows.length}`}
      headlineNote="Units with a rule"
    >
      <KpiRow>
        <Kpi label="Units" value={String(rows.length)} note="not archived" />
        <Kpi
          label="Rule set"
          value={String(rows.length - missing.length)}
          note={missing.length > 0 ? `${missing.length} without one` : 'all covered'}
          tone={missing.length > 0 ? 'gold' : 'good'}
        />
        <Kpi
          label="Caretaker unconfirmed"
          value={String(needsCaretaker.length)}
          note="rule depends on them"
          tone={needsCaretaker.length > 0 ? 'danger' : 'good'}
        />
        <Kpi
          label="No delivery hours"
          value={String(noHours.length)}
          note="assumed always open"
          tone={noHours.length > 0 ? 'gold' : 'good'}
        />
        <Kpi
          label="Gate hand-offs"
          value={String(byRule.get('guest_meets_at_gate') ?? 0)}
          note="guest comes down"
        />
        <Kpi
          label="Askari hand-offs"
          value={String(byRule.get('leave_with_askari') ?? 0)}
          note="left at the gate"
        />
      </KpiRow>

      {needsCaretaker.length > 0 ? (
        <div className="border-danger/40 bg-danger/5 rounded-xl border p-4">
          <p className="text-danger text-[0.875rem] font-extrabold">
            {needsCaretaker.length} unit{needsCaretaker.length === 1 ? '' : 's'} hand over to a
            caretaker who has not confirmed
          </p>
          <p className="text-muted mt-1 text-[0.75rem] font-semibold leading-[1.65]">
            The rule names {needsCaretaker.map((r) => r.caretaker_name ?? 'someone').join(', ')}.
            Until they confirm, a rider arriving at{' '}
            {needsCaretaker.map((r) => r.unit_name).join(', ')} has no one expecting them. We do
            not quietly fall back to another rule — a bag left somewhere the host did not choose
            is worse than a rider who calls.
          </p>
        </div>
      ) : null}

      <TwoColumn
        rail={
          <>
            <section className="border-border bg-surface rounded-xl border">
              <div className="border-border border-b px-4 py-3">
                <h2 className="text-[0.875rem] font-extrabold tracking-tight">Rules in use</h2>
              </div>
              {[...byRule.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([k, n]) => (
                  <Fact
                    key={k}
                    label={k === 'unset' ? 'No rule set' : (HANDOFF[k]?.label ?? k)}
                    value={`${n} unit${n === 1 ? '' : 's'}`}
                  />
                ))}
            </section>

            <HowItWorks title="Why only one rule">
              A unit gets one hand-off rule, not a preference list. A rider at a gate at nine at
              night needs an instruction, not options — and a fallback nobody chose is how a bag
              ends up with a neighbour. If the rule cannot be followed the rider calls you and the
              order waits.
            </HowItWorks>

            <HowItWorks title="Delivery hours">
              Outside the hours you set, your card still scans and the menu still shows — what
              changes is that merchants who cannot reach you are filtered out rather than
              accepting an order they will have to cancel.
            </HowItWorks>
          </>
        }
      >
        <Table
          head={['Unit', 'Hand-off rule', 'Ask for', 'Hours', 'Status']}
          empty="No units yet. Add a property and its units first."
          caption="Changing a rule applies to the next delivery. An order already on its way keeps the rule it was placed under, because the rider has already been told what to do."
        >
          {rows.map((r) => (
            <Tr
              key={r.unit_id}
              tone={
                r.rule === 'caretaker' && !r.caretaker_confirmed_at
                  ? 'danger'
                  : r.rule_missing
                    ? 'warn'
                    : 'plain'
              }
            >
              <Td strong note={r.property_name ?? undefined}>
                {r.unit_name}
              </Td>
              <Td note={r.rule ? HANDOFF[r.rule]?.needs : 'A rider will have to call you'}>
                {r.rule ? (HANDOFF[r.rule]?.label ?? r.rule) : <Pill tone="warn">Not set</Pill>}
              </Td>
              <Td>
                {r.caretaker_name ?? DASH}
                {r.caretaker_name && !r.caretaker_confirmed_at ? (
                  <span className="ml-1.5">
                    <Pill tone="danger">unconfirmed</Pill>
                  </span>
                ) : null}
              </Td>
              <Td muted>{hours(r.delivery_hours)}</Td>
              <Td>
                {r.unit_status === 'live' ? (
                  <Pill tone="good">Live</Pill>
                ) : (
                  <Pill tone="plain">{r.unit_status.replace(/_/g, ' ')}</Pill>
                )}
              </Td>
            </Tr>
          ))}
        </Table>

        {rows.some((r) => r.handoff_note) ? (
          <section className="border-border bg-surface rounded-xl border">
            <div className="border-border border-b px-4 py-3">
              <h2 className="text-[0.875rem] font-extrabold tracking-tight">
                Notes a rider sees
              </h2>
            </div>
            <div className="divide-border divide-y">
              {rows
                .filter((r) => r.handoff_note)
                .map((r) => (
                  <div key={r.unit_id} className="px-4 py-3">
                    <p className="text-[0.8125rem] font-extrabold">{r.unit_name}</p>
                    <p className="text-muted mt-0.5 text-[0.75rem] font-semibold leading-[1.6]">
                      {r.handoff_note}
                    </p>
                  </div>
                ))}
            </div>
            <p className="text-muted-light border-border border-t px-4 py-2.5 text-[0.6875rem] font-semibold leading-[1.6]">
              Shown to the rider on the job card, after they accept. Do not put a gate code here —
              it would be in the app of every rider who ever delivers to this unit.
            </p>
          </section>
        ) : null}
      </TwoColumn>
    </HostSection>
  );
}
