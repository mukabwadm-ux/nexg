import 'server-only';

import type { Movement, MovementSum } from './finance';
import type { createClient } from './supabase/server';

type Client = ReturnType<typeof createClient>;

/**
 * The Finance readers, typed. They are security definer functions that
 * check Finance access themselves and return JSON, so a long period is
 * never cut at the API's row limit.
 */

export async function movementSummary(
  supabase: Client,
  from: string,
  to: string,
): Promise<{ rows: MovementSum[]; error: string | null }> {
  const { data, error } = await supabase.rpc('rpc_finance_transaction_summary', {
    p_from: from,
    p_to: to,
  });
  return {
    rows: ((data as unknown as MovementSum[] | null) ?? []).map((r) => ({
      ...r,
      n: Number(r.n),
      cents: Number(r.cents),
    })),
    error: error?.message ?? null,
  };
}

export async function movementList(
  supabase: Client,
  from: string,
  to: string,
  kind: string | null,
  limit = 2000,
): Promise<{ rows: Movement[]; truncated: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc('rpc_finance_transactions', {
    p_from: from,
    p_to: to,
    p_kind: kind ?? undefined,
    p_limit: limit,
  });
  const rows = ((data as unknown as Movement[] | null) ?? []).map((r) => ({
    ...r,
    amount_cents: Number(r.amount_cents),
  }));
  return { rows, truncated: rows.length >= limit, error: error?.message ?? null };
}

export interface InvoiceItem {
  party_kind: 'host' | 'hotel' | 'merchant' | 'client';
  id: string;
  number: string;
  party_id: string;
  party_name: string | null;
  period: string;
  total_cents: number;
  status: string;
  issued_at: string;
  due_at: string | null;
  paid_at: string | null;
  provider_ref: string | null;
  /** Client invoices only (they take part payments); null for the rest. */
  balance_cents: number | null;
}

export async function invoiceList(
  supabase: Client,
  from: string,
  to: string,
): Promise<{ rows: InvoiceItem[]; error: string | null }> {
  const { data, error } = await supabase.rpc('rpc_finance_invoices', { p_from: from, p_to: to });
  return {
    rows: ((data as unknown as InvoiceItem[] | null) ?? []).map((r) => ({
      ...r,
      total_cents: Number(r.total_cents),
      balance_cents: r.balance_cents == null ? null : Number(r.balance_cents),
    })),
    error: error?.message ?? null,
  };
}
