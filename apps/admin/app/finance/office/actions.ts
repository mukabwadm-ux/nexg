'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

/**
 * Office finance writes. The rules (full Finance only, a second person
 * approves, nothing paid before approval, paid is final) and the audit
 * entries live in the rpc_office_* functions.
 */

export interface Outcome {
  ok: boolean;
  message?: string;
  id?: string;
}

function done(error: { message: string } | null, message?: string, id?: string): Outcome {
  if (error) return { ok: false, message: error.message };
  return { ok: true, message, id };
}

function refresh() {
  revalidatePath('/finance/office');
  revalidatePath('/transactions');
}

export interface ExpenseInput {
  id?: string | null;
  spentOn: string;
  description: string;
  category: string;
  amountCents: number;
  payee: string;
  vendorId: string | null;
  locationId: string | null;
  notes: string;
  receiptPath: string | null;
}

export async function saveExpense(input: ExpenseInput): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_office_expense_save', {
    p_spent_on: input.spentOn,
    p_description: input.description,
    p_category: input.category,
    p_amount_cents: input.amountCents,
    p_payee: input.payee,
    p_vendor_id: input.vendorId ?? undefined,
    p_location_id: input.locationId ?? undefined,
    p_notes: input.notes || undefined,
    p_receipt_path: input.receiptPath ?? undefined,
    p_id: input.id ?? undefined,
  });
  refresh();
  return done(
    error,
    input.id ? 'Expense updated' : 'Expense recorded for approval',
    data ?? undefined,
  );
}

export async function decideExpense(id: string, approve: boolean, note: string): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_office_expense_decide', {
    p_id: id,
    p_approve: approve,
    p_note: note || undefined,
  });
  refresh();
  return done(error, approve ? 'Approved' : 'Turned down');
}

export async function payExpense(input: {
  id: string;
  method: string;
  reference: string;
  paidOn: string | null;
}): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_office_expense_pay', {
    p_id: input.id,
    p_method: input.method,
    p_reference: input.reference || undefined,
    p_paid_on: input.paidOn ?? undefined,
  });
  refresh();
  return done(error, 'Marked paid');
}

export async function cancelExpense(id: string, reason: string): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_office_expense_cancel', {
    p_id: id,
    p_reason: reason,
  });
  refresh();
  return done(error, 'Expense cancelled');
}

export async function setBudget(
  month: string,
  category: string,
  amountCents: number,
): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_office_budget_set', {
    p_month: month,
    p_category: category,
    p_amount_cents: amountCents,
  });
  refresh();
  return done(error, 'Budget saved');
}

/** A receipt link that lasts a minute, signed only for people who reach Finance. */
export async function receiptLink(path: string): Promise<Outcome & { url?: string }> {
  const { data, error } = await createClient()
    .storage.from('office-receipts')
    .createSignedUrl(path, 60);
  if (error || !data)
    return { ok: false, message: error?.message ?? 'The receipt could not be opened.' };
  return { ok: true, url: data.signedUrl };
}
