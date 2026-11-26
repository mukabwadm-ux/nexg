'use server';

import { revalidatePath } from 'next/cache';

import { requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

/*
 * The Management Fees tab's buttons, through the RPCs in
 * 20270332000600_stays_management_fees.sql. The database checks who may raise
 * (Finance or hospitality) and who may record a payment (Finance), and audits
 * both; nothing here writes a table.
 */

export interface FeeOutcome {
  ok: boolean;
  message?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

type Untyped = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

async function call(fn: string, args: Record<string, unknown>): Promise<FeeOutcome> {
  const staff = await requireStaff();
  if (!staff.modules.some((m) => m.key === 'hotels' || m.key === 'finance')) {
    return { ok: false, message: 'Management fees are for hospitality or Finance staff.' };
  }
  const db = createClient() as unknown as Untyped;
  const { data, error } = await db.rpc(fn, args);
  if (error) return { ok: false, message: error.message };
  revalidatePath('/stays', 'layout');
  const message = (data as { message?: unknown } | null)?.message;
  return { ok: true, message: typeof message === 'string' ? message : 'Saved.' };
}

/** Raise every host's management fee invoice for a month that has ended. */
export async function raiseFeeInvoices(month: string): Promise<FeeOutcome> {
  if (!DAY.test(month)) return { ok: false, message: 'Pick a month.' };
  return call('rpc_console_stays_fee_raise', { p_month: month });
}

/** Finance records a host's M-Pesa payment against a fee invoice. */
export async function recordFeePayment(input: {
  invoiceId: string;
  amount: string;
  reference: string;
  paidOn: string;
}): Promise<FeeOutcome> {
  if (!UUID.test(input.invoiceId)) return { ok: false, message: 'The invoice is invalid.' };
  const amount = Number(input.amount.replace(/[,\s]/g, ''));
  if (!Number.isFinite(amount) || amount <= 0)
    return { ok: false, message: 'Type the amount the host paid, in shillings.' };
  if (!input.reference.trim()) return { ok: false, message: 'Type the M-Pesa transaction code.' };
  if (input.paidOn && !DAY.test(input.paidOn))
    return { ok: false, message: 'Pick the day it was paid.' };
  return call('rpc_console_stays_fee_payment', {
    p_invoice_id: input.invoiceId,
    p_amount_kes: amount,
    p_reference: input.reference.trim(),
    p_paid_on: input.paidOn || null,
  });
}
