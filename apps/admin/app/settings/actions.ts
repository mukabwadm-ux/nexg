'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

export interface Outcome {
  ok: boolean;
  message?: string;
  id?: string;
  pair?: string;
  singlePerson?: boolean;
  effectiveFrom?: string;
}

/**
 * Every write the Settings console makes.
 *
 * Thin on purpose. The rules — who may edit which group, which keys
 * can never be immediate, that the approver must be a different
 * person, that the strictest key in a set decides the pair — all
 * live in the RPCs, because a rule enforced in a React form is not
 * a rule. What these add is the path to revalidate and a sentence
 * somebody can read.
 */
function fail(error: { message: string } | null): Outcome | null {
  if (!error) return null;
  return { ok: false, message: error.message.replace(/^.*?:\s*/, '') };
}

/*
 * Through the `public` wrappers, not `settings` directly.
 *
 * PostgREST only serves schemas in the project's exposed list, which
 * is a dashboard field no migration can set — and an unexposed
 * schema fails by returning nothing rather than erroring, so the
 * page rendered with every control locked and no explanation. The
 * wrappers put the surface somewhere always served; the rules stay
 * in the settings functions behind them.
 */
const s = () => createClient();

function done(message: string, extra: Partial<Outcome> = {}): Outcome {
  revalidatePath('/settings');
  return { ok: true, message, ...extra };
}

// ─────────────────────────────────────────────── drafting

export async function stageChange(input: {
  group: string;
  cityId: string | null;
  key: string;
  value: unknown;
  category?: string | null;
  zoneId?: string | null;
}): Promise<Outcome> {
  const db = s();

  const { data: opened, error: openError } = await db.rpc('rpc_settings_open', {
    p_group: input.group,
    p_city_id: input.cityId ?? undefined,
  });
  const openFailed = fail(openError);
  if (openFailed) return openFailed;

  const changeSetId = (opened as { id?: string } | null)?.id;
  if (!changeSetId) return { ok: false, message: 'Could not open a draft.' };

  const { data, error } = await db.rpc('rpc_settings_put', {
    p_change_set: changeSetId,
    p_key: input.key,
    p_value: input.value as never,
    p_city_id: input.cityId ?? undefined,
    p_zone_id: input.zoneId ?? undefined,
    p_category: input.category ?? undefined,
  });
  const putFailed = fail(error);
  if (putFailed) return putFailed;

  const r = data as { unchanged?: boolean } | null;
  return done(
    r?.unchanged
      ? 'Same as the live value — nothing staged.'
      : 'Staged. It is not live until somebody approves it.',
    { id: changeSetId },
  );
}

export async function discardDraft(changeSetId: string): Promise<Outcome> {
  const { error } = await s().rpc('rpc_settings_discard', { p_change_set: changeSetId });
  return fail(error) ?? done('Draft discarded.');
}

export async function submitChangeSet(
  changeSetId: string,
  immediate: boolean,
  reason: string | null,
  effectiveFrom: string | null,
): Promise<Outcome> {
  const { data, error } = await s().rpc('rpc_settings_submit', {
    p_change_set: changeSetId,
    p_effective_from: effectiveFrom ?? undefined,
    p_immediate: immediate,
    p_reason: reason ?? undefined,
  });
  const bad = fail(error);
  if (bad) return bad;

  const r = data as { pair?: string; effective_from?: string; single_person?: boolean; changes?: number } | null;
  return done(
    r?.single_person
      ? `${r?.changes ?? 0} change${r?.changes === 1 ? '' : 's'} submitted — you can approve this yourself.`
      : `Sent to ${r?.pair?.replace('+', ' and ')}. It takes effect once they approve.`,
    { pair: r?.pair, singlePerson: r?.single_person, effectiveFrom: r?.effective_from },
  );
}

export async function approveChangeSet(changeSetId: string): Promise<Outcome> {
  const { data, error } = await s().rpc('rpc_settings_approve', { p_change_set: changeSetId });
  const bad = fail(error);
  if (bad) return bad;

  const r = data as { immediate?: boolean; effective_from?: string } | null;
  return done(
    r?.immediate
      ? 'Approved and live now.'
      : `Approved. It goes live at ${
          r?.effective_from
            ? new Date(r.effective_from).toLocaleString('en-GB', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Africa/Nairobi',
              })
            : 'the next midnight'
        }.`,
  );
}

export async function rejectChangeSet(changeSetId: string, reason: string): Promise<Outcome> {
  const { error } = await s().rpc('rpc_settings_reject', {
    p_change_set: changeSetId,
    p_reason: reason,
  });
  return fail(error) ?? done('Rejected. The person who asked can see why.');
}

export async function rollbackVersion(versionId: string, reason: string): Promise<Outcome> {
  const { data, error } = await s().rpc('rpc_settings_rollback', {
    p_version_id: versionId,
    p_reason: reason,
  });
  const bad = fail(error);
  if (bad) return bad;
  const r = data as { value?: unknown } | null;
  return done(
    r?.value === null || r?.value === undefined
      ? 'Rolled back. There was no earlier value, so it is unset again.'
      : 'Rolled back, immediately. The history keeps both.',
  );
}

export async function activateDue(): Promise<Outcome> {
  const { data, error } = await s().rpc('rpc_settings_activate', {});
  const bad = fail(error);
  if (bad) return bad;
  const n = (data as { activated?: number } | null)?.activated ?? 0;
  return done(
    n === 0 ? 'Nothing was due.' : `${n} change${n === 1 ? '' : 's'} are now live.`,
  );
}

// ────────────────────────────────────────── the incident switch

/**
 * Turning a guest payment method on or off.
 *
 * Deliberately not a change set. A provider going down at 19:00 on a
 * Friday should not wait for midnight and a second approver — but it
 * still needs a reason, it still names who did it, and it still
 * writes a high-severity event. Switching one back ON is refused
 * when there is no provider connected behind it.
 */
export async function togglePaymentMethod(
  key: string,
  enabled: boolean,
  reason: string,
): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_payment_method_toggle', {
    p_key: key,
    p_enabled: enabled,
    p_reason: reason,
  });
  const bad = fail(error);
  if (bad) return bad;
  const r = data as { message?: string; unchanged?: boolean } | null;
  return done(r?.unchanged ? 'Already in that state.' : (r?.message ?? 'Done.'));
}
