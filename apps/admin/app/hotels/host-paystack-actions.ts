'use server';

import { revalidatePath } from 'next/cache';

import { parseRate } from '@/lib/merchant-commission';
import { fetchSubaccount, payoutMode } from '@/lib/paystack';
import { loadPaystackKeys } from '@/lib/paystack-keys';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

/*
 * A host's NexG commission and Paystack sub-account, from the host panel
 * (Hotels › Hosts). The same rules as the merchant ones
 * (app/merchants/commission-actions.ts, app/merchants/subaccount-actions.ts):
 * the RPCs hold who may ask and who may approve, and write the audit entry;
 * the console looks a sub-account up in Paystack itself, so what Finance sees
 * comes from Paystack, not from what was typed. Nothing here writes a table.
 */

export interface HostPaystackResult {
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
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const refusal = (message: string) => message.replace(/^.*?:\s*/, '').slice(0, 300);

/* The new RPCs are not in the generated types yet (CI makes them). */
function client() {
  return createClient() as unknown as { rpc: Rpc };
}

function done(message: string): HostPaystackResult {
  revalidatePath('/hotels');
  return { ok: true, message };
}

// ─────────────────────────────────────────────── commission

export async function requestHostCommission(
  hostId: string,
  input: { pct: string; startsOn: string; endsOn: string; reason: string; termsRef: string },
): Promise<HostPaystackResult> {
  const staff = await requireStaff();
  requireModule(staff, 'hotels');
  if (!UUID.test(hostId)) return { ok: false, message: 'That host could not be found.' };
  const rate = parseRate(input.pct);
  if (!rate.ok || rate.value === null) {
    return { ok: false, message: 'A rate is a percentage from 0 to 100, two decimals at most.' };
  }
  if (!DAY.test(input.startsOn) || (input.endsOn && !DAY.test(input.endsOn))) {
    return { ok: false, message: 'Choose the dates again.' };
  }
  if (!input.reason.trim()) return { ok: false, message: 'Say what was agreed.' };
  const { error } = await client().rpc('rpc_host_commission_request', {
    p_host_id: hostId,
    p_pct: rate.value,
    p_starts_on: input.startsOn,
    p_ends_on: input.endsOn || null,
    p_reason: input.reason.trim().slice(0, 1000),
    ...(input.termsRef.trim() ? { p_terms_ref: input.termsRef.trim().slice(0, 200) } : {}),
  });
  if (error) return { ok: false, message: refusal(error.message) };
  return done('Sent for approval. A second person has to approve it.');
}

export async function decideHostCommission(
  termId: string,
  approve: boolean,
  note: string,
): Promise<HostPaystackResult> {
  const staff = await requireStaff();
  requireModule(staff, 'hotels');
  if (!UUID.test(termId)) return { ok: false, message: 'That rate could not be found.' };
  const { error } = await client().rpc('rpc_host_commission_decide', {
    p_term_id: termId,
    p_approve: approve,
    ...(note.trim() ? { p_note: note.trim().slice(0, 1000) } : {}),
  });
  if (error) return { ok: false, message: refusal(error.message) };
  return done(
    approve
      ? 'Approved. Stays held from its start day use this rate.'
      : 'Rejected. The host stays on the rate they have.',
  );
}

export async function withdrawHostCommission(termId: string): Promise<HostPaystackResult> {
  const staff = await requireStaff();
  requireModule(staff, 'hotels');
  if (!UUID.test(termId)) return { ok: false, message: 'That rate could not be found.' };
  const { error } = await client().rpc('rpc_host_commission_withdraw', { p_term_id: termId });
  if (error) return { ok: false, message: refusal(error.message) };
  return done('Request withdrawn.');
}

// ─────────────────────────────────────────────── sub-account

interface PaystackSubaccount {
  subaccount_code?: string;
  business_name?: string;
  settlement_bank?: string;
  account_number?: string;
  settlement_schedule?: string;
  active?: boolean;
  currency?: string;
}

/**
 * The sub-account as Paystack describes it, in the console's Paystack mode.
 * The same look-up as the merchant one; kept here rather than shared because
 * a 'use server' file's exports are callable from the browser.
 */
async function lookUp(
  code: string,
): Promise<
  | { ok: true; details: Record<string, unknown> & { test: boolean } }
  | { ok: false; message: string }
> {
  await loadPaystackKeys();
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

/** Records a host's sub-account, looked up in Paystack first. */
export async function requestHostSubaccount(
  hostId: string,
  input: { code: string; schedule: string; note: string },
): Promise<HostPaystackResult> {
  const staff = await requireStaff();
  requireModule(staff, 'finance');
  const code = input.code.trim();
  if (!UUID.test(hostId)) return { ok: false, message: 'That host could not be found.' };
  if (!CODE.test(code)) return { ok: false, message: 'A Paystack sub-account code starts ACCT_.' };
  if (!SCHEDULES.includes(input.schedule as Schedule)) {
    return { ok: false, message: 'Choose how often Paystack pays them.' };
  }

  const looked = await lookUp(code);
  if (!looked.ok) return { ok: false, message: looked.message };

  const { error } = await client().rpc('rpc_host_subaccount_request', {
    p_host_id: hostId,
    p_is_test: looked.details.test,
    p_subaccount_code: code,
    p_schedule: input.schedule,
    p_paystack_details: looked.details,
    p_note: input.note.slice(0, 500),
  });
  if (error) return { ok: false, message: refusal(error.message) };
  return done('Recorded. A second Finance person switches it on; until then nothing is split.');
}

export async function decideHostSubaccount(
  id: string,
  code: string,
  approve: boolean,
  note: string,
): Promise<HostPaystackResult> {
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
  const { error } = await client().rpc('rpc_host_subaccount_decide', {
    p_id: id,
    p_approve: approve,
    p_note: note.slice(0, 500),
    ...(fresh ? { p_paystack_details: fresh } : {}),
  });
  if (error) return { ok: false, message: refusal(error.message) };
  return done(
    approve ? "Switched on. This host's next stays are split by Paystack." : 'Turned down.',
  );
}

export async function pauseHostSubaccount(
  id: string,
  pause: boolean,
  note: string,
): Promise<HostPaystackResult> {
  const staff = await requireStaff();
  requireModule(staff, 'finance');
  if (!UUID.test(id)) return { ok: false, message: 'That sub-account could not be found.' };
  const { error } = await client().rpc('rpc_host_subaccount_pause', {
    p_id: id,
    p_pause: pause,
    p_note: note.slice(0, 500),
  });
  if (error) return { ok: false, message: refusal(error.message) };
  return done(
    pause
      ? 'Paused. New stays go to the weekly payout run until it is resumed.'
      : 'Resumed. New stays are split by Paystack again.',
  );
}
