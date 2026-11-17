'use server';

import { z } from 'zod';

import { createClient } from '@/lib/session';

/**
 * Signing in to the developer console.
 *
 * The developer console is where a key is issued, so it needs to know
 * who is asking. The account is the same NexG account the marketing
 * site and the staff console use -- one login, three surfaces -- so
 * there is no separate API account to create or forget.
 *
 * A failed sign-in says "that email and password do not match" and
 * never which of the two was wrong. The first tells anybody who asks
 * which email addresses are registered. A failed security check and too
 * many attempts are named, because neither says anything about the email.
 */

export interface AuthResult {
  ok: boolean;
  message: string;
  /** Where the caller should go next. */
  redirectTo?: string;
}

const credentials = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(6, 'Passwords are at least 6 characters.'),
});

export async function signIn(formData: FormData): Promise<AuthResult> {
  const parsed = credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check the form.' };
  }

  const supabase = createClient();
  const captcha = formData.get('captchaToken');
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email.toLowerCase(),
    password: parsed.data.password,
    options: { captchaToken: typeof captcha === 'string' && captcha ? captcha : undefined },
  });

  if (error) {
    // Neither of these says whether the email is registered, so they can be named.
    const code = (error as { code?: string }).code ?? '';
    if (code === 'captcha_failed' || /captcha/i.test(error.message)) {
      return { ok: false, message: 'The security check did not go through. Press Sign in again.' };
    }
    if (code === 'over_request_rate_limit' || error.status === 429) {
      return { ok: false, message: 'Too many attempts. Wait a minute, then try again.' };
    }
    return { ok: false, message: 'That email and password do not match.' };
  }

  return { ok: true, message: 'Signed in.', redirectTo: '/developers' };
}

export async function signOut(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
}
