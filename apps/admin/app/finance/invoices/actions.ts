'use server';

import { revalidatePath } from 'next/cache';

import { ensureInvoicePdf, invoiceDetail, invoicePdfBytes } from '@/lib/client-invoice-pdf';
import { billToOf, emailList, money, type VatRate } from '@/lib/client-invoices';
import { sendFinanceEmail } from '@/lib/email';
import { createClient } from '@/lib/supabase/server';

/**
 * Client invoice writes. The rules (full Finance only, amounts worked out
 * in the database, an issued invoice never changes, no payment beyond what
 * is owed, no void once money has come in) and the audit entries live in
 * the rpc_fin_* functions; these pass the form through and say how it went.
 */

export interface Outcome {
  ok: boolean;
  message?: string;
  id?: string;
}

function refresh() {
  revalidatePath('/finance/invoices');
  revalidatePath('/finance/reports');
}

/* ─────────────────────────────────────────────────────────────── clients */

export interface ClientInput {
  id?: string | null;
  kind: 'corporate' | 'partner';
  legalName: string;
  tradingName: string;
  kraPin: string;
  email: string;
  ccEmails: string;
  phone: string;
  address: string;
  paymentTermsDays: number;
  active?: boolean;
}

export async function saveClient(input: ClientInput): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_fin_client_save', {
    p_id: input.id ?? undefined,
    p_client: {
      kind: input.kind,
      legal_name: input.legalName,
      trading_name: input.tradingName,
      kra_pin: input.kraPin,
      email: input.email,
      cc_emails: input.ccEmails,
      phone: input.phone,
      address: input.address,
      payment_terms_days: input.paymentTermsDays,
      active: input.active ?? true,
    },
  });
  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true, message: input.id ? 'Client updated' : 'Client added', id: data as string };
}

/* ──────────────────────────────────────────────────────────────── drafts */

export interface InvoiceInput {
  id: string | null;
  /** Made when the form opens: a second press of Save finds the first draft. */
  clientRef: string;
  clientId: string;
  issueDate: string;
  dueDate: string;
  notes: string;
  lines: {
    description: string;
    quantity: number;
    unitPriceCents: number;
    vatRate: VatRate;
    revenueAccount: string;
  }[];
}

async function save(input: InvoiceInput) {
  return createClient().rpc('rpc_fin_invoice_save', {
    p_id: input.id ?? undefined,
    p_client_ref: input.clientRef,
    p_invoice: {
      client_id: input.clientId,
      issue_date: input.issueDate,
      due_date: input.dueDate || null,
      notes: input.notes,
      lines: input.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unit_price_cents: l.unitPriceCents,
        vat_rate: l.vatRate,
        revenue_account: l.revenueAccount,
      })),
    },
  });
}

export async function saveInvoiceDraft(input: InvoiceInput): Promise<Outcome> {
  const { data, error } = await save(input);
  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true, message: 'Draft saved', id: data as string };
}

export interface IssueOutcome extends Outcome {
  number?: string;
  /** Set when the invoice was issued but its PDF could not be made yet. */
  pdfProblem?: string;
}

async function issue(id: string): Promise<IssueOutcome> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('rpc_fin_invoice_issue', { p_id: id });
  if (error) return { ok: false, message: error.message, id };
  const number = (data as unknown as { number: string }).number;

  /* Issued is issued: a PDF that fails now is made again from the panel. */
  const { detail, error: readError } = await invoiceDetail(supabase, id);
  const pdf = detail
    ? await ensureInvoicePdf(supabase, detail)
    : { ok: false as const, message: readError ?? 'The invoice could not be read back.' };
  refresh();
  return {
    ok: true,
    id,
    number,
    message: `Invoice ${number} issued`,
    ...(pdf.ok ? {} : { pdfProblem: pdf.message }),
  };
}

/** Saves the form and issues it, from the Create Invoice panel. */
export async function saveAndIssueInvoice(input: InvoiceInput): Promise<IssueOutcome> {
  const { data, error } = await save(input);
  if (error) return { ok: false, message: error.message };
  return issue(data as string);
}

export async function issueInvoice(id: string): Promise<IssueOutcome> {
  return issue(id);
}

/* ─────────────────────────────────────────────────────── money and KRA */

export async function recordInvoicePayment(input: {
  id: string;
  amountCents: number;
  method: 'bank' | 'mpesa';
  reference: string;
  paidOn: string;
}): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_fin_invoice_record_payment', {
    p_id: input.id,
    p_amount_cents: input.amountCents,
    p_method: input.method,
    p_reference: input.reference,
    p_paid_on: input.paidOn || undefined,
  });
  if (error) return { ok: false, message: error.message };
  refresh();
  const r = data as unknown as { status: string; balance_cents: number };
  return {
    ok: true,
    id: input.id,
    message:
      r.status === 'paid'
        ? 'Payment recorded. The invoice is paid in full.'
        : `Payment recorded. KES ${money(Number(r.balance_cents))} still owed.`,
  };
}

