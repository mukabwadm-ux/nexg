'use server';

import { revalidatePath } from 'next/cache';

import { fetchSubaccount, payoutMode } from '@/lib/paystack';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

/*
 * A merchant paid by Paystack directly (a sub-account). The console looks the
 * code up in Paystack itself, so what Finance sees about the account comes
 * from Paystack, not from what was typed; the RPCs hold the rules (Finance
 * only, a second person switches it on) and write the audit entry.
 */

export interface SubaccountResult {
  ok: boolean;
  message: string;
}

type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^ACCT_[A-Za-z0-9]{4,60}$/;
const SCHEDULES = ['auto', 'weekly', 'monthly', 'manual'] as const;
type Schedule = (typeof SCHEDULES)[number];

const refusal = (message: string) => message.replace(/^.*?:\s*/, '').slice(0, 300);

function client() {
  return createClient() as unknown as { rpc: Rpc };
}

function done(merchantId: string, message: string): SubaccountResult {
  revalidatePath(`/merchants/${merchantId}`);
  return { ok: true, message };
}

interface PaystackSubaccount {
  subaccount_code?: string;
  business_name?: string;
  settlement_bank?: string;
  account_number?: string;
  settlement_schedule?: string;
  active?: boolean;
  currency?: string;
}

/** The sub-account as Paystack describes it, in the console's Paystack mode. */
async function lookUp(
  code: string,
): Promise<
  | { ok: true; details: Record<string, unknown> & { test: boolean } }
  | { ok: false; message: string }
> {
  const mode = payoutMode();
  if (!mode) return { ok: false, message: 'Paystack is unavailable at the moment.' };
  const looked = await fetchSubaccount(mode, code);
  if (!looked.answered || !looked.raw) return { ok: false, message: looked.message };
  let found: PaystackSubaccount | undefined;
  try {
    const body = JSON.parse(looked.raw) as { status?: boolean; data?: PaystackSubaccount };
    found = body.status === true ? body.data : undefined;
  } catch {
    found = undefined;
  }
  if (!found || found.subaccount_code !== code) {
    return {
      ok: false,
      message: `Paystack does not know ${code} in ${mode} mode: ${looked.message}`,
    };
  }
  const account = found.account_number ?? '';
  return {
    ok: true,
    details: {
      subaccount_code: code,
      test: mode === 'test',
      business_name: found.business_name ?? null,
      settlement_bank: found.settlement_bank ?? null,
      account_last4: account ? account.slice(-4) : null,
      paystack_schedule: found.settlement_schedule ?? null,
      active: found.active ?? null,
      currency: found.currency ?? null,
      looked_up_at: new Date().toISOString(),
    },
  };
}

/** Records a merchant's sub-account, looked up in Paystack first. */
export async function requestSubaccount(
  merchantId: string,
  input: { code: string; schedule: string; note: string },
): Promise<SubaccountResult> {
  const staff = await requireStaff();
  requireModule(staff, 'finance');
  const code = input.code.trim();
  if (!UUID.test(merchantId)) return { ok: false, message: 'That merchant could not be found.' };
  if (!CODE.test(code)) return { ok: false, message: 'A Paystack sub-account code starts ACCT_.' };
  if (!SCHEDULES.includes(input.schedule as Schedule)) {
    return { ok: false, message: 'Choose how often Paystack pays them.' };
  }

  const looked = await lookUp(code);
  if (!looked.ok) return { ok: false, message: looked.message };

  const { error } = await client().rpc('rpc_merchant_subaccount_request', {
    p_merchant_id: merchantId,
    p_is_test: looked.details.test,
    p_subaccount_code: code,
    p_schedule: input.schedule,
    p_paystack_details: looked.details,
    p_note: input.note.slice(0, 500),
  });
  if (error) return { ok: false, message: refusal(error.message) };
  return done(
    merchantId,
    'Recorded. A second Finance person switches it on; until then nothing is split.',
  );
}

export async function decideSubaccount(
  merchantId: string,
  id: string,
  code: string,
  approve: boolean,
  note: string,
): Promise<SubaccountResult> {
  const staff = await requireStaff();
  requireModule(staff, 'finance');
  if (!UUID.test(id)) return { ok: false, message: 'That sub-account could not be found.' };

  /* Switching on rests on this person's own look-up in Paystack, not on
     what the first person recorded. */
  let fresh: Record<string, unknown> | null = null;
  if (approve) {
    const looked = await lookUp(code);
    if (!looked.ok) return { ok: false, message: looked.message };
    fresh = looked.details;
  }
  const { error } = await client().rpc('rpc_merchant_subaccount_decide', {
    p_id: id,
    p_approve: approve,
    p_note: note.slice(0, 500),
    ...(fresh ? { p_paystack_details: fresh } : {}),
  });
  if (error) return { ok: false, message: refusal(error.message) };
  return done(
    merchantId,
    approve ? "Switched on. This merchant's next orders are split by Paystack." : 'Turned down.',
  );
}

export async function pauseSubaccount(
  merchantId: string,
  id: string,
  pause: boolean,
  note: string,
): Promise<SubaccountResult> {
  const staff = await requireStaff();
  requireModule(staff, 'finance');
  if (!UUID.test(id)) return { ok: false, message: 'That sub-account could not be found.' };
  const { error } = await client().rpc('rpc_merchant_subaccount_pause', {
    p_id: id,
    p_pause: pause,
    p_note: note.slice(0, 500),
  });
  if (error) return { ok: false, message: refusal(error.message) };
  return done(
    merchantId,
    pause
      ? 'Paused. New orders go to the payout run until it is resumed.'
      : 'Resumed. New orders are split by Paystack again.',
  );
}

/** Who carries the merchant's part of a refund on an order Paystack paid out. */
export async function decideRecovery(
  merchantId: string,
  refundId: string,
  method: 'paystack' | 'next_sales' | 'invoice' | 'nexg',
  amountKes: string,
  note: string,
): Promise<SubaccountResult> {
  const staff = await requireStaff();
  requireModule(staff, 'finance');
  if (!UUID.test(refundId)) return { ok: false, message: 'That refund could not be found.' };
  const kes = Number(amountKes);
  if (!Number.isFinite(kes) || kes <= 0) return { ok: false, message: 'Enter the amount in KES.' };
  /* Cents, never rounded up past what the database allows. */
  const { error } = await client().rpc('rpc_merchant_recovery_decide', {
    p_refund_id: refundId,
    p_method: method,
    p_amount_cents: Math.floor(kes * 100 + 1e-6),
    p_note: note.slice(0, 500),
  });
  if (error) return { ok: false, message: refusal(error.message) };
  return done(
    merchantId,
    method === 'paystack'
      ? 'Recorded: Paystack took it from their sub-account.'
      : method === 'next_sales'
        ? 'Taken from their next sales: NexG keeps that much more of their next payments.'
        : method === 'invoice'
          ? 'Recorded as invoiced. Mark it paid here when the merchant pays.'
          : 'Recorded: NexG carries it.',
  );
}

export async function settleRecovery(
  merchantId: string,
  id: string,
  reference: string,
): Promise<SubaccountResult> {
  const staff = await requireStaff();
  requireModule(staff, 'finance');
  if (!UUID.test(id)) return { ok: false, message: 'That recovery could not be found.' };
  const { error } = await client().rpc('rpc_merchant_recovery_settle', {
    p_id: id,
    p_reference: reference.slice(0, 64),
  });
  if (error) return { ok: false, message: refusal(error.message) };
  return done(merchantId, 'Marked paid.');
}
