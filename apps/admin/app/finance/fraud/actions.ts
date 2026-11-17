'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

/**
 * Fraud check writes. Who may review which flag, that dismissing needs a
 * reason, that nobody reviews a flag about themselves, the strike a confirmed
 * rider flag gives, and the audit entries all live in the rpc_fraud_*
 * functions.
 */

export interface Outcome {
  ok: boolean;
  message?: string;
}

function done(error: { message: string } | null, message: string): Outcome {
  if (error) return { ok: false, message: error.message };
  return { ok: true, message };
}

function refresh() {
  revalidatePath('/finance/fraud');
  revalidatePath('/riders');
}

export async function decideFlag(id: string, confirm: boolean, note: string): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_fraud_flag_decide', {
    p_id: id,
    p_confirm: confirm,
    p_note: note.trim() || undefined,
  });
  refresh();
  return done(error, confirm ? 'Flag confirmed' : 'Flag dismissed');
}

export async function setRule(
  kind: string,
  enabled: boolean,
  params: Record<string, number> | null,
): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_fraud_rule_set', {
    p_kind: kind,
    p_enabled: enabled,
    p_params: params ?? undefined,
  });
  refresh();
  return done(error, enabled ? 'Check saved' : 'Check turned off');
}

export async function runChecks(): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_fraud_checks_run');
  refresh();
  if (error) return { ok: false, message: error.message };
  const result = (data ?? {}) as {
    raised?: Record<string, number>;
    errors?: Record<string, string>;
  };
  const raised = Object.values(result.raised ?? {}).reduce((a, b) => a + Number(b || 0), 0);
  const failed = Object.keys(result.errors ?? {});
  if (failed.length > 0) {
    return {
      ok: false,
      message: `Some checks failed (${failed.join(', ')}). The others ran.`,
    };
  }
  return {
    ok: true,
    message:
      raised === 0
        ? 'Checks ran. Nothing new found.'
        : `Checks ran. ${raised} new flag${raised === 1 ? '' : 's'}.`,
  };
}
