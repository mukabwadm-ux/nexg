import { Fact, Kpi, KpiRow, Pill, Table, Td, Tr } from '@/components/host/module';
import { HostSection, hostContext } from '@/components/host/section';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Charge to Room' };
export const dynamic = 'force-dynamic';

interface FolioRow {
  id: string;
  order_reference: string;
  room_no: string;
  guest_surname: string;
  amount: number;
  commission_amount: number | null;
  status: string;
  sync: string;
  folio_ref: string | null;
  desk_note: string | null;
  pms_posted_at: string | null;
  escalated_at: string | null;
  created_at: string;
}

const STATUS: Record<string, { label: string; tone: 'good' | 'warn' | 'danger' | 'plain' }> = {
  pending: { label: 'Waiting on the desk', tone: 'warn' },
  approved: { label: 'Approved', tone: 'good' },
  posted: { label: 'Posted to folio', tone: 'good' },
  declined: { label: 'Declined', tone: 'danger' },
  voided: { label: 'Voided', tone: 'plain' },
  recharged: { label: 'Charged to card', tone: 'plain' },
};

const SYNC: Record<string, { label: string; tone: 'good' | 'warn' | 'danger' | 'plain' }> = {
  not_required: { label: 'No PMS', tone: 'plain' },
  pending: { label: 'Queued', tone: 'warn' },
  synced: { label: 'In your PMS', tone: 'good' },
  failed: { label: 'PMS rejected it', tone: 'danger' },
};

function kes(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(Number(cents))) return 'KES [—]';
  return `KES ${Math.round(Number(cents) / 100).toLocaleString('en-KE')}`;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Nairobi',
  });
}

/**
 * Orders put on a room bill instead of a card.
 *
 * Only hotels have a folio, so only hotels have this. A host
 * running apartments sees why it is empty rather than a board
 * implying they have forgotten to switch something on — the
 * feature is not theirs, and saying so is more useful than a
 * zero.
 *
 * `folio_posting` is read through `host_folio_v`, whose RLS is
 * `is_hotel_member`. A host who is not a hotel member reads
 * nothing, which is the rule doing its job rather than the
 * page failing.
 */
export default async function ChargeToRoom() {
  const { home, live, nav, photoUrl } = await hostContext();
  if (!home) return null;

  const supabase = createClient();
  const [folioRes, settingsRes] = await Promise.all([
    supabase.from('host_folio_v').select('*').limit(100),
    supabase.from('host_settings_v').select('features').eq('host_id', home.host_id).maybeSingle(),
  ]);
  const { data } = folioRes;

  const all = (data as FolioRow[] | null) ?? [];
  const pending = all.filter((f) => f.status === 'pending');
  const failed = all.filter((f) => f.sync === 'failed');
  const postedToday = all.filter(
    (f) =>
      f.status === 'posted' &&
      new Date(f.created_at).toDateString() === new Date().toDateString(),
  );
  const outstanding = all
    .filter((f) => f.status === 'pending' || f.status === 'approved')
    .reduce((sum, f) => sum + f.amount, 0);

  /* Whether the feature belongs to this account at all. An
     empty table and "you do not have this" look identical in a
     zero, so they are told apart before anything is counted. */
  const features = (settingsRes.data as { features: Record<string, boolean> | null } | null)?.features ?? {};
  const enabled = features.charge_to_room === true;

  return (
    <HostSection
      home={home}
      live={live}
      nav={nav}
      photoUrl={photoUrl}
      current="/host/charge-to-room"
      title="Charge to Room"
      lead="Guest orders put on a room bill rather than a card, and how they reached your PMS."
      headlineValue={enabled ? String(pending.length) : '—'}
      headlineNote={enabled ? 'waiting on your desk' : 'hotels only'}
    >
      {!enabled ? (
        <>
          <section className="border-border bg-surface rounded-xl border p-5">
            <h2 className="text-[1rem] font-extrabold tracking-tight">
              This one is for hotels
            </h2>
            <p className="text-muted mt-2 text-[0.875rem] font-semibold leading-[1.7]">
              Charging to a room needs a folio to charge to — a property management system, a
              front desk that can approve a posting, and a nightly reconciliation against it.
              Apartments and serviced units take payment the ordinary way, at checkout, and
              nothing here would apply to them.
            </p>
            <p className="text-muted-light mt-3 text-[0.8125rem] font-semibold leading-[1.7]">
              If you do run a hotel and this should be on, ask host ops to enable it. It is
              switched on per account because it needs your PMS details and a desk device paired
              before the first posting, not after.
            </p>
          </section>

          <section className="border-border bg-surface rounded-xl border">
            <div className="border-border border-b px-4 py-3">
              <h2 className="text-[0.875rem] font-extrabold tracking-tight">What it would do</h2>
            </div>
            <Fact
              label="A guest orders from their room"
              value="They choose Charge to room instead of paying"
            />
            <Fact label="Your desk approves it" value="On the desk device, against the folio" />
            <Fact label="It posts to your PMS" value="With the order reference on the line" />
            <Fact label="You are invoiced monthly" value="Net of commission, with the detail" />
          </section>
        </>
      ) : (
        <>
          <KpiRow>
            <Kpi
              label="Waiting on your desk"
              value={String(pending.length)}
              note={pending.length > 0 ? 'guests are waiting' : 'nothing pending'}
              tone={pending.length > 0 ? 'gold' : 'good'}
            />
            <Kpi label="Posted today" value={String(postedToday.length)} note="to room folios" />
            <Kpi
              label="PMS rejected"
              value={String(failed.length)}
              note={failed.length > 0 ? 'needs a person' : 'all synced'}
              tone={failed.length > 0 ? 'danger' : 'good'}
            />
            <Kpi label="Outstanding" value={kes(outstanding)} note="approved, not yet invoiced" />
          </KpiRow>

          <Table
            head={['Order', 'Room', 'Guest', 'Amount', 'Status', 'PMS', 'When']}
            empty="No postings yet. The first one appears here the moment a guest chooses Charge to room."
          >
            {all.map((f) => {
                const st = STATUS[f.status] ?? { label: f.status, tone: 'plain' as const };
                const sy = SYNC[f.sync] ?? { label: f.sync, tone: 'plain' as const };
                return (
                  <Tr key={f.id}>
                    <Td strong>{f.order_reference}</Td>
                    <Td strong>{f.room_no}</Td>
                    <Td>{f.guest_surname}</Td>
                    <Td strong>{kes(f.amount)}</Td>
                    <Td>
                      <Pill tone={st.tone}>{st.label}</Pill>
                    </Td>
                    <Td>
                      <Pill tone={sy.tone}>{sy.label}</Pill>
                    </Td>
                    <Td muted>{when(f.created_at)}</Td>
                  </Tr>
                );
            })}
          </Table>


          <section className="border-border bg-surface rounded-xl border">
            <div className="border-border border-b px-4 py-3">
              <h2 className="text-[0.875rem] font-extrabold tracking-tight">When a posting does not reach your PMS</h2>
            </div>
            <Fact
              label="The money is not lost"
              value="The order is paid for; only the line is missing"
            />
            <Fact label="It stays here" value="Marked rejected until somebody clears it" />
            <Fact label="Your desk can re-post it" value="From the desk device, with the reason" />
            <Fact
              label="Or it moves to the card"
              value="If the guest has checked out, we recharge"
            />
          </section>
        </>
      )}
    </HostSection>
  );
}
