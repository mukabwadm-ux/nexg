/**
 * Merchant welcome email.
 *
 * Submitting a registration sends the existing single-use password setup link
 * (Supabase's recovery email). Before it is sent, the merchant's own
 * user_metadata is marked so the recovery template renders a welcome version:
 * greeting, username (their email) and a "Set your password" button. Ordinary
 * password resets keep the reset wording. The flag only changes wording; it
 * grants nothing, so it is safe in user-editable metadata.
 *
 * The template that reads these keys lives in Supabase (Authentication >
 * Emails > Reset password) and in supabase/templates/password-recovery.html
 * for local development. Keep the key names in sync with both.
 */

export const WELCOME_FLAG = 'nexg_welcome';
export const WELCOME_FIRST_NAME = 'nexg_welcome_first_name';
export const WELCOME_BUSINESS = 'nexg_welcome_business';
/** True for hosts: the template says "host workspace" and links to /host. A
 *  boolean rather than a role string, because a missing key is simply false
 *  in the email template while an `eq` on a missing value can fail it. */
export const WELCOME_HOST = 'nexg_welcome_host';
/** True for customers who created an account at /sign-up: the template says
 *  "Welcome to NexG" without an application, and the link returns home. */
export const WELCOME_CUSTOMER = 'nexg_welcome_customer';

function clean(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const printable = Array.from(value, (char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127 ? ' ' : char;
  }).join('');
  const text = printable.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

export function welcomeMetadata(
  business: { firstName?: unknown; name?: unknown },
  role: 'merchant' | 'host' | 'customer' = 'merchant',
) {
  return {
    [WELCOME_FLAG]: true,
    [WELCOME_FIRST_NAME]: clean(business.firstName, 100),
    [WELCOME_BUSINESS]: clean(business.name, 200),
    [WELCOME_HOST]: role === 'host' ? true : null,
    [WELCOME_CUSTOMER]: role === 'customer' ? true : null,
  };
}

/** Sent with the new password so later resets use the normal wording. */
export const clearedWelcomeMetadata = {
  [WELCOME_FLAG]: null,
  [WELCOME_FIRST_NAME]: null,
  [WELCOME_BUSINESS]: null,
  [WELCOME_HOST]: null,
  [WELCOME_CUSTOMER]: null,
} as const;

/**
 * Supabase allows one auth email per address per minute. The most common way
 * to hit it is asking for a sign-in code straight after the welcome email.
 */
export const EMAIL_RATE_LIMIT_MESSAGE =
  'We just sent an email to this address. Check your inbox, or wait about a minute and try again.';
