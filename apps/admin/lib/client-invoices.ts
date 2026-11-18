/**
 * Client invoices (Finance → Invoices → Create Invoice): the shapes the
 * readers return and the arithmetic the form previews.
 *
 * The database works every amount out again when a draft is saved
 * (rpc_fin_invoice_save) and never takes the browser's figures; the
 * functions here round the same way so the preview and the saved invoice
 * agree to the cent: a line's net is quantity times the unit price
 * (excluding VAT) rounded to the cent, and standard-rated VAT is the net
 * times the rate, rounded, per line.
 */

export type VatRate = 'standard' | 'zero' | 'exempt';

export const VAT_RATES: VatRate[] = ['standard', 'zero', 'exempt'];

export function vatRateLabel(rate: VatRate, pct: number): string {
  if (rate === 'zero') return '0%';
  if (rate === 'exempt') return 'Exempt';
  return `${Math.round(pct * 100) / 100}%`;
}

/** What a line is for, and the revenue account it is credited to. */
export const REVENUE_CATEGORIES: { value: string; label: string }[] = [
  { value: 'revenue.other_services', label: 'Other Services' },
  { value: 'revenue.concierge_fee', label: 'Concierge Fee' },
  { value: 'revenue.service_fee', label: 'Service Fee' },
  { value: 'revenue.delivery_fee', label: 'Delivery Fee' },
  { value: 'revenue.commission', label: 'Commission' },
  { value: 'revenue.featured', label: 'Featured Placement' },
  { value: 'revenue.packages', label: 'Welcome Packages' },
];

export function categoryLabel(account: string): string {
  return REVENUE_CATEGORIES.find((c) => c.value === account)?.label ?? account;
}

export const PAYMENT_METHODS: { value: 'bank' | 'mpesa'; label: string }[] = [
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'mpesa', label: 'M-PESA' },
];

export const KRA_STATUSES: { value: string; label: string }[] = [
  { value: 'submitted', label: 'Submitted to KRA' },
  { value: 'accepted', label: 'Accepted by KRA' },
  { value: 'rejected', label: 'Rejected by KRA' },
  { value: 'not_required', label: 'Not Required' },
];

/** Shillings typed in a form ("1,234.5") as cents; null when blank, NaN when not money. */
export function parseKes(value: string): number | null {
  const clean = value.replace(/[,\s]/g, '');
  if (!clean) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return Number.NaN;
  const [whole = '0', fraction = ''] = clean.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** A quantity typed in a form; NaN when it is not above zero with at most three decimals. */
export function parseQuantity(value: string): number {
  const clean = value.replace(/[,\s]/g, '');
  if (!/^\d+(\.\d{1,3})?$/.test(clean)) return Number.NaN;
  const n = Number(clean);
  return n > 0 ? n : Number.NaN;
}

/** One line's net, VAT and total in cents, rounded as the database rounds them. */
export function lineAmounts(
  quantity: number,
  unitPriceCents: number,
  rate: VatRate,
  pct: number,
): { net: number; vat: number; gross: number } {
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPriceCents)) {
    return { net: 0, vat: 0, gross: 0 };
  }
  const net = Math.round((Math.round(quantity * 1000) * unitPriceCents) / 1000);
  const vat = rate === 'standard' ? Math.round((net * pct) / 100) : 0;
  return { net, vat, gross: net + vat };
}

export function invoiceTotals(lines: { net: number; vat: number }[]): {
  net: number;
  vat: number;
  gross: number;
} {
  const net = lines.reduce((s, l) => s + l.net, 0);
  const vat = lines.reduce((s, l) => s + l.vat, 0);
  return { net, vat, gross: net + vat };
}

