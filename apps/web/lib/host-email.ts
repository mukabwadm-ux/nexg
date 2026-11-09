import { getCaptchaToken } from '@nexg/ui';
import type { SupabaseClient, User } from '@supabase/supabase-js';

/*
 * Email verification inside the host registration form.
 *
 * The visitor gets an anonymous session; the code is an email-change OTP on
 * that same user, so verifying it turns the session into a real login with
 * a confirmed email. Supabase refuses an email another account already uses,
 * which is what keeps host logins unique (a merchant's email cannot be
 * reused for a host account).
 */

type Auth = SupabaseClient['auth'];

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const CODE_PATTERN = /^(?:\d{6}|\d{8})$/;

export class HostEmailError extends Error {}

function same(left: string | null | undefined, right: string) {
  return left?.trim().toLowerCase() === right.trim().toLowerCase();
}

function explain(error: { status?: number; code?: string; message?: string }, fallback: string) {
  const text = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  if (error.status === 429 || text.includes('rate'))
    return 'We just sent an email to this address. Wait a minute, then try again.';
  if (
    text.includes('email_exists') ||
    text.includes('already been registered') ||
    text.includes('already registered')
  )
    return 'This email already has a NexG account. Sign in, or use a different email for your host account.';
  return fallback;
}

/** The current user, signing in anonymously if there is nobody yet. */
async function applicant(auth: Auth): Promise<User> {
  const { data } = await auth.getUser();
  if (data.user) return data.user;
  const signedIn = await auth.signInAnonymously({
    options: { captchaToken: await getCaptchaToken() },
  });
  if (signedIn.error || !signedIn.data.user)
    throw new HostEmailError(
      'We could not start your registration. Reload the page and try again.',
    );
  return signedIn.data.user;
}

/**
 * Sends the code, or reports that this email is already verified on the
 * current login. Returns the user id the code belongs to.
 */
export async function sendHostEmailCode(
  auth: Auth,
  email: string,
): Promise<{ userId: string; verified: boolean }> {
  const clean = email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(clean)) throw new HostEmailError('Enter a valid email address.');
  const user = await applicant(auth);
  if (!user.is_anonymous) {
    if (same(user.email, clean) && user.email_confirmed_at)
      return { userId: user.id, verified: true };
    throw new HostEmailError(
      `You are signed in as ${user.email ?? 'another account'}. Sign out to register a host with a different email.`,
    );
  }
  const { data, error } = await auth.updateUser({ email: clean });
  if (error) throw new HostEmailError(explain(error, 'We could not send a code. Try again.'));
  if (!data.user || data.user.id !== user.id || !same(data.user.new_email, clean))
    throw new HostEmailError('We could not send a code. Reload the page and try again.');
  return { userId: user.id, verified: false };
}

export async function verifyHostEmailCode(auth: Auth, userId: string, email: string, code: string) {
  const clean = email.trim().toLowerCase();
  if (!CODE_PATTERN.test(code))
    throw new HostEmailError('Enter the 6- or 8-digit code from the email.');
  const { data, error } = await auth.verifyOtp({ type: 'email_change', email: clean, token: code });
  if (error)
    throw new HostEmailError(explain(error, 'That code is wrong or has expired. Send a new one.'));
  if (
    !data.user ||
    data.user.id !== userId ||
    data.user.is_anonymous ||
    !same(data.user.email, clean)
  )
    throw new HostEmailError('We could not confirm your email. Reload the page and try again.');
  /* The server action reads the session cookie; refresh so it carries the
     verified email rather than the anonymous one. */
  await auth.refreshSession();
}
