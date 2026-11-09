import 'server-only';

import { headers } from 'next/headers';

/*
 * Server-side check of a Turnstile token for our own forms (contact, leads,
 * waitlist, careers, stay requests). Supabase verifies the tokens sent with
 * sign-in, sign-up and password reset itself.
 *
 * - No TURNSTILE_SECRET_KEY: the check is skipped (logged once), so forms
 *   keep working before the keys are configured.
 * - Cloudflare says no (missing, reused, expired or forged token): refused.
 * - Cloudflare cannot be reached: allowed and logged, so an outage there
 *   does not take every form on the site down with it.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
let warned = false;

export const CAPTCHA_FAILED_MESSAGE =
  'We could not confirm you are not a bot. Refresh the page and try again.';

export async function verifyTurnstile(token: unknown): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    if (!warned) {
      warned = true;
      console.warn('TURNSTILE_SECRET_KEY is not set: form captcha checks are skipped.');
    }
    return true;
  }
  if (typeof token !== 'string' || token.length < 10 || token.length > 4096) return false;

  const ip =
    headers().get('cf-connecting-ip') ?? headers().get('x-forwarded-for')?.split(',')[0]?.trim();
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);

  try {
    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`siteverify ${response.status}`);
    const outcome = (await response.json()) as { success?: boolean };
    return outcome.success === true;
  } catch (error) {
    console.error('Turnstile verification unavailable; allowing the submission.', error);
    return true;
  }
}
