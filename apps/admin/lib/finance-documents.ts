import 'server-only';

import { createHash } from 'node:crypto';

import type { Database } from '@nexg/db';
import {
  documentCompany,
  renderReceipt,
  renderReport,
  renderSettlement,
  type DocumentCompany,
  type IconName,
  type RenderedDocument,
  type ReportLine,
} from '@nexg/merchant-agreement/documents';
import type { SupabaseClient } from '@supabase/supabase-js';

import { invoiceDetail } from './client-invoice-pdf';
import { movementSummary } from './finance-server';

/**
 * The branded finance documents Finance prints from the console: payment
 * receipts (one per client invoice payment), settlement statements (one
 * per settlement line) and monthly financial reports. Each is drawn from
 * the records as they are now, with the reference the database gives it
 * the first time it is printed (rpc_fin_document_issue), so printing it
 * again gives the same number.
 *
 * Everything runs with the signed-in person's own session.
 */

type Client = SupabaseClient<Database>;

export type DocumentKind = 'receipt' | 'settlement' | 'report';

export type DocumentResult =
  | { ok: true; doc: RenderedDocument; filename: string }
  | { ok: false; status: number; message: string };

interface Issued {
  reference: string;
  check_code: string | null;
  issued_at: string;
  orders: number | null;
}

/** The first tax invoice check code: what fn_tax_invoice_check_code gives. */
export function taxInvoiceCheckCode(id: string): string {
  return createHash('sha256').update(id).digest('hex').slice(0, 12);
}

const nairobiDay = (iso: string | Date) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

/* The reference, or a stand-in until the document register is in this database. */
async function issue(
  client: Client,
  kind: DocumentKind,
  args: { subjectId?: string; month?: string },
): Promise<{ issued: Issued } | { error: string; status: number }> {
  const { data, error } = await client.rpc(
    'rpc_fin_document_issue' as never,
    {
      p_kind: kind,
      p_subject_id: args.subjectId ?? null,
      p_month: args.month ? `${args.month}-01` : null,
    } as never,
  );
  if (error) {
    const missing = /could not find the function|does not exist|schema cache/i.test(error.message);
    if (missing) {
      return {
        issued: {
          reference: 'NOT-YET-NUMBERED',
          check_code: null,
          issued_at: new Date().toISOString(),
          orders: null,
        },
      };
    }
    const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 400;
    return { error: error.message, status };
  }
  return { issued: data as unknown as Issued };
}

async function company(client: Client): Promise<DocumentCompany> {
  const { data } = await client.rpc('rpc_fin_letterhead');
  const phone = (data as { phone?: string | null } | null)?.phone ?? null;
  return documentCompany(phone);
}

/* ----------------------------------------------------------------- receipt */

export async function receiptPdf(
  client: Client,
  invoiceId: string,
  paymentId: string,
): Promise<DocumentResult> {
  const { detail, error } = await invoiceDetail(client, invoiceId);
  if (!detail) return { ok: false, status: 404, message: error ?? 'That invoice is not on file.' };
  const payment = detail.payments.find((p) => p.id === paymentId);
  if (!payment) return { ok: false, status: 404, message: 'That payment is not on this invoice.' };

  const got = await issue(client, 'receipt', { subjectId: paymentId });
  if ('error' in got) return { ok: false, status: got.status, message: got.error };
  const { issued } = got;

  const inv = detail.invoice;
  /* What is still owed once this payment and the ones before it are in. */
  const ordered = [...detail.payments].sort(
    (a, b) => a.paid_on.localeCompare(b.paid_on) || a.recorded_at.localeCompare(b.recorded_at),
  );
  const upTo = ordered.slice(0, ordered.findIndex((p) => p.id === paymentId) + 1);
  const paid = upTo.reduce((s, p) => s + p.amount_cents, 0);
  /* The payment's VAT, in the invoice's own proportion. */
  const vat =
    inv.gross_cents > 0 ? Math.round((payment.amount_cents * inv.vat_cents) / inv.gross_cents) : 0;

  const doc = await renderReceipt({
    reference: issued.reference,
    checkCode: issued.check_code,
    issueDate: nairobiDay(issued.issued_at),
    receivedFrom: inv.bill_to?.legal_name ?? detail.client.legal_name,
    paidOn: payment.paid_on,
    method: payment.method,
    transactionId: payment.reference,
    invoiceNumber: inv.number ?? 'Draft',
    amountCents: payment.amount_cents,
    netCents: payment.amount_cents - vat,
    vatCents: vat,
    balanceCents: Math.max(0, inv.gross_cents - paid),
    company: await company(client),
    createdAt: new Date(issued.issued_at),
  });
  return { ok: true, doc, filename: `NexG-Receipt-${issued.reference}.pdf` };
}

/* -------------------------------------------------------------- settlement */

interface LineRow {
  id: string;
  run_id: string;
  run_reference: string | null;
  party_type: string;
  party_id: string | null;
  party_label: string | null;
  rail: string | null;
  gross_cents: number | null;
  commission_cents: number | null;
  adjustment_cents: number | null;
  net_cents: number | null;
  state: string | null;
  provider_ref: string | null;
  paid_at: string | null;
}

const RAILS: Record<string, string> = {
  mpesa_b2c: 'M-PESA',
  mpesa_b2b: 'M-PESA (Paybill / Till)',
  bank_eft: 'Bank transfer',
  credit_note: 'Credit note',
  invoice_credit: 'Credit against invoice',
};

const STATES: Record<string, string> = {
  ready: 'Ready to pay',
  cash_netted: 'Netted against cash held',
  held_suspended: 'On hold',
  held_kyc: 'On hold (KYC)',
  name_mismatch: 'On hold (name check)',
  below_minimum_rolled: 'Rolled to next period',
  mismatch: 'Under review',
  approved: 'Approved',
  queued: 'Queued for payment',
  sent: 'Sent for payment',
  paid: 'Paid',
  failed: 'Failed',
};

