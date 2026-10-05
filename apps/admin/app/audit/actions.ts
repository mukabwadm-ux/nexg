'use server';

import { revalidatePath } from 'next/cache';

import type { Json } from '@nexg/db';

import { createClient } from '@/lib/supabase/server';

export interface Outcome {
  ok: boolean;
  message?: string;
}

/**
 * Every write the Audit console can make.
 *
 * All thin. The rule is in the RPC — that you cannot review your own
 * action, that a hold needs a second person to lift, that a pack
 * cannot be shared before it is frozen — because those have to hold
 * whether the call came from this console, from psql, or from
 * something nobody has written yet.
 */
function fail(error: { message: string } | null): Outcome | null {
  if (!error) return null;
  return { ok: false, message: error.message.replace(/^.*?:\s*/, '') };
}

function done(message: string): Outcome {
  revalidatePath('/audit');
  return { ok: true, message };
}

/*
 * Through the `public` wrappers. PostgREST only serves schemas in
 * the project's exposed list — a dashboard field, not something a
 * migration can set — and an unexposed schema returns nothing
 * rather than erroring, which on an audit console reads as "no
 * events" instead of "we could not look".
 */
const audit = () => createClient();

// ───────────────────────────────────────────────────────── reviewing

export async function reviewEvent(
  eventId: number,
  state: 'reviewed' | 'escalated' | 'needs_review',
  note: string | null,
): Promise<Outcome> {
  const { error } = await audit().rpc('rpc_audit_review_event', {
    p_event_id: eventId,
    p_state: state,
    p_note: note ?? undefined,
  });
  return (
    fail(error) ??
    done(
      state === 'reviewed'
        ? 'Marked reviewed.'
        : state === 'escalated'
          ? 'Escalated.'
          : 'Back in the queue.',
    )
  );
}

export async function actOnAlert(
  alertId: string,
  action: 'acknowledge' | 'resolve' | 'false_positive',
  note: string | null,
): Promise<Outcome> {
  const { error } = await audit().rpc('rpc_audit_alert_act', {
    p_alert_id: alertId,
    p_action: action,
    p_note: note ?? undefined,
  });
  return (
    fail(error) ??
    done(
      action === 'acknowledge'
        ? 'Acknowledged — it stays open until somebody closes it.'
        : 'Closed.',
    )
  );
}

// ───────────────────────────────────────────────── sessions and access

export async function revokeSessions(staffUserId: string, reason: string): Promise<Outcome> {
  const { data, error } = await audit().rpc('rpc_audit_revoke_sessions', {
    p_staff_user_id: staffUserId,
    p_reason: reason,
  });
  const bad = fail(error);
  if (bad) return bad;
  const ended = (data as { sessions_ended?: number } | null)?.sessions_ended ?? 0;
  return done(
    ended === 0
      ? 'They had no live sessions. Nothing to end.'
      : `${ended} session${ended === 1 ? '' : 's'} ended.`,
  );
}

export async function openBreakGlass(
  reason: string,
  scope: string,
  minutes: number,
  moduleKey: string | null,
  cityId: string | null,
): Promise<Outcome> {
  const { data, error } = await audit().rpc('rpc_audit_break_glass_open', {
    p_reason: reason,
    p_scope: scope,
    p_minutes: minutes,
    p_module_key: moduleKey ?? undefined,
    p_city_id: cityId ?? undefined,
  });
  const bad = fail(error);
  if (bad) return bad;
  const expires = (data as { expires_at?: string } | null)?.expires_at;
  return done(
    `Open until ${
      expires
        ? new Date(expires).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Africa/Nairobi',
          })
        : 'it expires'
    }. Close it when the emergency ends.`,
  );
}

export async function closeBreakGlass(id: string): Promise<Outcome> {
  const { error } = await audit().rpc('rpc_audit_break_glass_close', { p_id: id });
  return fail(error) ?? done('Closed.');
}

export async function reviewBreakGlass(
  id: string,
  outcome: 'justified' | 'unjustified' | 'inconclusive',
  note: string,
): Promise<Outcome> {
  const { error } = await audit().rpc('rpc_audit_break_glass_review', {
    p_id: id,
    p_outcome: outcome,
    p_note: note ?? undefined,
  });
  return fail(error) ?? done('Reviewed.');
}

// ─────────────────────────────────────────── holds, packs, the chain