/** "17,248.15" from 1724815: invoices are exact to the cent, unlike the KES summaries. */
export function money(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return '—';
  const abs = Math.abs(Math.round(cents));
  const whole = Math.trunc(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${cents < 0 ? '-' : ''}${whole}.${String(abs % 100).padStart(2, '0')}`;
}

/** A calendar day plus some days, as YYYY-MM-DD. */
export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** Addresses typed in one box, separated by commas, semicolons or spaces. */
export function emailList(value: string): { ok: string[]; bad: string[] } {
  const all = value
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const unique = [...new Set(all)];
  return { ok: unique.filter((e) => EMAIL.test(e)), bad: unique.filter((e) => !EMAIL.test(e)) };
}

/* ─────────────────────────────────────────────────────── what the readers return */

export interface FinClient {
  id: string;
  kind: 'corporate' | 'partner';
  legal_name: string;
  trading_name: string | null;
  kra_pin: string | null;
  email: string | null;
  cc_emails: string[];
  phone: string | null;
  address: string | null;
  payment_terms_days: number;
  active: boolean;
  linked_name?: string | null;
  invoices?: number;
  open_cents?: number;
}

export interface BillTo {
  kind: string;
  legal_name: string;
  trading_name: string | null;
  kra_pin: string | null;
  email: string | null;
  cc_emails: string[] | null;
  phone: string | null;
  address: string | null;
}

export interface InvoiceLine {
  id: string;
  sort: number;
  description: string;
  quantity: number;
  unit_price_cents: number;
  vat_rate: VatRate;
  vat_pct: number;
  net_cents: number;
  vat_cents: number;
  gross_cents: number;
  revenue_account: string;
}

export interface InvoicePayment {
  id: string;
  amount_cents: number;
  method: 'bank' | 'mpesa';
  reference: string;
  paid_on: string;
  recorded_at: string;
  recorded_by_name: string | null;
}

export interface TaxDocument {
  id: string;
  number: string;
  kra_status: string;
  kra_reference: string | null;
  issued_at: string;
}

export interface ClientInvoiceDetail {
  invoice: {
    id: string;
    client_id: string;
    number: string | null;
    status: 'draft' | 'issued' | 'paid' | 'void';
    issue_date: string;
    due_date: string;
    net_cents: number;
    vat_cents: number;
    gross_cents: number;
    notes: string | null;
    bill_to: BillTo | null;
    pdf_path: string | null;
    sent_at: string | null;
    sent_to: string | null;
    paid_at: string | null;
    created_at: string;
    issued_at: string | null;
    voided_at: string | null;
    void_reason: string | null;
    updated_at: string;
    created_by_name: string | null;
    issued_by_name: string | null;
    voided_by_name: string | null;
  };
  client: FinClient;
  lines: InvoiceLine[];
  payments: InvoicePayment[];
  paid_cents: number;
  balance_cents: number;
  tax_invoice: TaxDocument | null;
  credit_note: TaxDocument | null;
}

/** JSON numbers can arrive as strings (bigint, numeric): make them numbers once. */
export function normaliseDetail(d: ClientInvoiceDetail): ClientInvoiceDetail {
  const n = (v: unknown) => Number(v ?? 0);
  return {
    ...d,
    invoice: {
      ...d.invoice,
      net_cents: n(d.invoice.net_cents),
      vat_cents: n(d.invoice.vat_cents),
      gross_cents: n(d.invoice.gross_cents),
    },
    lines: (d.lines ?? []).map((l) => ({
      ...l,
      quantity: n(l.quantity),
      unit_price_cents: n(l.unit_price_cents),
      vat_pct: n(l.vat_pct),
      net_cents: n(l.net_cents),
      vat_cents: n(l.vat_cents),
      gross_cents: n(l.gross_cents),
    })),
    payments: (d.payments ?? []).map((p) => ({ ...p, amount_cents: n(p.amount_cents) })),
    paid_cents: n(d.paid_cents),
    balance_cents: n(d.balance_cents),
  };
}

/** Who the invoice is to, as printed once issued, or as the client stands for a draft. */
export function billToOf(d: ClientInvoiceDetail): BillTo {
  return (
    d.invoice.bill_to ?? {
      kind: d.client.kind,
      legal_name: d.client.legal_name,
      trading_name: d.client.trading_name,
      kra_pin: d.client.kra_pin,
      email: d.client.email,
      cc_emails: d.client.cc_emails,
      phone: d.client.phone,
      address: d.client.address,
    }
  );
}