const human = (value: string) => value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** NexG's commission includes VAT at this rate; the statement shows the VAT apart. */
const COMMISSION_VAT_PCT = 16;

export async function settlementPdf(client: Client, lineId: string): Promise<DocumentResult> {
  const { data: line, error } = await client
    .from('fin_run_line_v')
    .select(
      'id, run_id, run_reference, party_type, party_id, party_label, rail, gross_cents, commission_cents, adjustment_cents, net_cents, state, provider_ref, paid_at',
    )
    .eq('id', lineId)
    .maybeSingle();
  if (error) return { ok: false, status: 400, message: error.message };
  const l = line as unknown as LineRow | null;
  if (!l) return { ok: false, status: 404, message: 'That settlement line is not on file.' };

  const { data: run } = await client
    .from('fin_run_v')
    .select('reference, period_start, period_end, pay_date')
    .eq('id', l.run_id)
    .maybeSingle();
  const r = run as {
    reference: string | null;
    period_start: string | null;
    period_end: string | null;
  } | null;

  const got = await issue(client, 'settlement', { subjectId: lineId });
  if ('error' in got) return { ok: false, status: got.status, message: got.error };
  const { issued } = got;

  const commission = Number(l.commission_cents ?? 0);
  const vat = Math.round((commission * COMMISSION_VAT_PCT) / (100 + COMMISSION_VAT_PCT));
  const prefix = l.party_type === 'merchant' ? 'MER' : l.party_type.slice(0, 3).toUpperCase();

  const doc = await renderSettlement({
    reference: issued.reference,
    checkCode: issued.check_code,
    issueDate: nairobiDay(issued.issued_at),
    partyType: l.party_type,
    partyName: l.party_label ?? 'Name not on file',
    partyCode: l.party_id ? `${prefix}-${l.party_id.slice(0, 8).toUpperCase()}` : '–',
    periodFrom: r?.period_start ?? nairobiDay(issued.issued_at),
    periodTo: r?.period_end ?? nairobiDay(issued.issued_at),
    grossCents: Number(l.gross_cents ?? 0),
    orders: issued.orders ?? null,
    commissionCents: commission,
    commissionVatCents: vat,
    adjustmentCents: Number(l.adjustment_cents ?? 0),
    netCents: Number(l.net_cents ?? 0),
    payoutMethod: l.rail ? (RAILS[l.rail] ?? human(l.rail)) : 'Not set',
    settlementReference: l.provider_ref ?? r?.reference ?? l.run_reference ?? '–',
    status: l.state ? (STATES[l.state] ?? human(l.state)) : '–',
    company: await company(client),
    createdAt: new Date(issued.issued_at),
  });
  return { ok: true, doc, filename: `NexG-Settlement-${issued.reference}.pdf` };
}

/* ------------------------------------------------------------------ report */

const LINE_ICONS: [RegExp, IconName][] = [
  [/commission|merchant|food|restaurant/i, 'utensils'],
  [/stay|host|hotel|booking/i, 'bed'],
  [/deliver|courier|ride|transport/i, 'car'],
  [/experience|ticket|event/i, 'ticket'],
  [/service|fee/i, 'percent'],
];

function iconFor(label: string): IconName {
  return LINE_ICONS.find(([re]) => re.test(label))?.[1] ?? 'grid';
}

function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export async function reportPdf(client: Client, month: string): Promise<DocumentResult> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    return { ok: false, status: 400, message: 'Give the month as YYYY-MM.' };
  const { from, to } = monthBounds(month);

  const [summary, fees, expenses] = await Promise.all([
    movementSummary(client, from, to),
    client
      .from('fin_fee_line_v')
      .select('account_name, account_code, amount_cents')
      .gte('day', from)
      .lte('day', to),
    client
      .from('fin_office_expense')
      .select('amount_cents, status')
      .gte('spent_on', from)
      .lte('spent_on', to)
      .in('status', ['approved', 'paid']),
  ]);
  const failed = summary.error ?? fees.error?.message ?? expenses.error?.message;
  if (failed) return { ok: false, status: 400, message: failed };

  const gtv = summary.rows
    .filter((r) => r.source === 'payment' && r.kind === 'customer' && r.status === 'successful')
    .reduce((s, r) => s + r.cents, 0);

  const bySource = new Map<string, number>();
  for (const f of (fees.data ?? []) as {
    account_name: string | null;
    account_code: string | null;
    amount_cents: number | null;
  }[]) {
    const label = f.account_name ?? f.account_code ?? 'Other';
    bySource.set(label, (bySource.get(label) ?? 0) + Number(f.amount_cents ?? 0));
  }
  const lines: ReportLine[] = [...bySource.entries()]
    .map(([label, cents]) => ({ label, cents, icon: iconFor(label) }))
    .sort((a, b) => b.cents - a.cents);
  const revenue = lines.reduce((s, l) => s + l.cents, 0);
  const spent = ((expenses.data ?? []) as { amount_cents: number }[]).reduce(
    (s, e) => s + Number(e.amount_cents),
    0,
  );

  const got = await issue(client, 'report', { month });
  if ('error' in got) return { ok: false, status: got.status, message: got.error };
  const { issued } = got;

  const doc = await renderReport({
    reference: issued.reference,
    month,
    issueDate: nairobiDay(issued.issued_at),
    gtvCents: gtv,
    revenueCents: revenue,
    expensesCents: spent,
    lines,
    company: await company(client),
    createdAt: new Date(issued.issued_at),
  });
  return { ok: true, doc, filename: `NexG-Financial-Report-${month}.pdf` };
}
