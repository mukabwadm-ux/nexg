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
 * which email addresses are registered.
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
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email.toLowerCase(),
    password: parsed.data.password,
  });

  if (error) {
    return { ok: false, message: 'That email and password do not match.' };
  }

  return { ok: true, message: 'Signed in.', redirectTo: '/developers' };
}

export async function signOut(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
}