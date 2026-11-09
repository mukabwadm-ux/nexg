/**
 * Receipts: proof that money moved, issued by the database when it moves
 * (supabase/migrations/20261125000100_receipts.sql). Row-level security
 * returns only the receipts that belong to the signed-in person, their
 * merchant, their rider record or their host account.
 */

export type ReceiptParty = 'guest' | 'merchant' | 'rider' | 'host';

export interface ReceiptLine {
  label: string;
  amount_cents: number;
}

export interface Receipt {
  id: string;
  number: string;
  kind: 'payment' | 'payout' | 'refund' | 'deposit' | 'earnings';
  party_type: ReceiptParty;
  party_id: string;
  title: string;
  lines: ReceiptLine[];
  total_cents: number;
  currency: string;
  method: string | null;
  method_ref: string | null;
  issued_at: string;
}

export const RECEIPT_COLUMNS =
  'id, number, kind, party_type, party_id, title, lines, total_cents, currency, method, method_ref, issued_at';

/** What each kind means to the person reading it. */
export const RECEIPT_KIND_LABEL: Record<Receipt['kind'], string> = {
  payment: 'Payment',
  payout: 'Payout',
  refund: 'Refund',
  deposit: 'Deposit',
  earnings: 'Earnings',
};

export function receiptAmount(cents: number, currency = 'KES') {
  const value = cents / 100;
  return `${currency} ${value.toLocaleString('en-KE', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function receiptDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Nairobi',
  });
}

export function receiptDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Nairobi',
  });
}

/** The receipts table returns jsonb lines; keep only well-formed ones. */
export function toReceipts(rows: unknown): Receipt[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const r = row as Receipt & { lines: unknown };
    const lines = Array.isArray(r.lines)
      ? (r.lines as ReceiptLine[]).filter(
          (line) => typeof line?.label === 'string' && Number.isFinite(Number(line.amount_cents)),
        )
      : [];
    return { ...r, total_cents: Number(r.total_cents), lines };
  });
}
