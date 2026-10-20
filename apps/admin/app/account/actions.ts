'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

/**
 * A staff member editing their own account. Every RPC resolves "me" from the
 * session, so nothing here takes a staff id from the client.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
}

type Loose = { data: unknown; error: { message: string } | null };

function loose(supabase: ReturnType<typeof createClient>, fn: string, args: object) {
  return supabase.rpc(fn as never, args as never) as unknown as Promise<Loose>;
}

const clean = (m: string) => m.replace(/^.*?:\s*/, '');

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const supabase = createClient();
  const { error } = await loose(supabase, 'rpc_my_staff_profile_update', {
    p_display_name: String(formData.get('display_name') ?? ''),
    p_phone: String(formData.get('phone') ?? ''),
    p_job_title: String(formData.get('job_title') ?? ''),
    p_bio: String(formData.get('bio') ?? ''),
    p_timezone: String(formData.get('timezone') ?? '') || null,
  });
  if (error) return { ok: false, message: clean(error.message) };
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Profile saved.' };
}

export async function setAvatarPath(path: string | null): Promise<ActionResult> {
  const supabase = createClient();
  const { data, error } = await loose(supabase, 'rpc_my_staff_avatar_set', { p_path: path });
  if (error) return { ok: false, message: clean(error.message) };
  if (typeof data === 'string' && data) {
    await supabase.storage.from('staff-avatars').remove([data]);
  }
  revalidatePath('/', 'layout');
  return { ok: true, message: path ? 'Photo updated.' : 'Photo removed.' };
}

export async function changeEmail(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { ok: false, message: 'Enter the new email and your password.' };

  const domain = process.env.STAFF_EMAIL_DOMAIN;
  if (domain && !email.endsWith(`@${domain}`)) {
    return { ok: false, message: `Use your @${domain} work account.` };
  }

  const supabase = createClient();
  const { error } = await loose(supabase, 'rpc_my_staff_email_change', {
    p_new_email: email,
    p_current_password: password,
  });
  if (error) return { ok: false, message: clean(error.message) };

  /* Refresh the session so it carries the new address. */
  await supabase.auth.refreshSession();
  revalidatePath('/', 'layout');
  return { ok: true, message: `Your sign-in email is now ${email}.` };
}

export async function changePassword(formData: FormData): Promise<ActionResult> {
  const current = String(formData.get('current') ?? '');
  const next = String(formData.get('next') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (next.length < 10) return { ok: false, message: 'Use at least 10 characters.' };
  if (next !== confirm) return { ok: false, message: 'The two new passwords do not match.' };
  if (next === current) return { ok: false, message: 'Pick a password you are not using now.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, message: 'Sign in again first.' };

  const check = await supabase.auth.signInWithPassword({ email: user.email, password: current });
  if (check.error) return { ok: false, message: 'Your current password is not right.' };

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: 'Password changed.' };
}
