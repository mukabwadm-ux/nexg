import { DashCard } from '@/components/portal/dash';
import {
  RaiseFeeInvoicesButton,
  RecordFeePaymentButton,
} from '@/components/stays/management-fees-client';
import { Chip, DataTable, Footnote, PersonCell } from '@/components/stays/module';
import { asNumber, asObject, kesFull, n, shortDate } from '@/lib/stays-module';

/*
 * Stays › Finance › Management Fees: the monthly fee invoices
 * (rpc_console_stays_fee_invoices, 20270332000600), what was taken from
 * payouts or paid by M-Pesa, and the two buttons. Server-safe.
 */

export interface FeeInvoice {
  id: string;
  number: string;
  host_id: string;
  host_name: string | null;
  period: string;
  properties: number;
  lines: { label: string; amount_kes: number }[] | null;
  total_kes: number;
  deducted_kes: number;
  mpesa_kes: number;
  pending_kes: number;
  outstanding_kes: number;
  status: string;
  due_at: string | null;
  paid_at: string | null;
  subaccount: boolean;
}

export interface FeeData {
  kpis: Record<string, unknown>;
  invoices: FeeInvoice[];
  months: string[];
  deductions: Record<string, { booked_kes: number; pending_kes: number }>;
  canRaise: boolean;
  canRecord: boolean;
}

/** The reader's output, typed; empty when the migration is not there yet. */
export function feeData(raw: unknown): FeeData {
  const o = asObject(raw);
  return {
    kpis: asObject(o.kpis),
    invoices: (Array.isArray(o.invoices) ? o.invoices : []) as FeeInvoice[],
    months: (Array.isArray(o.months) ? o.months : []) as string[],
    deductions: asObject(o.deductions) as FeeData['deductions'],
    canRaise: o.can_raise === true,
    canRecord: o.can_record === true,
  };
}

const STATUS: Record<string, { chip: string; text: string }> = {
  paid: { chip: 'resolved', text: 'Paid' },
  due: { chip: 'pending', text: 'Due' },
  sent: { chip: 'pending', text: 'Due' },
  overdue: { chip: 'cancelled', text: 'Overdue' },
  credited: { chip: 'closed', text: 'Credited' },
  draft: { chip: 'draft', text: 'Draft' },
};

const monthLong = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-KE', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

export function ManagementFeesView({
  data,
  feeKes,
  trialMonths,
}: {
  data: FeeData;
  feeKes: number;
  trialMonths: number;
}) {
  const k = data.kpis;
  const months = Array.from(new Set(data.invoices.map((i) => i.period.slice(0, 10))));
  return (
    <DashCard
      title="Management Fees"
      aside={data.canRaise ? <RaiseFeeInvoicesButton months={data.months} /> : undefined}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Invoiced', kesFull(asNumber(k.invoiced_kes)), `${n(asNumber(k.invoices))} invoices`],
          [
            'Collected',
            kesFull(asNumber(k.collected_kes)),
            `${kesFull(asNumber(k.deducted_kes))} from payouts · ${kesFull(asNumber(k.mpesa_kes))} M-Pesa`,
          ],
          ['Being taken', kesFull(asNumber(k.pending_kes)), 'in payout runs not yet approved'],
          ['Outstanding', kesFull(asNumber(k.outstanding_kes)), `${n(asNumber(k.paid))} paid`],
        ].map(([t, v, sub]) => (
          <div key={t} className="rounded-xl bg-[#FFFBF0] p-3">
            <p className="text-muted text-[0.75rem] font-semibold">{t}</p>
            <p className="mt-1 text-[1rem] font-extrabold tabular-nums">{v}</p>
            <p className="text-muted text-[0.75rem]">{sub}</p>
          </div>
        ))}
      </div>

      {months.length === 0 ? (
        <div className="mt-4">
          <DataTable
            caption="Management fee invoices"
            isEmpty
            empty="No management fee invoice for the months in this period."
            head={['Invoice']}
          >
            {null}
          </DataTable>
        </div>
      ) : (
        months.map((m) => {
          const rows = data.invoices.filter((i) => i.period.slice(0, 10) === m);
          return (
            <section key={m} className="mt-5">
              <h3 className="mb-2 text-[0.9375rem] font-extrabold">{monthLong(m)}</h3>
              <DataTable
                caption={`Management fee invoices for ${monthLong(m)}`}
                isEmpty={rows.length === 0}
                empty=""
                head={[
                  'Invoice',
                  'Host',
                  'Properties',
                  'Fee',
                  'From payouts',
                  'M-Pesa',
                  'Outstanding',
                  'Status',
                  'Due',
                  '',
                ]}
              >
                {rows.map((r) => {
                  const st = STATUS[r.status] ?? { chip: r.status, text: r.status };
                  return (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap font-semibold">{r.number}</td>
                      <td>
                        <PersonCell
                          name={r.host_name ?? '—'}
                          sub={
                            r.subaccount
                              ? 'Paid by Paystack sub-account · pays by M-Pesa'
                              : 'Taken from payouts'
                          }
                        />
                      </td>
                      <td
                        className="text-center tabular-nums"
                        title={(r.lines ?? []).map((l) => l.label).join(', ')}
                      >
                        {n(r.properties)}
                      </td>
                      <td className="whitespace-nowrap tabular-nums">{kesFull(r.total_kes)}</td>
                      <td className="whitespace-nowrap tabular-nums">
                        {kesFull(r.deducted_kes)}
                        {r.pending_kes > 0 && (
                          <span className="text-muted block text-[0.75rem]">
                            + {kesFull(r.pending_kes)} in a run awaiting approval
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap tabular-nums">{kesFull(r.mpesa_kes)}</td>
                      <td className="whitespace-nowrap font-bold tabular-nums">
                        {kesFull(r.outstanding_kes)}
                      </td>
                      <td>
                        <Chip status={st.chip} text={st.text} />
                      </td>
                      <td className="whitespace-nowrap">
                        {r.status === 'paid' ? `Paid ${shortDate(r.paid_at)}` : shortDate(r.due_at)}
                      </td>
                      <td>
                        {data.canRecord &&
                          r.status !== 'paid' &&
                          r.status !== 'credited' &&
                          r.outstanding_kes - r.pending_kes > 0 && (
                            <RecordFeePaymentButton
                              invoiceId={r.id}
                              number={r.number}
                              hostName={r.host_name ?? 'The host'}
                              outstandingKes={r.outstanding_kes - r.pending_kes}
                            />
                          )}
                      </td>
                    </tr>
                  );
                })}
              </DataTable>
            </section>
          );
        })
      )}
      <Footnote>
        {kesFull(feeKes)} per approved, listed property per month, once its {n(trialMonths)}-month
        free trial has ended (the month the trial ends in is free). Invoices are raised on the 1st
        for the month before. Each weekly payout run takes what is still owed from the host&rsquo;s
        payout, never below zero; it is booked when the run is approved, and the rest stays due.
        Hosts paid by a Paystack sub-account have no payout to take it from: they are asked to pay
        by M-Pesa, and Finance records the payment here.
      </Footnote>
    </DashCard>
  );
}
