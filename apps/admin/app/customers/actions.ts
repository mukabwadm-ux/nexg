'use server';

import { createClient as createPlainClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

/**
 * Customer actions. Who may act, that each one has a reason, and the audit
 * entries live in the rpc_customer_* functions; the device and address of
 * the staff member travel with every call (lib/request-context).
 */

export interface Outcome {
  ok: boolean;
  message?: string;
}

function done(error: { message: string } | null, message: string): Outcome {
  if (error) return { ok: false, message: error.message };
  return { ok: true, message };
}

function refresh(id: string) {
  revalidatePath('/customers');
  revalidatePath(`/customers/${id}`);
}

export async function addNote(id: string, body: string): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_customer_note_add', {
    p_id: id,
    p_body: body,
  });
  refresh(id);
  return done(error, 'Note added');
}

export async function setSuspended(
  id: string,
  suspended: boolean,
  reason: string,
): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_customer_set_suspended', {
    p_id: id,
    p_suspended: suspended,
    p_reason: reason,
  });
  refresh(id);
  return done(error, suspended ? 'Customer suspended' : 'Customer reactivated');
}

export async function setVip(id: string, vip: boolean, reason: string): Promise<Outcome> {
  const { error } = await createClient().rpc('rpc_customer_set_vip', {
    p_id: id,
    p_vip: vip,
    p_reason: reason,
  });
  refresh(id);
  return done(error, vip ? 'Marked VIP' : 'No longer VIP');
}

/**
 * The database checks the account is unverified and records who asked; then
 * Supabase Auth sends its own sign-up confirmation email again. Auth needs a
 * Turnstile token for that, which the staff member's browser passes.
 *
 * A separate client without a session: the staff member's own sign-in must
 * not be touched, and the email's link has to work in the customer's browser,
 * so no code verifier is kept here.
 */
export async function resendVerification(
  id: string,
  reason: string,
  captchaToken: string | null,
): Promise<Outcome> {
  const { data, error } = await createClient().rpc('rpc_customer_verification_resend', {
    p_id: id,
    p_reason: reason,
  });
  if (error) return { ok: false, message: error.message };
  const email = (data as { email?: string } | null)?.email;
  if (!email) return { ok: false, message: 'This account has no email address.' };

  const auth = createPlainClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, flowType: 'implicit' } },
  ).auth;
  const sent = await auth.resend({
    type: 'signup',
    email,
    options: { captchaToken: captchaToken ?? undefined },
  });
  refresh(id);
  if (sent.error) {
    return {
      ok: false,
      message: /captcha/i.test(sent.error.message)
        ? 'The security check did not pass. Reload the page and try again.'
        : `Supabase did not send it: ${sent.error.message}`,
    };
  }
  return { ok: true, message: `Verification email sent to ${email}` };
}