export async function placeLegalHold(input: {
  reference: string;
  title: string;
  reason: string;
  subjectType: string;
  instructedBy: string;
  subjectId: string | null;
}): Promise<Outcome> {
  const { error } = await audit().rpc('rpc_audit_legal_hold_place', {
    p_reference: input.reference,
    p_title: input.title,
    p_reason: input.reason,
    p_subject_type: input.subjectType,
    p_instructed_by: input.instructedBy,
    p_subject_id: input.subjectId ?? undefined,
  });
  return fail(error) ?? done('Hold placed. Deletion for that subject stops now.');
}

export async function releaseLegalHold(id: string, reason: string): Promise<Outcome> {
  const { error } = await audit().rpc('rpc_audit_legal_hold_release', {
    p_id: id,
    p_reason: reason,
  });
  return fail(error) ?? done('Released. Retention resumes on the next run.');
}

export async function createPack(input: {
  reference: string;
  title: string;
  purpose: string;
  requestedBy: string;
  reason: string;
  filter: Record<string, unknown>;
  from: string | null;
  to: string | null;
}): Promise<Outcome> {
  const { error } = await audit().rpc('rpc_audit_pack_create', {
    p_reference: input.reference,
    p_title: input.title,
    p_purpose: input.purpose,
    p_requested_by: input.requestedBy,
    p_reason: input.reason,
    p_filter: input.filter as Json,
    p_from: input.from ?? undefined,
    p_to: input.to ?? undefined,
  });
  return fail(error) ?? done('Draft created. Freeze it to pin the events and take the digest.');
}

export async function freezePack(id: string): Promise<Outcome> {
  const { data, error } = await audit().rpc('rpc_audit_pack_freeze', { p_id: id });
  const bad = fail(error);
  if (bad) return bad;
  const r = data as { events?: number; hash?: string; chain_ok?: boolean } | null;
  return done(
    `${r?.events ?? 0} events pinned. Digest ${r?.hash?.slice(0, 12) ?? '[—]'}${
      r?.chain_ok === false ? ' — but the chain did not verify. Do not share this.' : '.'
    }`,
  );
}

export async function sharePack(id: string, with_: string, how: string): Promise<Outcome> {
  const { error } = await audit().rpc('rpc_audit_pack_share', {
    p_id: id,
    p_shared_with: with_,
    p_how: how,
  });
  return fail(error) ?? done('Recorded.');
}

export async function verifyChain(): Promise<Outcome> {
  const { data, error } = await audit().rpc('rpc_audit_verify_chain', {});
  const bad = fail(error);
  if (bad) return bad;
  const r = data as {
    ok?: boolean;
    events_checked?: number;
    first_bad_id?: number | null;
  } | null;
  return done(
    r?.ok
      ? `${(r.events_checked ?? 0).toLocaleString('en-KE')} events verified.`
      : `The chain did not verify. First bad event: #${r?.first_bad_id ?? '[—]'}. Take a database snapshot before anything else.`,
  );
}

// ──────────────────────────────────────────────────────── retention

export async function setRetention(input: {
  key: string;
  months: number;
  basis: string;
  anonymise: boolean;
  module: string | null;
  description: string | null;
}): Promise<Outcome> {
  const { error } = await audit().rpc('rpc_audit_retention_set', {
    p_key: input.key,
    p_retain_for: `${input.months} months`,
    p_basis: input.basis,
    p_anonymise: input.anonymise,
    p_module: input.module ?? undefined,
    p_description: input.description ?? undefined,
  });
  return fail(error) ?? done('Saved. It needs two approvals before it takes effect.');
}

export async function approveRetention(key: string): Promise<Outcome> {
  const { data, error } = await audit().rpc('rpc_audit_retention_approve', { p_key: key });
  const bad = fail(error);
  if (bad) return bad;
  const state = (data as { state?: string } | null)?.state;
  return done(
    state === 'approved' ? 'Approved and in force.' : 'Your approval is in. One more person.',
  );
}

export async function recordExport(input: {
  module: string;
  what: string;
  reason: string;
  rowCount: number | null;
  containsPii: boolean;
}): Promise<Outcome> {
  const { error } = await audit().rpc('rpc_audit_record_export', {
    p_module: input.module ?? undefined,
    p_what: input.what,
    p_reason: input.reason,
    p_row_count: input.rowCount ?? undefined,
    p_contains_pii: input.containsPii,
  });
  return fail(error) ?? done('Export recorded.');
}
