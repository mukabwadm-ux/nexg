import { getCaptchaToken } from '@nexg/ui';
import type { SupabaseClient, User } from '@supabase/supabase-js';

/*
 * Email verification inside a registration form (hosts, customers).
 *
 * The visitor gets an anonymous session; the code is an email-change OTP on
 * that same user, so verifying it turns the session into a real login with
 * a confirmed email. Supabase refuses an email another account already uses,
 * which is what keeps logins unique (a merchant's email cannot be reused for
 * a host or customer account).
 *
 * Every call that can reach Supabase's captcha check carries a fresh
 * Turnstile token: the anonymous sign-in takes one directly, and the
 * email-change and verify calls are made on that captcha-checked session.
 */

type Auth = SupabaseClient['auth'];

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const CODE_PATTERN = /^(?:\d{6}|\d{8})$/;

/** Supabase allows one auth email per address per minute. */
export const EMAIL_GAP_MS = 61_000;

export class EmailCodeError extends Error {
  constructor(
    message: string,
    /** The address already has an account: offer sign-in. */
    readonly exists = false,
    /** One email a minute: wait, then retry. */
    readonly rateLimited = false,
  ) {
    super(message);
  }
}

export interface EmailCodeWording {
  /** Shown when the address already has a NexG account. */
  exists: string;
  /** Shown when this browser is signed in to a different account. */
  signedInAs: (email: string) => string;
}

const DEFAULT_WORDING: EmailCodeWording = {
  exists: 'This email already has a NexG account. Sign in instead, or use a different email.',
  signedInAs: (email) => `You are signed in as ${email}. Sign out to use a different email.`,
};

function same(left: string | null | undefined, right: string) {
  return left?.trim().toLowerCase() === right.trim().toLowerCase();
}

function explain(
  error: { status?: number; code?: string; message?: string },
  fallback: string,
  wording: EmailCodeWording,
): EmailCodeError {
  const text = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  if (error.status === 429 || text.includes('rate'))
    return new EmailCodeError(
      'We just sent an email to this address. Wait a minute, then try again.',
      false,
      true,
    );
  if (
    text.includes('email_exists') ||
    text.includes('already been registered') ||
    text.includes('already registered')
  )
    return new EmailCodeError(wording.exists, true);
  if (text.includes('captcha'))
    return new EmailCodeError(
      'We could not confirm you are not a bot. Refresh the page and try again.',
    );
  return new EmailCodeError(fallback);
}

/** The current user, signing in anonymously if there is nobody yet. */
async function applicant(auth: Auth): Promise<User> {
  const { data } = await auth.getUser();
  if (data.user) return data.user;
  const signedIn = await auth.signInAnonymously({
    options: { captchaToken: await getCaptchaToken() },
  });
  if (signedIn.error || !signedIn.data.user)
    throw new EmailCodeError(
      'We could not start your registration. Reload the page and try again.',
    );
  return signedIn.data.user;
}

/**
 * Sends the code, or reports that this email is already verified on the
 * current login. Returns the user id the code belongs to.
 */
export async function sendEmailCode(
  auth: Auth,
  email: string,
  wording: EmailCodeWording = DEFAULT_WORDING,
): Promise<{ userId: string; verified: boolean }> {
  const clean = email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(clean)) throw new EmailCodeError('Enter a valid email address.');
  const user = await applicant(auth);
  if (!user.is_anonymous) {
    if (same(user.email, clean) && user.email_confirmed_at)
      return { userId: user.id, verified: true };
    throw new EmailCodeError(wording.signedInAs(user.email ?? 'another account'));
  }
  const { data, error } = await auth.updateUser({ email: clean });
  if (error) throw explain(error, 'We could not send a code. Try again.', wording);
  if (!data.user || data.user.id !== user.id || !same(data.user.new_email, clean))
    throw new EmailCodeError('We could not send a code. Reload the page and try again.');
  return { userId: user.id, verified: false };
}

export async function verifyEmailCode(
  auth: Auth,
  userId: string,
  email: string,
  code: string,
  wording: EmailCodeWording = DEFAULT_WORDING,
) {
  const clean = email.trim().toLowerCase();
  if (!CODE_PATTERN.test(code))
    throw new EmailCodeError('Enter the 6- or 8-digit code from the email.');
  const { data, error } = await auth.verifyOtp({ type: 'email_change', email: clean, token: code });
  if (error) throw explain(error, 'That code is wrong or has expired. Send a new one.', wording);
  if (
    !data.user ||
    data.user.id !== userId ||
    data.user.is_anonymous ||
    !same(data.user.email, clean)
  )
    throw new EmailCodeError('We could not confirm your email. Reload the page and try again.');
  /* The server action reads the session cookie; refresh so it carries the
     verified email rather than the anonymous one. */
  await auth.refreshSession();
}
