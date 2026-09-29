'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

/**
 * Everything the Staff & roles page does.
 *
 * Each one is a thin call to an RPC that checks super_admin for itself, so
 * a forged request reaches the same refusal the UI already applied. Nothing
 * here decides who may do what.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
  /** Shown once, never stored: the invited person's first password. */
  oneTimePassword?: string;
}

export async function inviteStaff(formData: FormData): Promise<ActionResult> {
  const supabase = createClient();

  const email = String(formData.get('email') ?? '').trim();
  const name = String(formData.get('display_name') ?? '').trim();
  const roles = formData.getAll('roles').map(String).filter(Boolean);

  if (!email || !name) return { ok: false, message: 'A name and an email, at least.' };
  if (roles.length === 0) return { ok: false, message: 'Give them at least one role.' };

  const { data, error } = await supabase.rpc('rpc_staff_invite', {
    p_email: email,
    p_display_name: name,
    p_roles: roles,
  });

  if (error) return { ok: false, message: error.message };

  revalidatePath('/staff');
  const result = data as { one_time_password?: string } | null;
  return {
    ok: true,
    message: `${name} can sign in now.`,
    ...(result?.one_time_password ? { oneTimePassword: result.one_time_password } : {}),
  };
}

export async function setRoles(staffId: string, roles: string[]): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_staff_set_roles', {
    p_staff_id: staffId,
    p_roles: roles,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath('/staff');
  return { ok: true, message: 'Roles updated. They take effect on next sign-in.' };
}

export async function setScope(
  staffId: string,
  cityId: string | null,
  expiresAt: string | null,
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_staff_set_scope', {
    p_staff_id: staffId,
    p_city_id: cityId ?? undefined,
    p_expires_at: expiresAt ?? undefined,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath('/staff');
  return { ok: true, message: 'Scope updated.' };
}

export async function setStatus(
  staffId: string,
  status: 'active' | 'suspended' | 'offboarded',
  reason: string,
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_staff_set_status', {
    p_staff_id: staffId,
    p_status: status,
    p_reason: reason,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath('/staff');
  return { ok: true, message: status === 'active' ? 'Reactivated.' : 'Deactivated, immediately.' };
}

export async function signOutEverywhere(staffId: string): Promise<ActionResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('rpc_staff_sign_out_everywhere', {
    p_staff_id: staffId,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath('/staff');
  return { ok: true, message: `${data ?? 0} session(s) ended.` };
}

export async function requestRole(
  staffId: string,
  role: 'super_admin' | 'finance',
  reason: string,
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_role_grant_request', {
    p_staff_id: staffId,
    p_role: role,
    p_reason: reason,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath('/staff');
  return { ok: true, message: 'Proposed. It needs a second person to accept it.' };
}

export async function decideApproval(
  requestId: string,
  approve: boolean,
  note: string,
): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_approval_decide', {
    p_request_id: requestId,
    p_approve: approve,
    p_note: note,
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath('/staff');
  return { ok: true, message: approve ? 'Granted.' : 'Rejected.' };
}

export async function claimFirstSuperAdmin(): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_bootstrap_super_admin');
  if (error) return { ok: false, message: error.message };
  revalidatePath('/staff');
  return { ok: true, message: 'You are the first super admin. Every later one needs two people.' };
}
