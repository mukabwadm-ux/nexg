'use server';

import { revalidatePath } from 'next/cache';

import type { Json } from '@nexg/db';

import { createClient } from '@/lib/supabase/server';

/*
 * Categories & Commissions actions. Who may change what, the dates, the
 * second approver and the audit entries (old and new value) all live in the
 * rpc_category_commission_* functions (20270345000100); nothing here writes
 * a table.
 */

export interface Outcome {
  ok: boolean;
  message?: string;
}

const PATH = '/settings/categories';

function done(error: { message: string } | null, message: string): Outcome {
  revalidatePath(PATH);
  if (error) return { ok: false, message: error.message };
  return { ok: true, message };
}

export async function saveCategory(
  category: string,
  payload: Record<string, unknown>,
): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_category_commission_save', {
    p_category: category,
    p_payload: payload as Json,
  });
  const rate = (data as { rate?: string | null } | null)?.rate;
  return done(
    error,
    rate === 'pending'
      ? 'Saved. The new rate waits for a second person to approve it.'
      : rate === 'approved'
        ? 'Saved. The new rate applies from its start day.'
        : 'Saved',
  );
}

export async function addCategory(
  category: string,
  payload: Record<string, unknown>,
): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_category_commission_add', {
    p_category: category,
    p_payload: payload as Json,
  });
  return done(error, 'Category added, switched off until it is ready');
}

export async function decideRate(rateId: string, approve: boolean, note: string): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_category_commission_decide', {
    p_rate_id: rateId,
    p_approve: approve,
    ...(note.trim() ? { p_note: note.trim() } : {}),
  });
  return done(error, approve ? 'Rate approved' : 'Rate rejected');
}

export async function withdrawRate(rateId: string): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_category_commission_withdraw', {
    p_rate_id: rateId,
  });
  return done(error, 'Request withdrawn');
}

/** Applies an uploaded file, one category at a time; says which ones failed. */
export async function importCategories(
  rows: { category: string; payload: Record<string, unknown> }[],
  reason: string,
): Promise<Outcome> {
  const supabase = createClient();
  const failed: string[] = [];
  let saved = 0;
  for (const row of rows.slice(0, 100)) {
    const payload: Record<string, unknown> = { ...row.payload, reason };
    if (payload.rate && typeof payload.rate === 'object') {
      payload.rate = { ...(payload.rate as Record<string, unknown>), reason };
    }
    const { error } = await supabase.rpc('rpc_category_commission_save', {
      p_category: row.category,
      p_payload: payload as Json,
    });
    if (error) failed.push(`${row.category}: ${error.message}`);
    else saved += 1;
  }
  revalidatePath(PATH);
  if (failed.length) {
    return {
      ok: false,
      message: `${saved} saved, ${failed.length} not: ${failed.slice(0, 3).join(' · ')}`,
    };
  }
  return { ok: true, message: `${saved} ${saved === 1 ? 'category' : 'categories'} saved` };
}