export async function voidInvoice(id: string, reason: string): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_fin_invoice_void', {
    p_id: id,
    p_reason: reason,
  });
  if (error) return { ok: false, message: error.message };
  refresh();
  const r = data as unknown as { credit_note_number: string };
  return { ok: true, id, message: `Invoice voided. Credit note ${r.credit_note_number} issued.` };
}

export async function recordKraReference(input: {
  taxInvoiceId: string;
  status: string;
  reference: string;
  note: string;
}): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_tax_set_kra_status', {
    p_invoice_id: input.taxInvoiceId,
    p_status: input.status,
    p_reference: input.reference || undefined,
    p_note: input.note || undefined,
  });
  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true, message: 'KRA status saved' };
}

/* ─────────────────────────────────────────────────────── PDF and email */

/** Makes the PDF of an issued invoice that has none yet (an earlier attempt failed). */
export async function makeInvoicePdf(id: string): Promise<Outcome> {
  const supabase = createClient();
  const { detail, error } = await invoiceDetail(supabase, id);
  if (!detail) return { ok: false, message: error ?? 'That invoice is not on file.' };
  const pdf = await ensureInvoicePdf(supabase, detail);
  if (!pdf.ok) return { ok: false, message: pdf.message };
  refresh();
  return { ok: true, id, message: 'PDF ready' };
}

export interface SendOutcome extends Outcome {
  /** "skipped" when email is not set up: nothing was sent. */
  email?: 'sent' | 'skipped' | 'failed';
}

export async function sendInvoice(input: {
  id: string;
  to: string;
  cc: string;
  message: string;
}): Promise<SendOutcome> {
  const to = emailList(input.to);
  const cc = emailList(input.cc);
  if (to.ok.length === 0) return { ok: false, message: 'Enter the address to send it to.' };
  const bad = [...to.bad, ...cc.bad];
  if (bad.length) return { ok: false, message: `${bad[0]} is not a valid email address.` };
  if (to.ok.length + cc.ok.length > 10) {
    return { ok: false, message: 'Send it to ten addresses at most.' };
  }
  if (!process.env.RESEND_API_KEY) {
    return {
      ok: false,
      email: 'skipped',
      message: 'Email is not set up for the console yet, so nothing was sent.',
    };
  }

  const supabase = createClient();
  const { detail, error } = await invoiceDetail(supabase, input.id);
  if (!detail) return { ok: false, message: error ?? 'That invoice is not on file.' };
  const inv = detail.invoice;
  if (!inv.number || inv.status === 'draft') {
    return { ok: false, message: 'Issue the invoice before sending it.' };
  }
  if (inv.status === 'void') return { ok: false, message: 'A void invoice is not sent.' };

  const pdf = await ensureInvoicePdf(supabase, detail);
  if (!pdf.ok) return { ok: false, message: pdf.message };
  const bytes = await invoicePdfBytes(supabase, pdf.path);
  if (!bytes) return { ok: false, message: 'The PDF could not be read from storage.' };

  const bill = billToOf(detail);
  const name = bill.trading_name || bill.legal_name;
  const due = new Date(`${inv.due_date}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const note = input.message.trim();
  const text = `Dear ${name},

Please find attached our invoice ${inv.number} for KES ${money(inv.gross_cents)}${
    inv.status === 'paid' ? ', which is paid in full. Thank you.' : `, due on ${due}.`
  }
${note ? `\n${note}\n` : ''}
Please quote ${inv.number} with your payment. If anything on it is not right, reply to this email.

NexG Finance
NexGenius Concierge Limited
`;

  const sent = await sendFinanceEmail({
    to: to.ok,
    cc: cc.ok,
    subject: `Invoice ${inv.number} from NexG`,
    text,
    attachments: [{ filename: `NexG-Invoice-${inv.number}.pdf`, content: bytes }],
  });
  if (sent.status === 'skipped') {
    return { ok: false, email: 'skipped', message: sent.error ?? 'Email is not set up.' };
  }
  if (sent.status === 'failed') {
    return { ok: false, email: 'failed', message: `The email was not sent: ${sent.error ?? ''}` };
  }

  const { error: markError } = await supabase.rpc('rpc_fin_invoice_mark_sent', {
    p_id: input.id,
    p_to: [...to.ok, ...cc.ok].join(', '),
  });
  refresh();
  return {
    ok: true,
    email: 'sent',
    id: input.id,
    message: markError
      ? `Sent, but not marked as sent: ${markError.message}`
      : `Invoice sent to ${to.ok.join(', ')}`,
  };
}

/** Records that the invoice went out another way (from someone's own mailbox). */
export async function markInvoiceSent(id: string, to: string): Promise<Outcome> {
  const list = emailList(to);
  if (list.ok.length === 0) return { ok: false, message: 'Enter who it was sent to.' };
  const { error } = await createClient().rpc('rpc_fin_invoice_mark_sent', {
    p_id: id,
    p_to: list.ok.join(', '),
  });
  if (error) return { ok: false, message: error.message };
  refresh();
  return { ok: true, id, message: 'Recorded as sent' };
}
