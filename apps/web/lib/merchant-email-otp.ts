import type { SupabaseClient } from '@supabase/supabase-js';

type EmailAuth = Pick<SupabaseClient['auth'], 'getUser' | 'updateUser' | 'verifyOtp' | 'refreshSession'>;

export function isMerchantEmailCode(code: string): boolean {
  return /^(?:\d{6}|\d{8})$/.test(code);
}

function sameEmail(left: string | undefined | null, right: string): boolean {
  return left?.trim().toLowerCase() === right.trim().toLowerCase();
}

function providerMessage(error: { status?: number; code?: string } | null, fallback: string): string {
  if (error?.status === 429 || error?.code?.includes('rate_limit'))
    return 'Too many requests. Please wait a minute before trying again.';
  return fallback;
}

/** Never create or sign into a second account while an application belongs to this one. */
async function currentApplicant(auth: EmailAuth, actorId: string) {
  const { data, error } = await auth.getUser();
  if (error || !data.user || data.user.id !== actorId)
    throw new Error('Your registration session has changed. Return to Home for help.');
  return data.user;
}

/** Request an email-change OTP on the existing applicant, preserving its ID. */
export async function requestMerchantEmailCode(auth: EmailAuth, actorId: string, email: string) {
  const user = await currentApplicant(auth, actorId);
  if (!user.is_anonymous && sameEmail(user.email, email) && user.email_confirmed_at)
    return 'verified' as const;
  if (sameEmail(user.new_email, email)) return 'pending' as const;
  const { data, error } = await auth.updateUser({ email: email.trim().toLowerCase() });
  if (error)
    throw new Error(providerMessage(error, 'We could not send a verification code. Please try again or contact support.'));
  if (!data.user || data.user.id !== actorId || !sameEmail(data.user.new_email, email))
    throw new Error('We could not confirm that verification is required. Return to Home and contact support.');
  return 'sent' as const;
}

export async function resendMerchantEmailCode(auth: EmailAuth, actorId: string, email: string) {
  const user = await currentApplicant(auth, actorId);
  if (!sameEmail(user.new_email, email))
    throw new Error('This verification request has changed. Return to Home and try again.');
  const { data, error } = await auth.updateUser({ email: email.trim().toLowerCase() });
  if (error)
    throw new Error(providerMessage(error, 'We could not send a new code. Please try again.'));
  if (!data.user || data.user.id !== actorId || !sameEmail(data.user.new_email, email))
    throw new Error('We could not confirm your verification request. Return to Home and contact support.');
}

export async function verifyMerchantEmailCode(auth: EmailAuth, actorId: string, email: string, code: string) {
  const user = await currentApplicant(auth, actorId);
  if (!sameEmail(user.new_email, email))
    throw new Error('This verification request has changed. Return to Home and try again.');
  if (!isMerchantEmailCode(code)) throw new Error('Enter the complete 6- or 8-digit code.');
  const { data, error } = await auth.verifyOtp({
    type: 'email_change', email: email.trim().toLowerCase(), token: code,
  });
  if (error)
    throw new Error(providerMessage(error, 'That code is invalid or has expired. Request another code and try again.'));
  if (!data.user || data.user.id !== actorId || data.user.is_anonymous ||
      !data.user.email_confirmed_at || !sameEmail(data.user.email, email))
    throw new Error('We could not confirm your account. Return to Home and contact support.');
  const refreshed = await auth.refreshSession();
  if (refreshed.error || !refreshed.data.user || refreshed.data.user.id !== actorId ||
      refreshed.data.user.is_anonymous || !refreshed.data.user.email_confirmed_at)
    throw new Error('Your email was checked, but your session could not be refreshed. Return to Home and try again.');
}
