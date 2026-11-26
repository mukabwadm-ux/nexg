'use client';

import { Banknote, FilePlus2 } from 'lucide-react';
import * as React from 'react';

import { raiseFeeInvoices, recordFeePayment } from '@/app/stays/finance/fee-actions';
import {
  FieldRow,
  FormPanel,
  SelectField,
  TextField,
  useRunner,
} from '@/components/portal/client-kit';

const outlined =
  'focus-visible:ring-gold inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#F5D27A] bg-[#FFFBF0] px-3 text-[0.875rem] font-bold text-[#8A5C00] transition-colors hover:bg-[#FFF4D6] focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50';

const monthName = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-KE', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** "Raise invoices for <month>": every host's fee invoice for a month that has ended. */
export function RaiseFeeInvoicesButton({ months }: { months: string[] }) {
  const { run, busy } = useRunner();
  const [open, setOpen] = React.useState(false);
  const [month, setMonth] = React.useState(months[0] ?? '');
  return (
    <>
      <button
        type="button"
        className={outlined}
        onClick={() => setOpen(true)}
        disabled={months.length === 0}
      >
        <FilePlus2 aria-hidden="true" className="h-4 w-4" />
        Raise invoices
      </button>
      <FormPanel
        open={open}
        onOpenChange={setOpen}
        title={month ? `Raise invoices for ${monthName(month)}` : 'Raise invoices'}
        subtitle="One invoice per host, one line per approved, listed property past its free trial for the whole month. Hosts already invoiced for the month are left as they are, and each new invoice is emailed to the host. The monthly job does this on the 1st by itself."
        submitLabel="Raise invoices"
        busy={busy}
        onSubmit={() => run(() => raiseFeeInvoices(month))}
      >
        <SelectField
          label="Month"
          required
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          options={months.map((m) => ({ value: m, label: monthName(m) }))}
        />
      </FormPanel>
    </>
  );
}

/** Finance records a host's M-Pesa payment against one invoice. */
export function RecordFeePaymentButton({
  invoiceId,
  number,
  hostName,
  outstandingKes,
}: {
  invoiceId: string;
  number: string;
  hostName: string;
  outstandingKes: number;
}) {
  const { run, busy } = useRunner();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    amount: String(outstandingKes),
    reference: '',
    paidOn: '',
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <>
      <button type="button" className={outlined} onClick={() => setOpen(true)}>
        <Banknote aria-hidden="true" className="h-4 w-4" />
        Record payment
      </button>
      <FormPanel
        open={open}
        onOpenChange={setOpen}
        title={`Record payment · ${number}`}
        subtitle={`${hostName} paid by M-Pesa. The invoice is marked paid once the whole fee is covered, and the host gets a receipt.`}
        submitLabel="Record payment"
        busy={busy}
        onSubmit={() =>
          run(() =>
            recordFeePayment({
              invoiceId,
              amount: form.amount,
              reference: form.reference,
              paidOn: form.paidOn,
            }),
          )
        }
      >
        <FieldRow>
          <TextField
            label="Amount (KES)"
            required
            inputMode="decimal"
            value={form.amount}
            onChange={set('amount')}
          />
          <TextField label="Paid on" type="date" value={form.paidOn} onChange={set('paidOn')} />
        </FieldRow>
        <TextField
          label="M-Pesa transaction code"
          required
          hint="As on the M-Pesa message, for example QK12ABC345."
          value={form.reference}
          onChange={set('reference')}
          maxLength={20}
          autoCapitalize="characters"
        />
      </FormPanel>
    </>
  );
}
