'use server';

import { revalidatePath } from 'next/cache';

import { verifyHost } from '@/app/hotels/actions';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

/*
 * The Stays screens' buttons. Each goes through one of the RPCs in
 * 20270329000100_stays_module_screens.sql, which check that the caller works
 * in hospitality, hold the rules (a reason to send a host back, a resolution
 * to close a case, no block over a booking) and write the audit event in the
 * same transaction. Nothing here updates a table directly.
 */

export interface Outcome {
  ok: boolean;
  message?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

type Untyped = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

async function call(fn: string, args: Record<string, unknown>, done: string): Promise<Outcome> {
  const staff = await requireStaff();
  requireModule(staff, 'hotels');
  const db = createClient() as unknown as Untyped;
  const { error } = await db.rpc(fn, args);
  if (error) return { ok: false, message: error.message };
  revalidatePath('/stays', 'layout');
  return { ok: true, message: done };
}

/* ─────────────────────────────────────────────────────────────── hosts */

/** Approve: the existing verification (ID and authority must be approved first). */
export async function approveHost(input: {
  hostId: string;
  method: string;
  evidence: string;
}): Promise<Outcome> {
  const r = await verifyHost(input);
  if (r.error) return { ok: false, message: r.error };
  revalidatePath('/stays', 'layout');
  return { ok: true, message: 'Approved. The host is live and has been emailed.' };
}

/** Send back to fix (stays applied) or decline (offboarded), with the reason the host reads. */
export async function rejectHost(input: {
  hostId: string;
  reason: string;
  final: boolean;
}): Promise<Outcome> {
  if (!UUID.test(input.hostId)) return { ok: false, message: 'The host ID is invalid.' };
  if (!input.reason.trim()) return { ok: false, message: 'Say why — the host reads this.' };
  return call(
    'rpc_console_host_reject',
    { p_host_id: input.hostId, p_reason: input.reason.trim(), p_final: input.final },
    input.final
      ? 'Declined. The host has been emailed the reason.'
      : 'Sent back to the host to fix.',
  );
}

/* ─────────────────────────────────────────────────────────────── stays */

export async function checkInStay(stayId: string): Promise<Outcome> {
  if (!UUID.test(stayId)) return { ok: false, message: 'The stay ID is invalid.' };
  return call('rpc_console_stay_check_in', { p_stay_id: stayId }, 'Checked in.');
}

export async function checkOutStay(stayId: string): Promise<Outcome> {
  if (!UUID.test(stayId)) return { ok: false, message: 'The stay ID is invalid.' };
  return call('rpc_console_stay_check_out', { p_stay_id: stayId }, 'Checked out.');
}

export async function blockDates(input: {
  unitId: string;
  from: string;
  to: string;
  note: string;
}): Promise<Outcome> {
  if (!UUID.test(input.unitId)) return { ok: false, message: 'Pick a unit.' };
  if (!DAY.test(input.from) || !DAY.test(input.to))
    return { ok: false, message: 'Pick the first and last night.' };
  return call(
    'rpc_console_stay_block',
    { p_unit_id: input.unitId, p_from: input.from, p_to: input.to, p_note: input.note.trim() },
    'Dates blocked.',
  );
}

export async function setUnitRate(unitId: string, rate: string): Promise<Outcome> {
  if (!UUID.test(unitId)) return { ok: false, message: 'Pick a unit.' };
  const value = Math.round(Number(rate.replace(/[,\s]/g, '')));
  if (!Number.isFinite(value) || value <= 0)
    return { ok: false, message: 'Type the nightly rate in shillings.' };
  return call(
    'rpc_console_unit_rate_set',
    { p_unit_id: unitId, p_rate_kes: value },
    'Nightly rate saved.',
  );
}

/* ─────────────────────────────────────────────────────────────── reviews */

export async function moderateReview(
  stayId: string,
  action: 'publish' | 'hide' | 'review' | 'feature' | 'unfeature' | 'reply',
  reply = '',
): Promise<Outcome> {
  if (!UUID.test(stayId)) return { ok: false, message: 'The review is invalid.' };
  const done: Record<string, string> = {
    publish: 'Published.',
    hide: 'Hidden from guests.',
    review: 'Marked for review.',
    feature: 'Featured.',
    unfeature: 'No longer featured.',
    reply: 'Reply saved.',
  };
  return call(
    'rpc_console_review_moderate',
    { p_stay_id: stayId, p_action: action, p_reply: reply.trim() || null },
    done[action]!,
  );
}

/* ─────────────────────────────────────────────────────────────── cases */

export async function openCase(input: {
  caseType: string;
  category: string;
  title: string;
  description: string;
  stayRef: string;
  reportedBy: string;
  parties: string;
  amount: string;
  priority: string;
}): Promise<Outcome> {
  if (!input.title.trim()) return { ok: false, message: 'Give the case a short title.' };
  const ref = input.stayRef.trim();
  const amount = input.amount.trim()
    ? Math.round(Number(input.amount.replace(/[,\s]/g, '')))
    : null;
  return call(
    'rpc_console_stays_case_open',
    {
      p: {
        case_type: input.caseType,
        category: input.category,
        title: input.title.trim(),
        description: input.description.trim(),
        stay_id: UUID.test(ref) ? ref : null,
        stay_ref: UUID.test(ref) ? null : ref || null,
        reported_by: input.reportedBy,
        parties: input.parties.trim(),
        amount_kes: amount != null && Number.isFinite(amount) ? amount : null,
        priority: input.priority,
      },
    },
    'Case logged.',
  );
}

export async function updateCase(input: {
  caseId: string;
  status?: string;
  priority?: string;
  escalate?: boolean;
  assignToMe?: boolean;
  resolution?: string;
}): Promise<Outcome> {
  if (!UUID.test(input.caseId)) return { ok: false, message: 'The case is invalid.' };
  return call(
    'rpc_console_stays_case_update',
    {
      p_case_id: input.caseId,
      p_status: input.status ?? null,
      p_priority: input.priority ?? null,
      p_escalate: input.escalate ?? false,
      p_assign_to_me: input.assignToMe ?? false,
      p_resolution: input.resolution?.trim() || null,
    },
    'Case updated.',
  );
}

/* ─────────────────────────────────────────────────────── growth and partners */

export async function saveLead(input: Record<string, string | boolean>): Promise<Outcome> {
  if (!input.id && !String(input.name ?? '').trim())
    return { ok: false, message: 'Give the lead a name.' };
  return call(
    'rpc_console_stays_lead_save',
    { p: input },
    input.id ? 'Lead updated.' : 'Lead added.',
  );
}

export async function saveCampaign(input: Record<string, string>): Promise<Outcome> {
  if (!input.id && !String(input.name ?? '').trim())
    return { ok: false, message: 'Give the campaign a name.' };
  return call(
    'rpc_console_stays_campaign_save',
    { p: input },
    input.id ? 'Campaign updated.' : 'Campaign added.',
  );
}

export async function savePartner(input: Record<string, string | boolean>): Promise<Outcome> {
  if (!input.id && !String(input.name ?? '').trim())
    return { ok: false, message: 'Give the partner a name.' };
  return call(
    'rpc_console_partner_save',
    { p: input },
    input.id ? 'Partner updated.' : 'Partner added.',
  );
}

export async function setPropertyManager(propertyId: string, managerId: string): Promise<Outcome> {
  if (!UUID.test(propertyId)) return { ok: false, message: 'Pick a building.' };
  return call(
    'rpc_console_property_set_manager',
    { p_property_id: propertyId, p_manager_id: UUID.test(managerId) ? managerId : null },
    UUID.test(managerId) ? 'Building linked to the partner.' : 'Partner removed from the building.',
  );
}
