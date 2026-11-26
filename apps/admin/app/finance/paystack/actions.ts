'use server';

import { revalidatePath } from 'next/cache';

import { refreshPaystackKeys } from '@/lib/paystack-keys';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

/*
 * What Finance › Paystack writes. For the keys, the rules (a super admin whose
 * role names no city, the key's form, Vault, the audit entry) are
 * rpc_paystack_key_set and rpc_paystack_key_remove. A pasted key goes to the
 * database and nowhere else: it is never returned, logged, put in a message or
 * in an address.
 */

export interface KeyOutcome {
  ok: boolean;
  message: string;
}

type Rpc = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;

type Mode = 'test' | 'live';

const isMode = (mode: unknown): mode is Mode => mode === 'test' || mode === 'live';

/* The database never quotes a key; this makes sure nothing else does. */
const withoutKeys = (message: string) =>
  message.replace(/sk_(test|live)_[A-Za-z0-9_]{4,}/g, '[key]').slice(0, 300);

async function change(
  fn: 'rpc_paystack_key_set' | 'rpc_paystack_key_remove',
  args: Record<string, unknown>,
  done: (data: unknown) => string,
): Promise<KeyOutcome> {
  const staff = await requireStaff();
  requireModule(staff, 'finance');
  if (!staff.isSuperAdmin) {
    return { ok: false, message: 'Only a super admin for every city can change Paystack keys.' };
  }
  let result: Awaited<ReturnType<Rpc>>;
  try {
    result = await (createClient() as unknown as { rpc: Rpc }).rpc(fn, args);
  } catch {
    return {
      ok: false,
      message: 'The console could not reach the database. Check above whether it was saved.',
    };
  }
  if (result.error) {
    return {
      ok: false,
      message:
        result.error.code === 'PGRST202'
          ? 'This part is not on the database yet.'
          : withoutKeys(result.error.message),
    };
  }
  /* This server follows at once; the others within 30 seconds. */
  await refreshPaystackKeys();
  revalidatePath('/finance/paystack');
  return { ok: true, message: done(result.data) };
}

export async function savePaystackKey(mode: string, value: string): Promise<KeyOutcome> {
  if (!isMode(mode)) return { ok: false, message: 'Choose test or live.' };
  if (typeof value !== 'string' || !value.trim()) {
    return { ok: false, message: 'Paste the key first.' };
  }
  return change('rpc_paystack_key_set', { p_mode: mode, p_value: value }, (data) => {
    const last4 = (data as { last4?: unknown } | null)?.last4;
    const ends = typeof last4 === 'string' ? ` It ends ${last4.slice(-4)}.` : '';
    return `Saved the ${mode} key.${ends}`;
  });
}

/**
 * Finance › Paystack › Problems, "Mark reviewed". Who may (full Finance or a
 * super admin, never for their own action) is rpc_finance_paystack_problem_review.
 */
export async function reviewPaystackProblem(
  eventId: number,
  note: string,
): Promise<{ ok: boolean; message: string }> {
  const staff = await requireStaff();
  requireModule(staff, 'finance');
  if (!Number.isSafeInteger(eventId) || eventId <= 0) {
    return { ok: false, message: 'That problem could not be found.' };
  }
  const done = typeof note === 'string' ? note.trim().slice(0, 500) : '';
  let result: Awaited<ReturnType<Rpc>>;
  try {
    result = await (createClient() as unknown as { rpc: Rpc }).rpc(
      'rpc_finance_paystack_problem_review',
      { p_event_id: eventId, ...(done ? { p_note: done } : {}) },
    );
  } catch {
    return { ok: false, message: 'The console could not reach the database. Try again.' };
  }
  if (result.error) {
    return {
      ok: false,
      message:
        result.error.code === 'PGRST202'
          ? 'This part is not on the database yet.'
          : result.error.message.slice(0, 300),
    };
  }
  revalidatePath('/finance/paystack');
  return { ok: true, message: 'Marked reviewed.' };
}

export async function removePaystackKey(mode: string, reason: string): Promise<KeyOutcome> {
  if (!isMode(mode)) return { ok: false, message: 'Choose test or live.' };
  if (typeof reason !== 'string' || !reason.trim()) {
    return { ok: false, message: 'Say why this key is being removed.' };
  }
  return change(
    'rpc_paystack_key_remove',
    { p_mode: mode, p_reason: reason.trim().slice(0, 500) },
    (data) =>
      (data as { removed?: unknown } | null)?.removed === false
        ? `There was no ${mode} key to remove.`
        : `Removed the ${mode} key.`,
  );
}
